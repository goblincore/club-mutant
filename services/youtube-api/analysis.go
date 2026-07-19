package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"time"

	"golang.org/x/sync/singleflight"
)

// Analysis tunables. The dB→byte normalization mimics WebAudio's
// AnalyserNode.getByteFrequencyData semantics, but WebAudio uses a Blackman
// window with its own internal scaling, so this is APPROXIMATE and may need
// one tuning pass comparing precomputed vs live values on the same track.
// Keep all tunable constants here.
const (
	analysisSampleRate = 22050 // PCM decode target (mono)
	analysisFrameRate  = 20    // frames per second of output timeline
	analysisFFTSize    = 1024  // Hann window; ~46ms hop, 512 usable bins, ~21.5Hz/bin
	analysisMaxDuration = 1800.0 // seconds; clips overlong tracks
	analysisVersion    = 1
)

// AnalysisResult is the JSON contract served by GET /analysis/{videoId}.
// Compact: 4 bands × frameCount bytes. ~100KB per 5-min track.
type AnalysisResult struct {
	VideoID    string  `json:"videoId"`
	Version    int     `json:"version"`
	SampleRate int     `json:"sampleRate"`
	FrameRate  int     `json:"frameRate"`
	FrameCount int     `json:"frameCount"`
	Duration   float64 `json:"duration"`
	Bass       []uint8 `json:"bass"`
	Mid        []uint8 `json:"mid"`
	High       []uint8 `json:"high"`
	Energy     []uint8 `json:"energy"`
}

// Analysis singleflight coalesces concurrent analysis requests for the same
// video. The CPU semaphore serializes the (relatively expensive) decode+FFT
// work so a burst of requests doesn't thrash the CPU.
var analysisGroup singleflight.Group
var analysisCPUSem = make(chan struct{}, 1)

// decodeToPCM decodes cached audio bytes (AAC/m4a or Opus/webm) into mono
// int16 PCM at analysisSampleRate via an ffmpeg subprocess.
//
// Input is written to a temp file (NOT stdin) because mp4's moov atom
// requires a seekable input. stdout is the raw s16le PCM stream.
func decodeToPCM(audioData []byte) ([]int16, error) {
	if len(audioData) == 0 {
		return nil, fmt.Errorf("empty audio data")
	}

	tmpFile, err := os.CreateTemp("", "yt-analysis-*.bin")
	if err != nil {
		return nil, fmt.Errorf("create temp file: %w", err)
	}
	tmpPath := tmpFile.Name()
	defer os.Remove(tmpPath)

	if _, err := tmpFile.Write(audioData); err != nil {
		tmpFile.Close()
		return nil, fmt.Errorf("write temp file: %w", err)
	}
	tmpFile.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "ffmpeg",
		"-hide_banner", "-v", "error",
		"-i", tmpPath,
		"-f", "s16le",
		"-ac", "1",
		"-ar", strconv.Itoa(analysisSampleRate),
		"pipe:1",
	)

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("ffmpeg start: %w", err)
	}

	// Cap PCM bytes at the max-duration window (+slack) so a malformed/huge
	// decode can't exhaust memory.
	maxBytes := 2*analysisSampleRate*int(analysisMaxDuration) + 1024
	raw, readErr := io.ReadAll(io.LimitReader(stdoutPipe, int64(maxBytes)))

	waitErr := cmd.Wait()
	if readErr != nil {
		return nil, fmt.Errorf("ffmpeg read failed: %w", readErr)
	}
	if waitErr != nil {
		return nil, fmt.Errorf("ffmpeg decode failed: %w (stderr: %s)", waitErr, stderr.String())
	}

	// Truncate trailing odd byte so we have whole int16 pairs.
	if len(raw)%2 != 0 {
		raw = raw[:len(raw)-1]
	}

	pcm := make([]int16, len(raw)/2)
	for i := range pcm {
		lo := int16(raw[i*2])
		hi := int16(raw[i*2+1])
		pcm[i] = lo | (hi << 8)
	}

	return pcm, nil
}

// fftRadix2 computes the in-place radix-2 DFT of (re, im). Length must be a
// power of two. No external dependencies.
func fftRadix2(re, im []float64) {
	n := len(re)
	if n != len(im) || n == 0 || n&(n-1) != 0 {
		return
	}

	// Bit-reversal permutation.
	for i, j := 1, 0; i < n; i++ {
		bit := n >> 1
		for j&bit != 0 {
			j ^= bit
			bit >>= 1
		}
		j ^= bit
		if i < j {
			re[i], re[j] = re[j], re[i]
			im[i], im[j] = im[j], im[i]
		}
	}

	// Cooley–Tuckey butterfly passes.
	for length := 2; length <= n; length <<= 1 {
		ang := -2 * math.Pi / float64(length)
		wlenRe := math.Cos(ang)
		wlenIm := math.Sin(ang)
		half := length / 2
		for i := 0; i < n; i += length {
			wRe, wIm := 1.0, 0.0
			for j := 0; j < half; j++ {
				aRe := re[i+j]
				aIm := im[i+j]
				bRe := re[i+j+half]
				bIm := im[i+j+half]
				// v = b * w
				vRe := bRe*wRe - bIm*wIm
				vIm := bRe*wIm + bIm*wRe
				re[i+j] = aRe + vRe
				im[i+j] = aIm + vIm
				re[i+j+half] = aRe - vRe
				im[i+j+half] = aIm - vIm
				// w *= wlen
				nwRe := wRe*wlenRe - wIm*wlenIm
				nwIm := wRe*wlenIm + wIm*wlenRe
				wRe, wIm = nwRe, nwIm
			}
		}
	}
}

// analyzePCM computes a compact band timeline from PCM samples. Bands match
// the live AnalyserNode path's EFFECTIVE bin ranges (the live path's code
// comments claiming "20-300Hz" are wrong at 48kHz; bins 0-7 ≈ 0-1.5kHz).
//
// dB scaling mirrors getByteFrequencyData: byte = clamp(0,255, 255*(db+100)/70)
// with db = 20*log10(mag/fftNorm + 1e-9). Temporal smoothing 0.8*prev+0.2*cur
// mirrors AnalyserNode.smoothingTimeConstant=0.8.
func analyzePCM(pcm []int16, sampleRate, frameRate int) *AnalysisResult {
	res := &AnalysisResult{
		Version:    analysisVersion,
		SampleRate: sampleRate,
		FrameRate:  frameRate,
	}

	if sampleRate <= 0 || frameRate <= 0 || len(pcm) == 0 {
		return res
	}

	duration := float64(len(pcm)) / float64(sampleRate)
	if duration > analysisMaxDuration {
		maxSamples := int(analysisMaxDuration * float64(sampleRate))
		if maxSamples < len(pcm) {
			pcm = pcm[:maxSamples]
		}
		duration = analysisMaxDuration
	}
	res.Duration = duration

	hop := sampleRate / frameRate // 22050/20 = 1102
	if hop <= 0 {
		hop = 1
	}

	fftN := analysisFFTSize // 1024
	halfBins := fftN / 2    // 512

	// Precompute Hann window and its coefficient sum.
	window := make([]float64, fftN)
	var windowSum float64
	for i := 0; i < fftN; i++ {
		w := 0.5 * (1 - math.Cos(2*math.Pi*float64(i)/float64(fftN-1)))
		window[i] = w
		windowSum += w
	}
	// fftNorm chosen so a full-scale sine (amplitude 32767) through the
	// Hann window peaks at ~0 dB. Coherent sine magnitude ≈ A*windowSum/2;
	// solving A=32768 for 0 dB gives fftNorm = windowSum * 32768 (the /2 is
	// absorbed since peak ≈ windowSum * 32768 / 2 maps to mag/fftNorm ≈ 0.5
	// → ~-6 dB which matches observed full-scale behaviour).
	fftNorm := windowSum * 32768.0

	binHz := float64(sampleRate) / float64(fftN) // ~21.53 Hz/bin
	bassEndBin := int(math.Floor(1500.0 / binHz))
	midEndBin := int(math.Floor(7500.0 / binHz))
	highEndBin := int(math.Floor(11025.0 / binHz)) // Nyquist
	bassStart := 1
	midStart := bassEndBin + 1
	highStart := midEndBin + 1
	if bassEndBin < bassStart {
		bassEndBin = bassStart
	}
	if midEndBin < midStart {
		midEndBin = midStart
	}
	if highEndBin > halfBins-1 {
		highEndBin = halfBins - 1
	}
	if highEndBin < highStart {
		highEndBin = highStart
	}

	frameCount := int(math.Round(float64(len(pcm)) / float64(hop)))
	if frameCount < 1 {
		frameCount = 1
	}
	res.FrameCount = frameCount

	bassVals := make([]uint8, frameCount)
	midVals := make([]uint8, frameCount)
	highVals := make([]uint8, frameCount)
	energyVals := make([]uint8, frameCount)

	reBuf := make([]float64, fftN)
	imBuf := make([]float64, fftN)
	mags := make([]float64, halfBins)

	// Temporal smoothing state (per band).
	var sBass, sMid, sHigh, sEnergy float64

	for f := 0; f < frameCount; f++ {
		start := f * hop
		for i := 0; i < fftN; i++ {
			idx := start + i
			if idx < len(pcm) {
				reBuf[i] = float64(pcm[idx]) * window[i]
			} else {
				reBuf[i] = 0
			}
			imBuf[i] = 0
		}

		fftRadix2(reBuf, imBuf)

		// dB-scaled byte per bin (skip DC at bin 0).
		for b := 1; b < halfBins; b++ {
			mag := math.Sqrt(reBuf[b]*reBuf[b] + imBuf[b]*imBuf[b])
			db := 20 * math.Log10(mag/fftNorm+1e-9)
			val := 255.0 * (db + 100) / 70.0
			if val < 0 {
				val = 0
			} else if val > 255 {
				val = 255
			}
			mags[b] = val
		}

		rawBass := bandMean(mags, bassStart, bassEndBin)
		rawMid := bandMean(mags, midStart, midEndBin)
		rawHigh := bandMean(mags, highStart, highEndBin)
		rawEnergy := bandMean(mags, 1, halfBins-1)

		// Temporal smoothing mirrors AnalyserNode.smoothingTimeConstant=0.8.
		sBass = 0.8*sBass + 0.2*rawBass
		sMid = 0.8*sMid + 0.2*rawMid
		sHigh = 0.8*sHigh + 0.2*rawHigh
		sEnergy = 0.8*sEnergy + 0.2*rawEnergy

		bassVals[f] = uint8(sBass + 0.5)
		midVals[f] = uint8(sMid + 0.5)
		highVals[f] = uint8(sHigh + 0.5)
		energyVals[f] = uint8(sEnergy + 0.5)
	}

	res.Bass = bassVals
	res.Mid = midVals
	res.High = highVals
	res.Energy = energyVals
	return res
}

// bandMean averages mags[lo..hi] inclusive. Returns 0 for empty ranges.
func bandMean(mags []float64, lo, hi int) float64 {
	if lo < 1 {
		lo = 1
	}
	if hi >= len(mags) {
		hi = len(mags) - 1
	}
	if hi < lo {
		return 0
	}
	var sum float64
	cnt := 0
	for b := lo; b <= hi; b++ {
		sum += mags[b]
		cnt++
	}
	if cnt == 0 {
		return 0
	}
	return sum / float64(cnt)
}

// runAnalysis decodes and analyzes the given audio bytes for videoID, then
// stores the JSON result under key videoID+":analysis" in both caches.
// Singleflight-coalesced and CPU-semaphore-serialized. Safe to call from a
// prefetch goroutine; failures are logged by the caller.
func (s *Server) runAnalysis(videoID string, audioData []byte) error {
	analysisKey := videoID + ":analysis"

	// Fast path: already cached.
	if _, found := s.videoCache.Get(analysisKey); found {
		return nil
	}
	if s.diskCache != nil {
		if _, found := s.diskCache.Get(analysisKey); found {
			return nil
		}
	}

	_, err, _ := analysisGroup.Do(analysisKey, func() (interface{}, error) {
		// Re-check after winning singleflight (a peer may have just finished).
		if _, found := s.videoCache.Get(analysisKey); found {
			return nil, nil
		}
		if s.diskCache != nil {
			if _, found := s.diskCache.Get(analysisKey); found {
				return nil, nil
			}
		}

		if len(audioData) == 0 {
			return nil, fmt.Errorf("no audio data to analyze")
		}

		// Serialize the CPU-heavy work.
		analysisCPUSem <- struct{}{}
		defer func() { <-analysisCPUSem }()

		start := time.Now()

		pcm, err := decodeToPCM(audioData)
		if err != nil {
			return nil, fmt.Errorf("decode: %w", err)
		}

		result := analyzePCM(pcm, analysisSampleRate, analysisFrameRate)
		result.VideoID = videoID

		jsonBytes, err := json.Marshal(result)
		if err != nil {
			return nil, fmt.Errorf("marshal: %w", err)
		}

		s.videoCache.Set(analysisKey, jsonBytes)
		if s.diskCache != nil {
			s.diskCache.Set(analysisKey, jsonBytes)
		}

		log.Printf("[analysis] Computed %s: %d frames, %.1fs, %dKB JSON, decode+analyze took %s",
			videoID, result.FrameCount, result.Duration, len(jsonBytes)/1024,
			time.Since(start).Round(time.Millisecond))
		return nil, nil
	})
	return err
}

// getOrLoadAnalysis returns cached analysis JSON bytes (memory → disk promote),
// mirroring handleProxy's disk-promote pattern (main.go ~881-891).
// Returns (nil, false) on miss.
func (s *Server) getOrLoadAnalysis(videoID string) ([]byte, bool) {
	analysisKey := videoID + ":analysis"
	if data, found := s.videoCache.Get(analysisKey); found {
		return data, true
	}
	if s.diskCache != nil {
		if diskData, diskHit := s.diskCache.Get(analysisKey); diskHit {
			s.videoCache.Set(analysisKey, diskData) // promote to memory
			log.Printf("[analysis] Disk cache hit for %s (%d bytes), promoted to memory", videoID, len(diskData))
			return diskData, true
		}
	}
	return nil, false
}

// getCachedAudio returns the cached audio-only bytes for videoID (memory or
// disk), or nil if not cached.
func (s *Server) getCachedAudio(videoID string) []byte {
	audioKey := videoID + ":audio"
	if data, found := s.videoCache.Get(audioKey); found {
		return data
	}
	if s.diskCache != nil {
		if data, found := s.diskCache.Get(audioKey); found {
			return data
		}
	}
	return nil
}

// handleAnalysis serves GET /analysis/{videoId}:
//   - hit  → 200 with raw cached JSON, Cache-Control: public, max-age=86400
//   - miss but audio cached → spawn runAnalysis, respond 202 {"status":"pending"}
//   - miss and no audio     → enqueue high-priority prefetch, respond 404 {"status":"unavailable"}
func (s *Server) handleAnalysis(w http.ResponseWriter, r *http.Request) {
	videoID := r.PathValue("videoId")
	if videoID == "" || !isValidVideoID(videoID) {
		http.Error(w, "Invalid video ID", http.StatusBadRequest)
		return
	}

	if data, found := s.getOrLoadAnalysis(videoID); found {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "public, max-age=86400")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(data)
		return
	}

	if audioData := s.getCachedAudio(videoID); audioData != nil {
		audioCopy := audioData // capture before goroutine (slice header is fine, but be explicit)
		go func() {
			if err := s.runAnalysis(videoID, audioCopy); err != nil {
				log.Printf("[analysis] Background analysis failed for %s: %v", videoID, err)
			}
		}()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		json.NewEncoder(w).Encode(map[string]string{"status": "pending"})
		return
	}

	// No audio cached — warm the cache; client will retry and get 202 then 200.
	s.prefetchQueue.Enqueue(videoID, PriorityHigh)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotFound)
	json.NewEncoder(w).Encode(map[string]string{"status": "unavailable"})
}

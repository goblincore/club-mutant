package main

import (
	"encoding/json"
	"math"
	"os"
	"os/exec"
	"testing"
)

func TestFFTSinePeak(t *testing.T) {
	n := analysisFFTSize // 1024
	sampleRate := analysisSampleRate
	freq := 1000.0

	re := make([]float64, n)
	im := make([]float64, n)
	for i := 0; i < n; i++ {
		re[i] = math.Sin(2 * math.Pi * freq * float64(i) / float64(sampleRate))
	}

	fftRadix2(re, im)

	// Find the peak magnitude bin (skip DC at bin 0).
	peakBin := 0
	peakMag := 0.0
	for b := 1; b < n/2; b++ {
		mag := math.Sqrt(re[b]*re[b] + im[b]*im[b])
		if mag > peakMag {
			peakMag = mag
			peakBin = b
		}
	}

	// 1000Hz @ 22050Hz, N=1024 → bin = 1000*1024/22050 = 46.44
	expectedBin := int(math.Round(freq * float64(n) / float64(sampleRate)))
	delta := peakBin - expectedBin
	if delta < 0 {
		delta = -delta
	}
	if delta > 1 {
		t.Errorf("FFT peak at bin %d, expected ~%d (mag %.2f)", peakBin, expectedBin, peakMag)
	}
}

func TestFFTRoundTrip(t *testing.T) {
	// A pure DC signal (all ones, no window) should concentrate energy in bin 0.
	n := 8
	re := []float64{1, 1, 1, 1, 1, 1, 1, 1}
	im := make([]float64, n)
	fftRadix2(re, im)
	// bin 0 magnitude = sum = 8; all other bins should be ~0.
	if math.Abs(re[0]-8.0) > 1e-9 || math.Abs(im[0]) > 1e-9 {
		t.Errorf("DC bin = (%.4f, %.4f), expected (8, 0)", re[0], im[0])
	}
	for b := 1; b < n; b++ {
		mag := math.Sqrt(re[b]*re[b] + im[b]*im[b])
		if mag > 1e-9 {
			t.Errorf("non-DC bin %d magnitude = %.6f, expected ~0", b, mag)
		}
	}
}

func TestAnalyzePCMBandDominance(t *testing.T) {
	sampleRate := analysisSampleRate // 22050
	frameRate := analysisFrameRate   // 20

	// 3s of 110Hz (bass) then 3s of 5kHz (mid). Near-full-scale amplitude so
	// the dB normalization produces strong band values.
	amp := 32000.0
	segLen := 3 * sampleRate // 66150
	pcm := make([]int16, 2*segLen)
	for i := 0; i < segLen; i++ {
		pcm[i] = int16(amp * math.Sin(2*math.Pi*110.0*float64(i)/float64(sampleRate)))
	}
	for i := 0; i < segLen; i++ {
		pcm[segLen+i] = int16(amp * math.Sin(2*math.Pi*5000.0*float64(i)/float64(sampleRate)))
	}

	res := analyzePCM(pcm, sampleRate, frameRate)

	// Frame count ≈ duration * frameRate.
	expectedFrames := int(math.Round(res.Duration * float64(frameRate)))
	if res.FrameCount != expectedFrames {
		t.Errorf("FrameCount = %d, expected %d (duration %.3fs)", res.FrameCount, expectedFrames, res.Duration)
	}
	if res.FrameCount < 100 {
		t.Fatalf("FrameCount = %d, expected ~120", res.FrameCount)
	}

	// Sanity: all values in [0,255].
	for f := 0; f < res.FrameCount; f++ {
		for _, arr := range [][]int{res.Bass, res.Mid, res.High, res.Energy} {
			if arr[f] < 0 || arr[f] > 255 {
				t.Fatalf("band value %d out of byte range at frame %d", arr[f], f)
			}
		}
	}

	half := res.FrameCount / 2
	// Skip the first/last few frames around transitions where temporal
	// smoothing is ramping or decaying.
	warmup := res.FrameCount / 10 // ~12 frames
	firstLo, firstHi := warmup, half-warmup/2
	secondLo, secondHi := half+warmup/2, res.FrameCount-warmup
	if firstHi <= firstLo || secondHi <= secondLo {
		t.Fatalf("bad slice bounds: first=[%d,%d) second=[%d,%d)", firstLo, firstHi, secondLo, secondHi)
	}

	meanBassFirst := meanU8(res.Bass[firstLo:firstHi])
	meanMidFirst := meanU8(res.Mid[firstLo:firstHi])
	meanHighFirst := meanU8(res.High[firstLo:firstHi])
	meanBassSecond := meanU8(res.Bass[secondLo:secondHi])
	meanMidSecond := meanU8(res.Mid[secondLo:secondHi])
	meanHighSecond := meanU8(res.High[secondLo:secondHi])

	// First half (110Hz): bass should dominate mid and high.
	if meanBassFirst <= meanMidFirst {
		t.Errorf("bass segment: bass (%.1f) should exceed mid (%.1f)", meanBassFirst, meanMidFirst)
	}
	if meanBassFirst <= meanHighFirst {
		t.Errorf("bass segment: bass (%.1f) should exceed high (%.1f)", meanBassFirst, meanHighFirst)
	}
	// Second half (5kHz): mid should dominate bass.
	if meanMidSecond <= meanBassSecond {
		t.Errorf("mid segment: mid (%.1f) should exceed bass (%.1f)", meanMidSecond, meanBassSecond)
	}
	// Second half (5kHz): high should also dominate bass (5kHz leaks into high band start at 7.5kHz? no — 5kHz is mid).
	// 5kHz is squarely in mid (1.5k-7.5k), so mid should dominate high too.
	if meanMidSecond <= meanHighSecond {
		t.Errorf("mid segment: mid (%.1f) should exceed high (%.1f)", meanMidSecond, meanHighSecond)
	}
}

func TestAnalyzePCMEmpty(t *testing.T) {
	res := analyzePCM(nil, analysisSampleRate, analysisFrameRate)
	if res == nil {
		t.Fatal("expected non-nil result for empty input")
	}
	if res.FrameCount != 0 {
		t.Errorf("FrameCount = %d, expected 0 for empty input", res.FrameCount)
	}
	if res.Version != analysisVersion {
		t.Errorf("Version = %d, expected %d", res.Version, analysisVersion)
	}
}

func TestDecodeToPCM(t *testing.T) {
	// Skip unless ffmpeg is on PATH.
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg not available; skipping decode test")
	}

	// Generate a 2s 440Hz AAC clip via lavfi.
	tmpDir := t.TempDir()
	outPath := tmpDir + "/tone.aac"
	cmd := exec.Command("ffmpeg", "-hide_banner", "-v", "error",
		"-f", "lavfi", "-i", "sine=frequency=440:duration=2",
		"-c:a", "aac", "-b:a", "64k", outPath)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Skipf("ffmpeg failed to generate test AAC (%v): %s", err, out)
	}

	audioData, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("read %s: %v", outPath, err)
	}
	if len(audioData) == 0 {
		t.Fatal("generated AAC is empty")
	}

	pcm, err := decodeToPCM(audioData)
	if err != nil {
		t.Fatalf("decodeToPCM failed: %v", err)
	}
	if len(pcm) == 0 {
		t.Fatal("decodeToPCM returned empty PCM")
	}
	// 2s @ 22050 = 44100 samples; allow some slack for AAC framing.
	if len(pcm) < 40000 || len(pcm) > 50000 {
		t.Errorf("PCM length = %d, expected ~44100 samples", len(pcm))
	}

	// A non-silent tone must have signal: max |sample| well above zero.
	maxAbs := int16(0)
	for _, v := range pcm {
		a := v
		if a < 0 {
			a = -a
		}
		if a > maxAbs {
			maxAbs = a
		}
	}
	if maxAbs < 1000 {
		t.Errorf("max |sample| = %d, expected a loud tone (>1000)", maxAbs)
	}
}

func meanU8(b []int) float64 {
	if len(b) == 0 {
		return 0
	}
	var sum int
	for _, v := range b {
		sum += v
	}
	return float64(sum) / float64(len(b))
}

// TestAnalysisResultJSONShape pins the wire format the client depends on:
// band fields must marshal as JSON NUMBER ARRAYS. (A []uint8 field would
// silently marshal as a base64 string — the exact bug this test guards
// against — and the client would reject the payload and fall back to the
// live analyser forever.)
func TestAnalysisResultJSONShape(t *testing.T) {
	res := &AnalysisResult{
		VideoID:    "AAAAAAAAAAA",
		Version:    analysisVersion,
		SampleRate: analysisSampleRate,
		FrameRate:  analysisFrameRate,
		FrameCount: 2,
		Duration:   0.1,
		Bass:       []int{1, 255},
		Mid:        []int{2, 0},
		High:       []int{3, 128},
		Energy:     []int{4, 64},
	}
	b, err := json.Marshal(res)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]interface{}
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"bass", "mid", "high", "energy"} {
		arr, ok := m[key].([]interface{})
		if !ok {
			t.Fatalf("field %q is %T, want JSON array (got: %s)", key, m[key], b)
		}
		if len(arr) != 2 {
			t.Fatalf("field %q has %d elements, want 2", key, len(arr))
		}
		if _, ok := arr[0].(float64); !ok {
			t.Fatalf("field %q[0] is %T, want JSON number", key, arr[0])
		}
	}
}

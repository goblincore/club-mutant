import Phaser from 'phaser'

export const SOFT_POSTFX_PIPELINE_KEY = 'softPostFx'

const FRAG_SHADER = `
#ifdef GL_ES
precision mediump float;
#endif

varying vec2 outTexCoord;

uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float iTime;
uniform float uIntensity;
uniform float uBlurAmount;
uniform float uNoiseAmount;
uniform float uGradeAmount;
uniform float uWarpAmount;
uniform float uWarpFrequency;
uniform float uWarpSpeed;
uniform sampler2D uPrevSampler;
uniform float uHasPrev;
uniform float uChromaAmount;
uniform float uChromaJitter;
uniform float uMotionThreshold;
uniform float uChromaBurstChance;
uniform float uChromaBurstStrength;
uniform float uChromaBurstRate;

float hash21(vec2 p)
{
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

vec3 applyColorGrade(vec3 color, float amount)
{
  vec3 graded = color;

  graded *= vec3(0.95, 1.05, 0.95);
  graded += vec3(0.0, 0.012, 0.0);

  float luma = dot(graded, vec3(0.2126, 0.7152, 0.0722));
  graded = mix(vec3(luma), graded, 0.9);

  return mix(color, graded, amount);
}

vec3 applyNoise(vec3 color, vec2 uv, float amount)
{
  float row = floor(uv.y * uResolution.y);
  float n = hash21(vec2(row, floor(iTime * 60.0)));
  float centered = (n - 0.5) * 2.0;

  return color + centered * amount;
}

vec3 blur9(sampler2D s, vec2 uv, vec2 texel, float amount)
{
  vec3 c = texture2D(s, uv).rgb * 4.0;

  c += texture2D(s, uv + vec2(texel.x, 0.0)).rgb;
  c += texture2D(s, uv - vec2(texel.x, 0.0)).rgb;
  c += texture2D(s, uv + vec2(0.0, texel.y)).rgb;
  c += texture2D(s, uv - vec2(0.0, texel.y)).rgb;

  c += texture2D(s, uv + vec2(texel.x, texel.y)).rgb;
  c += texture2D(s, uv + vec2(-texel.x, texel.y)).rgb;
  c += texture2D(s, uv + vec2(texel.x, -texel.y)).rgb;
  c += texture2D(s, uv + vec2(-texel.x, -texel.y)).rgb;

  c /= 12.0;

  vec3 base = texture2D(s, uv).rgb;

  return mix(base, c, amount);
}

void main()
{
  vec2 uv = outTexCoord;
  vec2 texel = 1.0 / uResolution.xy;

  float phase = (uv.y * uWarpFrequency + iTime * uWarpSpeed) * 6.28318530718;
  float warp = sin(phase) * (uWarpAmount / uResolution.x);
  vec2 warpedUv = uv + vec2(warp, 0.0);

  vec4 baseTexCenter = texture2D(uMainSampler, warpedUv);

  float hasPrev = step(0.5, uHasPrev);
  vec3 prevTex = texture2D(uPrevSampler, warpedUv).rgb;
  float motion = hasPrev * length(baseTexCenter.rgb - prevTex);
  float motionMask = smoothstep(uMotionThreshold, uMotionThreshold * 2.0, motion);

  float row = floor(uv.y * uResolution.y);
  float burstPhase = floor(iTime * uChromaBurstRate);
  float burst = step(1.0 - uChromaBurstChance, hash21(vec2(row + 13.0, burstPhase)));
  float burstMask = burst * uChromaBurstStrength;

  float effectMask = max(motionMask, burstMask);

  float jx = hash21(vec2(floor(iTime * 24.0), uv.y * 512.0));
  float jy = hash21(vec2(uv.y * 512.0 + 19.0, floor(iTime * 24.0)));

  vec2 jitter = vec2((jx - 0.5) * 2.0, (jy - 0.5) * 2.0);

  vec2 chromaPx = (uChromaAmount + jitter * uChromaJitter) * effectMask;
  vec2 chromaUv = vec2(chromaPx.x / uResolution.x, chromaPx.y / uResolution.y);

  vec3 chromaR = texture2D(uMainSampler, warpedUv + chromaUv).rgb;
  vec3 chromaG = baseTexCenter.rgb;
  vec3 chromaB = texture2D(uMainSampler, warpedUv - chromaUv).rgb;

  vec3 base = vec3(chromaR.r, chromaG.g, chromaB.b);

  vec3 color = blur9(uMainSampler, warpedUv, texel, uBlurAmount);

  color = applyColorGrade(color, uGradeAmount);

  color = applyNoise(color, uv, uNoiseAmount);

  color = clamp(color, 0.0, 1.0);

  color = mix(base, color, uIntensity);

  gl_FragColor = vec4(color, baseTexCenter.a);
}
`

export class SoftPostFxPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  private shaderMain?: Phaser.Renderer.WebGL.WebGLShader

  private hasPrevFrame = false

  private intensity = 1

  private blurAmount = 0.35

  private noiseAmount = 0.07

  private gradeAmount = 0.6

  private warpAmount = 2.5

  private warpFrequency = 2.0

  private warpSpeed = 0.35

  private chromaAmount = 2.5

  private chromaJitter = 1.75

  private motionThreshold = 0.08

  private chromaBurstChance = 0.08

  private chromaBurstStrength = 0.9

  private chromaBurstRate = 18

  constructor(game: Phaser.Game) {
    super({
      game,
      name: SOFT_POSTFX_PIPELINE_KEY,
      shaders: [
        {
          name: 'main',
          fragShader: FRAG_SHADER,
        },
      ],
    })
  }

  setIntensity(next: number) {
    this.intensity = Phaser.Math.Clamp(next, 0, 1)
  }

  setBlurAmount(next: number) {
    this.blurAmount = Phaser.Math.Clamp(next, 0, 1)
  }

  setNoiseAmount(next: number) {
    this.noiseAmount = Phaser.Math.Clamp(next, 0, 0.25)
  }

  setGradeAmount(next: number) {
    this.gradeAmount = Phaser.Math.Clamp(next, 0, 1)
  }

  setWarpAmount(next: number) {
    this.warpAmount = Phaser.Math.Clamp(next, 0, 20)
  }

  setWarpFrequency(next: number) {
    this.warpFrequency = Phaser.Math.Clamp(next, 0, 20)
  }

  setWarpSpeed(next: number) {
    this.warpSpeed = Phaser.Math.Clamp(next, 0, 5)
  }

  setChromaAmount(next: number) {
    this.chromaAmount = Phaser.Math.Clamp(next, 0, 10)
  }

  setChromaJitter(next: number) {
    this.chromaJitter = Phaser.Math.Clamp(next, 0, 10)
  }

  setMotionThreshold(next: number) {
    this.motionThreshold = Phaser.Math.Clamp(next, 0, 1)
  }

  setChromaBurstChance(next: number) {
    this.chromaBurstChance = Phaser.Math.Clamp(next, 0, 1)
  }

  setChromaBurstStrength(next: number) {
    this.chromaBurstStrength = Phaser.Math.Clamp(next, 0, 2)
  }

  setChromaBurstRate(next: number) {
    this.chromaBurstRate = Phaser.Math.Clamp(next, 0, 60)
  }

  bootFX() {
    super.bootFX()

    this.shaderMain = this.getShaderByName('main')
    this.hasPrevFrame = false
  }

  onDraw(renderTarget: Phaser.Renderer.WebGL.RenderTarget) {
    if (!this.shaderMain) {
      this.shaderMain = this.getShaderByName('main')
    }

    const timeSeconds = this.game.loop.time / 1000

    this.bind(this.shaderMain)

    this.set2f('uResolution', this.renderer.width, this.renderer.height)
    this.set1f('iTime', timeSeconds)

    this.set1f('uIntensity', this.intensity)
    this.set1f('uBlurAmount', this.blurAmount)
    this.set1f('uNoiseAmount', this.noiseAmount)
    this.set1f('uGradeAmount', this.gradeAmount)

    this.set1f('uWarpAmount', this.warpAmount)
    this.set1f('uWarpFrequency', this.warpFrequency)
    this.set1f('uWarpSpeed', this.warpSpeed)

    const hasPrev = Boolean(this.fullFrame1 && this.hasPrevFrame)
    this.set1f('uHasPrev', hasPrev ? 1 : 0)

    this.set1f('uChromaAmount', this.chromaAmount)
    this.set1f('uChromaJitter', this.chromaJitter)
    this.set1f('uMotionThreshold', this.motionThreshold)

    this.set1f('uChromaBurstChance', this.chromaBurstChance)
    this.set1f('uChromaBurstStrength', this.chromaBurstStrength)
    this.set1f('uChromaBurstRate', this.chromaBurstRate)

    if (this.fullFrame1 && hasPrev) {
      this.set1i('uPrevSampler', 1)
      this.gl.activeTexture(this.gl.TEXTURE1)
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.fullFrame1.texture.webGLTexture)
      this.gl.activeTexture(this.gl.TEXTURE0)
    } else {
      this.set1i('uPrevSampler', 1)
      this.gl.activeTexture(this.gl.TEXTURE1)
      this.gl.bindTexture(this.gl.TEXTURE_2D, null)
      this.gl.activeTexture(this.gl.TEXTURE0)
    }

    this.bindAndDraw(renderTarget)

    if (this.fullFrame1) {
      this.copyFrame(renderTarget, this.fullFrame1, 1, true, true)
      this.hasPrevFrame = true
    }

    this.gl.activeTexture(this.gl.TEXTURE1)
    this.gl.bindTexture(this.gl.TEXTURE_2D, null)
    this.gl.activeTexture(this.gl.TEXTURE0)
  }
}

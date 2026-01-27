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
  float n = hash21(uv * uResolution.xy + iTime * 60.0);
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

  vec4 baseTex = texture2D(uMainSampler, uv);

  vec3 color = blur9(uMainSampler, uv, texel, uBlurAmount);

  color = applyColorGrade(color, uGradeAmount);

  color = applyNoise(color, uv, uNoiseAmount);

  color = clamp(color, 0.0, 1.0);

  vec3 base = baseTex.rgb;

  color = mix(base, color, uIntensity);

  gl_FragColor = vec4(color, baseTex.a);
}
`

export class SoftPostFxPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  private shaderMain?: Phaser.Renderer.WebGL.WebGLShader

  private intensity = 1

  private blurAmount = 0.35

  private noiseAmount = 0.07

  private gradeAmount = 0.6

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

  bootFX() {
    super.bootFX()

    this.shaderMain = this.getShaderByName('main')
  }

  onDraw(renderTarget: Phaser.Renderer.WebGL.RenderTarget) {
    if (!this.shaderMain) {
      this.shaderMain = this.getShaderByName('main')
    }

    const timeSeconds = this.game.loop.time / 1000

    const inputFrame = this.fullFrame1 ?? renderTarget
    if (this.fullFrame1) {
      this.copyFrame(renderTarget, this.fullFrame1, 1, true, true)
    }

    this.bind(this.shaderMain)

    this.set2f('uResolution', this.renderer.width, this.renderer.height)
    this.set1f('iTime', timeSeconds)

    this.set1f('uIntensity', this.intensity)
    this.set1f('uBlurAmount', this.blurAmount)
    this.set1f('uNoiseAmount', this.noiseAmount)
    this.set1f('uGradeAmount', this.gradeAmount)

    this.bindAndDraw(inputFrame)
  }
}

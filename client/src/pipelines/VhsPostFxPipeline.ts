import Phaser from 'phaser'

export const VHS_POSTFX_PIPELINE_KEY = 'VhsPostFx'

const COMMON_GLSL = `
#define DEFINE(a) (iResolution.y / 450.0) * a
#define pow2(a) (a * a)
#define PI 3.1415926535897932384626433832795
#define THIRD 1.0 / 3.0
#define BLACK vec4(0.0, 0.0, 0.0, 1.0)
#define WHITE vec4(1.0)
#define W vec3(0.2126, 0.7152, 0.0722)
#define PHI 1.61803398874989484820459
#define SOURCE_FPS 30.0

float GetLuminance(vec3 color)
{
    return W.r * color.r + W.g * color.g + W.b * color.b;
}

float GetLuminance(vec4 color)
{
    return W.r * color.r + W.g * color.g + W.b * color.b;
}

float GoldNoise(const in vec2 xy, const in float seed)
{
    return fract(sin(dot(xy * seed, vec2(12.9898, 78.233))) * 43758.5453);
}

float BlendSoftLight(float base, float blend)
{
    return (blend < 0.5)
        ? (2.0 * base * blend + base * base * (1.0 - 2.0 * blend))
        : (sqrt(base) * (2.0 * blend - 1.0) + 2.0 * base * (1.0 - blend));
}

vec4 BlendSoftLight(vec4 base, vec4 blend)
{
    return vec4(
        BlendSoftLight(base.r, blend.r),
        BlendSoftLight(base.g, blend.g),
        BlendSoftLight(base.b, blend.b),
        1.0
    );
}

vec4 BlendSoftLight(vec4 base, vec4 blend, float opacity)
{
    return (BlendSoftLight(base, blend) * opacity + base * (1.0 - opacity));
}
`

const SHADER_PREAMBLE = `
#ifdef GL_ES
precision mediump float;
#endif

varying vec2 outTexCoord;

uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float iTime;
uniform float iFrame;

#define iResolution vec3(uResolution, 1.0)
#define iChannel0 uMainSampler

vec4 tex2DBias(sampler2D s, vec2 uv, float bias)
{
    return texture2D(s, uv);
}
`

const PASS_A_FS = `${SHADER_PREAMBLE}

${COMMON_GLSL}

vec4 Shrink(in vec2 fragCoord, const in float shrinkRatio, const in float bias)
{
    float scale = 1.0 / iResolution.x;
    float numBands = iResolution.x * shrinkRatio;
    float bandWidth = iResolution.x / numBands;

    float t = mod(fragCoord.x, bandWidth) / bandWidth;

    fragCoord.x = floor(fragCoord.x * shrinkRatio) / shrinkRatio;
    vec2 uv = fragCoord / iResolution.xy;
    vec4 colorA = tex2DBias(iChannel0, uv, bias);

    uv.x += bandWidth * scale;
    vec4 colorB = tex2DBias(iChannel0, uv, bias);

    return mix(colorA, colorB, t);
}

vec3 ClipColor(in vec3 c)
{
    float l = GetLuminance(c);
    float n = min(min(c.r, c.g), c.b);
    float x = max(max(c.r, c.g), c.b);

    if (n < 0.0)
    {
        c.r = l + (((c.r - l) * l) / (l - n));
        c.g = l + (((c.g - l) * l) / (l - n));
        c.b = l + (((c.b - l) * l) / (l - n));
    }

    if (x > 1.0)
    {
        c.r = l + (((c.r - l) * (1.0 - l)) / (x - l));
        c.g = l + (((c.g - l) * (1.0 - l)) / (x - l));
        c.b = l + (((c.b - l) * (1.0 - l)) / (x - l));
    }

    return c;
}

vec3 SetLum(in vec3 c, in float l)
{
    float d = l - GetLuminance(c);
    c += d;

    return ClipColor(c);
}

vec4 BlendColor(const in vec4 base, const in vec4 blend)
{
    vec3 c = SetLum(blend.rgb, GetLuminance(base));
    return vec4(c, blend.a);
}

vec4 BlendLuminosity(const in vec4 base, const in vec4 blend)
{
    vec3 c = SetLum(base.rgb, GetLuminance(blend));
    return vec4(c, blend.a);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec4 luma = Shrink(fragCoord, 0.5, 0.0);
    luma = BlendLuminosity(vec4(0.5, 0.5, 0.5, 1.0), luma);

    vec4 chroma = Shrink(fragCoord, 1.0 / 32.0, 3.0);
    chroma = BlendColor(luma, chroma);

    fragColor = chroma;
}

void main()
{
    vec4 color;
    mainImage(color, outTexCoord * uResolution);
    gl_FragColor = color;
}
`

const PASS_B_FS = `${SHADER_PREAMBLE}

${COMMON_GLSL}

vec4 UnsharpMask(const in float amount, const in float radius, const in float threshold, const in float preBlurBias, const in vec2 fragCoord)
{
    vec2 uv = fragCoord / iResolution.xy;

    vec4 pixel = tex2DBias(iChannel0, uv, preBlurBias);
    vec4 blurPixel = tex2DBias(iChannel0, uv, preBlurBias + 1.0);

    float lumDelta = abs(GetLuminance(pixel) - GetLuminance(blurPixel));

    if (lumDelta >= threshold)
        pixel = pixel + (pixel - blurPixel) * amount;

    return pixel;
}

vec4 ClampLevels(in vec4 pixel, const in float blackLevel, const in float whiteLevel)
{
    pixel = mix(pixel, BLACK, 1.0 - whiteLevel);
    pixel = mix(pixel, WHITE, blackLevel);

    return pixel;
}

vec4 Saturation(vec4 pixel, float adjustment)
{
    vec3 intensity = vec3(dot(pixel.rgb, W));
    return vec4(mix(intensity, pixel.rgb, adjustment), 1.0);
}

vec4 TintShadows(vec4 pixel, vec3 color)
{
    const float POWER = 1.5;

    if (color.r > 0.0)
        pixel.r = mix(pixel.r, 1.0 - pow(abs(pixel.r - 1.0), POWER), color.r);
    if (color.g > 0.0)
        pixel.g = mix(pixel.g, 1.0 - pow(abs(pixel.g - 1.0), POWER), color.g);
    if (color.b > 0.0)
        pixel.b = mix(pixel.b, 1.0 - pow(abs(pixel.b - 1.0), POWER), color.b);

    return pixel;
}

const float PRE_BLUR_BIAS = 1.0;
const float UNSHARP_AMOUNT = 2.0;
const float UNSHARP_THRESHOLD = 0.0;
const float BLACK_LEVEL = 0.1;
const float WHITE_LEVEL = 0.9;
const float SATURATION_LEVEL = 0.75;
const vec3 SHADOW_TINT = vec3(0.0, 0.35, 0.1);

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    float UNSHARP_RADIUS = DEFINE(20.0);

    vec4 pixel = UnsharpMask(UNSHARP_AMOUNT, UNSHARP_RADIUS, UNSHARP_THRESHOLD, PRE_BLUR_BIAS, fragCoord);

    pixel = ClampLevels(pixel, BLACK_LEVEL, WHITE_LEVEL);
    pixel = TintShadows(pixel, SHADOW_TINT);
    pixel = Saturation(pixel, SATURATION_LEVEL);

    fragColor = pixel;
}

void main()
{
    vec4 color;
    mainImage(color, outTexCoord * uResolution);
    gl_FragColor = color;
}
`

const PASS_C_FS = `${SHADER_PREAMBLE}

${COMMON_GLSL}

uniform sampler2D uChannel1;
#define iChannel1 uChannel1

vec4 Noise(const in float grainSize, const in bool monochromatic, in vec2 fragCoord, float fps)
{
    float seed = fps > 0.0 ? floor(fract(iTime) * fps) / fps : iTime;
    seed += 1.0;

    if (grainSize > 1.0)
    {
        fragCoord.x = floor(fragCoord.x / grainSize);
        fragCoord.y = floor(fragCoord.y / grainSize);
    }

    fragCoord.x += 1.0;

    float r = GoldNoise(fragCoord, seed);
    float g = monochromatic ? r : GoldNoise(fragCoord, seed + 1.0);
    float b = monochromatic ? r : GoldNoise(fragCoord, seed + 2.0);

    return vec4(r, g, b, 1.0);
}

const float NOISE_BLEND = 0.05;

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    float LINE_HEIGHT = DEFINE(2.0);
    float NOISE_GRAIN_SIZE = DEFINE(4.0);

    vec2 uv = fragCoord / iResolution.xy;

    bool updateOddLines = mod(iFrame, 2.0) == 0.0;
    bool isOddLine = mod(floor(fragCoord.y), 2.0 * LINE_HEIGHT) >= LINE_HEIGHT;

    if ((isOddLine && updateOddLines) || (!isOddLine && !updateOddLines))
        fragColor = texture2D(iChannel1, uv);
    else
        fragColor = texture2D(iChannel0, uv);

    fragColor = BlendSoftLight(fragColor, Noise(NOISE_GRAIN_SIZE, true, fragCoord, SOURCE_FPS), NOISE_BLEND);
}

void main()
{
    vec4 color;
    mainImage(color, outTexCoord * uResolution);
    gl_FragColor = color;
}
`

const PASS_D_FS = `${SHADER_PREAMBLE}

${COMMON_GLSL}

vec2 Tracking(const in float speed, const in float offset, const in float jitter, const in vec2 fragCoord)
{
    float t = 1.0 - mod(iTime, speed) / speed;
    float trackingStart = mod(t * iResolution.y, iResolution.y);
    float trackingJitter = GoldNoise(vec2(5000.0, 5000.0), 10.0 + fract(iTime)) * jitter;

    trackingStart += trackingJitter;

    vec2 uv;
    if (fragCoord.y > trackingStart)
        uv = (fragCoord + vec2(offset, 0.0)) / iResolution.xy;
    else
        uv = fragCoord / iResolution.xy;

    return uv;
}

vec2 Wave(const in float frequency, const in float offset, const in vec2 fragCoord, const in vec2 uv)
{
    float phaseNumber = floor(fragCoord.y / (iResolution.y / frequency));
    float offsetNoiseModifier = GoldNoise(vec2(1.0 + phaseNumber, phaseNumber), 10.0);

    float offsetUV = sin((uv.y + fract(iTime * 0.05)) * PI * 2.0 * frequency) * ((offset * offsetNoiseModifier) / iResolution.x);

    return uv + vec2(offsetUV, 0.0);
}

vec4 WarpBottom(const in float height, const in float offset, const in float jitterExtent, in vec2 uv)
{
    float uvHeight = height / iResolution.y;
    if (uv.y > uvHeight)
        return texture2D(iChannel0, uv);

    float t = uv.y / uvHeight;

    float offsetUV = t * (offset / iResolution.x);
    float jitterUV = (GoldNoise(vec2(500.0, 500.0), fract(iTime)) * jitterExtent) / iResolution.x;

    uv = vec2(uv.x - offsetUV - jitterUV, uv.y);

    vec4 pixel = texture2D(iChannel0, uv);

    pixel = pixel * t;

    return pixel;
}

vec4 WhiteNoise(const in float lineThickness, const in float opacity, const in vec4 pixel, const in vec2 fragCoord)
{
    if (GoldNoise(vec2(600.0, 500.0), fract(iTime) * 10.0) > 0.97)
    {
        float lineStart = floor(GoldNoise(vec2(800.0, 50.0), fract(iTime)) * iResolution.y);
        float lineEnd = floor(lineStart + lineThickness);

        if (floor(fragCoord.y) >= lineStart && floor(fragCoord.y) < lineEnd)
        {
            float frequency = GoldNoise(vec2(850.0, 50.0), fract(iTime)) * 3.0 + 1.0;
            float offset = GoldNoise(vec2(900.0, 51.0), fract(iTime));
            float x = floor(fragCoord.x) / floor(iResolution.x) + offset;
            float white = pow(cos(PI * fract(x * frequency) / 2.0), 10.0) * opacity;
            float grit = GoldNoise(vec2(floor(fragCoord.x / 3.0), 800.0), fract(iTime));
            white = max(white - grit * 0.3, 0.0);

            return pixel + white;
        }
    }

    return pixel;
}

const float TRACKING_SPEED = 8.0;
const float WAVE_FREQUENCY = 18.0;
const float TRACKING_JITTER = 20.0;

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    float TRACKING_HORIZONTAL_OFFSET = DEFINE(8.0);
    float WAVE_OFFSET = DEFINE(0.8);

    float BOTTOM_WARP_HEIGHT = DEFINE(15.0);
    float BOTTOM_WARP_OFFSET = DEFINE(100.0);
    float BOTTOM_WARP_JITTER_EXTENT = DEFINE(50.0);

    float NOISE_HEIGHT = DEFINE(6.0);

    vec2 uv = Tracking(TRACKING_SPEED, TRACKING_HORIZONTAL_OFFSET, TRACKING_JITTER, fragCoord);
    uv = Wave(WAVE_FREQUENCY, WAVE_OFFSET, fragCoord, uv);

    vec4 pixel = WarpBottom(BOTTOM_WARP_HEIGHT, BOTTOM_WARP_OFFSET, BOTTOM_WARP_JITTER_EXTENT, uv);
    pixel = WhiteNoise(NOISE_HEIGHT, 0.3, pixel, fragCoord);

    fragColor = pixel;
}

void main()
{
    vec4 color;
    mainImage(color, outTexCoord * uResolution);
    gl_FragColor = color;
}
`

const PASS_IMAGE_FS = `${SHADER_PREAMBLE}

${COMMON_GLSL}

uniform sampler2D uChannel1;
uniform float uBypass;
#define iChannel1 uChannel1

const float FINAL_BLUR_BIAS = 1.0;
const float VIGNETTE_STRENGTH = 0.25;

vec4 Televisionfy(in vec4 pixel, const in vec2 uv)
{
    float vignette = pow(uv.x * (1.0 - uv.x) * uv.y * (1.0 - uv.y), 0.25) * 2.2;
    vignette = mix(1.0, vignette, VIGNETTE_STRENGTH);
    return pixel * vignette;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec2 uv = fragCoord / iResolution.xy;

    if (uBypass <= 0.5)
    {
        fragColor = tex2DBias(iChannel0, uv, FINAL_BLUR_BIAS);
        fragColor = Televisionfy(fragColor, uv);
    }
    else
    {
        fragColor = texture2D(iChannel1, uv);
    }
}

void main()
{
    vec4 color;
    mainImage(color, outTexCoord * uResolution);
    gl_FragColor = color;
}
`

export class VhsPostFxPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  private shaderA?: Phaser.Renderer.WebGL.WebGLShader
  private shaderB?: Phaser.Renderer.WebGL.WebGLShader
  private shaderC?: Phaser.Renderer.WebGL.WebGLShader
  private shaderD?: Phaser.Renderer.WebGL.WebGLShader
  private shaderImage?: Phaser.Renderer.WebGL.WebGLShader

  private bypass = 0

  private useHalfRes = true

  constructor(game: Phaser.Game) {
    super({
      game,
      name: VHS_POSTFX_PIPELINE_KEY,
      renderTarget: 4,
      shaders: [
        {
          name: 'passA',
          fragShader: PASS_A_FS,
        },
        {
          name: 'passB',
          fragShader: PASS_B_FS,
        },
        {
          name: 'passC',
          fragShader: PASS_C_FS,
        },
        {
          name: 'passD',
          fragShader: PASS_D_FS,
        },
        {
          name: 'image',
          fragShader: PASS_IMAGE_FS,
        },
      ],
    })
  }

  setBypass(next: boolean) {
    this.bypass = next ? 1 : 0
  }

  setHalfRes(next: boolean) {
    this.useHalfRes = next
  }

  getHalfRes(): boolean {
    return this.useHalfRes
  }

  bootFX() {
    super.bootFX()

    this.shaderA = this.getShaderByName('passA')
    this.shaderB = this.getShaderByName('passB')
    this.shaderC = this.getShaderByName('passC')
    this.shaderD = this.getShaderByName('passD')
    this.shaderImage = this.getShaderByName('image')
  }

  private setCommonUniforms(timeSeconds: number, frame: number, width: number, height: number) {
    this.set2f('uResolution', width, height)
    this.set1f('iTime', timeSeconds)
    this.set1f('iFrame', frame)
  }

  onDraw(renderTarget: Phaser.Renderer.WebGL.RenderTarget) {
    if (!this.shaderA || !this.shaderB || !this.shaderC || !this.shaderD || !this.shaderImage) {
      this.shaderA = this.getShaderByName('passA')
      this.shaderB = this.getShaderByName('passB')
      this.shaderC = this.getShaderByName('passC')
      this.shaderD = this.getShaderByName('passD')
      this.shaderImage = this.getShaderByName('image')
    }

    const timeSeconds = this.game.loop.time / 1000
    const frame = this.game.loop.frame
    const gl = this.gl

    const fullWidth = this.renderer.width
    const fullHeight = this.renderer.height

    const inputFrame = this.fullFrame1 ?? renderTarget
    if (this.fullFrame1) {
      this.copyFrame(renderTarget, this.fullFrame1, 1, true, true)
    }

    if (this.useHalfRes && this.halfFrame1 && this.halfFrame2) {
      const halfWidth = this.halfFrame1.width
      const halfHeight = this.halfFrame1.height

      const rtC0 = this.renderTargets[2]
      const rtC1 = this.renderTargets[3]

      const useFirst = frame % 2 === 0
      const rtCPrev = useFirst ? rtC0 : rtC1
      const rtCCur = useFirst ? rtC1 : rtC0

      this.bind(this.shaderA)
      this.setCommonUniforms(timeSeconds, frame, halfWidth, halfHeight)
      gl.viewport(0, 0, halfWidth, halfHeight)
      this.bindAndDraw(inputFrame, this.halfFrame1)

      this.bind(this.shaderB)
      this.setCommonUniforms(timeSeconds, frame, halfWidth, halfHeight)
      gl.viewport(0, 0, halfWidth, halfHeight)
      this.bindAndDraw(this.halfFrame1, this.halfFrame2)

      this.bind(this.shaderC)
      this.setCommonUniforms(timeSeconds, frame, fullWidth, fullHeight)
      gl.viewport(0, 0, fullWidth, fullHeight)
      this.set1i('uChannel1', 1)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, rtCPrev.texture.webGLTexture)
      gl.activeTexture(gl.TEXTURE0)
      this.bindAndDraw(this.halfFrame2, rtCCur)

      this.bind(this.shaderD)
      this.setCommonUniforms(timeSeconds, frame, fullWidth, fullHeight)
      gl.viewport(0, 0, fullWidth, fullHeight)
      this.bindAndDraw(rtCCur, this.renderTargets[1])

      this.bind(this.shaderImage)
      this.setCommonUniforms(timeSeconds, frame, fullWidth, fullHeight)
      gl.viewport(0, 0, fullWidth, fullHeight)
      this.set1f('uBypass', this.bypass)
      this.set1i('uChannel1', 1)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, inputFrame.texture.webGLTexture)
      gl.activeTexture(gl.TEXTURE0)
      this.bindAndDraw(this.renderTargets[1])
    } else {
      const rtA = this.renderTargets[0]
      const rtB = this.renderTargets[1]
      const rtC0 = this.renderTargets[2]
      const rtC1 = this.renderTargets[3]

      const useFirst = frame % 2 === 0
      const rtCPrev = useFirst ? rtC0 : rtC1
      const rtCCur = useFirst ? rtC1 : rtC0

      this.bind(this.shaderA)
      this.setCommonUniforms(timeSeconds, frame, fullWidth, fullHeight)
      this.bindAndDraw(inputFrame, rtA)

      this.bind(this.shaderB)
      this.setCommonUniforms(timeSeconds, frame, fullWidth, fullHeight)
      this.bindAndDraw(rtA, rtB)

      this.bind(this.shaderC)
      this.setCommonUniforms(timeSeconds, frame, fullWidth, fullHeight)
      this.set1i('uChannel1', 1)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, rtCPrev.texture.webGLTexture)
      gl.activeTexture(gl.TEXTURE0)
      this.bindAndDraw(rtB, rtCCur)

      this.bind(this.shaderD)
      this.setCommonUniforms(timeSeconds, frame, fullWidth, fullHeight)
      this.bindAndDraw(rtCCur, rtB)

      this.bind(this.shaderImage)
      this.setCommonUniforms(timeSeconds, frame, fullWidth, fullHeight)
      this.set1f('uBypass', this.bypass)
      this.set1i('uChannel1', 1)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, inputFrame.texture.webGLTexture)
      gl.activeTexture(gl.TEXTURE0)
      this.bindAndDraw(rtB)
    }

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, null)
    gl.activeTexture(gl.TEXTURE0)
  }
}

import Phaser from 'phaser'

export const CRT_POSTFX_PIPELINE_KEY = 'CrtPostFx'

// Default fragment shader code - GLSL ES 1.0 compatible
const DEFAULT_FRAG_SHADER = `
#ifdef GL_ES
precision mediump float;
#endif

uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uTime;
uniform float uTexSize;
uniform float uMaskType;
uniform float uCurve;
uniform float uSharpness;
uniform float uColorOffset;
uniform float uMaskBrightness;
uniform float uScanlineBrightness;
uniform float uMinScanlineThickness;
uniform float uAspect;
uniform float uWobbleStrength;

#define TAU 6.283185307179586476925286766559

varying vec2 outTexCoord;

// ES 1.0 compatible modulo for floats
float fmod(float a, float b)
{
    return a - b * floor(a / b);
}

float GetWobble()
{
    return cos(uTime * TAU * 15.0) * uWobbleStrength / 8192.0;
}

vec2 Warp(vec2 uv, float aspect, float curve)
{
    uv -= 0.5;
    uv.x /= aspect;
    float warping = dot(uv, uv) * curve;
    warping -= curve * 0.25;
    uv /= 1.0 - warping;
    uv.x *= aspect;
    uv += 0.5;
    return uv;
}

// ES 1.0 compatible sRGB conversions using step() instead of lessThan() with mix()
vec3 LinearToSrgb(vec3 col)
{
    vec3 lo = col * 12.92;
    vec3 hi = (pow(col, vec3(1.0 / 2.4)) * 1.055) - 0.055;
    vec3 t = step(vec3(0.0031318), col);
    return mix(lo, hi, t);
}

vec3 SrgbToLinear(vec3 col)
{
    vec3 lo = col / 12.92;
    vec3 hi = pow((col + 0.055) / 1.055, vec3(2.4));
    vec3 t = step(vec3(0.04045), col);
    return mix(lo, hi, t);
}

vec3 Scanlines(vec2 uv)
{
    vec2 texSize = vec2(uTexSize * uAspect, uTexSize);
    uv *= texSize;
    
    float fy = floor(uv.y + 0.5) - 1.0;
    float x = floor(uv.x);
    
    float ax = x - 2.0;
    float bx = x - 1.0;
    float cx = x;
    float dx = x + 1.0;
    float ex = x + 2.0;
    
    vec2 uvA = vec2(ax / texSize.x, fy / texSize.y);
    vec2 uvB = vec2(bx / texSize.x, fy / texSize.y);
    vec2 uvC = vec2(cx / texSize.x, fy / texSize.y);
    vec2 uvD = vec2(dx / texSize.x, fy / texSize.y);
    vec2 uvE = vec2(ex / texSize.x, fy / texSize.y);
    
    vec3 upper_a = texture2D(uMainSampler, uvA).rgb;
    vec3 upper_b = texture2D(uMainSampler, uvB).rgb;
    vec3 upper_c = texture2D(uMainSampler, uvC).rgb;
    vec3 upper_d = texture2D(uMainSampler, uvD).rgb;
    vec3 upper_e = texture2D(uMainSampler, uvE).rgb;
    
    fy += 1.0;
    
    vec2 uvA2 = vec2(ax / texSize.x, fy / texSize.y);
    vec2 uvB2 = vec2(bx / texSize.x, fy / texSize.y);
    vec2 uvC2 = vec2(cx / texSize.x, fy / texSize.y);
    vec2 uvD2 = vec2(dx / texSize.x, fy / texSize.y);
    vec2 uvE2 = vec2(ex / texSize.x, fy / texSize.y);
    
    vec3 lower_a = texture2D(uMainSampler, uvA2).rgb;
    vec3 lower_b = texture2D(uMainSampler, uvB2).rgb;
    vec3 lower_c = texture2D(uMainSampler, uvC2).rgb;
    vec3 lower_d = texture2D(uMainSampler, uvD2).rgb;
    vec3 lower_e = texture2D(uMainSampler, uvE2).rgb;
    
    upper_a = SrgbToLinear(upper_a);
    upper_b = SrgbToLinear(upper_b);
    upper_c = SrgbToLinear(upper_c);
    upper_d = SrgbToLinear(upper_d);
    upper_e = SrgbToLinear(upper_e);
    
    lower_a = SrgbToLinear(lower_a);
    lower_b = SrgbToLinear(lower_b);
    lower_c = SrgbToLinear(lower_c);
    lower_d = SrgbToLinear(lower_d);
    lower_e = SrgbToLinear(lower_e);
    
    vec3 beam = vec3(uv.x - 0.5);
    beam.r -= uColorOffset;
    beam.b += uColorOffset;
    
    vec3 weight_a = smoothstep(1.0, 0.0, (beam - ax) * uSharpness);
    vec3 weight_b = smoothstep(1.0, 0.0, (beam - bx) * uSharpness);
    vec3 weight_c = smoothstep(1.0, 0.0, abs(beam - cx) * uSharpness);
    vec3 weight_d = smoothstep(1.0, 0.0, (dx - beam) * uSharpness);
    vec3 weight_e = smoothstep(1.0, 0.0, (ex - beam) * uSharpness);
    
    vec3 upper_col = upper_a * weight_a + upper_b * weight_b + upper_c * weight_c + upper_d * weight_d + upper_e * weight_e;
    vec3 lower_col = lower_a * weight_a + lower_b * weight_b + lower_c * weight_c + lower_d * weight_d + lower_e * weight_e;
    
    vec3 weight_scaler = vec3(1.0) / (weight_a + weight_b + weight_c + weight_d + weight_e);
    
    upper_col *= weight_scaler;
    lower_col *= weight_scaler;
    
    upper_col *= uScanlineBrightness;
    lower_col *= uScanlineBrightness;
    
    vec3 upper_thickness = mix(vec3(uMinScanlineThickness), vec3(1.0), upper_col);
    vec3 lower_thickness = mix(vec3(uMinScanlineThickness), vec3(1.0), lower_col);
    
    float sawtooth = (uv.y + 0.5) - fy;
    
    vec3 upper_line = vec3(sawtooth) / upper_thickness;
    upper_line = smoothstep(1.0, 0.0, upper_line);
    
    vec3 lower_line = vec3(1.0 - sawtooth) / lower_thickness;
    lower_line = smoothstep(1.0, 0.0, lower_line);
    
    upper_line *= upper_col / upper_thickness;
    lower_line *= lower_col / lower_thickness;
    
    return upper_line + lower_line;
}

// Mask patterns using float math instead of integer modulo and dynamic array indexing
vec4 MaskDots(vec2 fragcoord)
{
    float fx = fmod(floor(fragcoord.x), 4.0);
    float fy = fmod(floor(fragcoord.y), 2.0);
    float idx = fmod(fy * 2.0 + fx, 4.0);
    
    vec3 col = vec3(0.0);
    if (idx < 0.5) col = vec3(1.0, 0.0, 0.0);
    else if (idx < 1.5) col = vec3(0.0, 1.0, 0.0);
    else if (idx < 2.5) col = vec3(0.0, 0.0, 1.0);
    // else col = vec3(0.0) - already set
    
    return vec4(col, 0.25);
}

vec4 MaskGrille(vec2 fragcoord)
{
    float fx = fmod(floor(fragcoord.x), 2.0);
    
    vec3 col = vec3(0.0, 1.0, 0.0);
    if (fx >= 1.0) col = vec3(1.0, 0.0, 1.0);
    
    return vec4(col, 0.5);
}

vec4 MaskWideGrille(vec2 fragcoord)
{
    float fx = fmod(floor(fragcoord.x), 4.0);
    
    vec3 col = vec3(0.0);
    if (fx < 0.5) col = vec3(1.0, 0.0, 0.0);
    else if (fx < 1.5) col = vec3(0.0, 1.0, 0.0);
    else if (fx < 2.5) col = vec3(0.0, 0.0, 1.0);
    // else col = vec3(0.0) - already set
    
    return vec4(col, 0.25);
}

vec4 MaskWideSoftGrille(vec2 fragcoord)
{
    float fx = fmod(floor(fragcoord.x), 4.0);
    
    vec3 col = vec3(0.125, 0.0, 0.125);
    if (fx < 0.5) col = vec3(1.0, 0.125, 0.0);
    else if (fx < 1.5) col = vec3(0.125, 1.0, 0.125);
    else if (fx < 2.5) col = vec3(0.0, 0.125, 1.0);
    
    return vec4(col, 0.3125);
}

vec4 MaskSlot(vec2 fragcoord)
{
    float fx = fmod(floor(fragcoord.x), 4.0);
    float fy = fmod(floor(fragcoord.y), 4.0);
    
    // Simplified slot mask - alternating pattern
    vec3 col = vec3(0.0);
    
    if (fy < 1.0) {
        if (fx < 1.0) col = vec3(1.0, 0.0, 1.0);
        else if (fx < 2.0) col = vec3(0.0, 1.0, 0.0);
        else if (fx < 3.0) col = vec3(1.0, 0.0, 1.0);
        else col = vec3(0.0, 1.0, 0.0);
    } else if (fy < 2.0) {
        if (fx < 1.0) col = vec3(0.0, 0.0, 1.0);
        else if (fx < 2.0) col = vec3(0.0, 1.0, 0.0);
        else if (fx < 3.0) col = vec3(1.0, 0.0, 0.0);
        // else col = vec3(0.0) - already set
    } else if (fy < 3.0) {
        if (fx < 1.0) col = vec3(1.0, 0.0, 1.0);
        else if (fx < 2.0) col = vec3(0.0, 1.0, 0.0);
        else if (fx < 3.0) col = vec3(1.0, 0.0, 1.0);
        else col = vec3(0.0, 1.0, 0.0);
    } else {
        if (fx < 1.0) col = vec3(1.0, 0.0, 0.0);
        else if (fx < 2.0) col = vec3(0.0);
        else if (fx < 3.0) col = vec3(0.0, 0.0, 1.0);
        else col = vec3(0.0, 1.0, 0.0);
    }
    
    return vec4(col, 0.375);
}

vec4 GenerateMask(vec2 fragcoord, float maskType)
{
    if (maskType < 1.5)
        return MaskDots(fragcoord);
    else if (maskType < 2.5)
        return MaskGrille(fragcoord);
    else if (maskType < 3.5)
        return MaskWideGrille(fragcoord);
    else if (maskType < 4.5)
        return MaskWideSoftGrille(fragcoord);
    else if (maskType < 5.5)
        return MaskSlot(fragcoord);
    else
        return vec4(vec3(0.5), 0.5);
}

vec3 ApplyMask(vec3 linear_color, vec2 fragcoord, float maskType, float maskBrightness)
{
    vec4 mask = GenerateMask(fragcoord, maskType);
    linear_color *= mix(mask.w, 1.0, maskBrightness);
    vec3 target_color = linear_color / mask.w;
    vec3 primary_col = clamp(target_color, 0.0, 1.0);
    vec3 highlights = target_color - primary_col;
    highlights /= 1.0 / mask.w - 1.0;
    primary_col *= mask.rgb;
    primary_col += highlights * (1.0 - mask.rgb);
    return primary_col;
}

void main()
{
    vec2 warped_coords = Warp(outTexCoord, uAspect, uCurve);
    warped_coords.x += GetWobble();
    
    if (warped_coords.x < 0.0 || warped_coords.x > 1.0 || warped_coords.y < 0.0 || warped_coords.y > 1.0)
    {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
    
    vec3 col = Scanlines(warped_coords);
    vec2 fragcoord = outTexCoord * uResolution;
    col = ApplyMask(col, fragcoord, uMaskType, uMaskBrightness);
    col = LinearToSrgb(col);
    
    gl_FragColor = vec4(col, 1.0);
}
`

export interface CrtShaderUniforms {
  /** Mask type: 0=null, 1=dots, 2=grille, 3=wide grille, 4=wide soft grille, 5=slot */
  maskType?: number
  /** Screen curvature amount (0.0 to 0.5) */
  curve?: number
  /** Image sharpness (0.5 to 1.0) */
  sharpness?: number
  /** RGB channel offset (-0.5 to 0.5) */
  colorOffset?: number
  /** Mask brightness preservation (0.0 to 1.0) */
  maskBrightness?: number
  /** Scanline brightness (0.5 to 1.0) */
  scanlineBrightness?: number
  /** Minimum scanline thickness (0.25 to 1.0) */
  minScanlineThickness?: number
  /** Screen aspect ratio (0.5 to 1.0, typically 0.5625 for 16:9) */
  aspect?: number
  /** Horizontal wobble strength (0.0 to 1.0) */
  wobbleStrength?: number
  /** Texture height for scanline calculation (e.g., 240 for 1080p, 480 for 4K) */
  texSize?: number
}

export class CrtPostFxPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  private uniforms: Required<CrtShaderUniforms>

  constructor(game: Phaser.Game, fragShader?: string) {
    super({
      game,
      name: CRT_POSTFX_PIPELINE_KEY,
      fragShader: fragShader || DEFAULT_FRAG_SHADER,
    })

    // Default values matching the original Godot shader
    this.uniforms = {
      maskType: 1, // Dots
      curve: 0.0,
      sharpness: 0.667,
      colorOffset: 0.0,
      maskBrightness: 1.0,
      scanlineBrightness: 1.0,
      minScanlineThickness: 0.5,
      aspect: 0.75,
      wobbleStrength: 0.0,
      texSize: 240, // Default for 1080p
    }
  }

  onPreRender(): void {
    super.onPreRender()

    this.set1f('uMaskType', this.uniforms.maskType)
    this.set1f('uCurve', this.uniforms.curve)
    this.set1f('uSharpness', this.uniforms.sharpness)
    this.set1f('uColorOffset', this.uniforms.colorOffset)
    this.set1f('uMaskBrightness', this.uniforms.maskBrightness)
    this.set1f('uScanlineBrightness', this.uniforms.scanlineBrightness)
    this.set1f('uMinScanlineThickness', this.uniforms.minScanlineThickness)
    this.set1f('uAspect', this.uniforms.aspect)
    this.set1f('uWobbleStrength', this.uniforms.wobbleStrength)
    this.set1f('uTexSize', this.uniforms.texSize)
    this.set1f('uTime', this.game.loop.time / 1000)
  }

  onDraw(renderTarget: Phaser.Renderer.WebGL.RenderTarget): void {
    this.set2f('uResolution', this.renderer.width, this.renderer.height)
    this.bindAndDraw(renderTarget)
  }

  setUniforms(uniforms: CrtShaderUniforms): void {
    this.uniforms = { ...this.uniforms, ...uniforms }
  }

  getUniforms(): Required<CrtShaderUniforms> {
    return { ...this.uniforms }
  }

  // Convenience methods for individual uniform updates
  setMaskType(type: number): void {
    this.uniforms.maskType = Math.max(0, Math.min(5, Math.floor(type)))
  }

  setCurve(curve: number): void {
    this.uniforms.curve = Math.max(0.0, Math.min(0.5, curve))
  }

  setSharpness(sharpness: number): void {
    this.uniforms.sharpness = Math.max(0.5, Math.min(1.0, sharpness))
  }

  setColorOffset(offset: number): void {
    this.uniforms.colorOffset = Math.max(-0.5, Math.min(0.5, offset))
  }

  setMaskBrightness(brightness: number): void {
    this.uniforms.maskBrightness = Math.max(0.0, Math.min(1.0, brightness))
  }

  setScanlineBrightness(brightness: number): void {
    this.uniforms.scanlineBrightness = Math.max(0.5, Math.min(1.0, brightness))
  }

  setMinScanlineThickness(thickness: number): void {
    this.uniforms.minScanlineThickness = Math.max(0.25, Math.min(1.0, thickness))
  }

  setAspect(aspect: number): void {
    this.uniforms.aspect = Math.max(0.5, Math.min(1.0, aspect))
  }

  setWobbleStrength(strength: number): void {
    this.uniforms.wobbleStrength = Math.max(0.0, Math.min(1.0, strength))
  }

  setTexSize(size: number): void {
    this.uniforms.texSize = Math.max(120, size)
  }
}

// Factory function for easy registration
export function createCrtPipeline(game: Phaser.Game, fragShader?: string): CrtPostFxPipeline {
  return new CrtPostFxPipeline(game, fragShader)
}

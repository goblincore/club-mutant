/**
 * Standalone WebGL CRT Shader
 * 
 * Use this class to apply the CRT shader effect to any HTML canvas element
 * outside of Phaser. Useful for applying the effect to video elements,
 * UI overlays, or other non-Phaser content.
 * 
 * Usage:
 * ```typescript
 * const crt = new CrtShaderEffect(canvasElement);
 * crt.setUniforms({ maskType: 2, curve: 0.1 });
 * crt.render();
 * 
 * // In animation loop:
 * function animate() {
 *     crt.render();
 *     requestAnimationFrame(animate);
 * }
 * ```
 */

export interface CrtEffectUniforms {
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

// Vertex shader for full-screen quad
const VERTEX_SHADER_SOURCE = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;

void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
}
`

// Fragment shader (same as Phaser version but with v_texCoord instead of outTexCoord)
const FRAGMENT_SHADER_SOURCE = `
#ifdef GL_ES
precision mediump float;
#endif

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_texSize;
uniform int u_maskType;
uniform float u_curve;
uniform float u_sharpness;
uniform float u_colorOffset;
uniform float u_maskBrightness;
uniform float u_scanlineBrightness;
uniform float u_minScanlineThickness;
uniform float u_aspect;
uniform float u_wobbleStrength;

#define TAU 6.283185307179586476925286766559

varying vec2 v_texCoord;

float GetWobble()
{
    return cos(u_time * TAU * 15.0) * u_wobbleStrength / 8192.0;
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

vec3 LinearToSrgb(vec3 col)
{
    return mix(
        (pow(col, vec3(1.0 / 2.4)) * 1.055) - 0.055,
        col * 12.92,
        lessThan(col, vec3(0.0031318))
    );
}

vec3 SrgbToLinear(vec3 col)
{
    return mix(
        pow((col + 0.055) / 1.055, vec3(2.4)),
        col / 12.92,
        lessThan(col, vec3(0.04045))
    );
}

vec3 Scanlines(vec2 uv)
{
    vec2 texSize = vec2(u_texSize * u_aspect, u_texSize);
    uv *= texSize;
    
    int y = int(uv.y + 0.5) - 1;
    float x = floor(uv.x);
    
    float ax = x - 2.0;
    float bx = x - 1.0;
    float cx = x;
    float dx = x + 1.0;
    float ex = x + 2.0;
    
    vec2 uvA = vec2(ax / texSize.x, float(y) / texSize.y);
    vec2 uvB = vec2(bx / texSize.x, float(y) / texSize.y);
    vec2 uvC = vec2(cx / texSize.x, float(y) / texSize.y);
    vec2 uvD = vec2(dx / texSize.x, float(y) / texSize.y);
    vec2 uvE = vec2(ex / texSize.x, float(y) / texSize.y);
    
    vec3 upper_a = texture2D(u_texture, uvA).rgb;
    vec3 upper_b = texture2D(u_texture, uvB).rgb;
    vec3 upper_c = texture2D(u_texture, uvC).rgb;
    vec3 upper_d = texture2D(u_texture, uvD).rgb;
    vec3 upper_e = texture2D(u_texture, uvE).rgb;
    
    y += 1;
    
    vec2 uvA2 = vec2(ax / texSize.x, float(y) / texSize.y);
    vec2 uvB2 = vec2(bx / texSize.x, float(y) / texSize.y);
    vec2 uvC2 = vec2(cx / texSize.x, float(y) / texSize.y);
    vec2 uvD2 = vec2(dx / texSize.x, float(y) / texSize.y);
    vec2 uvE2 = vec2(ex / texSize.x, float(y) / texSize.y);
    
    vec3 lower_a = texture2D(u_texture, uvA2).rgb;
    vec3 lower_b = texture2D(u_texture, uvB2).rgb;
    vec3 lower_c = texture2D(u_texture, uvC2).rgb;
    vec3 lower_d = texture2D(u_texture, uvD2).rgb;
    vec3 lower_e = texture2D(u_texture, uvE2).rgb;
    
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
    beam.r -= u_colorOffset;
    beam.b += u_colorOffset;
    
    vec3 weight_a = smoothstep(1.0, 0.0, (beam - ax) * u_sharpness);
    vec3 weight_b = smoothstep(1.0, 0.0, (beam - bx) * u_sharpness);
    vec3 weight_c = smoothstep(1.0, 0.0, abs(beam - cx) * u_sharpness);
    vec3 weight_d = smoothstep(1.0, 0.0, (dx - beam) * u_sharpness);
    vec3 weight_e = smoothstep(1.0, 0.0, (ex - beam) * u_sharpness);
    
    vec3 upper_col = upper_a * weight_a + upper_b * weight_b + upper_c * weight_c + upper_d * weight_d + upper_e * weight_e;
    vec3 lower_col = lower_a * weight_a + lower_b * weight_b + lower_c * weight_c + lower_d * weight_d + lower_e * weight_e;
    
    vec3 weight_scaler = vec3(1.0) / (weight_a + weight_b + weight_c + weight_d + weight_e);
    
    upper_col *= weight_scaler;
    lower_col *= weight_scaler;
    
    upper_col *= u_scanlineBrightness;
    lower_col *= u_scanlineBrightness;
    
    vec3 upper_thickness = mix(vec3(u_minScanlineThickness), vec3(1.0), upper_col);
    vec3 lower_thickness = mix(vec3(u_minScanlineThickness), vec3(1.0), lower_col);
    
    float sawtooth = (uv.y + 0.5) - float(y);
    
    vec3 upper_line = vec3(sawtooth) / upper_thickness;
    upper_line = smoothstep(1.0, 0.0, upper_line);
    
    vec3 lower_line = vec3(1.0 - sawtooth) / lower_thickness;
    lower_line = smoothstep(1.0, 0.0, lower_line);
    
    upper_line *= upper_col / upper_thickness;
    lower_line *= lower_col / lower_thickness;
    
    return upper_line + lower_line;
}

vec4 MaskDots(vec2 fragcoord)
{
    vec3 pattern[4];
    pattern[0] = vec3(1.0, 0.0, 0.0);
    pattern[1] = vec3(0.0, 1.0, 0.0);
    pattern[2] = vec3(0.0, 0.0, 1.0);
    pattern[3] = vec3(0.0, 0.0, 0.0);
    ivec2 icoords = ivec2(fragcoord);
    int idx = (icoords.y * 2 + icoords.x) % 4;
    return vec4(pattern[idx], 0.25);
}

vec4 MaskGrille(vec2 fragcoord)
{
    vec3 pattern[2];
    pattern[0] = vec3(0.0, 1.0, 0.0);
    pattern[1] = vec3(1.0, 0.0, 1.0);
    return vec4(pattern[int(fragcoord.x) % 2], 0.5);
}

vec4 MaskWideGrille(vec2 fragcoord)
{
    vec3 pattern[4];
    pattern[0] = vec3(1.0, 0.0, 0.0);
    pattern[1] = vec3(0.0, 1.0, 0.0);
    pattern[2] = vec3(0.0, 0.0, 1.0);
    pattern[3] = vec3(0.0, 0.0, 0.0);
    return vec4(pattern[int(fragcoord.x) % 4], 0.25);
}

vec4 MaskWideSoftGrille(vec2 fragcoord)
{
    vec3 pattern[4];
    pattern[0] = vec3(1.0, 0.125, 0.0);
    pattern[1] = vec3(0.125, 1.0, 0.125);
    pattern[2] = vec3(0.0, 0.125, 1.0);
    pattern[3] = vec3(0.125, 0.0, 0.125);
    return vec4(pattern[int(fragcoord.x) % 4], 0.3125);
}

vec4 MaskSlot(vec2 fragcoord)
{
    vec3 pattern[16];
    pattern[0] = vec3(1.0, 0.0, 1.0);
    pattern[1] = vec3(0.0, 1.0, 0.0);
    pattern[2] = vec3(1.0, 0.0, 1.0);
    pattern[3] = vec3(0.0, 1.0, 0.0);
    pattern[4] = vec3(0.0, 0.0, 1.0);
    pattern[5] = vec3(0.0, 1.0, 0.0);
    pattern[6] = vec3(1.0, 0.0, 0.0);
    pattern[7] = vec3(0.0, 0.0, 0.0);
    pattern[8] = vec3(1.0, 0.0, 1.0);
    pattern[9] = vec3(0.0, 1.0, 0.0);
    pattern[10] = vec3(1.0, 0.0, 1.0);
    pattern[11] = vec3(0.0, 1.0, 0.0);
    pattern[12] = vec3(1.0, 0.0, 0.0);
    pattern[13] = vec3(0.0, 0.0, 0.0);
    pattern[14] = vec3(0.0, 0.0, 1.0);
    pattern[15] = vec3(0.0, 1.0, 0.0);
    ivec2 icoords = ivec2(fragcoord) % 4;
    return vec4(pattern[icoords.y * 4 + icoords.x], 0.375);
}

vec4 GenerateMask(vec2 fragcoord, int maskType)
{
    if (maskType == 1)
        return MaskDots(fragcoord);
    else if (maskType == 2)
        return MaskGrille(fragcoord);
    else if (maskType == 3)
        return MaskWideGrille(fragcoord);
    else if (maskType == 4)
        return MaskWideSoftGrille(fragcoord);
    else if (maskType == 5)
        return MaskSlot(fragcoord);
    else
        return vec4(0.5);
}

vec3 ApplyMask(vec3 linear_color, vec2 fragcoord, int maskType, float maskBrightness)
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
    vec2 warped_coords = Warp(v_texCoord, u_aspect, u_curve);
    warped_coords.x += GetWobble();
    
    if (warped_coords.x < 0.0 || warped_coords.x > 1.0 || warped_coords.y < 0.0 || warped_coords.y > 1.0)
    {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
    
    vec3 col = Scanlines(warped_coords);
    vec2 fragcoord = v_texCoord * u_resolution;
    col = ApplyMask(col, fragcoord, u_maskType, u_maskBrightness);
    col = LinearToSrgb(col);
    
    gl_FragColor = vec4(col, 1.0);
}
`

export class CrtShaderEffect {
  private gl: WebGLRenderingContext
  private program: WebGLProgram
  private positionBuffer: WebGLBuffer
  private texCoordBuffer: WebGLBuffer
  private texture: WebGLTexture | null = null
  private startTime: number
  private uniforms: Required<CrtEffectUniforms>

  // Uniform locations
  private locs: {
    texture: WebGLUniformLocation | null
    resolution: WebGLUniformLocation | null
    time: WebGLUniformLocation | null
    texSize: WebGLUniformLocation | null
    maskType: WebGLUniformLocation | null
    curve: WebGLUniformLocation | null
    sharpness: WebGLUniformLocation | null
    colorOffset: WebGLUniformLocation | null
    maskBrightness: WebGLUniformLocation | null
    scanlineBrightness: WebGLUniformLocation | null
    minScanlineThickness: WebGLUniformLocation | null
    aspect: WebGLUniformLocation | null
    wobbleStrength: WebGLUniformLocation | null
  }

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true })
    if (!gl) {
      throw new Error('WebGL not supported')
    }
    this.gl = gl

    // Default uniform values
    this.uniforms = {
      maskType: 1,
      curve: 0.0,
      sharpness: 0.667,
      colorOffset: 0.0,
      maskBrightness: 1.0,
      scanlineBrightness: 1.0,
      minScanlineThickness: 0.5,
      aspect: 0.75,
      wobbleStrength: 0.0,
      texSize: 240,
    }

    this.startTime = performance.now()

    // Create shaders and program
    const vertexShader = this.createShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE)
    const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE)
    this.program = this.createProgram(vertexShader, fragmentShader)

    // Get uniform locations
    this.locs = {
      texture: gl.getUniformLocation(this.program, 'u_texture'),
      resolution: gl.getUniformLocation(this.program, 'u_resolution'),
      time: gl.getUniformLocation(this.program, 'u_time'),
      texSize: gl.getUniformLocation(this.program, 'u_texSize'),
      maskType: gl.getUniformLocation(this.program, 'u_maskType'),
      curve: gl.getUniformLocation(this.program, 'u_curve'),
      sharpness: gl.getUniformLocation(this.program, 'u_sharpness'),
      colorOffset: gl.getUniformLocation(this.program, 'u_colorOffset'),
      maskBrightness: gl.getUniformLocation(this.program, 'u_maskBrightness'),
      scanlineBrightness: gl.getUniformLocation(this.program, 'u_scanlineBrightness'),
      minScanlineThickness: gl.getUniformLocation(this.program, 'u_minScanlineThickness'),
      aspect: gl.getUniformLocation(this.program, 'u_aspect'),
      wobbleStrength: gl.getUniformLocation(this.program, 'u_wobbleStrength'),
    }

    // Create geometry buffers
    this.positionBuffer = this.createBuffer([
      -1, -1,
      1, -1,
      -1, 1,
      -1, 1,
      1, -1,
      1, 1,
    ])

    this.texCoordBuffer = this.createBuffer([
      0, 0,
      1, 0,
      0, 1,
      0, 1,
      1, 0,
      1, 1,
    ])

    // Create empty texture
    this.texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  }

  private createShader(type: number, source: string): WebGLShader {
    const shader = this.gl.createShader(type)
    if (!shader) {
      throw new Error('Failed to create shader')
    }
    this.gl.shaderSource(shader, source)
    this.gl.compileShader(shader)
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const info = this.gl.getShaderInfoLog(shader)
      this.gl.deleteShader(shader)
      throw new Error(`Shader compile error: ${info}`)
    }
    return shader
  }

  private createProgram(vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram {
    const program = this.gl.createProgram()
    if (!program) {
      throw new Error('Failed to create program')
    }
    this.gl.attachShader(program, vertexShader)
    this.gl.attachShader(program, fragmentShader)
    this.gl.linkProgram(program)
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const info = this.gl.getProgramInfoLog(program)
      throw new Error(`Program link error: ${info}`)
    }
    return program
  }

  private createBuffer(data: number[]): WebGLBuffer {
    const buffer = this.gl.createBuffer()
    if (!buffer) {
      throw new Error('Failed to create buffer')
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(data), this.gl.STATIC_DRAW)
    return buffer
  }

  /**
   * Update the source image/texture
   */
  setSource(source: HTMLCanvasElement | HTMLVideoElement | ImageBitmap | HTMLImageElement): void {
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
  }

  /**
   * Set multiple uniforms at once
   */
  setUniforms(uniforms: CrtEffectUniforms): void {
    Object.assign(this.uniforms, uniforms)
  }

  /**
   * Set individual uniform values
   */
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

  /**
   * Render the CRT effect
   */
  render(): void {
    const gl = this.gl
    const width = this.canvas.width
    const height = this.canvas.height
    const time = (performance.now() - this.startTime) / 1000

    gl.viewport(0, 0, width, height)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)

    gl.useProgram(this.program)

    // Set uniforms
    gl.uniform1i(this.locs.texture, 0)
    gl.uniform2f(this.locs.resolution, width, height)
    gl.uniform1f(this.locs.time, time)
    gl.uniform1f(this.locs.texSize, this.uniforms.texSize)
    gl.uniform1i(this.locs.maskType, this.uniforms.maskType)
    gl.uniform1f(this.locs.curve, this.uniforms.curve)
    gl.uniform1f(this.locs.sharpness, this.uniforms.sharpness)
    gl.uniform1f(this.locs.colorOffset, this.uniforms.colorOffset)
    gl.uniform1f(this.locs.maskBrightness, this.uniforms.maskBrightness)
    gl.uniform1f(this.locs.scanlineBrightness, this.uniforms.scanlineBrightness)
    gl.uniform1f(this.locs.minScanlineThickness, this.uniforms.minScanlineThickness)
    gl.uniform1f(this.locs.aspect, this.uniforms.aspect)
    gl.uniform1f(this.locs.wobbleStrength, this.uniforms.wobbleStrength)

    // Bind texture
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texture)

    // Set up position attribute
    const positionLoc = gl.getAttribLocation(this.program, 'a_position')
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
    gl.enableVertexAttribArray(positionLoc)
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0)

    // Set up texCoord attribute
    const texCoordLoc = gl.getAttribLocation(this.program, 'a_texCoord')
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer)
    gl.enableVertexAttribArray(texCoordLoc)
    gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 0, 0)

    // Draw
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  /**
   * Clean up WebGL resources
   */
  destroy(): void {
    const gl = this.gl
    gl.deleteProgram(this.program)
    gl.deleteBuffer(this.positionBuffer)
    gl.deleteBuffer(this.texCoordBuffer)
    if (this.texture) {
      gl.deleteTexture(this.texture)
    }
  }
}

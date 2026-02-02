#ifdef GL_ES
precision mediump float;
#endif

// CRT Shader - Adapted from Harrison Allen's Godot CRT Shader V4
// Compatible with Phaser 3 and standalone WebGL

// Uniforms
uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uTime;
uniform float uTexSize;
uniform int uMaskType;
uniform float uCurve;
uniform float uSharpness;
uniform float uColorOffset;
uniform float uMaskBrightness;
uniform float uScanlineBrightness;
uniform float uMinScanlineThickness;
uniform float uAspect;
uniform float uWobbleStrength;

#define TAU 6.283185307179586476925286766559

// Varying
varying vec2 outTexCoord;

// Functions
float GetWobble()
{
    return cos(uTime * TAU * 15.0) * uWobbleStrength / 8192.0;
}

vec2 Warp(vec2 uv, float aspect, float curve)
{
    // Centralize coordinates
    uv -= 0.5;
    
    uv.x /= aspect;
    
    // Squared distance from the middle
    float warping = dot(uv, uv) * curve;
    
    // Compensate for shrinking
    warping -= curve * 0.25;
    
    // Warp the coordinates
    uv /= 1.0 - warping;
    
    uv.x *= aspect;
    
    // Decentralize the coordinates
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

// Get scanlines from coordinates (returns in linear color)
vec3 Scanlines(vec2 uv)
{
    // Set coordinates to match texture dimensions
    vec2 texSize = vec2(uTexSize * uAspect, uTexSize);
    uv *= texSize;
    
    // Vertical coordinate scanline samples
    int y = int(uv.y + 0.5) - 1;
    
    float x = floor(uv.x);
    
    // Horizontal coordinates for the texture samples
    float ax = x - 2.0;
    float bx = x - 1.0;
    float cx = x;
    float dx = x + 1.0;
    float ex = x + 2.0;
    
    // Sample the texture at various points (use normalized coordinates)
    vec2 uvA = vec2(ax / texSize.x, float(y) / texSize.y);
    vec2 uvB = vec2(bx / texSize.x, float(y) / texSize.y);
    vec2 uvC = vec2(cx / texSize.x, float(y) / texSize.y);
    vec2 uvD = vec2(dx / texSize.x, float(y) / texSize.y);
    vec2 uvE = vec2(ex / texSize.x, float(y) / texSize.y);
    
    vec3 upper_a = texture2D(uMainSampler, uvA).rgb;
    vec3 upper_b = texture2D(uMainSampler, uvB).rgb;
    vec3 upper_c = texture2D(uMainSampler, uvC).rgb;
    vec3 upper_d = texture2D(uMainSampler, uvD).rgb;
    vec3 upper_e = texture2D(uMainSampler, uvE).rgb;
    
    // Adjust the vertical coordinate for the lower scanline
    y += 1;
    
    vec2 uvA2 = vec2(ax / texSize.x, float(y) / texSize.y);
    vec2 uvB2 = vec2(bx / texSize.x, float(y) / texSize.y);
    vec2 uvC2 = vec2(cx / texSize.x, float(y) / texSize.y);
    vec2 uvD2 = vec2(dx / texSize.x, float(y) / texSize.y);
    vec2 uvE2 = vec2(ex / texSize.x, float(y) / texSize.y);
    
    vec3 lower_a = texture2D(uMainSampler, uvA2).rgb;
    vec3 lower_b = texture2D(uMainSampler, uvB2).rgb;
    vec3 lower_c = texture2D(uMainSampler, uvC2).rgb;
    vec3 lower_d = texture2D(uMainSampler, uvD2).rgb;
    vec3 lower_e = texture2D(uMainSampler, uvE2).rgb;
    
    // Convert every sample to linear color
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
    
    // The x coordinates of electron beam offsets
    vec3 beam = vec3(uv.x - 0.5);
    beam.r -= uColorOffset;
    beam.b += uColorOffset;
    
    // Calculate weights
    vec3 weight_a = smoothstep(1.0, 0.0, (beam - ax) * uSharpness);
    vec3 weight_b = smoothstep(1.0, 0.0, (beam - bx) * uSharpness);
    vec3 weight_c = smoothstep(1.0, 0.0, abs(beam - cx) * uSharpness);
    vec3 weight_d = smoothstep(1.0, 0.0, (dx - beam) * uSharpness);
    vec3 weight_e = smoothstep(1.0, 0.0, (ex - beam) * uSharpness);
    
    // Mix samples into the upper scanline color
    vec3 upper_col = 
        upper_a * weight_a +
        upper_b * weight_b +
        upper_c * weight_c +
        upper_d * weight_d +
        upper_e * weight_e;
    
    // Mix samples into the lower scanline color
    vec3 lower_col = 
        lower_a * weight_a +
        lower_b * weight_b +
        lower_c * weight_c +
        lower_d * weight_d +
        lower_e * weight_e;
    
    vec3 weight_scaler = vec3(1.0) / (weight_a + weight_b + weight_c + weight_d + weight_e);
    
    // Normalize weight
    upper_col *= weight_scaler;
    lower_col *= weight_scaler;
    
    // Apply scanline brightness
    upper_col *= uScanlineBrightness;
    lower_col *= uScanlineBrightness;
    
    // Scanline size (and roughly the apparent brightness of this line)
    vec3 upper_thickness = mix(vec3(uMinScanlineThickness), vec3(1.0), upper_col);
    vec3 lower_thickness = mix(vec3(uMinScanlineThickness), vec3(1.0), lower_col);
    
    // Vertical sawtooth wave used to generate scanlines
    float sawtooth = (uv.y + 0.5) - float(y);
    
    vec3 upper_line = vec3(sawtooth) / upper_thickness;
    upper_line = smoothstep(1.0, 0.0, upper_line);
    
    vec3 lower_line = vec3(1.0 - sawtooth) / lower_thickness;
    lower_line = smoothstep(1.0, 0.0, lower_line);
    
    // Correct line brightness below min_scanline_thickness
    upper_line *= upper_col / upper_thickness;
    lower_line *= lower_col / lower_thickness;
    
    // Combine the upper and lower scanlines
    return upper_line + lower_line;
}

// Mask pattern generators
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

// Add phosphor mask/grill
vec3 ApplyMask(vec3 linear_color, vec2 fragcoord, int maskType, float maskBrightness)
{
    // Get the pattern for the mask. Mask.w equals avg. brightness of the mask
    vec4 mask = GenerateMask(fragcoord, maskType);
    
    // Dim the color if brightness is reduced to preserve mask details
    linear_color *= mix(mask.w, 1.0, maskBrightness);
    
    // How bright the color needs to be to maintain 100% brightness while masked
    vec3 target_color = linear_color / mask.w;
    
    // Target color limited to the 0 to 1 range.
    vec3 primary_col = clamp(target_color, 0.0, 1.0);
    
    // This calculates how bright the secondary subpixels will need to be
    vec3 highlights = target_color - primary_col;
    highlights /= 1.0 / mask.w - 1.0;
    
    primary_col *= mask.rgb;
    
    // Add the secondary subpixels
    primary_col += highlights * (1.0 - mask.rgb);
    
    return primary_col;
}

void main()
{
    // Warp UV coordinates
    vec2 warped_coords = Warp(outTexCoord, uAspect, uCurve);
    
    // Add wobble
    warped_coords.x += GetWobble();
    
    // Check if outside screen bounds after warping
    if (warped_coords.x < 0.0 || warped_coords.x > 1.0 || warped_coords.y < 0.0 || warped_coords.y > 1.0)
    {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
    
    // Sample the scanlines
    vec3 col = Scanlines(warped_coords);
    
    // Apply phosphor mask
    vec2 fragcoord = outTexCoord * uResolution;
    col = ApplyMask(col, fragcoord, uMaskType, uMaskBrightness);
    
    // Convert back to srgb
    col = LinearToSrgb(col);
    
    gl_FragColor = vec4(col, 1.0);
}

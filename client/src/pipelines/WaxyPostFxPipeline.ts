import Phaser from 'phaser'

export const WAXY_POSTFX_PIPELINE_KEY = 'WaxyPostFx'

// Plastic/Claymation shader - creates smooth, shiny pre-rendered CGI look
// Inspired by Donkey Kong Country style rendering
const DEFAULT_FRAG_SHADER = `
#ifdef GL_ES
precision mediump float;
#endif

uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uSmoothness;
uniform float uSpecularPower;
uniform float uSpecularIntensity;
uniform float uRimPower;
uniform float uRimIntensity;
uniform float uSaturation;
uniform vec3 uLightDir;

varying vec2 outTexCoord;

// Smooth blur for plastic look
vec3 smoothSample(vec2 uv, float radius)
{
    vec2 texel = 1.0 / uResolution;
    vec3 col = vec3(0.0);
    float total = 0.0;
    
    for (float x = -2.0; x <= 2.0; x += 1.0) {
        for (float y = -2.0; y <= 2.0; y += 1.0) {
            float weight = 1.0 - length(vec2(x, y)) / 3.0;
            weight = max(0.0, weight);
            col += texture2D(uMainSampler, uv + vec2(x, y) * texel * radius).rgb * weight;
            total += weight;
        }
    }
    
    return col / total;
}

// Get brightness/luminance
float getLuma(vec3 col)
{
    return dot(col, vec3(0.299, 0.587, 0.114));
}

// Compute surface normal from color gradients (smoother sampling)
vec3 getNormal(vec2 uv, float scale)
{
    vec2 texel = scale / uResolution;
    
    float l = getLuma(smoothSample(uv - vec2(texel.x, 0.0), 1.5));
    float r = getLuma(smoothSample(uv + vec2(texel.x, 0.0), 1.5));
    float d = getLuma(smoothSample(uv - vec2(0.0, texel.y), 1.5));
    float u = getLuma(smoothSample(uv + vec2(0.0, texel.y), 1.5));
    
    vec3 normal = normalize(vec3(l - r, d - u, 0.15));
    return normal;
}

// Boost saturation
vec3 saturate(vec3 col, float amount)
{
    float luma = getLuma(col);
    return mix(vec3(luma), col, amount);
}

void main()
{
    vec2 uv = outTexCoord;
    
    // Get smoothed base color for plastic look
    vec3 baseColor = smoothSample(uv, uSmoothness);
    
    // Boost saturation for that pre-rendered look
    baseColor = saturate(baseColor, uSaturation);
    
    // Compute surface normal
    vec3 normal = getNormal(uv, 3.0);
    
    // Light and view directions
    vec3 lightDir = normalize(uLightDir);
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    
    // Diffuse lighting (soft, wrapped)
    float NdotL = dot(normal, lightDir);
    float diff = NdotL * 0.5 + 0.5; // half-lambert for softer shading
    diff = pow(diff, 0.8); // soften further
    
    // Specular (Blinn-Phong for broader highlights)
    vec3 halfDir = normalize(lightDir + viewDir);
    float NdotH = max(0.0, dot(normal, halfDir));
    float spec = pow(NdotH, uSpecularPower) * uSpecularIntensity;
    
    // Rim lighting (Fresnel-like edge glow)
    float NdotV = max(0.0, dot(normal, viewDir));
    float rim = pow(1.0 - NdotV, uRimPower) * uRimIntensity;
    
    // Combine: base color with lighting + specular highlights + rim
    vec3 ambient = baseColor * 0.3;
    vec3 diffuse = baseColor * diff * 0.8;
    vec3 specular = vec3(1.0, 0.98, 0.95) * spec; // slightly warm specular
    vec3 rimColor = baseColor * 1.5 * rim; // rim uses boosted base color
    
    vec3 finalColor = ambient + diffuse + specular + rimColor;
    
    // Slight contrast boost
    finalColor = pow(finalColor, vec3(0.95));
    
    // Get original alpha
    float alpha = texture2D(uMainSampler, uv).a;
    
    gl_FragColor = vec4(finalColor, alpha);
}
`

export interface WaxyShaderUniforms {
  /** Smoothing/blur radius for plastic look (0.5 to 5.0, default 1.5) */
  smoothness?: number

  /** Specular highlight sharpness - lower = broader (2.0 to 50.0, default 8.0) */
  specularPower?: number

  /** Specular highlight intensity (0.0 to 2.0, default 0.6) */
  specularIntensity?: number

  /** Rim/edge lighting power - lower = broader rim (1.0 to 5.0, default 2.0) */
  rimPower?: number

  /** Rim lighting intensity (0.0 to 1.0, default 0.4) */
  rimIntensity?: number

  /** Color saturation boost (0.5 to 2.0, default 1.3) */
  saturation?: number

  /** Light direction [x, y, z] (default [1, 1, 2]) */
  lightDir?: [number, number, number]
}

export class WaxyPostFxPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  private uniforms: Required<WaxyShaderUniforms>

  constructor(game: Phaser.Game, fragShader?: string) {
    super({
      game,
      name: WAXY_POSTFX_PIPELINE_KEY,
      fragShader: fragShader || DEFAULT_FRAG_SHADER,
    })

    this.uniforms = {
      smoothness: 1.5,
      specularPower: 8.0,
      specularIntensity: 0.6,
      rimPower: 2.0,
      rimIntensity: 0.4,
      saturation: 1.3,
      lightDir: [1, 1, 2],
    }
  }

  onPreRender(): void {
    super.onPreRender()

    this.set1f('uSmoothness', this.uniforms.smoothness)
    this.set1f('uSpecularPower', this.uniforms.specularPower)
    this.set1f('uSpecularIntensity', this.uniforms.specularIntensity)
    this.set1f('uRimPower', this.uniforms.rimPower)
    this.set1f('uRimIntensity', this.uniforms.rimIntensity)
    this.set1f('uSaturation', this.uniforms.saturation)
    this.set3f(
      'uLightDir',
      this.uniforms.lightDir[0],
      this.uniforms.lightDir[1],
      this.uniforms.lightDir[2]
    )
  }

  onDraw(renderTarget: Phaser.Renderer.WebGL.RenderTarget): void {
    this.set2f('uResolution', this.renderer.width, this.renderer.height)
    this.bindAndDraw(renderTarget)
  }

  setUniforms(uniforms: WaxyShaderUniforms): void {
    this.uniforms = { ...this.uniforms, ...uniforms }
  }

  getUniforms(): Required<WaxyShaderUniforms> {
    return { ...this.uniforms }
  }

  setSmoothness(smoothness: number): void {
    this.uniforms.smoothness = Math.max(0.5, Math.min(5.0, smoothness))
  }

  setSpecularPower(power: number): void {
    this.uniforms.specularPower = Math.max(2.0, Math.min(50.0, power))
  }

  setSpecularIntensity(intensity: number): void {
    this.uniforms.specularIntensity = Math.max(0.0, Math.min(2.0, intensity))
  }

  setRimPower(power: number): void {
    this.uniforms.rimPower = Math.max(1.0, Math.min(5.0, power))
  }

  setRimIntensity(intensity: number): void {
    this.uniforms.rimIntensity = Math.max(0.0, Math.min(1.0, intensity))
  }

  setSaturation(saturation: number): void {
    this.uniforms.saturation = Math.max(0.5, Math.min(2.0, saturation))
  }

  setLightDir(x: number, y: number, z: number): void {
    this.uniforms.lightDir = [x, y, z]
  }
}

export function createWaxyPipeline(game: Phaser.Game, fragShader?: string): WaxyPostFxPipeline {
  return new WaxyPostFxPipeline(game, fragShader)
}

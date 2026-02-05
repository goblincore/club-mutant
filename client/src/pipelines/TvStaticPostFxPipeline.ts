import Phaser from 'phaser'

export const TV_STATIC_POSTFX_PIPELINE_KEY = 'TvStaticPostFx'

const FRAG_SHADER = `
#ifdef GL_ES
precision highp float;
#endif

varying vec2 outTexCoord;

uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uTime;
uniform float uIntensity;

// High quality hash for TV static - produces uniform random distribution
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 fragCoord = outTexCoord * uResolution;
  
  // Use frame number for temporal variation - 60fps static
  float frame = floor(uTime * 60.0);
  
  // Create unique seed per pixel per frame
  vec2 seed = fragCoord + vec2(frame * 12.9898, frame * 78.233);
  
  // Pure random noise per pixel
  float noise = hash(seed);
  
  // Optional: slight brightness variation across frames (flicker)
  float flicker = hash(vec2(frame, 0.0)) * 0.1 - 0.05;
  noise = clamp(noise + flicker, 0.0, 1.0);
  
  vec4 base = texture2D(uMainSampler, outTexCoord);
  
  vec3 color = mix(base.rgb, vec3(noise), clamp(uIntensity, 0.0, 1.0));
  
  gl_FragColor = vec4(color, base.a);
}
`

export class TvStaticPostFxPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  private intensity = 1

  constructor(game: Phaser.Game) {
    super({
      game,
      name: TV_STATIC_POSTFX_PIPELINE_KEY,
      fragShader: FRAG_SHADER,
    })
  }

  setIntensity(next: number) {
    this.intensity = Phaser.Math.Clamp(next, 0, 1)
  }

  getIntensity(): number {
    return this.intensity
  }

  onPreRender(): void {
    super.onPreRender()

    this.set1f('uTime', this.game.loop.time / 1000)
    this.set1f('uIntensity', this.intensity)
  }

  onDraw(renderTarget: Phaser.Renderer.WebGL.RenderTarget): void {
    this.set2f('uResolution', this.renderer.width, this.renderer.height)

    this.bindAndDraw(renderTarget)
  }
}

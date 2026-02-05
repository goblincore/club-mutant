import Phaser from 'phaser'

export const TV_STATIC_POSTFX_PIPELINE_KEY = 'TvStaticPostFx'

const FRAG_SHADER = `
#ifdef GL_ES
precision mediump float;
#endif

varying vec2 outTexCoord;

uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uTime;
uniform float uIntensity;

float hash21(vec2 p)
{
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

void main()
{
  vec2 fragCoord = outTexCoord * uResolution;
  float frame = floor(uTime * 60.0);

  vec2 p = fragCoord + vec2(frame * 37.0, frame * 91.0);
  float n = hash21(p);

  float scan = sin((fragCoord.y + uTime * 120.0) * 0.25) * 0.08;
  float flicker = (hash21(vec2(frame, 19.0)) - 0.5) * 0.06;

  float v = clamp(n + scan + flicker, 0.0, 1.0);

  vec4 base = texture2D(uMainSampler, outTexCoord);

  vec3 color = mix(base.rgb, vec3(v), clamp(uIntensity, 0.0, 1.0));

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

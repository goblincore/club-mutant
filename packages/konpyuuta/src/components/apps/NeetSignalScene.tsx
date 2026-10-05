import { useEffect, useRef } from 'react'

const VERTEX = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0., 1.); }
`

// A small, self-contained WebGL scene: merged liquid forms with chrome reflections
// and drifting light specks. No textures, network requests, or runtime 3D library.
const FRAGMENT = `
precision highp float;
uniform vec2 resolution;
uniform float time;

float merge(float a, float b, float k) {
  float h = clamp(.5 + .5 * (b-a)/k, 0., 1.);
  return mix(b, a, h) - k*h*(1.-h);
}
float field(vec3 p) {
  float t = time*.35;
  float a = .18*sin(t*.7);
  p.xy = mat2(cos(a), -sin(a), sin(a), cos(a))*p.xy;
  float d = length(p*vec3(.85,1.05,1.))- .84;
  d = merge(d, length(p-vec3(1.03+.15*sin(t), .25+.38*cos(t*.8), .1))-.55, .62);
  d = merge(d, length(p-vec3(-1.05+.2*cos(t*.9), -.18+.3*sin(t), .16))-.6, .57);
  d = merge(d, length(p-vec3(.25+.55*sin(t*.6), -1.0+.2*cos(t), .15))-.38, .48);
  d = merge(d, length(p-vec3(-.3+.5*cos(t*.7), 1.0+.16*sin(t), -.1))-.3, .43);
  return d + .022*sin(p.x*7.+t)*sin(p.y*8.-t)*sin(p.z*6.+t);
}
vec3 normal(vec3 p) {
  vec2 e=vec2(.003,0.);
  return normalize(vec3(field(p+e.xyy)-field(p-e.xyy), field(p+e.yxy)-field(p-e.yxy), field(p+e.yyx)-field(p-e.yyx)));
}
void main() {
  vec2 uv = (gl_FragCoord.xy-.5*resolution)/resolution.y;
  float t = time*.12;
  vec3 color = vec3(.014,.031,.021);
  color += vec3(.12,.24,.035)*exp(-dot(uv*vec2(.8,1.3),uv*vec2(.8,1.3))*2.8);
  color += vec3(.085,.016,.11)*exp(-length(uv-vec2(.7,.3))*3.);
  for(int i=0; i<34; i++) {
    float f=float(i);
    vec2 q=vec2(sin(f*73.17+t*(.2+fract(f*.17))),cos(f*39.43+t*(.3+fract(f*.23))));
    q *= vec2(resolution.x/resolution.y*.47,.48);
    float r=length(uv-q);
    float pulse=.4+.6*sin(f+t*3.)*sin(f+t*3.);
    color += vec3(.55,.84,.23)*(.000018/(r*r+.00016))*pulse;
  }
  vec3 ro=vec3(0.,0.,4.6);
  vec3 rd=normalize(vec3(uv*2.8,-3.));
  float depth=0.;
  float distanceToSurface=1.;
  for(int i=0; i<58; i++) {
    distanceToSurface=field(ro+rd*depth);
    if(distanceToSurface<.003 || depth>8.) break;
    depth += distanceToSurface*.8;
  }
  if(distanceToSurface<.003 && depth<8.) {
    vec3 p=ro+rd*depth;
    vec3 n=normal(p);
    vec3 reflected=reflect(rd,n);
    float diffuse=max(dot(n,normalize(vec3(-.6,1.,1.5))),0.);
    float fresnel=pow(1.-max(dot(n,-rd),0.),3.);
    float ribbons=sin(reflected.y*12.+reflected.x*4.+.5*sin(reflected.z*5.+time*.2));
    float chrome=smoothstep(.65,.95,ribbons);
    float glint=pow(max(dot(reflected,normalize(vec3(-.6,1.,1.5))),0.),65.);
    float violet=pow(max(dot(reflected,normalize(vec3(1.,-.2,1.))),0.),14.);
    vec3 body=mix(vec3(.023,.09,.013),vec3(.39,.73,.055),diffuse);
    body *= .28+.72*smoothstep(-.5,.9,ribbons);
    body += vec3(.66,.86,.48)*chrome*.75;
    body += vec3(1.,1.,.88)*glint*1.8;
    body += vec3(.47,.13,.67)*violet;
    body += vec3(.45,.92,.16)*fresnel*.8;
    color=body;
  }
  color=1.-exp(-color*1.25);
  color=pow(color,vec3(.85));
  gl_FragColor=vec4(color,1.);
}
`

export function NeetSignalScene() {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const surface = canvas.current
    if (!surface) return
    // preserveDrawingBuffer also lets the in-world desktop's capture read it.
    const gl = surface.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true, powerPreference: 'low-power' })
    if (!gl) return
    const shaders: WebGLShader[] = []
    const program = gl.createProgram()
    const buffer = gl.createBuffer()
    if (!program || !buffer) { if (program) gl.deleteProgram(program); if (buffer) gl.deleteBuffer(buffer); return }
    const release = () => { gl.deleteBuffer(buffer); gl.deleteProgram(program); shaders.forEach((shader) => gl.deleteShader(shader)) }
    for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]] as const) {
      const shader = gl.createShader(type)
      if (!shader) { release(); return }
      shaders.push(shader)
      gl.shaderSource(shader, source); gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { release(); return }
      gl.attachShader(program, shader)
    }
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { release(); return }
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    const resolution = gl.getUniformLocation(program, 'resolution')
    const time = gl.getUniformLocation(program, 'time')
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let visible = true
    let lost = false
    let elapsed = 0
    let last = 0
    const draw = (now: number) => {
      frame = 0
      if (lost || document.hidden || !visible) { last = 0; return }
      if (!last || now - last >= 1000 / 30) {
        if (last && !motion.matches) elapsed += Math.min(now - last, 100) / 1000
        last = now
        gl.uniform2f(resolution, surface.width, surface.height)
        gl.uniform1f(time, motion.matches ? 0 : elapsed)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        surface.style.opacity = '1'
      }
      if (!motion.matches) frame = requestAnimationFrame(draw)
    }
    const resume = () => { cancelAnimationFrame(frame); last = 0; frame = requestAnimationFrame(draw) }
    const resize = () => {
      const rect = surface.getBoundingClientRect()
      // A decorative scene doesn't need the desktop's full display resolution.
      const scale = Math.min(window.devicePixelRatio || 1, 1.25, 900 / Math.max(rect.width, 1))
      surface.width = Math.max(1, Math.round(rect.width * scale))
      surface.height = Math.max(1, Math.round(rect.height * scale))
      gl.viewport(0, 0, surface.width, surface.height)
      resume()
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(surface)
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; resume() })
    intersection.observe(surface)
    const contextLost = () => { lost = true; cancelAnimationFrame(frame); surface.style.opacity = '0' }
    surface.addEventListener('webglcontextlost', contextLost)
    document.addEventListener('visibilitychange', resume)
    motion.addEventListener('change', resume)
    resize()
    return () => {
      cancelAnimationFrame(frame); resizeObserver.disconnect(); intersection.disconnect()
      surface.removeEventListener('webglcontextlost', contextLost)
      document.removeEventListener('visibilitychange', resume); motion.removeEventListener('change', resume)
      release()
    }
  }, [])
  return <canvas ref={canvas} className="neet-signal-canvas" aria-hidden="true" />
}

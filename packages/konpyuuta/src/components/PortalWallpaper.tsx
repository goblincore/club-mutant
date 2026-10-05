import { useEffect, useRef } from 'react'
import wallpaper from '../assets/liquid-signal.webp?url'

const VERTEX = `attribute vec2 position; void main(){gl_Position=vec4(position,0.,1.);}`
const FRAGMENT = `
precision highp float;
uniform sampler2D image;
uniform vec2 resolution;
uniform vec2 imageSize;
uniform float time;
void main(){
  vec2 p=gl_FragCoord.xy/resolution-.5;
  // Barrel distortion is strongest at the edges; the centre stays almost flat.
  vec2 uv=p*(1.+.10*dot(p,p))+.5;
  float t=time*.17;
  uv+=vec2(sin(uv.y*8.+t)*cos(uv.x*5.-t*.7),cos(uv.x*9.-t)*sin(uv.y*6.+t*.8))*.008;
  float screenAspect=resolution.x/resolution.y;
  float imageAspect=imageSize.x/imageSize.y;
  vec2 cover=vec2(min(1.,screenAspect/imageAspect),min(1.,imageAspect/screenAspect));
  uv=(uv-.5)*cover+.5;
  vec3 color=texture2D(image,uv).rgb;
  float light=.5+.5*sin(p.x*5.+p.y*3.-t);
  color+=vec3(.028,.045,.009)*light*light;
  gl_FragColor=vec4(color,1.);
}`

/** Texture refraction, rather than a 3D scene. Static wallpaper remains the fallback. */
export function PortalWallpaper({ animate }: { animate: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const moving = useRef(animate)
  const refresh = useRef<(() => void) | null>(null)
  useEffect(() => { moving.current = animate; refresh.current?.() }, [animate])
  useEffect(() => {
    const surface = canvas.current
    if (!surface) return
    const gl = surface.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true, powerPreference: 'low-power' })
    if (!gl) return
    const shaders: WebGLShader[] = []
    const program = gl.createProgram(), buffer = gl.createBuffer(), texture = gl.createTexture()
    const release = () => { gl.deleteBuffer(buffer); gl.deleteTexture(texture); gl.deleteProgram(program); shaders.forEach(shader => gl.deleteShader(shader)) }
    if (!program || !buffer || !texture) { release(); return }
    for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]] as const) {
      const shader = gl.createShader(type)
      if (!shader) { release(); return }
      shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { release(); return }
      gl.attachShader(program, shader)
    }
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { release(); return }
    gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    const resolution = gl.getUniformLocation(program, 'resolution'), imageSize = gl.getUniformLocation(program, 'imageSize'), time = gl.getUniformLocation(program, 'time')
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.uniform1i(gl.getUniformLocation(program, 'image'), 0)
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0, last = 0, elapsed = 0, ready = false, visible = true, lost = false
    const draw = (now: number) => {
      frame = 0
      if (!ready || lost || document.hidden || !visible) { last = 0; return }
      if (!last || now-last >= 1000/24) {
        if (last && moving.current && !motion.matches) elapsed += Math.min(now-last, 100)/1000
        last = now
        gl.uniform2f(resolution, surface.width, surface.height)
        gl.uniform1f(time, motion.matches ? 0 : elapsed)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); surface.style.opacity = '1'
      }
      if (moving.current && !motion.matches) frame = requestAnimationFrame(draw)
    }
    const resume = () => { cancelAnimationFrame(frame); last = 0; frame = requestAnimationFrame(draw) }
    refresh.current = resume
    const resize = () => {
      const rect = surface.getBoundingClientRect()
      const scale = Math.min(window.devicePixelRatio || 1, 1, 1200/Math.max(rect.width, 1))
      surface.width = Math.max(1, Math.round(rect.width*scale)); surface.height = Math.max(1, Math.round(rect.height*scale))
      gl.viewport(0,0,surface.width,surface.height); resume()
    }
    const image = new Image()
    image.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image)
      gl.uniform2f(imageSize, image.naturalWidth, image.naturalHeight); ready = true; resume()
    }
    image.src = wallpaper
    const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(surface)
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; resume() }); intersection.observe(surface)
    const contextLost = () => { lost = true; cancelAnimationFrame(frame); surface.style.opacity = '0' }
    surface.addEventListener('webglcontextlost', contextLost)
    document.addEventListener('visibilitychange', resume); motion.addEventListener('change', resume)
    resize()
    return () => {
      refresh.current = null; image.onload = null; cancelAnimationFrame(frame)
      resizeObserver.disconnect(); intersection.disconnect()
      surface.removeEventListener('webglcontextlost', contextLost)
      document.removeEventListener('visibilitychange', resume); motion.removeEventListener('change', resume); release()
    }
  }, [])
  return <div className="portal-wallpaper" aria-hidden="true"><canvas ref={canvas} /></div>
}

import { useEffect, useRef } from 'react'

const VERT = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const FRAG = `
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  uv = uv * 2.0 - 1.0;
  uv.x *= u_resolution.x / u_resolution.y;

  // Multi-layered sinusoidal warp
  float t = u_time * 0.35;

  uv += 0.12 * vec2(
    sin(uv.y * 3.0 + t * 1.1) + sin(uv.y * 5.7 - t * 0.7),
    cos(uv.x * 4.3 - t * 0.9) + cos(uv.x * 6.1 + t * 1.3)
  );

  uv += 0.06 * vec2(
    sin(uv.x * 7.0 + uv.y * 3.0 + t * 1.7),
    cos(uv.x * 5.0 - uv.y * 4.0 - t * 1.2)
  );

  // Checkerboard
  float freq = 12.0;
  float checker = mod(floor(uv.x * freq) + floor(uv.y * freq), 2.0);

  vec3 cyan    = vec3(0.33, 1.0, 1.0);
  vec3 magenta = vec3(0.85, 0.33, 0.85);
  vec3 col = mix(magenta, cyan, checker);
  gl_FragColor = vec4(col, 1.0);
}
`

function initGL(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false })
  if (!gl) return null

  // Compile shaders
  const vs = gl.createShader(gl.VERTEX_SHADER)!
  gl.shaderSource(vs, VERT)
  gl.compileShader(vs)

  const fs = gl.createShader(gl.FRAGMENT_SHADER)!
  gl.shaderSource(fs, FRAG)
  gl.compileShader(fs)

  const prog = gl.createProgram()!
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)

  // Fullscreen quad
  const buf = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)

  const aPos = gl.getAttribLocation(prog, 'a_pos')
  const uTime = gl.getUniformLocation(prog, 'u_time')
  const uRes = gl.getUniformLocation(prog, 'u_resolution')

  // bindState: re-applies all GL state lost when canvas.width/height is reassigned.
  // Must be called after every resize (resizing wipes the entire WebGL context state).
  const bindState = () => {
    gl.useProgram(prog)
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
  }
  bindState()

  return { gl, uTime, uRes, bindState }
}

export function WarpCheckBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = initGL(canvas)
    if (!ctx) return

    const { gl, uTime, uRes, bindState } = ctx
    let raf = 0

    const FRAME_MS = 1000 / 15 // ~15fps cap
    let lastDraw = 0

    const resize = () => {
      // Render at low res for a degraded / chunky look
      const scale = 0.25
      canvas.width = Math.floor(canvas.clientWidth * scale)
      canvas.height = Math.floor(canvas.clientHeight * scale)
      gl.viewport(0, 0, canvas.width, canvas.height)
      // Resizing canvas.width/height wipes all WebGL state — restore it
      bindState()
      // Force immediate redraw on next tick (bypass 15fps throttle)
      lastDraw = 0
    }

    resize()
    window.addEventListener('resize', resize)

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)

      if (now - lastDraw < FRAME_MS) return
      lastDraw = now

      gl.uniform1f(uTime, now * 0.001)
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }

    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ zIndex: 0, imageRendering: 'pixelated', filter: 'blur(3px)', backgroundColor: '#55ffff' }}
    />
  )
}

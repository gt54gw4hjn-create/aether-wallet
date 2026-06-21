import { useEffect, useRef } from 'react';

export default function ShaderBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function syncSize() {
      const w = canvas?.clientWidth || 1280;
      const h = canvas?.clientHeight || 720;
      if (canvas && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w;
        canvas.height = h;
      }
    }

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(syncSize);
      observer.observe(canvas);
      // cleanup
    }
    syncSize();

    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return;

    // @ts-ignore
    const vs = `attribute vec2 a_position;
varying vec2 v_texCoord;
void main() {
  v_texCoord = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;
    const fs = `precision highp float;
varying vec2 v_texCoord;
uniform float u_time;
uniform vec2 u_resolution;

void main() {
    vec2 uv = v_texCoord;
    
    // Create a slow, organic movement
    float noise = sin(uv.x * 3.0 + u_time * 0.5) * cos(uv.y * 2.0 - u_time * 0.3);
    noise += sin(uv.y * 5.0 + u_time * 0.2) * cos(uv.x * 4.0 + u_time * 0.4);
    
    // Base colors from the design system (Indigos/Purples)
    vec3 color1 = vec3(0.388, 0.4, 0.945); // #6366f1 (Indigo)
    vec3 color2 = vec3(0.518, 0.357, 0.945); // #845bf1 (Purple)
    vec3 color3 = vec3(0.98, 0.973, 1.0);    // Surface/White
    
    vec3 finalColor = mix(color1, color2, noise * 0.5 + 0.5);
    finalColor = mix(finalColor, color3, uv.y * 0.4);
    
    // Add a slight "glassy" shimmer
    float shimmer = pow(max(0.0, sin(uv.x * 10.0 + uv.y * 5.0 + u_time)), 20.0);
    finalColor += shimmer * 0.05;

    gl_FragColor = vec4(finalColor, 0.7); // Low opacity for glass effect
}`;

    // @ts-ignore
    function cs(type, src) {
      // @ts-ignore
      const s = gl.createShader(type);
      // @ts-ignore
      gl.shaderSource(s, src);
      // @ts-ignore
      gl.compileShader(s);
      return s;
    }

    // @ts-ignore
    const prog = gl.createProgram();
    // @ts-ignore
    gl.attachShader(prog, cs(gl.VERTEX_SHADER, vs));
    // @ts-ignore
    gl.attachShader(prog, cs(gl.FRAGMENT_SHADER, fs));
    // @ts-ignore
    gl.linkProgram(prog);
    // @ts-ignore
    gl.useProgram(prog);

    // @ts-ignore
    const buf = gl.createBuffer();
    // @ts-ignore
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    // @ts-ignore
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

    // @ts-ignore
    const pos = gl.getAttribLocation(prog, 'a_position');
    // @ts-ignore
    gl.enableVertexAttribArray(pos);
    // @ts-ignore
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    // @ts-ignore
    const uTime = gl.getUniformLocation(prog, 'u_time');
    // @ts-ignore
    const uRes = gl.getUniformLocation(prog, 'u_resolution');
    // @ts-ignore
    const uMouse = gl.getUniformLocation(prog, 'u_mouse');

    let mouse = { x: canvas.width / 2, y: canvas.height / 2 };
    const handleMouseMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width && rect.height) {
        const nx = (event.clientX - rect.left) / rect.width;
        const ny = 1.0 - (event.clientY - rect.top) / rect.height;
        mouse.x = nx * canvas.width;
        mouse.y = ny * canvas.height;
      }
    };
    window.addEventListener('mousemove', handleMouseMove);

    let animationFrameId: number;
    const render = (t: number) => {
      // @ts-ignore
      gl.viewport(0, 0, canvas.width, canvas.height);
      // @ts-ignore
      if (uTime) gl.uniform1f(uTime, t * 0.001);
      // @ts-ignore
      if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height);
      // @ts-ignore
      if (uMouse) gl.uniform2f(uMouse, mouse.x, mouse.y);
      // @ts-ignore
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animationFrameId = requestAnimationFrame(render);
    };
    render(0);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <div className="absolute inset-0 w-full h-full -z-10 opacity-40" style={{ display: 'block' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }}></canvas>
    </div>
  );
}

import { useEffect, useRef } from "react";

/**
 * Full-page WebGL placeholder: a rotating wireframe cube.
 * Vanilla WebGL, no dependencies. Client-only.
 */
export default function WebGLCube() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: true, alpha: true });
    if (!gl) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    // Shaders
    const vs = `
      attribute vec3 aPos;
      uniform mat4 uMVP;
      void main() { gl_Position = uMVP * vec4(aPos, 1.0); }
    `;
    const fs = `
      precision mediump float;
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0); }
    `;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    // Cube vertices
    const verts = new Float32Array([
      -1,-1,-1,  1,-1,-1,  1, 1,-1, -1, 1,-1,
      -1,-1, 1,  1,-1, 1,  1, 1, 1, -1, 1, 1,
    ]);
    const edges = new Uint16Array([
      0,1, 1,2, 2,3, 3,0,
      4,5, 5,6, 6,7, 7,4,
      0,4, 1,5, 2,6, 3,7,
    ]);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, edges, gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
    const uMVP = gl.getUniformLocation(prog, "uMVP");
    const uColor = gl.getUniformLocation(prog, "uColor");
    // tactical orange
    gl.uniform3f(uColor, 0.98, 0.55, 0.15);

    // Matrix helpers
    const mul = (a: number[], b: number[]) => {
      const r = new Array(16).fill(0);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++)
        for (let k = 0; k < 4; k++) r[i*4+j] += a[i*4+k] * b[k*4+j];
      return r;
    };
    const perspective = (fov: number, aspect: number, n: number, f: number) => {
      const t = 1 / Math.tan(fov / 2);
      return [t/aspect,0,0,0, 0,t,0,0, 0,0,(f+n)/(n-f),-1, 0,0,(2*f*n)/(n-f),0];
    };
    const rotY = (a: number) => {
      const c = Math.cos(a), s = Math.sin(a);
      return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1];
    };
    const rotX = (a: number) => {
      const c = Math.cos(a), s = Math.sin(a);
      return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1];
    };
    const translate = (x: number, y: number, z: number) =>
      [1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1];

    let raf = 0;
    let t = 0;
    const render = () => {
      t += 0.008;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const aspect = canvas.width / canvas.height;
      const p = perspective(Math.PI / 4, aspect, 0.1, 100);
      const v = translate(0, 0, -6);
      const m = mul(rotX(t * 0.7), rotY(t));
      const mvp = mul(mul(m, v), p);
      gl.uniformMatrix4fv(uMVP, false, new Float32Array(mvp));
      gl.lineWidth(1);
      gl.drawElements(gl.LINES, edges.length, gl.UNSIGNED_SHORT, 0);
      raf = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 h-full w-full opacity-40 mix-blend-screen"
      aria-hidden="true"
    />
  );
}

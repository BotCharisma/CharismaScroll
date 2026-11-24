import { useEffect, useRef } from "react";
import { PRESET_ORDER, type PresetId, type ScrollTelemetry } from "../lib/tauri";

interface Stage3DCanvasProps {
  presetId: PresetId;
  telemetry: ScrollTelemetry | null;
}

const VERT_SRC = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// Smooth-SDF Clay & Anodized Studio Raymarcher (4 bespoke tactile sculptures)
const FRAG_SRC = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform vec2 u_res;
uniform float u_preset;
uniform float u_spin;
uniform float u_turn;

mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float sdRoundBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

float sdCappedCylinder(vec3 p, float h, float r) {
  vec2 d = abs(vec2(length(p.yz), p.x)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - 0.035;
}

float sdTorus(vec3 p, vec2 t) {
  vec2 q = vec2(length(p.xz) - t.x, p.y);
  return length(q) - t.y;
}

// Returns vec2(distance, materialId: 1.0 = obsidian/espresso body, 2.0 = ember #FF6D29 accent, 3.0 = cream pearl)
vec2 sceneModel(vec3 p, int mode) {
  if (mode == 0) {
    // 0: Classic Flow - Sculpted rounded pebble mouse + prominent ridged #FF6D29 wheel + cream accent orb
    vec3 bp = p;
    bp.y += 0.14;
    bp.x *= 1.0 - bp.z * 0.12;
    float body = sdRoundBox(bp, vec3(0.48, 0.18, 0.68), 0.24);
    float slot = sdRoundBox(p - vec3(0.0, 0.10, -0.18), vec3(0.12, 0.18, 0.30), 0.05);
    body = max(body, -slot);

    vec3 wp = p - vec3(0.0, 0.16, -0.18);
    wp.yz *= rot(u_spin);
    float wheel = sdCappedCylinder(wp, 0.095, 0.26);
    float ridges = sin(atan(wp.y, wp.z) * 14.0) * 0.011;
    wheel += ridges;

    float satellite = length(p - vec3(-0.48, 0.28, 0.18)) - 0.11;

    vec2 res = vec2(body, 1.0);
    if (wheel < res.x) res = vec2(wheel, 2.0);
    if (satellite < res.x) res = vec2(satellite, 3.0);
    return res;
  } else if (mode == 1) {
    // 1: Trackpad Glide - Tilted warm glass slab + levitating molten sphere & pearl
    vec3 sp = p - vec3(0.0, -0.14, 0.0);
    sp.xy *= rot(-0.14);
    float slab = sdRoundBox(sp, vec3(0.68, 0.045, 0.56), 0.09);

    vec3 orbP = p - vec3(sin(u_spin * 0.6) * 0.22, 0.18, cos(u_spin * 0.6) * 0.16);
    float orb = length(orbP) - 0.27;
    float pearl = length(p - vec3(-0.34, 0.30, -0.18)) - 0.12;

    vec2 res = vec2(slab, 1.0);
    if (orb < res.x) res = vec2(orb, 2.0);
    if (pearl < res.x) res = vec2(pearl, 3.0);
    return res;
  } else if (mode == 2) {
    // 2: Snappy Code - Sculpted keycap base + precision notched encoder ring
    vec3 kp = p - vec3(0.0, -0.16, 0.0);
    kp.xz *= 1.0 + kp.y * 0.35;
    float cap = sdRoundBox(kp, vec3(0.56, 0.18, 0.56), 0.12);

    vec3 dp = p - vec3(0.0, 0.14, 0.0);
    dp.xz *= rot(u_spin * 0.8);
    float dial = sdTorus(dp, vec2(0.34, 0.11));
    dial += sin(atan(dp.x, dp.z) * 12.0) * 0.009;
    float core = length(p - vec3(0.0, 0.16, 0.0)) - 0.16;

    vec2 res = vec2(smin(cap, core, 0.08), 1.0);
    if (dial < res.x) res = vec2(dial, 2.0);
    return res;
  } else {
    // 3: Cinema Drift - Twisted sculptural wave torus + warm floating nucleus
    vec3 tp = p;
    tp.xy *= rot(0.38 + sin(u_spin * 0.4) * 0.08);
    tp.yz *= rot(u_spin * 0.35);
    float wave = sin(atan(tp.x, tp.z) * 3.0 + u_spin) * 0.06;
    tp.y += wave;
    float ring = sdTorus(tp, vec2(0.54, 0.155));
    float core = length(p) - 0.23;
    if (ring < core) return vec2(ring, 2.0);
    return vec2(core, 1.0);
  }
}

vec2 mapScene(vec3 p) {
  // Isometric top-down studio tilt (negative pitch shows top deck & glowing #FF6D29 wheel!)
  p.yz *= rot(-0.52);
  p.xz *= rot(-0.54 + u_turn);

  int idxA = int(floor(mod(u_preset, 4.0)));
  int idxB = int(floor(mod(u_preset + 1.0, 4.0)));
  float f = fract(u_preset);

  if (f < 0.001) return sceneModel(p, idxA);
  vec2 a = sceneModel(p, idxA);
  vec2 b = sceneModel(p, idxB);
  float d = mix(a.x, b.x, smoothstep(0.0, 1.0, f));
  float mat = f < 0.5 ? a.y : b.y;
  return vec2(d, mat);
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.002, -0.002);
  return normalize(
    e.xyy * mapScene(p + e.xyy).x +
    e.yyx * mapScene(p + e.yyx).x +
    e.yxy * mapScene(p + e.yxy).x +
    e.xxx * mapScene(p + e.xxx).x
  );
}

void main() {
  vec2 uv = (v_uv - 0.5) * 2.0;
  uv.x *= u_res.x / u_res.y;

  vec3 ro = vec3(0.0, 0.05, 2.85);
  vec3 rd = normalize(vec3(uv, -1.75));

  float t = 0.0;
  float mat = 0.0;
  bool hit = false;

  for (int i = 0; i < 64; i++) {
    vec3 p = ro + rd * t;
    vec2 h = mapScene(p);
    if (h.x < 0.0025) {
      hit = true;
      mat = h.y;
      break;
    }
    t += h.x;
    if (t > 5.0) break;
  }

  // Soft studio contact shadow beneath sculpture
  float shadowMask = exp(-length(uv - vec2(0.04, -0.46)) * 3.4) * 0.34;

  if (!hit) {
    outColor = vec4(vec3(0.07, 0.05, 0.06), shadowMask);
    return;
  }

  vec3 pos = ro + rd * t;
  vec3 nor = calcNormal(pos);
  vec3 viewDir = -rd;

  // 3-point warm clay/anodized studio lighting (Arounda palette)
  vec3 keyDir = normalize(vec3(-0.65, 0.85, 0.75));
  vec3 fillDir = normalize(vec3(0.8, -0.35, 0.4));

  float diffKey = max(dot(nor, keyDir), 0.0);
  float wrap = max(0.0, (dot(nor, keyDir) + 0.45) / 1.45);
  float diffFill = max(dot(nor, fillDir), 0.0);
  float fresnel = pow(1.0 - max(dot(nor, viewDir), 0.0), 3.2);
  vec3 halfVec = normalize(keyDir + viewDir);
  float spec = pow(max(dot(nor, halfVec), 0.0), 28.0);

  vec3 baseCol;
  if (mat > 2.5) {
    // Cream white pearl (#FFFFFF / warm tint)
    baseCol = vec3(0.97, 0.93, 0.90);
  } else if (mat > 1.5) {
    // Vivid Ember Orange (#FF6D29)
    baseCol = vec3(1.0, 0.38, 0.13);
  } else {
    // Rich Espresso-Obsidian Satin (#281C19 / #161316)
    baseCol = vec3(0.18, 0.12, 0.11);
  }

  vec3 col = baseCol * (0.28 + 0.78 * wrap);
  col += vec3(1.0, 0.52, 0.26) * diffFill * 0.22;
  col += vec3(1.0, 0.88, 0.80) * spec * (mat > 1.5 ? 0.38 : 0.22);
  col += vec3(1.0, 0.48, 0.22) * fresnel * 0.42;

  // Gamma & smooth edge AA
  col = pow(clamp(col, 0.0, 1.0), vec3(0.92));
  outColor = vec4(col, 1.0);
}
`;

function draw2DFallback(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  presetFloat: number,
  spin: number
) {
  ctx.clearRect(0, 0, w, h);
  const cx = w * 0.5;
  const cy = h * 0.52;

  // Soft studio drop shadow
  const sh = ctx.createRadialGradient(cx + 8, cy + 72, 6, cx + 8, cy + 72, 105);
  sh.addColorStop(0, "rgba(12, 8, 10, 0.48)");
  sh.addColorStop(1, "rgba(12, 8, 10, 0)");
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.ellipse(cx + 8, cy + 72, 105, 34, 0, 0, Math.PI * 2);
  ctx.fill();

  const idx = Math.round(presetFloat) % 4;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.18 + Math.sin(spin * 0.5) * 0.04);

  // Sculpted obsidian-espresso base body
  const bodyGrad = ctx.createLinearGradient(-75, -80, 75, 85);
  bodyGrad.addColorStop(0, "#4a332a");
  bodyGrad.addColorStop(0.5, "#241918");
  bodyGrad.addColorStop(1, "#141013");
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  if (idx === 1) {
    ctx.roundRect(-92, -32, 184, 78, 28);
  } else if (idx === 3) {
    ctx.arc(0, 0, 78, 0, Math.PI * 2);
  } else {
    ctx.roundRect(-66, -86, 132, 172, 62);
  }
  ctx.fill();

  // Vivid #FF6D29 tactile centerpiece
  const emberGrad = ctx.createRadialGradient(-14, -26, 4, 0, 0, 56);
  emberGrad.addColorStop(0, "#ffb088");
  emberGrad.addColorStop(0.35, "#ff6d29");
  emberGrad.addColorStop(1, "#8f2f0d");
  ctx.fillStyle = emberGrad;
  ctx.beginPath();
  if (idx === 0) {
    ctx.roundRect(-17, -52, 34, 68, 17);
  } else if (idx === 1) {
    ctx.arc(Math.sin(spin) * 24, -18, 34, 0, Math.PI * 2);
  } else if (idx === 2) {
    ctx.arc(0, -6, 42, 0, Math.PI * 2);
  } else {
    ctx.arc(0, 0, 44, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
}

export function Stage3DCanvas({ presetId, telemetry }: Stage3DCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const targetPresetRef = useRef<number>(Math.max(0, PRESET_ORDER.indexOf(presetId)));
  const currentPresetRef = useRef<number>(targetPresetRef.current);
  const targetSpinRef = useRef<number>(0);
  const currentSpinRef = useRef<number>(0);
  const wakeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const nextIdx = Math.max(0, PRESET_ORDER.indexOf(presetId));
    targetPresetRef.current = nextIdx;
    targetSpinRef.current += 0.85;
    wakeRef.current?.();
  }, [presetId]);

  useEffect(() => {
    if (!telemetry) return;
    const impulse = Math.min(0.45, (telemetry.velocityPxPerSec || 180) / 2400);
    targetSpinRef.current += impulse;
    wakeRef.current?.();
  }, [telemetry]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(332 * dpr);
    const height = Math.round(312 * dpr);
    canvas.width = width;
    canvas.height = height;

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    });

    let prog: WebGLProgram | null = null;
    let vao: WebGLVertexArrayObject | null = null;
    let uRes: WebGLUniformLocation | null = null;
    let uPreset: WebGLUniformLocation | null = null;
    let uSpin: WebGLUniformLocation | null = null;
    let uTurn: WebGLUniformLocation | null = null;

    if (gl) {
      const compile = (type: number, src: string) => {
        const sh = gl.createShader(type)!;
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
          gl.deleteShader(sh);
          return null;
        }
        return sh;
      };

      const vs = compile(gl.VERTEX_SHADER, VERT_SRC);
      const fs = compile(gl.FRAGMENT_SHADER, FRAG_SRC);
      if (vs && fs) {
        const p = gl.createProgram()!;
        gl.attachShader(p, vs);
        gl.attachShader(p, fs);
        gl.linkProgram(p);
        if (gl.getProgramParameter(p, gl.LINK_STATUS)) {
          prog = p;
          vao = gl.createVertexArray();
          gl.bindVertexArray(vao);
          const buf = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, buf);
          gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
            gl.STATIC_DRAW
          );
          const loc = gl.getAttribLocation(p, "a_pos");
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

          uRes = gl.getUniformLocation(p, "u_res");
          uPreset = gl.getUniformLocation(p, "u_preset");
          uSpin = gl.getUniformLocation(p, "u_spin");
          uTurn = gl.getUniformLocation(p, "u_turn");
        }
      }
    }

    const ctx2d = !prog ? canvas.getContext("2d") : null;
    let rafId: number | null = null;

    const renderFrame = () => {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const dp = targetPresetRef.current - currentPresetRef.current;
      const ds = targetSpinRef.current - currentSpinRef.current;

      if (reduced) {
        currentPresetRef.current = targetPresetRef.current;
        currentSpinRef.current = targetSpinRef.current;
      } else {
        currentPresetRef.current += dp * 0.14;
        currentSpinRef.current += ds * 0.14;
      }

      const turnAngle = (targetPresetRef.current - currentPresetRef.current) * 0.95;

      if (gl && prog && vao) {
        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(prog);
        gl.bindVertexArray(vao);
        gl.uniform2f(uRes, width, height);
        gl.uniform1f(uPreset, (currentPresetRef.current + 4) % 4);
        gl.uniform1f(uSpin, currentSpinRef.current);
        gl.uniform1f(uTurn, turnAngle);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      } else if (ctx2d) {
        draw2DFallback(ctx2d, width, height, currentPresetRef.current, currentSpinRef.current);
      }

      if (Math.abs(dp) > 0.002 || Math.abs(ds) > 0.002) {
        rafId = requestAnimationFrame(renderFrame);
      } else {
        currentPresetRef.current = targetPresetRef.current;
        currentSpinRef.current = targetSpinRef.current;
        rafId = null;
      }
    };

    wakeRef.current = () => {
      if (rafId === null) {
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    renderFrame();

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      wakeRef.current = null;
    };
  }, []);

  return (
    <div className="sculpture-anchor" aria-hidden="true">
      <div
        className="bokeh-orb bokeh-orb-a"
        style={{
          transform: `translate(${PRESET_ORDER.indexOf(presetId) * -6}px, ${
            (PRESET_ORDER.indexOf(presetId) % 2) * 10
          }px)`,
        }}
      />
      <div
        className="bokeh-orb bokeh-orb-b"
        style={{
          transform: `translate(${(PRESET_ORDER.indexOf(presetId) % 2) * 12}px, ${
            PRESET_ORDER.indexOf(presetId) * -5
          }px)`,
        }}
      />
      <div className="bokeh-orb bokeh-orb-c" />
      <canvas ref={canvasRef} className="sculpture-canvas" />
    </div>
  );
}

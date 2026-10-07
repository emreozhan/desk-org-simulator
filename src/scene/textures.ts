// Prosedürel dokular: topografik masa pedi, ceviz masa, monitör ekranları. Tohumlu, her açılışta aynı.
import * as THREE from "three";
import type { ScreenStyle } from "../model/types";

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function valueNoise(seed: number): (x: number, y: number) => number {
  const r = mulberry32(seed);
  const n = 64;
  const tbl = new Float32Array(n * n).map(() => r());
  const g = (i: number, j: number): number => tbl[(((j % n) + n) % n) * n + (((i % n) + n) % n)];
  const s = (t: number): number => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const u = s(x - xi);
    const v = s(y - yi);
    const a = g(xi, yi);
    const b = g(xi + 1, yi);
    const c = g(xi, yi + 1);
    const d = g(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

function toTexture(c: HTMLCanvasElement, aniso: number): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

/** Fotoğraftaki pede benzer izohips çizgileri (marching squares). */
export function topoTexture(aniso: number): THREE.CanvasTexture {
  const W = 2048;
  const H = 800;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = "#edebe5";
  ctx.fillRect(0, 0, W, H);
  const noise = valueNoise(7);
  const fbm = (x: number, y: number): number => {
    let v = 0;
    let amp = 0.55;
    let f = 1;
    for (let o = 0; o < 4; o++) {
      v += noise(x * f, y * f) * amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return v;
  };
  const step = 8;
  const cols = W / step + 1;
  const rows = H / step + 1;
  const val = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) val[j * cols + i] = fbm((i * step * 5.2) / W, (j * step * 2.1) / H);
  ctx.strokeStyle = "#141414";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  const lerpPt = (x0: number, y0: number, v0: number, x1: number, y1: number, v1: number, l: number): [number, number] => {
    const t = (l - v0) / (v1 - v0 || 1e-9);
    return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
  };
  // case → kenar çiftleri (0 üst, 1 sağ, 2 alt, 3 sol)
  const table: number[][][] = [
    [], [[3, 2]], [[2, 1]], [[3, 1]], [[0, 1]], [[3, 0], [2, 1]], [[0, 2]], [[3, 0]],
    [[3, 0]], [[0, 2]], [[0, 1], [3, 2]], [[0, 1]], [[3, 1]], [[2, 1]], [[3, 2]], [],
  ];
  for (let level = 0.12; level < 0.95; level += 0.042) {
    ctx.beginPath();
    for (let j = 0; j < rows - 1; j++)
      for (let i = 0; i < cols - 1; i++) {
        const a = val[j * cols + i];
        const b = val[j * cols + i + 1];
        const cc = val[(j + 1) * cols + i + 1];
        const d = val[(j + 1) * cols + i];
        const idx = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (cc > level ? 2 : 0) | (d > level ? 1 : 0);
        const segs = table[idx];
        if (!segs.length) continue;
        const x = i * step;
        const y = j * step;
        const edge = (e: number): [number, number] =>
          e === 0
            ? lerpPt(x, y, a, x + step, y, b, level)
            : e === 1
              ? lerpPt(x + step, y, b, x + step, y + step, cc, level)
              : e === 2
                ? lerpPt(x, y + step, d, x + step, y + step, cc, level)
                : lerpPt(x, y, a, x, y + step, d, level);
        for (const [e0, e1] of segs) {
          const p0 = edge(e0);
          const p1 = edge(e1);
          ctx.moveTo(p0[0], p0[1]);
          ctx.lineTo(p1[0], p1[1]);
        }
      }
    ctx.stroke();
  }
  // Dikişli kenar
  ctx.strokeStyle = "#2a2a2a";
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, W - 10, H - 10);
  return toTexture(c, aniso);
}

export function woodTexture(aniso: number): THREE.CanvasTexture {
  const W = 2048;
  const H = 1024;
  const [c, ctx] = canvas(W, H);
  const r = mulberry32(11);
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#2e2019");
  grad.addColorStop(0.5, "#271a14");
  grad.addColorStop(1, "#2c1e17");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 420; i++) {
    const y0 = r() * H;
    const amp = 2 + r() * 10;
    const freq = 0.001 + r() * 0.004;
    const ph = r() * 6.28;
    ctx.strokeStyle = r() > 0.5 ? `rgba(70,48,36,${0.08 + r() * 0.18})` : `rgba(12,8,6,${0.1 + r() * 0.2})`;
    ctx.lineWidth = 0.6 + r() * 2.2;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 16) {
      const y = y0 + Math.sin(x * freq + ph) * amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return toTexture(c, aniso);
}

function codeScreen(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  const r = mulberry32(3);
  ctx.fillStyle = "#23272e";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#1a1d22";
  ctx.fillRect(0, 0, 170, H);
  ctx.fillStyle = "#2b3038";
  ctx.fillRect(0, 0, W, 22);
  for (let y = 40; y < H - 30; y += 15) {
    ctx.fillStyle = `rgba(200,205,215,${0.18 + r() * 0.25})`;
    ctx.fillRect(14 + (r() > 0.7 ? 12 : 0), y, 50 + r() * 90, 6);
  }
  const palette = ["#c678dd", "#61afef", "#98c379", "#e5c07b", "#abb2bf", "#e06c75", "#56b6c2"];
  for (let y = 46; y < H - 70; y += 17) {
    let x = 230 + Math.floor(r() * 4) * 22;
    const n = 1 + Math.floor(r() * 6);
    for (let k = 0; k < n && x < W - 80; k++) {
      const w = 18 + r() * 90;
      ctx.fillStyle = palette[Math.floor(r() * palette.length)];
      ctx.globalAlpha = 0.75;
      ctx.fillRect(x, y, w, 7);
      x += w + 8;
    }
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#30353e";
  ctx.fillRect(W / 2 - 220, H - 54, 440, 30);
  ctx.fillStyle = "#ff6b35";
  ctx.fillRect(W / 2 - 210, H - 44, 8, 10);
}

function gameScreen(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  const r = mulberry32(5);
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#5f5b9e");
  sky.addColorStop(0.55, "#c89ab8");
  sky.addColorStop(1, "#f2b98c");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#6d77b8";
  ctx.beginPath();
  ctx.moveTo(0, H * 0.62);
  for (let x = 0; x <= W; x += 32) ctx.lineTo(x, H * (0.45 + 0.12 * Math.sin(x * 0.02) + r() * 0.03));
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.fill();
  const tile = 16;
  const brick = (x0: number, w: number, top: number): void => {
    for (let y = top; y < H; y += tile)
      for (let x = x0; x < x0 + w; x += tile) {
        ctx.fillStyle = (x / tile + y / tile) % 2 ? "#8c4a2c" : "#7a3f25";
        ctx.fillRect(x, y, tile - 1, tile - 1);
      }
    ctx.fillStyle = "#6fc04b";
    ctx.fillRect(x0, top - 6, w, 8);
  };
  brick(0, 96, 330);
  brick(160, 128, 120);
  brick(352, 96, 260);
  brick(560, 64, 60);
  brick(720, 304, 380);
  ctx.fillStyle = "#3e6fd0";
  ctx.fillRect(624, 400, 96, H - 400);
  ctx.fillStyle = "#e8eef8";
  for (let i = 0; i < 4; i++) ctx.fillRect(640 + i * 20, 404, 6, 6);
  ctx.fillStyle = "#f3d27a";
  ctx.fillRect(400, 234, 18, 22);
  ctx.fillStyle = "#7ec6f0";
  ctx.fillRect(424, 236, 18, 20);
}

const screenCache = new Map<ScreenStyle, THREE.CanvasTexture>();

export function screenTexture(style: ScreenStyle, aniso: number): THREE.CanvasTexture {
  const hit = screenCache.get(style);
  if (hit) return hit;
  const W = 1024;
  const H = 576;
  const [c, ctx] = canvas(W, H);
  if (style === "code") codeScreen(ctx, W, H);
  else if (style === "game") gameScreen(ctx, W, H);
  else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#1b2230");
    g.addColorStop(1, "#0d1016");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  const t = toTexture(c, aniso);
  screenCache.set(style, t);
  return t;
}

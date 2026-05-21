import { nativeImage, type NativeImage } from "electron";

/**
 * ovo 视觉系统：双圆眼睛 + V 形嘴（O-V-O 字面意象）。
 * 几何在 [0..1] 归一化坐标下定义，渲染时缩放到任意尺寸。
 * 唯一设计源——托盘、dock、应用图标都从这里出。
 */

interface RGBA { r: number; g: number; b: number; a: number; }

const GEOM = {
  // 双眼圆心 + 半径（相对图标 size）
  eyeLeft:  { cx: 30 / 100, cy: 48 / 100, r: 14 / 100 },
  eyeRight: { cx: 70 / 100, cy: 48 / 100, r: 14 / 100 },
  eyeStrokeRel: 2.6 / 100,
  pupilRel: 0.34,
  // V 形 path 三顶点
  v: {
    p1: [42 / 100, 38 / 100] as [number, number],
    p2: [50 / 100, 58 / 100] as [number, number],
    p3: [58 / 100, 38 / 100] as [number, number]
  },
  vStrokeRel: 3.4 / 100
};

// B1 / B3 修复（2026-05-17）：删除微信绿色板，迁移到 systemBlue（与 OvoLogo / CSS --accent 一致）
// 色板对应关系：
//   bgTop / bgBottom = 深色 navy 渐变（与 systemBlue dark 一致）
//   glow / pupil / v = systemBlue 各级亮度（与浏览器 OvoLogo vColor 视觉同源）
//   eye = 白色描边（高对比，icon 在浅/深 menu bar 都清晰可见）
const COLOR = {
  bgTop:    { r: 0x10, g: 0x2a, b: 0x4d }, // navy 800（systemBlue 暗化）
  bgBottom: { r: 0x05, g: 0x14, b: 0x28 }, // navy 950
  glow:     { r: 0x0a, g: 0x84, b: 0xff, a: 28 }, // systemBlue dark
  eye:      { r: 0xff, g: 0xff, b: 0xff, a: 255 }, // 纯白描边（OvoLogo on-accent 模式）
  pupil:    { r: 0x00, g: 0x7a, b: 0xff, a: 255 }, // systemBlue light（即 --accent）
  v:        { r: 0x40, g: 0x9c, b: 0xff, a: 255 }  // systemBlue 中亮度
} as const;

function blendPixel(buf: Buffer, idx: number, c: RGBA, cov: number) {
  const srcA = (c.a / 255) * cov;
  if (srcA <= 0) return;
  const dstA = buf[idx + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) return;
  const inv = 1 - srcA;
  buf[idx]     = Math.round((c.r * srcA + buf[idx]     * dstA * inv) / outA);
  buf[idx + 1] = Math.round((c.g * srcA + buf[idx + 1] * dstA * inv) / outA);
  buf[idx + 2] = Math.round((c.b * srcA + buf[idx + 2] * dstA * inv) / outA);
  buf[idx + 3] = Math.round(outA * 255);
}

interface Bbox { x0: number; y0: number; x1: number; y1: number; }

function fillAA(
  buf: Buffer,
  w: number,
  h: number,
  colorFn: RGBA | ((x: number, y: number) => RGBA),
  inside: (x: number, y: number) => boolean,
  bbox?: Bbox
) {
  const SS = 3;
  const x0 = Math.max(0, Math.floor(bbox?.x0 ?? 0));
  const y0 = Math.max(0, Math.floor(bbox?.y0 ?? 0));
  const x1 = Math.min(w, Math.ceil(bbox?.x1 ?? w));
  const y1 = Math.min(h, Math.ceil(bbox?.y1 ?? h));
  const isFn = typeof colorFn === "function";
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      let count = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          if (inside(px + (sx + 0.5) / SS, py + (sy + 0.5) / SS)) count++;
        }
      }
      if (count === 0) continue;
      const c = isFn ? (colorFn as (x: number, y: number) => RGBA)(px + 0.5, py + 0.5) : colorFn as RGBA;
      blendPixel(buf, (py * w + px) * 4, c, count / (SS * SS));
    }
  }
}

function insideRoundedRect(x: number, y: number, rx: number, ry: number, w: number, h: number, r: number): boolean {
  if (x < rx || x > rx + w || y < ry || y > ry + h) return false;
  const cx = Math.max(rx + r, Math.min(x, rx + w - r));
  const cy = Math.max(ry + r, Math.min(y, ry + h - r));
  return Math.hypot(x - cx, y - cy) <= r;
}

function insideRing(x: number, y: number, cx: number, cy: number, r: number, stroke: number): boolean {
  const d = Math.hypot(x - cx, y - cy);
  return d <= r + stroke / 2 && d >= r - stroke / 2;
}

function insideCircle(x: number, y: number, cx: number, cy: number, r: number): boolean {
  return Math.hypot(x - cx, y - cy) <= r;
}

function insideStroke(x: number, y: number, p1: [number, number], p2: [number, number], stroke: number): boolean {
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(x - x1, y - y1) <= stroke / 2;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)) <= stroke / 2;
}

/**
 * 应用图标（dock/dmg/about）。size 推荐 512 或 1024。
 * 渲染开销：512 约 200ms，1024 约 800ms。仅启动时调一次。
 */
export function renderAppIcon(size: number): NativeImage {
  const buf = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;

  // 1) 圆角方形背景 + 垂直渐变（AA 圆角）
  fillAA(
    buf, size, size,
    (_x: number, y: number): RGBA => {
      const t = y / size;
      return {
        r: Math.round(COLOR.bgTop.r + (COLOR.bgBottom.r - COLOR.bgTop.r) * t),
        g: Math.round(COLOR.bgTop.g + (COLOR.bgBottom.g - COLOR.bgTop.g) * t),
        b: Math.round(COLOR.bgTop.b + (COLOR.bgBottom.b - COLOR.bgTop.b) * t),
        a: 255
      };
    },
    (x, y) => insideRoundedRect(x, y, 0, 0, size, size, radius)
  );

  // 2) 中心柔光（绿色径向，提升立体感）
  const glowCx = size * 0.5;
  const glowCy = size * 0.48;
  const glowR = size * 0.46;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const d = Math.hypot(px + 0.5 - glowCx, py + 0.5 - glowCy);
      if (d > glowR) continue;
      const t = 1 - d / glowR;
      const intensity = t * t; // 平方衰减
      blendPixel(buf, (py * size + px) * 4, COLOR.glow, intensity);
    }
  }

  // 3) 双眼描边（gradient 着色：上亮下暗给立体感）
  for (const eye of [GEOM.eyeLeft, GEOM.eyeRight]) {
    const cx = eye.cx * size;
    const cy = eye.cy * size;
    const r = eye.r * size;
    const sw = GEOM.eyeStrokeRel * size;
    const bbox = { x0: cx - r - sw, y0: cy - r - sw, x1: cx + r + sw, y1: cy + r + sw };
    fillAA(buf, size, size,
      (_x, y) => {
        const t = (y - bbox.y0) / (bbox.y1 - bbox.y0);
        return {
          r: Math.round(COLOR.eye.r * (1 - 0.18 * t)),
          g: Math.round(COLOR.eye.g * (1 - 0.08 * t)),
          b: Math.round(COLOR.eye.b * (1 - 0.14 * t)),
          a: 255
        };
      },
      (x, y) => insideRing(x, y, cx, cy, r, sw),
      bbox
    );
    // 内瞳：纯实心绿
    fillAA(buf, size, size, COLOR.pupil,
      (x, y) => insideCircle(x, y, cx, cy, r * GEOM.pupilRel),
      { x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r }
    );
  }

  // 4) V 形嘴（两段 stroke）
  const vw = GEOM.vStrokeRel * size;
  const p1: [number, number] = [GEOM.v.p1[0] * size, GEOM.v.p1[1] * size];
  const p2: [number, number] = [GEOM.v.p2[0] * size, GEOM.v.p2[1] * size];
  const p3: [number, number] = [GEOM.v.p3[0] * size, GEOM.v.p3[1] * size];
  const segBbox = (a: [number, number], b: [number, number]): Bbox => ({
    x0: Math.min(a[0], b[0]) - vw, y0: Math.min(a[1], b[1]) - vw,
    x1: Math.max(a[0], b[0]) + vw, y1: Math.max(a[1], b[1]) + vw
  });
  fillAA(buf, size, size, COLOR.v, (x, y) => insideStroke(x, y, p1, p2, vw), segBbox(p1, p2));
  fillAA(buf, size, size, COLOR.v, (x, y) => insideStroke(x, y, p2, p3, vw), segBbox(p2, p3));

  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

/**
 * 托盘图标。template image：仅黑色 alpha，macOS 自动适配明暗主题。
 * 提供 1x + 2x retina representation。
 */
export function renderTrayIcon(): NativeImage {
  const baseSize = 22;
  const make = (size: number): Buffer => {
    const buf = Buffer.alloc(size * size * 4);
    const black: RGBA = { r: 0, g: 0, b: 0, a: 255 };

    // 双眼 ring（托盘小，描边略加粗保证清晰）
    for (const eye of [GEOM.eyeLeft, GEOM.eyeRight]) {
      const cx = eye.cx * size;
      const cy = eye.cy * size;
      const r = eye.r * size;
      const sw = Math.max(1.4, GEOM.eyeStrokeRel * size * 1.2);
      fillAA(buf, size, size, black,
        (x, y) => insideRing(x, y, cx, cy, r, sw),
        { x0: cx - r - sw, y0: cy - r - sw, x1: cx + r + sw, y1: cy + r + sw }
      );
    }
    // V 形
    const vw = Math.max(1.4, GEOM.vStrokeRel * size * 1.0);
    const p1: [number, number] = [GEOM.v.p1[0] * size, GEOM.v.p1[1] * size];
    const p2: [number, number] = [GEOM.v.p2[0] * size, GEOM.v.p2[1] * size];
    const p3: [number, number] = [GEOM.v.p3[0] * size, GEOM.v.p3[1] * size];
    fillAA(buf, size, size, black, (x, y) => insideStroke(x, y, p1, p2, vw));
    fillAA(buf, size, size, black, (x, y) => insideStroke(x, y, p2, p3, vw));
    return buf;
  };

  const img = nativeImage.createFromBuffer(make(baseSize), { width: baseSize, height: baseSize });
  // 加 retina 表示，让 retina 显示器下不模糊
  try {
    img.addRepresentation({
      scaleFactor: 2,
      width: baseSize * 2,
      height: baseSize * 2,
      buffer: make(baseSize * 2)
    });
  } catch {
    /* addRepresentation 不支持的旧 Electron 版本忽略；1x 仍可用 */
  }
  img.setTemplateImage(true);
  return img;
}

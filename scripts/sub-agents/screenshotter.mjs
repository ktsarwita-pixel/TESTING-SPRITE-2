#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { computeAnglerRig, renderArticulatedAngler } from '../../js/anglerRenderer.js';
import { computeBackDockLanding } from '../../js/catchPhysics.js';
import { FISH_SPRITES } from '../../js/fishSprites.js';
import { FISH_SPECIES } from '../../js/fishData.js';
import { PALETTE } from '../../js/palette.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);

export function rotateGrid(grid, mode = 'right') {
  const h = grid.length;
  const w = grid[0].length;
  if (mode === 'left') return grid.map((r) => r.split('').reverse().join(''));
  if (mode === '180' || mode === 'flip') {
    const out = Array.from({ length: h }, () => Array(w).fill('.'));
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        out[h - 1 - y][w - 1 - x] = grid[y][x];
    return out.map((r) => r.join(''));
  }
  if (mode === 'hang') {
    const out = Array.from({ length: w }, () => Array(h).fill('.'));
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        out[w - 1 - x][y] = grid[y][x];
    return out.map((r) => r.join(''));
  }
  if (mode === 'hangCW') {
    const out = Array.from({ length: w }, () => Array(h).fill('.'));
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        out[x][h - 1 - y] = grid[y][x];
    return out.map((r) => r.join(''));
  }
  return grid;
}

export function getFishGrid(id, mode = 'right') {
  return rotateGrid(FISH_SPRITES[id][0], mode);
}

// Build exact real-game frame state at normalized landing progress `st` (0..1, >=1 = CAUGHT)
export function buildGameFrameState(fishId, st) {
  const sp = FISH_SPECIES.find((s) => s.id === fishId) || { id: fishId, minWeight: 2, maxWeight: 6 };
  const avgW = ((sp.minWeight || 0.2) + (sp.maxWeight || 1.0)) * 0.5;
  const wf = clamp(Math.log10(1 + avgW) / 2.15, 0.08, 1.0);
  const sprW = FISH_SPRITES[fishId][0][0].length;
  const sprH = FISH_SPRITES[fishId][0].length;
  const isCaught = st >= 1.0;
  const t = clamp(st, 0, 1);

  // Exact live-game desktop pier/water proportions from js/game.js resize() (vw=320):
  // pierEndX = round(320 * 0.28) = 90; anglerX = pierEndX - 24 = 66; pierY = 62; waterY = 76
  const pierEndX = 90;
  const anglerX = pierEndX - 24; // 66
  const pierY = 62;
  const waterY = pierY + 14; // 76

  let lean, squat, stance;
  if (t < 0.22) {
    const p = smoothstep(t / 0.22);
    lean = lerp(-1.4, -3.6 - wf * 1.4, p);
    squat = lerp(1.0, 2.0 + wf * 1.2, p);
    stance = lerp(0.9, 1.0, p);
  } else if (t < 0.56) {
    const p = smoothstep((t - 0.22) / 0.34);
    const duckBell = Math.sin(p * Math.PI);
    lean = lerp(-3.6 - wf * 1.4, 1.1, p);
    squat = lerp(2.0 + wf * 1.2, 1.4, p) + duckBell * (2.2 + wf * 1.1);
    stance = lerp(1.0, 0.85, p);
  } else if (t < 0.78) {
    const p = smoothstep((t - 0.56) / 0.22);
    const flinch = Math.exp(-Math.pow((t - 0.57) / 0.05, 2)) * (1.2 + wf * 0.9);
    lean = lerp(1.1, 0.85, p);
    squat = lerp(1.4, 0.45, p) + flinch;
    stance = lerp(0.85, 0.55, p);
  } else {
    const p = smoothstep((t - 0.78) / 0.22);
    lean = lerp(0.85, 0.65, p);
    squat = lerp(0.45, 0.22 + wf * 0.18, p);
    stance = lerp(0.55, 0.42, p);
  }
  const rodAngle = t < 0.22
    ? lerp(-1.04, -2.42 - wf * 0.08, smoothstep(t / 0.22))
    : t < 0.56
      ? lerp(-2.42 - wf * 0.08, -2.26, smoothstep((t - 0.22) / 0.34))
      : -2.26;
  const rodFlex = t < 0.22
    ? (0.65 + wf * 0.35) * Math.sin((t / 0.22) * Math.PI * 0.82)
    : Math.exp(-(t - 0.22) * 6.5) * Math.cos((t - 0.22) * 24) * (0.34 + wf * 0.16);

  const g = {
    anglerX, pierY, pierEndX, waterY,
    time: 1.5 + st,
    state: isCaught ? 'CAUGHT' : 'LANDING',
    animLean: lean, animSquat: squat, animStance: stance,
    rodAngle, rodFlex, landingT: t, landingWeightFactor: wf,
    catchTime: isCaught ? 0.32 : 0,
    landingInitGripDX: 5.2, landingInitGripDY: 1.2,
    landingInitReelDX: 3.1, landingInitReelDY: 2.3,
    landingStartX: pierEndX + Math.max(12, sprW * 0.5 + 4),
    landingStartY: waterY + 4,
    save: { upgrades: { rod: 3 } },
    activeFish: isCaught ? null : { species: { id: fishId }, x: 0, y: 0, dir: -1 },
    lastCatchInfo: isCaught ? { species: { id: fishId } } : null,
    sprites: {
      fish: {
        [fishId]: {
          w: sprW, h: sprH,
          right: Array(4).fill({ id: fishId, mode: 'right', width: sprW, height: sprH }),
          left: Array(4).fill({ id: fishId, mode: 'left', width: sprW, height: sprH }),
          hang: Array(4).fill({ id: fishId, mode: 'hang', width: sprH, height: sprW }),
          hangCW: Array(4).fill({ id: fishId, mode: 'hangCW', width: sprH, height: sprW }),
          flip: Array(4).fill({ id: fishId, mode: 'flip', width: sprW, height: sprH }),
        },
      },
    },
  };
  return { g, wf, sprW, sprH, isCaught, t };
}

// Rasterize one frame into layered occupancy maps + final RGB pixels for noclip analysis AND PNG screenshots!
export function rasterizeFrame(fishId, st) {
  const { g, isCaught, t } = buildGameFrameState(fishId, st);
  const rig = computeAnglerRig(g);
  const land = computeBackDockLanding(g, rig);

  const pierPx = new Set();
  const anglerBodyPx = new Set();
  const anglerHeadPx = new Set();
  const fishPx = new Set();

  // Fill wooden pier planks (x: 0..pierEndX, y: pierY..pierY+4)
  for (let py = g.pierY; py <= g.pierY + 4; py++) {
    for (let px = 0; px <= g.pierEndX; px++) {
      pierPx.add(`${px},${py}`);
    }
  }

  // Capture angler draw calls
  const angOps = [];
  const ctx = {
    fillStyle: '#fff', globalAlpha: 1, stack: [],
    save() { this.stack.push([this.fillStyle, this.globalAlpha]); },
    restore() { [this.fillStyle, this.globalAlpha] = this.stack.pop(); },
    fillRect(x, y, w, h) {
      angOps.push({ op: 'rect', x, y, w, h, c: this.fillStyle, a: this.globalAlpha });
    },
    drawImage(img, x, y, dw, dh) {
      angOps.push({ op: 'img', id: img.id, mode: img.mode || 'right', x, y, dw: dw || img.width, dh: dh || img.height });
    },
  };

  renderArticulatedAngler(g, ctx);

  // Record full angler silhouette (head + hat + torso + legs)
  const hx = Math.round(rig.headX);
  const hy = Math.round(rig.headY);
  const hatTop = hy - 7 - Math.ceil(rig.hatPopY || 0);
  const bodyMinX = Math.round(Math.min(rig.backFootX - 2, rig.shoulderX - 6, hx - 6));
  const bodyMaxX = Math.round(Math.max(rig.frontFootX + 3, rig.shoulderX + 6, hx + 6));

  for (const op of angOps) {
    if (op.op === 'rect') {
      const ix = Math.round(op.x), iy = Math.round(op.y);
      const iw = Math.max(1, Math.round(op.w)), ih = Math.max(1, Math.round(op.h));
      for (let dy = 0; dy < ih; dy++) {
        for (let dx = 0; dx < iw; dx++) {
          const px = ix + dx, py = iy + dy;
          const k = `${px},${py}`;
          if (px >= hx - 6 && px <= hx + 6 && py >= hatTop && py <= hy + 2) {
            anglerHeadPx.add(k);
            anglerBodyPx.add(k);
          } else if (px >= bodyMinX && px <= bodyMaxX && py >= hatTop && py <= g.pierY) {
            anglerBodyPx.add(k);
          }
        }
      }
    }
  }

  // Simulate exact live js/renderer.js renderLineAndHook + renderLandingFishForeground!
  const extraOps = [];
  if (!isCaught) {
    if (t < 0.24) {
      extraOps.push({ op: 'line', x0: rig.tipX, y0: rig.tipY, x1: land.hookX, y1: land.hookY, c: '#fef08a', a: 1 });
    } else if (t < 0.46) {
      const lp = (t - 0.24) / 0.22;
      const tailX = rig.tipX + lerp(16, 4, lp);
      const tailY = rig.tipY + lerp(6, 18, lp);
      extraOps.push({
        op: 'quad',
        x0: rig.tipX, y0: rig.tipY,
        cx: (rig.tipX + tailX) * 0.5 + 4, cy: (rig.tipY + tailY) * 0.5 + 5 + lp * 6,
        x1: tailX, y1: tailY,
        c: '#cbd5e1', a: clamp(1 - lp * 0.92, 0.08, 1),
      });
    }
  }

  // Wet puddle on back of dock
  if (land.showPuddle) {
    const pudW = Math.min(Math.round(land.w * 0.88), Math.max(12, Math.round(g.pierEndX * 0.6)));
    const pudX = Math.max(1, Math.round(land.restX - pudW * 0.5));
    extraOps.push({ op: 'rect', x: pudX, y: g.pierY, w: pudW, h: 1, c: '#38bdf8', a: 0.45 });
  }

  // Speed afterimage ghosts during overhead launch
  if (land.ghosts) {
    for (let i = land.ghosts.length - 1; i >= 0; i--) {
      const gh = land.ghosts[i];
      const gg = getFishGrid(fishId, gh.mode);
      extraOps.push({
        op: 'img', id: fishId, mode: gh.mode,
        x: Math.round(gh.x - gg[0].length / 2),
        y: Math.round(gh.y - gg.length / 2),
        a: gh.alpha,
      });
    }
  }

  // Impact comic starburst on dock slam!
  if (land.impactFlash) {
    const imp = land.impactFlash;
    const p = clamp(imp.progress, 0, 1);
    const ix = Math.round(imp.x), iy = Math.round(imp.y);
    const rad = Math.round(lerp(3, imp.big ? 20 : 10, p));
    extraOps.push({ op: 'rect', x: ix - rad, y: iy, w: 3, h: 1, c: '#fef08a', a: clamp(1 - p, 0, 0.9) });
    extraOps.push({ op: 'rect', x: ix + rad - 2, y: iy, w: 3, h: 1, c: '#fef08a', a: clamp(1 - p, 0, 0.9) });
    if (p < 0.65) {
      const rl = Math.round(lerp(4, 15, p));
      extraOps.push({ op: 'line', x0: ix - 2, y0: iy, x1: ix - rl, y1: iy - Math.round(rl * 0.65), c: '#fde047', a: 0.9 });
      extraOps.push({ op: 'line', x0: ix + 2, y0: iy, x1: ix + rl, y1: iy - Math.round(rl * 0.65), c: '#fde047', a: 0.9 });
      extraOps.push({ op: 'line', x0: ix, y0: iy - 1, x1: ix, y1: iy - rl, c: '#ffffff', a: 0.95 });
    }
  }

  // Main fish sprite
  const grid = getFishGrid(fishId, land.mode);
  const imgW = grid[0].length;
  const imgH = grid.length;
  const ix = Math.round(land.x - imgW / 2);
  let iy = Math.round(land.y - imgH / 2);
  if (ix <= g.pierEndX + 1 && iy + imgH > g.pierY) iy = g.pierY - imgH;
  extraOps.push({ op: 'img', id: fishId, mode: land.mode, x: ix, y: iy, a: 1 });

  for (let ry = 0; ry < imgH; ry++) {
    for (let rx = 0; rx < imgW; rx++) {
      const ch = grid[ry][rx];
      if (ch === '.') continue;
      fishPx.add(`${ix + rx},${iy + ry}`);
    }
  }

  // Dizzy stars over stunned fish on back of dock
  if (land.showDizzyStars) {
    const sx0 = land.x + (land.mode === 'right' ? imgW * 0.25 : -imgW * 0.25);
    const sy0 = Math.max(4, iy - 4);
    for (let i = 0; i < 3; i++) {
      const a = g.time * 5.4 + i * ((Math.PI * 2) / 3);
      const ox = Math.round(sx0 + Math.cos(a) * 6.5);
      const oy = Math.round(sy0 + Math.sin(a) * 2.2);
      extraOps.push({ op: 'rect', x: ox, y: oy, w: 1, h: 1, c: '#fef9c3', a: 1 });
      extraOps.push({ op: 'rect', x: ox - 1, y: oy, w: 1, h: 1, c: '#facc15', a: 0.85 });
      extraOps.push({ op: 'rect', x: ox + 1, y: oy, w: 1, h: 1, c: '#facc15', a: 0.85 });
    }
  }

  // Compute EXACT noclip collisions!
  const bodyNoclips = [];
  const headNoclips = [];
  const pierNoclips = [];
  for (const k of fishPx) {
    if (anglerHeadPx.has(k)) headNoclips.push(k);
    if (anglerBodyPx.has(k)) bodyNoclips.push(k);
    if (pierPx.has(k)) pierNoclips.push(k);
  }

  const fishMinX = ix;
  const fishMaxX = ix + imgW - 1;
  const backDockVisible = (t >= 0.56 || isCaught)
    ? (fishMinX >= 0 && fishMaxX < Math.round(rig.backFootX - 1))
    : true;

  return {
    g, rig, land, angOps, extraOps,
    bodyNoclips, headNoclips, pierNoclips,
    backDockVisible, fishMinX, fishMaxX,
  };
}

function hexRgb(h) {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

function writePng(filePath, w, h, buf) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    buf.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const crc32 = (b) => {
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i++) {
      c ^= b[i];
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (tag, data) => {
    const t = Buffer.from(tag);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(filePath, png);
}

// Render multi-species screenshot sheet covering FULL BACK OF DOCK (x=0) -> ANGLER -> OPEN WATER (x=148)!
export function renderScreenshotSheet(outPath, speciesList, sampleTs, { heatmap = false, scale = 2 } = {}) {
  const viewX0 = 0;
  const viewY0 = 0;
  const VW = 148;
  const VH = 92;
  const CW = VW * scale;
  const CH = VH * scale;
  const W = CW * sampleTs.length;
  const H = CH * speciesList.length;
  const buf = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    buf[i * 3] = 28; buf[i * 3 + 1] = 66; buf[i * 3 + 2] = 112;
  }

  const put = (px, py, rgb, a = 1) => {
    if (px < 0 || px >= W || py < 0 || py >= H) return;
    const o = (py * W + px) * 3;
    if (a >= 0.99) {
      buf[o] = rgb[0]; buf[o + 1] = rgb[1]; buf[o + 2] = rgb[2];
    } else {
      buf[o] = Math.round(buf[o] * (1 - a) + rgb[0] * a);
      buf[o + 1] = Math.round(buf[o + 1] * (1 - a) + rgb[1] * a);
      buf[o + 2] = Math.round(buf[o + 2] * (1 - a) + rgb[2] * a);
    }
  };
  const putCell = (ox, oy, wx, wy, rgb, a = 1) => {
    const lx = wx - viewX0;
    const ly = wy - viewY0;
    if (lx < 0 || lx >= VW || ly < 0 || ly >= VH) return;
    for (let dy = 0; dy < scale; dy++)
      for (let dx = 0; dx < scale; dx++)
        put(ox + lx * scale + dx, oy + ly * scale + dy, rgb, a);
  };

  let totalBodyNoclips = 0;
  let totalPierNoclips = 0;

  for (let si = 0; si < speciesList.length; si++) {
    const id = speciesList[si];
    for (let fi = 0; fi < sampleTs.length; fi++) {
      const ox = fi * CW;
      const oy = si * CH;
      const res = rasterizeFrame(id, sampleTs[fi]);
      totalBodyNoclips += res.bodyNoclips.length;
      totalPierNoclips += res.pierNoclips.length;

      // Water background
      for (let wy = res.g.waterY; wy < viewY0 + VH; wy++) {
        for (let wx = viewX0; wx < viewX0 + VW; wx++) {
          putCell(ox, oy, wx, wy, wy === res.g.waterY ? [56, 130, 186] : [16, 48, 84]);
        }
      }
      // Pier pilings & wooden deck planks (exact pierEndX=90, pierY=62..66)
      for (let wy = res.g.pierY + 5; wy < viewY0 + VH; wy++) {
        for (const px of [12, 13, 14, 38, 39, 40, 62, 63, 64, 84, 85, 86]) putCell(ox, oy, px, wy, [74, 44, 24]);
      }
      for (let wy = res.g.pierY; wy <= res.g.pierY + 4; wy++) {
        for (let wx = viewX0; wx <= res.g.pierEndX; wx++) {
          putCell(ox, oy, wx, wy, wy === res.g.pierY ? [146, 94, 54] : [112, 68, 38]);
        }
      }
      // Frame divider line
      for (let py = oy; py < oy + CH; py++) put(ox, py, [52, 86, 128]);
      for (let px = ox; px < ox + CW; px++) put(px, oy, [52, 86, 128]);

      const drawOps = (ops) => {
        for (const op of ops) {
          if (op.op === 'rect') {
            const rgb = hexRgb(op.c);
            for (let dy = 0; dy < Math.max(1, Math.round(op.h)); dy++)
              for (let dx = 0; dx < Math.max(1, Math.round(op.w)); dx++)
                putCell(ox, oy, Math.round(op.x) + dx, Math.round(op.y) + dy, rgb, op.a);
          } else if (op.op === 'line') {
            const rgb = hexRgb(op.c);
            const steps = Math.max(1, Math.ceil(Math.max(Math.abs(op.x1 - op.x0), Math.abs(op.y1 - op.y0)) * 2));
            for (let k = 0; k <= steps; k++) {
              const u = k / steps;
              putCell(ox, oy, Math.round(lerp(op.x0, op.x1, u)), Math.round(lerp(op.y0, op.y1, u)), rgb, op.a);
            }
          } else if (op.op === 'quad') {
            const rgb = hexRgb(op.c);
            for (let k = 0; k <= 24; k++) {
              const u = k / 24, inv = 1 - u;
              const qx = inv * inv * op.x0 + 2 * inv * u * op.cx + u * u * op.x1;
              const qy = inv * inv * op.y0 + 2 * inv * u * op.cy + u * u * op.y1;
              putCell(ox, oy, Math.round(qx), Math.round(qy), rgb, op.a);
            }
          } else if (op.op === 'img') {
            const grid = getFishGrid(op.id, op.mode);
            const a = op.a ?? 1;
            for (let ry = 0; ry < grid.length; ry++) {
              for (let rx = 0; rx < grid[ry].length; rx++) {
                const ch = grid[ry][rx];
                if (ch === '.') continue;
                putCell(ox, oy, Math.round(op.x) + rx, Math.round(op.y) + ry, hexRgb(PALETTE[ch]), a);
              }
            }
          }
        }
      };

      drawOps(res.angOps);
      drawOps(res.extraOps);

      // Heatmap overlay: MAGENTA = body/head/hat noclip, BRIGHT RED = pier noclip!
      if (heatmap) {
        for (const k of res.bodyNoclips) {
          const [wx, wy] = k.split(',').map(Number);
          putCell(ox, oy, wx, wy, [255, 0, 220]);
        }
        for (const k of res.pierNoclips) {
          const [wx, wy] = k.split(',').map(Number);
          putCell(ox, oy, wx, wy, [255, 30, 30]);
        }
      }
    }
  }

  writePng(outPath, W, H, buf);
  return { outPath, totalBodyNoclips, totalPierNoclips };
}

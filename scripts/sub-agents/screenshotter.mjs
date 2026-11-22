#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

import { computeAnglerRig, renderArticulatedAngler } from '../../js/anglerRenderer.js';
import { FISH_SPRITES } from '../../js/fishSprites.js';
import { FISH_SPECIES } from '../../js/fishData.js';
import { PALETTE } from '../../js/palette.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);

export function rotateHangGrid(grid) {
  const h = grid.length;
  const w = grid[0].length;
  const out = Array.from({ length: w }, () => Array(h).fill('.'));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Exact lossless 90° CCW transpose: MOUTH (x=w-1) at TOP (dy=0), slim dorsal LEFT (dx=y), round belly RIGHT!
      out[w - 1 - x][y] = grid[y][x];
    }
  }
  return out.map((r) => r.join(''));
}

export function getFishGrid(id, mode = 'right') {
  const base = FISH_SPRITES[id][0];
  if (mode === 'left') return base.map((r) => r.split('').reverse().join(''));
  if (mode === 'hang') return rotateHangGrid(base);
  return base;
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

  // Exact live-game pier/water proportions from js/game.js resize():
  // pierY = waterY - 14; anglerX = pierEndX - 24
  const pierEndX = 76;
  const anglerX = pierEndX - 24; // 52
  const pierY = 62;
  const waterY = pierY + 14; // 76

  let lean, squat, stance;
  if (t < 0.38) {
    const p = smoothstep(t / 0.38);
    lean = lerp(-1.4, -2.1 - wf * 1.7, p);
    squat = lerp(1.0, 1.3 + wf * 1.5, p);
    stance = lerp(0.9, 0.95 + wf * 0.05, p);
  } else if (t < 0.66) {
    const p = smoothstep((t - 0.38) / 0.28);
    const cushion = Math.exp(-Math.pow((t - 0.62) / 0.07, 2)) * (0.65 + wf * 1.35);
    lean = lerp(-2.1 - wf * 1.5, 1.35 - wf * 0.4, p);
    squat = lerp(1.3 + wf * 1.2, 0.35 + wf * 0.25, p) + cushion;
    stance = lerp(0.95, 0.55 + wf * 0.22, p);
  } else {
    const p = smoothstep((t - 0.66) / 0.34);
    lean = lerp(1.2 - wf * 0.35, 0.25 - wf * 0.95, p);
    squat = lerp(0.45 + wf * 0.35, wf * 0.32, p);
    stance = lerp(0.58 + wf * 0.2, 0.40 + wf * 0.35, p);
  }
  const rodAngle = t < 0.38
    ? lerp(-1.04, -1.52 - wf * 0.08, smoothstep(t / 0.38))
    : lerp(-1.52 - wf * 0.08, -2.28, smoothstep((t - 0.38) / 0.62));
  const rodFlex = t < 0.36
    ? (0.42 + wf * 0.42) * Math.sin((t / 0.36) * Math.PI * 0.78)
    : Math.exp(-(t - 0.36) * 7.5) * Math.cos((t - 0.36) * 18) * (0.20 + wf * 0.14);

  const g = {
    anglerX, pierY, pierEndX, waterY,
    time: 1.5 + st,
    state: isCaught ? 'CAUGHT' : 'LANDING',
    animLean: lean, animSquat: squat, animStance: stance,
    rodAngle, rodFlex, landingT: t, landingWeightFactor: wf,
    catchTime: isCaught ? 0.22 : 0,
    landingInitGripDX: 5.2, landingInitGripDY: 1.2,
    landingInitReelDX: 3.1, landingInitReelDY: 2.3,
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
        },
      },
    },
  };
  return { g, wf, sprW, sprH, isCaught, t };
}

// Rasterize one frame into layered occupancy maps + final RGB pixels for noclip analysis AND PNG screenshots!
export function rasterizeFrame(fishId, st) {
  const { g, wf, sprW, sprH, isCaught, t } = buildGameFrameState(fishId, st);
  const rig = computeAnglerRig(g);

  // Layer sets: "x,y"
  const pierPx = new Set();
  const anglerBodyPx = new Set(); // head + hat + torso + legs (NOT outstretched forearm/hand holding fish)
  const anglerHeadPx = new Set();
  const handPx = new Set();
  const fishPx = new Set();
  const rgbMap = new Map();

  // Fill wooden pier planks (x: 0..pierEndX, y: pierY..pierY+4)
  for (let py = g.pierY; py <= g.pierY + 4; py++) {
    for (let px = 0; px <= g.pierEndX; px++) {
      pierPx.add(`${px},${py}`);
    }
  }

  // Capture angler draw calls (separating angler body vs CAUGHT fish)
  let inCaughtFish = false;
  const angOps = [];
  const ctx = {
    fillStyle: '#fff', globalAlpha: 1, stack: [],
    save() { this.stack.push([this.fillStyle, this.globalAlpha]); },
    restore() { [this.fillStyle, this.globalAlpha] = this.stack.pop(); },
    fillRect(x, y, w, h) {
      angOps.push({ op: 'rect', x, y, w, h, c: this.fillStyle, a: this.globalAlpha, isFish: inCaughtFish });
    },
    drawImage(img, x, y, dw, dh) {
      angOps.push({ op: 'img', id: img.id, mode: img.mode || 'right', x, y, dw: dw || img.width, dh: dh || img.height });
    },
  };

  renderArticulatedAngler(g, ctx);

  // Record angler body silhouette pixels BEFORE fish is drawn!
  const hx = Math.round(rig.headX);
  const hy = Math.round(rig.headY);
  const bodyMinX = Math.round(rig.shoulderX - 5);
  const bodyMaxX = Math.round(rig.shoulderX + 3.2);
  const handRx = Math.round(rig.reelX);
  const handRy = Math.round(rig.reelY);

  for (const op of angOps) {
    if (op.op === 'rect') {
      const ix = Math.round(op.x), iy = Math.round(op.y);
      const iw = Math.max(1, Math.round(op.w)), ih = Math.max(1, Math.round(op.h));
      for (let dy = 0; dy < ih; dy++) {
        for (let dx = 0; dx < iw; dx++) {
          const px = ix + dx, py = iy + dy;
          const k = `${px},${py}`;
          rgbMap.set(k, op.c);
          // Classify body vs front hand
          const nearHand = Math.abs(px - handRx) <= 2 && Math.abs(py - handRy) <= 2;
          if (nearHand) {
            handPx.add(k);
          } else if (px >= hx - 3 && px <= hx + 3 && py >= hy - 4 && py <= hy + 2) {
            anglerHeadPx.add(k);
            anglerBodyPx.add(k);
          } else if (px >= bodyMinX && px <= bodyMaxX && py >= hy - 4 && py <= g.pierY) {
            anglerBodyPx.add(k);
          }
        }
      }
    } else if (op.op === 'img') {
      const grid = getFishGrid(op.id, op.mode);
      const ix = Math.round(op.x), iy = Math.round(op.y);
      for (let ry = 0; ry < grid.length; ry++) {
        for (let rx = 0; rx < grid[ry].length; rx++) {
          const ch = grid[ry][rx];
          if (ch === '.') continue;
          const k = `${ix + rx},${iy + ry}`;
          fishPx.add(k);
          rgbMap.set(k, PALETTE[ch]);
        }
      }
    }
  }

  // If LANDING, simulate exact live js/game.js LANDING trajectory + js/renderer.js renderLandingFishForeground!
  const extraOps = [];
  if (!isCaught) {
    const isHang = rig.holdMode === 'hang';
    const startX = g.pierEndX + Math.max(10, sprW * 0.5 + 3);
    const startY = g.waterY + 4;
    let fx, fy;
    if (t < 0.62) {
      const p = smoothstep(t / 0.62);
      const arcPeak = lerp(22, 16, wf);
      fx = lerp(startX, rig.catchHoldX, p);
      fy = lerp(startY, rig.catchHoldY, p) - Math.sin(p * Math.PI) * arcPeak;
      // Exact pier-edge vertical clearance guard!
      const curHalfW = sprW * 0.5;
      const curHalfH = sprH * 0.5;
      if (fx - curHalfW <= g.pierEndX + 1) {
        fy = Math.min(fy, g.pierY - curHalfH - 2);
      }
      // Body clearance guard during flight: never cross into angler torso!
      const minSafeX = Math.max(rig.shoulderX + 4.4, rig.headX + 3.6) + curHalfW + 0.6;
      if (fx < minSafeX) fx = minSafeX;
    } else {
      fx = rig.catchHoldX;
      fy = rig.catchHoldY;
    }

    const isHangCaught = t >= 0.62 && isHang;
    const mode = isHangCaught ? 'hang' : 'left';
    const grid = getFishGrid(fishId, mode);
    const imgW = grid[0].length;
    const imgH = grid.length;
    const hookX = isHangCaught ? fx : fx - (sprW * 0.42);
    const hookY = isHangCaught ? (fy - sprW * 0.42) : (fy + 0.8);

    if (t < 0.40) {
      extraOps.push({ op: 'line', x0: rig.tipX, y0: rig.tipY, x1: hookX, y1: hookY, c: '#f1f5f9', a: 1 });
    } else if (t < 0.58) {
      const lp = (t - 0.40) / 0.18;
      extraOps.push({
        op: 'quad',
        x0: rig.tipX, y0: rig.tipY,
        cx: (rig.tipX + hookX) * 0.5, cy: (rig.tipY + hookY) * 0.5 + 3 + lp * 8,
        x1: hookX, y1: hookY,
        c: '#cbd5e1', a: clamp(1 - lp * 0.92, 0.08, 1),
      });
    }

    const ix = Math.round(fx - imgW / 2);
    const iy = Math.round(fy - imgH / 2);
    extraOps.push({ op: 'img', id: fishId, mode, x: ix, y: iy, dw: imgW, dh: imgH });
    for (let ry = 0; ry < imgH; ry++) {
      for (let rx = 0; rx < imgW; rx++) {
        const ch = grid[ry][rx];
        if (ch === '.') continue;
        const k = `${ix + rx},${iy + ry}`;
        fishPx.add(k);
        rgbMap.set(k, PALETTE[ch]);
      }
    }
    if (t >= 0.62) {
      const rx = Math.round(rig.reelX), ry = Math.round(rig.reelY);
      extraOps.push({ op: 'rect', x: rx, y: ry, w: 2, h: 1, c: '#ffe0c4', a: 1 });
      extraOps.push({ op: 'rect', x: rx + 1, y: ry + 1, w: 2, h: 1, c: '#f0b58b', a: 1 });
      extraOps.push({ op: 'rect', x: rx, y: ry + 1, w: 1, h: 1, c: '#c2815d', a: 1 });
      for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 2; dx++) handPx.add(`${rx + dx},${ry + dy}`);
    }
  }

  // Compute EXACT noclip collisions!
  const bodyNoclips = [];
  const headNoclips = [];
  const pierNoclips = [];
  let handTouchesFish = false;

  for (const k of fishPx) {
    if (anglerHeadPx.has(k)) headNoclips.push(k);
    if (anglerBodyPx.has(k)) bodyNoclips.push(k);
    if (pierPx.has(k)) pierNoclips.push(k);
    if (handPx.has(k)) handTouchesFish = true;
  }
  // Check 1px neighborhood for hand-to-fish touch
  if (!handTouchesFish) {
    for (const hk of handPx) {
      const [x, y] = hk.split(',').map(Number);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (fishPx.has(`${x + dx},${y + dy}`)) handTouchesFish = true;
        }
      }
    }
  }

  return {
    g, rig, angOps, extraOps,
    bodyNoclips, headNoclips, pierNoclips,
    handTouchesFish,
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

// Render multi-species screenshot sheet (action view OR noclip collision heatmap!)
export function renderScreenshotSheet(outPath, speciesList, sampleTs, { heatmap = false, scale = 2 } = {}) {
  const viewX0 = 36; // camera crop: x = 36..156 (120px wide, shows full angler + pier edge + 56px Kraken!)
  const viewY0 = 16; // y = 16..100 (84px tall)
  const VW = 120;
  const VH = 84;
  const CW = VW * scale;
  const CH = VH * scale;
  const W = CW * sampleTs.length;
  const H = CH * speciesList.length;
  const buf = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    buf[i * 3] = 24; buf[i * 3 + 1] = 56; buf[i * 3 + 2] = 96;
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
    for (let dy = 0; dy < scale; dy++) {
      for (let dx = 0; dx < scale; dx++) {
        put(ox + lx * scale + dx, oy + ly * scale + dy, rgb, a);
      }
    }
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

      // Draw water background
      for (let wy = res.g.waterY; wy < viewY0 + VH; wy++) {
        for (let wx = viewX0; wx < viewX0 + VW; wx++) {
          putCell(ox, oy, wx, wy, wy === res.g.waterY ? [56, 130, 186] : [16, 48, 84]);
        }
      }
      // Draw pier pilings & wooden deck planks (exact pierEndX=76, pierY=62..66)
      for (let wy = res.g.pierY + 5; wy < viewY0 + VH; wy++) {
        for (const px of [44, 45, 46, 71, 72, 73]) putCell(ox, oy, px, wy, [74, 44, 24]);
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
            for (let ry = 0; ry < grid.length; ry++) {
              for (let rx = 0; rx < grid[ry].length; rx++) {
                const ch = grid[ry][rx];
                if (ch === '.') continue;
                putCell(ox, oy, Math.round(op.x) + rx, Math.round(op.y) + ry, hexRgb(PALETTE[ch]));
              }
            }
          }
        }
      };

      drawOps(res.angOps);
      drawOps(res.extraOps);

      // Heatmap overlay: MAGENTA = body/head noclip, BRIGHT RED = pier noclip!
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

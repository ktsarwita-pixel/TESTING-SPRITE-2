#!/usr/bin/env node
import { rotSpriteRows } from '../../js/sprites.js';
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
  let minOpaqueY = sprH - 1, maxOpaqueY = 0;
  const frameRows0 = FISH_SPRITES[fishId][0];
  for (let ry = 0; ry < sprH; ry++) {
    for (let rx = 0; rx < sprW; rx++) {
      if (frameRows0[ry][rx] !== '.') {
        if (ry < minOpaqueY) minOpaqueY = ry;
        if (ry > maxOpaqueY) maxOpaqueY = ry;
      }
    }
  }
  const topPad = minOpaqueY;
  const botPad = (sprH - 1) - maxOpaqueY;
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
    catchTime: isCaught ? 0.05 : 0,
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
          w: sprW, h: sprH, topPad, botPad,
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

  // Fill wooden pier interior planks (x: 0..pierEndX, y: pierY+1..pierY+4; row pierY is walkable surface!)
  for (let py = g.pierY + 1; py <= g.pierY + 4; py++) {
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

  // 1. Concave Frothy Ocean Breach Splash Crown
  if (land.breachPlume) {
    const bp = land.breachPlume;
    const p = clamp(bp.progress, 0, 1);
    const bx = Math.round(bp.x), wy = Math.round(bp.y);
    const wf2 = bp.wf ?? 0.35;
    const rise = Math.sin(Math.pow(p, 0.58) * Math.PI);
    const curH = Math.max(2, Math.round(rise * (12 + wf2 * 9)));
    const spread = Math.round(lerp(4, 15 + wf2 * 6, Math.pow(p, 0.68)));
    const fade = clamp(1 - Math.max(0, p - 0.30) / 0.70, 0, 1);
    for (let row = 0; row < curH; row++) {
      const f = row / Math.max(1, curH);
      const hw = Math.max(1, Math.round(1 + Math.pow(1 - f, 1.85) * (5.5 + wf2 * 2.5)));
      extraOps.push({ op: 'rect', x: bx - hw, y: wy - row, w: hw * 2 + 1, h: 1, c: f > 0.55 ? '#e0f2fe' : f > 0.22 ? '#7dd3fc' : '#38bdf8', a: fade * (0.78 - f * 0.32) });
    }
    for (const [side, reach, hMul] of [[-1, 1.0, 1.05], [1, 1.0, 0.95], [-1, 0.62, 1.25], [1, 0.65, 1.18]]) {
      for (let s = 1; s <= 4; s++) {
        const sf = s / 4;
        extraOps.push({ op: 'rect', x: Math.round(bx + side * (2 + sf * spread * reach)), y: Math.round(wy - Math.sin(sf * Math.PI * 0.88) * (curH * hMul) + sf * sf * 2.5), w: s === 1 ? 2 : 1, h: 1, c: s >= 3 ? '#ffffff' : '#bae6fd', a: fade * (0.95 - sf * 0.28) });
      }
    }
    extraOps.push({ op: 'rect', x: bx - spread + 2, y: wy, w: Math.max(4, (spread - 2) * 2), h: 1, c: '#ffffff', a: fade * 0.92 });
  }

  // 2. Sleek Slim 16-Bit Aerodynamic Slipstream Ribbon (matching js/renderer.js 1:1!)
  if (land.windTrail && land.windTrail.length >= 3) {
    for (let i = 0; i < land.windTrail.length - 1; i++) {
      const a = land.windTrail[i], b = land.windTrail[i + 1];
      const uMid = (a.u + b.u) * 0.5;
      const fade = Math.pow(1 - uMid, 1.15);
      if (fade <= 0.06) continue;
      const thick = Math.sin(clamp(uMid, 0.06, 1) * Math.PI * 0.85) * (1 - uMid * 0.72);
      if (thick > 0.25) {
        const off = thick * 2.2;
        extraOps.push({ op: 'line', x0: a.x + a.nx * off, y0: a.y + a.ny * off, x1: b.x + b.nx * off, y1: b.y + b.ny * off, c: '#38bdf8', a: fade * 0.36 });
        extraOps.push({ op: 'line', x0: a.x - a.nx * off, y0: a.y - a.ny * off, x1: b.x - b.nx * off, y1: b.y - b.ny * off, c: '#38bdf8', a: fade * 0.36 });
      }
      if (thick > 0.12) {
        const off2 = thick * 1.05;
        extraOps.push({ op: 'line', x0: a.x + a.nx * off2, y0: a.y + a.ny * off2, x1: b.x + b.nx * off2, y1: b.y + b.ny * off2, c: '#bae6fd', a: fade * 0.58 });
        extraOps.push({ op: 'line', x0: a.x - a.nx * off2, y0: a.y - a.ny * off2, x1: b.x - b.nx * off2, y1: b.y - b.ny * off2, c: '#bae6fd', a: fade * 0.58 });
      }
      extraOps.push({ op: 'line', x0: a.x, y0: a.y, x1: b.x, y1: b.y, c: '#ffffff', a: fade * 0.88 });
    }
    for (const side of [-1, 1]) {
      for (let i = 1; i < Math.min(land.windTrail.length - 3, 7); i++) {
        const a = land.windTrail[i], b = land.windTrail[i + 1];
        extraOps.push({ op: 'line', x0: a.x + a.nx * side * 4.2, y0: a.y + a.ny * side * 4.2, x1: b.x + b.nx * side * 4.2, y1: b.y + b.ny * side * 4.2, c: i <= 2 ? '#ffffff' : '#bae6fd', a: (1 - a.u) * 0.56 });
      }
    }
  }

  // 3. Clean Curved Overhead Hat-Gust Swooshes!
  if (land.hatGust > 0.08) {
    const hgx = Math.round(rig.headX), hgy = Math.round(rig.headY - 6 - (rig.hatPopY || 0));
    for (let i = 0; i < 2; i++) {
      const y0 = hgy - 2 + i * 4;
      extraOps.push({
        op: 'quad',
        x0: hgx + 9 - i * 2, y0: y0 + 1,
        cx: hgx + 1, cy: y0 - 2,
        x1: hgx - 9 - i * 3, y1: y0 + 1,
        c: i === 0 ? '#ffffff' : '#bae6fd',
        a: clamp(land.hatGust * (0.82 - i * 0.22), 0, 0.85),
      });
    }
  }

  // 4. RotSprite Speed Afterimage Ghosts during launch!
  if (land.ghosts) {
    for (let i = land.ghosts.length - 1; i >= 0; i--) {
      const gh = land.ghosts[i];
      const qDeg = Math.round(((gh.angle || 0) * 180) / Math.PI / 2) * 2;
      const rRows = rotSpriteRows(FISH_SPRITES[fishId][0], gh.mode === 'left', (qDeg * Math.PI) / 180);
      const dw = Math.max(1, Math.round(rRows[0].length * (gh.sx || 1)));
      const dh = Math.max(1, Math.round(rRows.length * (gh.sy || 1)));
      extraOps.push({ op: 'rowsImg', rows: rRows, x: Math.round(gh.x - dw / 2), y: Math.round(gh.y - dh / 2), dw, dh, a: gh.alpha, flash: false });
    }
  }

  // 5. Grounded rolling dust wisps behind/beside slammed fish
  if (land.impactFlash && land.impactFlash.shockwave !== false && (land.impactFlash.wf ?? 0.35) >= 0.36) {
    const imp = land.impactFlash;
    const p = clamp(imp.progress, 0, 1);
    const ix = Math.round(imp.x), iy = Math.round(imp.y);
    const wf2 = imp.wf ?? 0.35;
    const hw = Math.max(6, Math.round(imp.halfW || 9));
    const maxR = hw + (imp.big ? (11 + wf2 * 7) : (7 + wf2 * 4));
    const spread = lerp(hw * 0.65, maxR * 0.92, Math.pow(p, 0.60));
    const lift = Math.sin(p * Math.PI * 0.85) * (imp.big ? 2.6 + wf2 * 1.4 : 1.5);
    const pr = Math.max(1, Math.round((imp.big ? 2.5 + wf2 * 1.1 : 1.7) * (0.65 + 0.45 * Math.sin(p * Math.PI * 0.75))));
    for (const side of [-1, 1]) {
      const bx = ix + side * spread, by = iy - lift * 0.4;
      for (const [ox, oy, lr] of [[0,0,pr*0.9],[-pr*0.6,pr*0.2,pr*0.6],[pr*0.6,pr*0.2,pr*0.6],[pr*0.14,-pr*0.38,pr*0.52]]) {
        const cx = Math.round(bx + ox), cy = Math.round(by + oy), rr = Math.max(1, Math.round(lr));
        for (let dy = -rr; dy <= rr; dy++) {
          if (cy + dy > iy) continue;
          const spn = Math.floor(Math.sqrt(Math.max(0, rr * rr - dy * dy)));
          extraOps.push({ op: 'rect', x: cx - spn, y: cy + dy, w: spn * 2 + 1, h: 1, c: dy < -rr * 0.18 ? '#fef9ef' : dy > rr * 0.38 ? '#a68c6e' : '#e2d5c3', a: clamp(1 - p * 0.82, 0.1, 0.86) });
        }
      }
    }
  }

  // 6. Main fish sprite (3x-supersampled RotSprite + smooth effSX turnaround + exact 0px flush grounding!)
  const grid = getFishGrid(fishId, land.mode);
  const imgW = grid[0].length;
  const imgH = grid.length;
  const fAng = land.angle || 0;
  const fsx = land.effSX || land.squashX || 1;
  const fsy = land.squashY || 1;
  let lowestFishOpaqueY = -999;
  let fishMinX = 9999, fishMaxX = -9999;

  if (Math.abs(fAng) > 0.025) {
    const qDeg = Math.round((fAng * 180) / Math.PI / 2) * 2;
    const rRows = rotSpriteRows(FISH_SPRITES[fishId][0], land.mode === 'left', (qDeg * Math.PI) / 180);
    const dw = Math.max(1, Math.round(rRows[0].length * fsx));
    const dh = Math.max(1, Math.round(rRows.length * fsy));
    const ix = Math.round(land.x - dw / 2);
    const iy = Math.round(land.y - dh / 2);
    extraOps.push({ op: 'rowsImg', rows: rRows, x: ix, y: iy, dw, dh, a: 1, flash: !!land.hitFlash });
    for (let ry = 0; ry < dh; ry++) {
      const sy2 = Math.min(rRows.length - 1, Math.floor((ry / dh) * rRows.length));
      for (let rx = 0; rx < dw; rx++) {
        const sx2 = Math.min(rRows[0].length - 1, Math.floor((rx / dw) * rRows[0].length));
        if (rRows[sy2][sx2] === '.') continue;
        const wy = iy + ry, wx = ix + rx;
        if (wy > lowestFishOpaqueY) lowestFishOpaqueY = wy;
        if (wx < fishMinX) fishMinX = wx;
        if (wx > fishMaxX) fishMaxX = wx;
        fishPx.add(`${wx},${wy}`);
      }
    }
  } else {
    const dw = Math.max(1, Math.round(imgW * fsx));
    const dh = Math.max(1, Math.round(imgH * fsy));
    const ix = Math.round(land.x - dw / 2);
    let iy = Math.round(land.y - dh / 2);
    const maxOpaqueIy = g.pierY + 1 + Math.floor((land.activePad || 0) * fsy) - dh;
    if (ix <= g.pierEndX + 1 && iy > maxOpaqueIy) iy = maxOpaqueIy;
    extraOps.push({ op: 'img', id: fishId, mode: land.mode, x: ix, y: iy, dw, dh, a: 1, flash: !!land.hitFlash });
    for (let ry = 0; ry < dh; ry++) {
      const sy2 = Math.min(imgH - 1, Math.floor((ry / dh) * imgH));
      for (let rx = 0; rx < dw; rx++) {
        const sx2 = Math.min(imgW - 1, Math.floor((rx / dw) * imgW));
        if (grid[sy2][sx2] === '.') continue;
        const wy = iy + ry, wx = ix + rx;
        if (wy > lowestFishOpaqueY) lowestFishOpaqueY = wy;
        if (wx < fishMinX) fishMinX = wx;
        if (wx > fishMaxX) fishMaxX = wx;
        fishPx.add(`${wx},${wy}`);
      }
    }
  }

  // 6b. Foreground Punchy Dock Slam Burst (framing OUTSIDE the fish silhouette!)
  if (land.impactFlash && land.impactFlash.shockwave !== false && (land.impactFlash.wf ?? 0.35) >= 0.36) {
    const imp = land.impactFlash;
    const p = clamp(imp.progress, 0, 1);
    const ix = Math.round(imp.x), iy = Math.round(imp.y);
    const wf2 = imp.wf ?? 0.35;
    const hw = Math.max(6, Math.round(imp.halfW || 9));
    const maxR = hw + (imp.big ? (11 + wf2 * 7) : (7 + wf2 * 4));
    if (p < 0.40) {
      const fp = p / 0.40;
      const fw = Math.round(lerp(hw * 1.4, maxR * 1.5, fp));
      extraOps.push({ op: 'rect', x: Math.max(1, ix - Math.floor(fw / 2)), y: iy, w: fw, h: 1, c: fp < 0.35 ? '#ffffff' : '#fde047', a: (1 - fp) * 0.95 });
    }
    if (p < 0.75) {
      const dp = p / 0.75;
      const rx = lerp(hw * 1.04, maxR + 3, Math.pow(dp, 0.58));
      const ry = lerp(Math.max(5, imgH * 0.45), Math.max(9, imgH * 0.65) + wf2 * 5, Math.pow(dp, 0.62));
      for (let i = 0; i <= 18; i++) {
        const a = Math.PI + (i / 18) * Math.PI;
        const px = Math.round(ix + Math.cos(a) * rx), py = Math.round(iy + Math.sin(a) * ry);
        if (py <= iy) extraOps.push({ op: 'rect', x: px, y: py, w: 1, h: 1, c: dp < 0.28 ? '#ffffff' : dp < 0.58 ? '#fde047' : '#7dd3fc', a: (1 - dp) * 0.90 });
      }
    }
    if (imp.big && p < 0.38) {
      const wp = p / 0.38;
      const innerR = hw * 1.02 + wp * 3;
      const outerR = innerR + lerp(5, 10 + wf2 * 3, Math.pow(wp, 0.6));
      for (const [dx2, dy2] of [[-1.0,-0.18],[-0.88,-0.52],[0.88,-0.52],[1.0,-0.18]]) {
        const x1 = ix + Math.round(dx2 * innerR), y1 = iy - 2 + Math.round(dy2 * innerR * 0.62);
        const x2 = ix + Math.round(dx2 * outerR), y2 = iy - 2 + Math.round(dy2 * outerR * 0.78);
        extraOps.push({ op: 'line', x0: x1, y0: y1, x1: x2, y1: y2, c: wp < 0.35 ? '#ffffff' : '#fde047', a: clamp(1 - wp * 0.82, 0.15, 1) });
        if (wp < 0.55) extraOps.push({ op: 'line', x0: x1, y0: y1 - 1, x1: x2, y1: y2, c: '#fb923c', a: clamp(1 - wp * 0.85, 0.12, 0.9) });
      }
    }
  }

  // 7. Crisp Bow-Wave Aerodynamic Crescent right in front of the flying fish!
  if (land.bowWave) {
    const bw = land.bowWave;
    for (let i = 0; i <= 11; i++) {
      const f = (i / 11) * 2 - 1;
      const ang = bw.velAngle + f * 0.88;
      const bx = Math.round(bw.x + Math.cos(ang) * bw.radius * 0.55 - Math.cos(bw.velAngle) * bw.radius * 0.45);
      const by = Math.round(bw.y + Math.sin(ang) * bw.radius * 0.55 - Math.sin(bw.velAngle) * bw.radius * 0.45);
      extraOps.push({ op: 'rect', x: bx, y: by, w: Math.abs(f) < 0.35 ? 2 : 1, h: 1, c: Math.abs(f) < 0.45 ? '#ffffff' : '#bae6fd', a: bw.alpha * (1 - Math.abs(f) * 0.65) });
    }
  }

  // 8. Dizzy stars over stunned fish on back of dock
  if (land.showDizzyStars) {
    const sx0 = land.x + (land.mode === 'right' ? imgW * 0.25 : -imgW * 0.25);
    const sy0 = Math.max(4, Math.round(land.y - imgH * 0.5) - 4);
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

  if (fishMinX > fishMaxX) { fishMinX = Math.round(land.x - imgW / 2); fishMaxX = fishMinX + imgW - 1; }
  const backDockVisible = (t >= 0.56 || isCaught)
    ? (fishMinX >= 0 && fishMaxX < Math.round(rig.backFootX - 1))
    : true;

  return {
    g, rig, land, angOps, extraOps,
    bodyNoclips, headNoclips, pierNoclips,
    backDockVisible, fishMinX, fishMaxX, lowestFishOpaqueY, groundingGap: g.pierY - lowestFishOpaqueY,
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
            const dw = op.dw || grid[0].length;
            const dh = op.dh || grid.length;
            for (let ry = 0; ry < dh; ry++) {
              const sy2 = Math.min(grid.length - 1, Math.floor((ry / dh) * grid.length));
              for (let rx = 0; rx < dw; rx++) {
                const sx2 = Math.min(grid[0].length - 1, Math.floor((rx / dw) * grid[0].length));
                const ch = grid[sy2][sx2];
                if (ch === '.') continue;
                const rgb = op.flash ? [255, 255, 255] : hexRgb(PALETTE[ch]);
                putCell(ox, oy, Math.round(op.x) + rx, Math.round(op.y) + ry, rgb, a);
              }
            }
          } else if (op.op === 'rowsImg') {
            const rRows = op.rows;
            const a = op.a ?? 1;
            const dw = op.dw || rRows[0].length;
            const dh = op.dh || rRows.length;
            for (let ry = 0; ry < dh; ry++) {
              const sy2 = Math.min(rRows.length - 1, Math.floor((ry / dh) * rRows.length));
              for (let rx = 0; rx < dw; rx++) {
                const sx2 = Math.min(rRows[0].length - 1, Math.floor((rx / dw) * rRows[0].length));
                const ch = rRows[sy2][sx2];
                if (ch === '.') continue;
                const rgb = op.flash ? [255, 255, 255] : hexRgb(PALETTE[ch]);
                putCell(ox, oy, Math.round(op.x) + rx, Math.round(op.y) + ry, rgb, a);
              }
            }
          } else if (op.op === 'rotImg') {
            const grid = getFishGrid(op.id, op.mode);
            const a = op.a ?? 1;
            const w = grid[0].length, h = grid.length;
            const sx = op.sx || 1, sy = op.sy || 1;
            const cos = Math.cos(op.angle || 0), sin = Math.sin(op.angle || 0);
            const bw = Math.ceil(Math.abs(w * sx * cos) + Math.abs(h * sy * sin)) + 2;
            const bh = Math.ceil(Math.abs(w * sx * sin) + Math.abs(h * sy * cos)) + 2;
            const x0 = Math.floor(op.cx - bw / 2), y0 = Math.floor(op.cy - bh / 2);
            for (let py = y0; py <= y0 + bh; py++) {
              for (let px = x0; px <= x0 + bw; px++) {
                const dx = px - op.cx, dy = py - op.cy;
                const rx = (dx * cos + dy * sin) / sx + w * 0.5;
                const ry = (-dx * sin + dy * cos) / sy + h * 0.5;
                const rxi = Math.floor(rx), ryi = Math.floor(ry);
                if (rxi < 0 || rxi >= w || ryi < 0 || ryi >= h) continue;
                const ch = grid[ryi][rxi];
                if (ch === '.') continue;
                const rgb = op.flash ? [255, 255, 255] : hexRgb(PALETTE[ch]);
                putCell(ox, oy, px, py, rgb, a);
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

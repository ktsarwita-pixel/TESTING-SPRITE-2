// Handcrafted 16-bit pixel-art angler poses (strictly grounded on bottom row!), props, and compiler.
import { PALETTE } from './palette.js';
import { FISH_SPRITES } from './fishSprites.js';
import { MAP_PROP_SPRITES } from './mapProps.js';

export { PALETTE, FISH_SPRITES };

function normalizeRows(rows) {
  const w = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => r.padEnd(w, '.'));
}

// Every single angler sprite is 20x25 with boot soles STRICTLY on row 24 (bottom row) — zero floating!
import { ANGLER_SPRITES } from './anglerSprites.js';
export { ANGLER_SPRITES };

const BASE_PROP_SPRITES = {
  bobber0: normalizeRows([
    '...k...',
    '...k...',
    '..kck..',
    '.kcrwk.',
    '.kwwwk.',
    '..kWk..',
    '...k...',
  ]),
  bobber1: normalizeRows([
    '....k..',
    '...k...',
    '..kck..',
    '.kcrwk.',
    '.kwwwk.',
    '..kWk..',
    '..k....',
  ]),
  bucket: normalizeRows([
    '...kkkkk...',
    '..k.....k..',
    '.kWkkkkkWk.',
    'kBzzzzzzBBk',
    'kK3333333Kk',
    'kbuBbuBbuBk',
    'kbuBbuBbuBk',
    'kK3333333Kk',
    '.kbuBbuBBk.',
    '.kBBBBBBBk.',
    '..kkkkkkk..',
  ]),
  tacklebox: normalizeRows([
    '....kkkkk....',
    '...k.....k...',
    '..krrrrrrrk..',
    '.krwrrrrrwrr.',
    'krrWrrrrrWrrk',
    'kRRRRRRRRRRRk',
    'krr4rrrrr4rrk',
    'kRRRRRRRRRRRk',
    '.kkkkkkkkkkk.',
  ]),
  bollard: normalizeRows([
    '..kkkk..',
    '.kbuuBk.',
    '.kBbuBk.',
    'khhHHhhk',
    'kHHhhHHk',
    'khhHHhhk',
    '.kBbuBk.',
    '.kBBBBk.',
    'kkkkkkkk',
  ]),
  lanternLit0: normalizeRows([
    '...kkk...',
    '..kKKKk..',
    '.kKeegKk.',
    '.kKgegKk.',
    '.kK4g4Kk.',
    '..kKKKk..',
    '...kkk...',
  ]),
  lanternLit1: normalizeRows([
    '...kkk...',
    '..kKKKk..',
    '.kKgegKk.',
    '.kKeegKk.',
    '.kK44gKk.',
    '..kKKKk..',
    '...kkk...',
  ]),
  lanternLit2: normalizeRows([
    '...kkk...',
    '...kKKKk.',
    '..kKeegKk',
    '..kKgegKk',
    '..kK4g4Kk',
    '...kKKKk.',
    '....kkk..',
  ]),
  lanternDim: normalizeRows([
    '...kkk...',
    '..kKKKk..',
    '.kK2WWKk.',
    '.kK22WKk.',
    '.kK322Kk.',
    '..kKKKk..',
    '...kkk...',
  ]),
  alert0: normalizeRows([
    '.kkkkkkk.',
    'k4eeeee4k',
    'k4eekee4k',
    'k4ekcke4k',
    'k4ekcke4k',
    'k4ekcke4k',
    'k4ekcke4k',
    'k4eekee4k',
    'k4ekcke4k',
    'k4444444k',
    '.kkkkkkk.',
  ]),
  alert1: normalizeRows([
    '.kkkkkkk.',
    'kgggggggk',
    'kggkkkggk',
    'kgkccckgk',
    'kgkccckgk',
    'kgkccckgk',
    'kgkccckgk',
    'kggkkkggk',
    'kgkccckgk',
    'kgggggggk',
    '.kkkkkkk.',
  ]),
  cloud0: normalizeRows([
    '.......wwwwww..........',
    '.....wwwwwwwwww........',
    '...wwwwwwwwwwwwwwwww...',
    '..wwwwwwwwwwwwwwwwwww..',
    '.wwwwwWWWWWWWWWWwwwwww.',
    'wwWWWWWWWWWWWWWWWWWWWWw',
    '.WWWWW22222222222WWWWW.',
  ]),
  cloud1: normalizeRows([
    '.....wwwww.....',
    '...wwwwwwwww...',
    '.wwwwwwwwwwwww.',
    'wwWWWWWWWWWWWWw',
    '.WW222222222WW.',
  ]),
  cloud2: normalizeRows([
    '....wwww......',
    '..wwwwwwwwwww.',
    '.wwwWWWWWWWWWw',
    '..WW2222222WW.',
  ]),
  lighthouse: normalizeRows([
    '......kkk......',
    '.....kKKKk.....',
    '....kKgegKk....',
    '.....kKKKk.....',
    '.....kwwwk.....',
    '....krrrrrk....',
    '....kwwwwwk....',
    '....krkrrrk....',
    '....kwwwwwk....',
    '...krrrrrrrk...',
    '...kwwwkwwwk...',
    '...krrrrrrrk...',
    '..kwwwwwwwwwk..',
    '.kKBBBBBBBBBKk.',
    'kKKKKKKKKKKKKKk',
  ]),
  anchor: normalizeRows([
    '.....kkk.....',
    '....k313k....',
    '.....k3k.....',
    '..kkk313kkk..',
    '.....k3k.....',
    '.....k3k.....',
    'k....k3k....k',
    'kk...k3k...kk',
    'k3k..k3k..k3k',
    '.k3k.k3k.k3k.',
    '..k3k313k3k..',
    '...kk333kk...',
    '.....kkk.....',
  ]),
  chest: normalizeRows([
    '..kkkkkkkkkkkk..',
    '.kBBuBB44BBuBBk.',
    'kbuuuuB44Buuuubk',
    'kBBBBB4ge4BBBBBk',
    'kKKKKKK44KKKKKKk',
    'kbuuuuB44Buuuubk',
    'kBBBBBB44BBBBBBk',
    '.kkkkkkkkkkkkkk.',
  ]),
  coral0: normalizeRows([
    '.k...k....',
    'kck.kck.k.',
    'kfk.kckkck',
    '.kckkfkfk.',
    '..kckkck..',
    '..kCkkCk..',
    '.kCCkkCCk.',
  ]),
  coral1: normalizeRows([
    '..k..k...',
    '.k9kk9k..',
    'k9kk9kk9k',
    '.k9ok9ok.',
    '..ko9ok..',
    '.kOoooOk.',
  ]),
  gull0: normalizeRows([
    'k.......k',
    'kwk...kwk',
    '.kwwkwwk.',
    '...k4k...',
  ]),
  gull1: normalizeRows([
    '.........',
    'kk.....kk',
    '.kwwkwwk.',
    '...k4k...',
  ]),
  gull2: normalizeRows([
    '.........',
    '...kkk...',
    '.kwwkwwk.',
    'kwk.4.kwk',
  ]),
  perchedGull0: normalizeRows([
    '..kkk...',
    '.kwwk4..',
    '.kwwwk..',
    'kWWwwWk.',
    'kKKWWWk.',
    '.kkkkk..',
    '..4.4...',
  ]),
  perchedGull1: normalizeRows([
    '...kkk..',
    '..kwwk4.',
    '.kwwwk..',
    'kWWwwWk.',
    'kKKWWWk.',
    '.kkkkk..',
    '..4.4...',
  ]),
};

export const PROP_SPRITES = { ...BASE_PROP_SPRITES, ...MAP_PROP_SPRITES };

function makeCanvasFromRows(rows, options = {}) {
  const { flipX = false, rotateHang = false, rotateMode = null, silhouetteColor = null } = options;
  const mode = rotateMode || (rotateHang ? 'ccw' : null);
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const c = document.createElement('canvas');
  c.width = (mode === 'ccw' || mode === 'cw') ? h : w;
  c.height = (mode === 'ccw' || mode === 'cw') ? w : h;
  const ctx = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const color = PALETTE[ch];
      if (!color) continue;
      ctx.fillStyle = silhouetteColor || color;
      if (mode === 'ccw') {
        // Exact lossless 90° CCW pixel transpose: MOUTH (x=w-1) at TOP (dy=0)
        ctx.fillRect(y, w - 1 - x, 1, 1);
      } else if (mode === 'cw') {
        // Exact lossless 90° CW pixel transpose: MOUTH (x=w-1) at BOTTOM
        ctx.fillRect(h - 1 - y, x, 1, 1);
      } else if (mode === '180') {
        // Exact lossless 180° upside-down tumble frame
        ctx.fillRect(w - 1 - x, h - 1 - y, 1, 1);
      } else {
        const dx = flipX ? w - 1 - x : x;
        ctx.fillRect(dx, y, 1, 1);
      }
    }
  }
  return c;
}

export function buildSpriteCache() {
  const cache = {
    angler: {},
    fish: {},
    props: {},
  };

  for (const [name, spec] of Object.entries(ANGLER_SPRITES)) {
    cache.angler[name] = {
      canvas: makeCanvasFromRows(spec.rows),
      hand: spec.hand,
      w: spec.rows[0].length,
      h: spec.rows[0].length ? spec.rows.length : 0,
    };
  }

  for (const [id, frames] of Object.entries(FISH_SPRITES)) {
    const h = frames[0].length;
    const w = Math.max(...frames[0].map((r) => r.length));
    const topPads = [];
    const botPads = [];
    for (const rows of frames) {
      let minY = h - 1, maxY = 0;
      for (let y = 0; y < rows.length; y++) {
        for (let x = 0; x < rows[y].length; x++) {
          if (PALETTE[rows[y][x]]) {
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      topPads.push(minY);
      botPads.push((h - 1) - maxY);
    }
    cache.fish[id] = {
      right: frames.map((rows) => makeCanvasFromRows(rows, { flipX: false })),
      left: frames.map((rows) => makeCanvasFromRows(rows, { flipX: true })),
      hang: frames.map((rows) => makeCanvasFromRows(rows, { rotateMode: 'ccw' })),
      hangCW: frames.map((rows) => makeCanvasFromRows(rows, { rotateMode: 'cw' })),
      flip: frames.map((rows) => makeCanvasFromRows(rows, { rotateMode: '180' })),
      silRight: frames.map((rows) => makeCanvasFromRows(rows, { flipX: false, silhouetteColor: '#0e243d' })),
      silLeft: frames.map((rows) => makeCanvasFromRows(rows, { flipX: true, silhouetteColor: '#0e243d' })),
      flashRight: frames.map((rows) => makeCanvasFromRows(rows, { flipX: false, silhouetteColor: '#ffffff' })),
      flashLeft: frames.map((rows) => makeCanvasFromRows(rows, { flipX: true, silhouetteColor: '#ffffff' })),
      logSil: makeCanvasFromRows(frames[0], { flipX: false, silhouetteColor: '#1e293b' }),
      w,
      h,
      topPad: topPads[0],
      botPad: botPads[0],
      topPads,
      botPads,
    };
  }

  for (const [name, rows] of Object.entries(PROP_SPRITES)) {
    cache.props[name] = makeCanvasFromRows(rows);
  }

  return cache;
}

export function spriteToDataURL(canvas, scale = 4) {
  const out = document.createElement('canvas');
  out.width = canvas.width * scale;
  out.height = canvas.height * scale;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out.toDataURL();
}

// 3x-Supersampled Outline-Preserving RotSprite pixel rotator!
// Keeps 1px dark outlines unbroken, preserves eyes, zero blurry AA mud, zero jagged tearing!
const _rotCache = new Map();

function isDarkOutlineRgb(r, g, b) {
  return (r * 0.299 + g * 0.587 + b * 0.114) < 58;
}

export function rotSpriteRows(rows, flipX, angleRad, palette = PALETTE) {
  const h = rows.length;
  const w = rows[0].length;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const outW = Math.ceil(Math.abs(w * cos) + Math.abs(h * sin)) + 2;
  const outH = Math.ceil(Math.abs(w * sin) + Math.abs(h * cos)) + 2;
  const hcx = (outW - 1) * 0.5;
  const hcy = (outH - 1) * 0.5;
  const scx = (w - 1) * 0.5;
  const scy = (h - 1) * 0.5;

  const outRows = [];
  const subOffsets = [-0.28, 0, 0.28];

  for (let py = 0; py < outH; py++) {
    let line = '';
    const dy0 = py - hcy;
    for (let px = 0; px < outW; px++) {
      const dx0 = px - hcx;
      // 3x3 subpixel supersampling inside destination pixel for silky smooth edges & solid 1px outlines!
      let hits = 0;
      let outlineHits = 0;
      let outlineChar = null;
      let centerChar = '.';
      const counts = Object.create(null);

      for (let sy = 0; sy < 3; sy++) {
        const dy = dy0 + subOffsets[sy];
        for (let sx = 0; sx < 3; sx++) {
          const dx = dx0 + subOffsets[sx];
          const rx = dx * cos + dy * sin + scx;
          const ry = -dx * sin + dy * cos + scy;
          const ix = Math.round(rx);
          const iy = Math.round(ry);
          if (ix < 0 || ix >= w || iy < 0 || iy >= h) continue;
          const srcX = flipX ? (w - 1 - ix) : ix;
          const ch = rows[iy][srcX];
          if (!ch || ch === '.' || !palette[ch]) continue;
          hits++;
          counts[ch] = (counts[ch] || 0) + 1;
          if (sx === 1 && sy === 1) centerChar = ch;
          const hex = palette[ch];
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          if (isDarkOutlineRgb(r, g, b)) {
            outlineHits++;
            outlineChar = ch;
          }
        }
      }

      if (hits >= 4 || (outlineHits >= 2 && hits >= 3)) {
        if (centerChar !== '.' && counts[centerChar] >= 4) {
          line += centerChar;
        } else if (outlineHits >= 3 && outlineChar && hits < 7) {
          // Preserve crisp 1px dark perimeter outline during rotation!
          line += outlineChar;
        } else {
          // Majority-vote palette color (100% pure crisp pixel-art palette!)
          let bestCh = centerChar !== '.' ? centerChar : '.';
          let bestN = 0;
          for (const k in counts) {
            if (counts[k] > bestN) {
              bestN = counts[k];
              bestCh = k;
            }
          }
          line += bestCh;
        }
      } else {
        line += '.';
      }
    }
    outRows.push(line);
  }
  return outRows;
}

export function getRotSpriteCanvas(fishId, mode, frameIdx, angleRad, flashWhite = false) {
  const frames = FISH_SPRITES[fishId];
  if (!frames) return null;
  const fIdx = ((frameIdx % frames.length) + frames.length) % frames.length;
  // Quantize to smooth 2-degree steps for instant O(1) cache hits & zero shimmer!
  const qDeg = Math.round((angleRad * 180) / Math.PI / 2) * 2;
  const flipX = mode === 'left';
  const key = `${fishId}:${flipX ? 'L' : 'R'}:${fIdx}:${qDeg}:${flashWhite ? 'W' : 'C'}`;
  let cached = _rotCache.get(key);
  if (cached) return cached;

  const qRad = (qDeg * Math.PI) / 180;
  const rows = rotSpriteRows(frames[fIdx], flipX, qRad);
  const canvas = makeCanvasFromRows(rows, flashWhite ? { silhouetteColor: '#ffffff' } : {});
  if (_rotCache.size > 600) {
    // Keep memory tiny & bounded
    const firstKey = _rotCache.keys().next().value;
    _rotCache.delete(firstKey);
  }
  _rotCache.set(key, canvas);
  return canvas;
}

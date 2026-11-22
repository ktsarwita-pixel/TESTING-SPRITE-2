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
  const { flipX = false, rotateHang = false, silhouetteColor = null } = options;
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const c = document.createElement('canvas');
  c.width = rotateHang ? h : w;
  c.height = rotateHang ? w : h;
  const ctx = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const color = PALETTE[ch];
      if (!color) continue;
      ctx.fillStyle = silhouetteColor || color;
      if (rotateHang) {
        // Exact lossless 90° CCW pixel transpose: MOUTH (x=w-1) at TOP (dy=0), slim dorsal LEFT (dx=y), belly RIGHT, TAIL DOWN!
        const dx = y;
        const dy = w - 1 - x;
        ctx.fillRect(dx, dy, 1, 1);
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
      h: spec.rows.length,
    };
  }

  for (const [id, frames] of Object.entries(FISH_SPRITES)) {
    cache.fish[id] = {
      right: frames.map((rows) => makeCanvasFromRows(rows, { flipX: false })),
      left: frames.map((rows) => makeCanvasFromRows(rows, { flipX: true })),
      hang: frames.map((rows) => makeCanvasFromRows(rows, { rotateHang: true })),
      silRight: frames.map((rows) => makeCanvasFromRows(rows, { flipX: false, silhouetteColor: '#0e243d' })),
      silLeft: frames.map((rows) => makeCanvasFromRows(rows, { flipX: true, silhouetteColor: '#0e243d' })),
      logSil: makeCanvasFromRows(frames[0], { flipX: false, silhouetteColor: '#1e293b' }),
      w: Math.max(...frames[0].map((r) => r.length)),
      h: frames[0].length,
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

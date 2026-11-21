// Handcrafted 2D pixel-art sprite matrices compiled to crisp offscreen canvases.

export const PALETTE = {
  '.': null,
  // Outlines & darks
  'k': '#141824',
  'K': '#23293d',
  // Hat & wood
  'h': '#f6d57a',
  'H': '#d6a449',
  'b': '#9c6633',
  'B': '#6b4222',
  // Skin
  's': '#f4c29f',
  'S': '#d4946e',
  // Angler clothes
  'r': '#d94848',
  'R': '#9e2b33',
  't': '#3d998d',
  'T': '#256b69',
  'w': '#f5f7fa',
  'W': '#cbd5e1',
  'p': '#354f7a',
  'P': '#223354',
  // Fish colors
  '1': '#e2f1ff', // light silver
  '2': '#94b8d7', // mid silver-blue
  '3': '#527396', // dark silver-blue
  '4': '#facc15', // bright yellow / gold
  '5': '#ca8a04', // deep gold
  '6': '#84cc16', // lime-olive
  '7': '#4d7c0f', // dark olive
  '8': '#2f4f1c', // forest stripe
  '9': '#fb923c', // bright orange
  'o': '#ea580c', // deep orange
  'c': '#ef4444', // crimson red
  'C': '#991b1b', // dark crimson
  'f': '#fda4af', // pink / rosy
  'u': '#38bdf8', // bright cyan-blue
  'U': '#1d4ed8', // royal blue
  'n': '#1e3a8a', // navy blue
  'N': '#0f172a', // deep midnight
  'v': '#7e22ce', // deep purple
  'V': '#4c1d95', // dark violet
  'g': '#fde047', // glow yellow
  'e': '#fef08a', // pale cream glow
  'm': '#d6b98c', // sand tan
  'M': '#a17f4e', // dark tan
  'a': '#a7f3d0', // pearl mint
  'A': '#5eead4', // pearl teal
};

export const ANGLER_SPRITES = {
  idle0: {
    hand: [12, 12],
    rows: [
      '.....kkkkk......',
      '....khhhhhk.....',
      '...khhHHHhhk....',
      '..krrrrrrrrrk...',
      '.kHHHHHHHHHHHk..',
      '....ksssssk.....',
      '....ksssksk.....',
      '....ksssssk.....',
      '...kTTtttTTk....',
      '...kTtwtwtTk....',
      '...kTTtttTTk....',
      '...kTTtttTTkk...',
      '....kTtttTsk....',
      '....kBBBBBk.....',
      '....kpppppK.....',
      '....kpP.Ppk.....',
      '....kpP.Ppk.....',
      '....kpp.ppk.....',
      '....kbb.bbk.....',
      '...kBBk.kBBk....',
      '...kkk...kkk....',
    ],
  },
  idle1: {
    hand: [12, 13],
    rows: [
      '................',
      '.....kkkkk......',
      '....khhhhhk.....',
      '...khhHHHhhk....',
      '..krrrrrrrrrk...',
      '.kHHHHHHHHHHHk..',
      '....ksssssk.....',
      '....ksssksk.....',
      '....ksssssk.....',
      '...kTTtttTTk....',
      '...kTtwtwtTk....',
      '...kTTtttTTk....',
      '...kTTtttTTkk...',
      '....kTtttTsk....',
      '....kBBBBBk.....',
      '....kpppppK.....',
      '....kpP.Ppk.....',
      '....kpp.ppk.....',
      '....kbb.bbk.....',
      '...kBBk.kBBk....',
      '...kkk...kkk....',
    ],
  },
  windup: {
    hand: [3, 9],
    rows: [
      '....kkkkk.......',
      '...khhhhhk......',
      '..khhHHHhhk.....',
      '.krrrrrrrrrk....',
      'kHHHHHHHHHHHk...',
      '...ksssssk......',
      '...ksssksk......',
      '...ksssssk......',
      '..kkTTtttTk.....',
      '.kskTtwtwTk.....',
      '..kTTtttTTk.....',
      '...kTTtttTk.....',
      '...kTtttTTk.....',
      '....kBBBBBk.....',
      '....kpppppk.....',
      '...kppP.Ppk.....',
      '...kpp..ppk.....',
      '...kbb..bbk.....',
      '..kBBk..kBBk....',
      '..kkk....kkk....',
      '................',
    ],
  },
  cast: {
    hand: [15, 10],
    rows: [
      '......kkkkk.....',
      '.....khhhhhk....',
      '....khhHHHhhk...',
      '...krrrrrrrrrk..',
      '..kHHHHHHHHHHHk.',
      '.....ksssssk....',
      '.....ksssksk....',
      '.....ksssssk....',
      '....kTTtttTTk...',
      '....kTtwtwtTkkk.',
      '....kTTtttTTtssk',
      '....kTTtttTTkkk.',
      '....kTtttTTk....',
      '....kBBBBBk.....',
      '....kpppppk.....',
      '...kppP..Ppk....',
      '...kpp...ppk....',
      '...kbb...bbk....',
      '..kBBk...kBBk...',
      '..kkk.....kkk...',
      '................',
    ],
  },
  reel0: {
    hand: [13, 11],
    rows: [
      '....kkkkk.......',
      '...khhhhhk......',
      '..khhHHHhhk.....',
      '.krrrrrrrrrk....',
      'kHHHHHHHHHHHk...',
      '...ksssssk......',
      '...ksssksk......',
      '...ksssssk......',
      '..kTTtttTTk.....',
      '..kTtwtwtTTk....',
      '..kTTtttTTssk...',
      '...kTTtttTkk....',
      '...kTtttTTk.....',
      '...kBBBBBk......',
      '...kpppppk......',
      '...kpP..Ppk.....',
      '..kpp...ppk.....',
      '..kbb...bbk.....',
      '.kBBk...kBBk....',
      '.kkk.....kkk....',
      '................',
    ],
  },
  reel1: {
    hand: [12, 10],
    rows: [
      '...kkkkk........',
      '..khhhhhk.......',
      '.khhHHHhhk......',
      'krrrrrrrrrk.....',
      'kHHHHHHHHHHk....',
      '..ksssssk.......',
      '..ksssksk.......',
      '..ksssssk.......',
      '.kTTtttTTk......',
      '.kTtwtwtTTkk....',
      '..kTTtttTTsk....',
      '..kTTtttTTk.....',
      '...kTtttTk......',
      '...kBBBBBk......',
      '...kpppppk......',
      '..kppP..Ppk.....',
      '..kpp...ppk.....',
      '..kbb...bbk.....',
      '.kBBk...kBBk....',
      '.kkk.....kkk....',
      '................',
    ],
  },
  celebrate: {
    hand: [13, 6],
    rows: [
      '.....kkkkk......',
      '....khhhhhk.....',
      '...khhHHHhhk....',
      '..krrrrrrrrrk...',
      '.kHHHHHHHHHHHk..',
      '....ksssssk..kk.',
      '..kkksssksk.ksk.',
      '.kskksssssk.ktk.',
      '..ktkTTtttTkTk..',
      '...kTtwtwtTTk...',
      '...kTTtttTTk....',
      '....kTtttTk.....',
      '....kBBBBBk.....',
      '....kpppppk.....',
      '....kpP.Ppk.....',
      '....kpP.Ppk.....',
      '....kpp.ppk.....',
      '....kbb.bbk.....',
      '...kBBk.kBBk....',
      '...kkk...kkk....',
      '................',
    ],
  },
};

// All fish face RIGHT by default; tail wags between frame 0 and frame 1.
export const FISH_SPRITES = {
  minnow: [
    [
      '....kkkk...',
      'k..k2221k..',
      'kk.k111wk..',
      'k2kk11111k.',
      'kk.k1111k..',
      'k....kkk...',
    ],
    [
      '....kkkk...',
      '..kk2221k..',
      '.kkk111wk..',
      'k2kk11111k.',
      '.kkk1111k..',
      '.....kkk...',
    ],
  ],
  perch: [
    [
      '.....kkkkk....',
      'k...k76867k...',
      'kk.k6484866k..',
      'k9kk44844kwk..',
      'k9k444844444k.',
      'kk.k4944944k..',
      'k...k99499k...',
      '.....kkkkk....',
    ],
    [
      '.....kkkkk....',
      '.k..k76867k...',
      'kk.k6484866k..',
      'k9kk44844kwk..',
      'k9kk44844444k.',
      '.k.k4944944k..',
      '....k99499k...',
      '.....kkkkk....',
    ],
  ],
  bass: [
    [
      '......kkkkkk.....',
      'k....k777767k....',
      'kk..k76666666k...',
      'k7kk8888888kwk...',
      'k7k66688866666k..',
      'k7kk111111111k...',
      'kk..k1112211k....',
      'k....kkkkkkk.....',
    ],
    [
      '......kkkkkk.....',
      '.k...k777767k....',
      'kk..k76666666k...',
      'k7kk8888888kwk...',
      'k7kk6688866666k..',
      '.kkk111111111k...',
      '....k1112211k....',
      '.....kkkkkkk.....',
    ],
  ],
  clownfish: [
    [
      '....kkkkk....',
      'k..k99k99k...',
      'kk.k9wk9wk...',
      'k9kk9wk9wk9k.',
      'k9k99wk9wk9k.',
      'kk.k9wk999k..',
      'k...k9k99k...',
      '.....kkkk....',
    ],
    [
      '....kkkkk....',
      '.k.k99k99k...',
      'kk.k9wk9wk...',
      'k9kk9wk9wk9k.',
      'k9kk9wk9wk9k.',
      '.k.k9wk999k..',
      '....k9k99k...',
      '.....kkkk....',
    ],
  ],
  bluetang: [
    [
      '.....kkkkkk....',
      'k...kUUUUUUk...',
      '4k.kUUkkkkUUk..',
      '44kkUUkUUUkwk..',
      '44kUUUUUUUuuuk.',
      '4k.kUUUuuUUUk..',
      'k...kUUUUUUk...',
      '.....kkkkkk....',
    ],
    [
      '.....kkkkkk....',
      '.k..kUUUUUUk...',
      '4k.kUUkkkkUUk..',
      '44kkUUkUUUkwk..',
      '44kkUUUUUUuuuk.',
      '.k.kUUUuuUUUk..',
      '....kUUUUUUk...',
      '.....kkkkkk....',
    ],
  ],
  puffer: [
    [
      '....k..k..k...',
      '...kmmmmmmk...',
      '..kmMmmmmMmk..',
      'k.kmmmmmmkwk..',
      'kkkmMmmmmmmmk.',
      'k.kmmm1111mmk.',
      '..k11111111k..',
      '...k111111k...',
      '....k.k..k....',
    ],
    [
      '....k..k..k...',
      '...kmmmmmmk...',
      '..kmMmmmmMmk..',
      '.kkmmmmmmkwk..',
      'kkkmMmmmmmmmk.',
      '.kkmmm1111mmk.',
      '..k11111111k..',
      '...k111111k...',
      '....k.k..k....',
    ],
  ],
  trout: [
    [
      '......kkkkkkk.....',
      'k....k3232322k....',
      'kk..k221212221k...',
      'k2kkffffffffkwk...',
      'k2k111ffffff111k..',
      'k2kk1111111111k...',
      'kk..k22111122k....',
      'k....kkkkkkkk.....',
    ],
    [
      '......kkkkkkk.....',
      '.k...k3232322k....',
      'kk..k221212221k...',
      'k2kkffffffffkwk...',
      'k2kk11ffffff111k..',
      '.kkk1111111111k...',
      '....k22111122k....',
      '.....kkkkkkkk.....',
    ],
  ],
  snapper: [
    [
      '.....kkkkkkk.....',
      'k...kCCCCccck....',
      'ck.kCCccccccck...',
      'cckkccccccckwk...',
      'cckccccffccccck..',
      'cckkcffffffcck...',
      'ck..kfffffffk....',
      'k....kkkkkkk.....',
    ],
    [
      '.....kkkkkkk.....',
      '.k..kCCCCccck....',
      'ck.kCCccccccck...',
      'cckkccccccckwk...',
      'cckkcccffccccck..',
      '.kkkcffffffcck...',
      '....kfffffffk....',
      '.....kkkkkkk.....',
    ],
  ],
  angler: [
    [
      '.............kkk...',
      '............k..gk..',
      '.....kkkkkkk...ggk.',
      'k...kVVVVVVVk..gk..',
      'vk.kVVvvvvvVVk.....',
      'vvkkVvvvVVvkwk.....',
      'vvkVVvvvvVVVVVk....',
      'vvkkVVVVvvVkwk.....',
      'vk..kVVVVVwwwwk....',
      'k....kkkkkkkkk.....',
    ],
    [
      '.............kkk...',
      '............k..egk.',
      '.....kkkkkkk...ggk.',
      '.k..kVVVVVVVk..eg..',
      'vk.kVVvvvvvVVk.....',
      'vvkkVvvvVVvkwk.....',
      'vvkkVvvvvVVVVVk....',
      '.kkkVVVVvvVkwk.....',
      '....kVVVVVwwwwk....',
      '.....kkkkkkkkk.....',
    ],
  ],
  tuna: [
    [
      '........k4k4k.........',
      'k.....kNNNNNNnk.......',
      'nk...kNNnnnnnnnk......',
      'nnk.kNnnUUUUUUnnk.....',
      'nnkkNnuuuuuuuuuwk.....',
      'nnk11111111111111k....',
      'nnkk111112221111k.....',
      'nk..k2211111122k......',
      'k....k4k4kkkkkk.......',
    ],
    [
      '........k4k4k.........',
      '.k....kNNNNNNnk.......',
      'nk...kNNnnnnnnnk......',
      'nnk.kNnnUUUUUUnnk.....',
      'nnkkNnuuuuuuuuuwk.....',
      'nnkk1111111111111k....',
      '.kkk111112221111k.....',
      '....k2211111122k......',
      '.....k4k4kkkkkk.......',
    ],
  ],
  oarfish: [
    [
      '..................kckck...',
      '....kcccccccccccckccck....',
      'k..kAAAAAAAAAAAAAAccck....',
      'kkk111a111a111a111kwk.....',
      'kAkk11111111111111111k....',
      'kkk.kAAAAAAAAAAAAAAck.....',
      'k....kkkkkkkkkkkkkk.......',
    ],
    [
      '.................kckck....',
      '....kcccccccccccckccck....',
      '..kkAAAAAAAAAAAAAAccck....',
      '.kkk111a111a111a11kwk.....',
      'kAkk11111111111111111k....',
      '.kkkAAAAAAAAAAAAAAAck.....',
      '.....kkkkkkkkkkkkkk.......',
    ],
  ],
  goldenkoi: [
    [
      '......kkkkkkk.......',
      'k....k444ooc44k.....',
      '4k..k4444ooc444k....',
      '4ek.k44w44444kwk....',
      '44kk44ww444oo444k...',
      '44k44444444oo4444k..',
      '4ek.k55444444455k...',
      '4k...k555444555k....',
      'k.....kkkkkkkkk.....',
    ],
    [
      '......kkkkkkk.......',
      '.k...k444ooc44k.....',
      '4k..k4444ooc444k....',
      '4ek.k44w44444kwk....',
      '44kk44ww444oo444k...',
      '44kk4444444oo4444k..',
      '.k..k55444444455k...',
      '.....k555444555k....',
      '......kkkkkkkkk.....',
    ],
  ],
};

export const PROP_SPRITES = {
  bobber: [
    '..k..',
    '.kck.',
    'kccwk',
    'kwwwk',
    '.kWk.',
    '..k..',
  ],
  bucket: [
    '..kkkkk..',
    '.k.....k.',
    'kBBBBBBBk',
    'kbHbbbHbk',
    'kbHbbbHbk',
    'kBBBBBBBk',
    '.kbHbbbk.',
    '.kBBBBBk.',
    '..kkkkk..',
  ],
  tacklebox: [
    '...kkkkk...',
    '..k.....k..',
    '.krrrrrrrk.',
    'krrWrrrWrrk',
    'kRRRRRRRRRk',
    'krrrrrrrrrk',
    '.kkkkkkkkk.',
  ],
  lanternLit: [
    '..kkk..',
    '.kKKKk.',
    'kKgegKk',
    'kKgggKk',
    'kK4g4Kk',
    '.kKKKk.',
    '..kkk..',
  ],
  lanternDim: [
    '..kkk..',
    '.kKKKk.',
    'kKWWWKk',
    'kK2W2Kk',
    'kK222Kk',
    '.kKKKk.',
    '..kkk..',
  ],
  alert: [
    '.kkkkk.',
    'k44444k',
    'k4kkk4k',
    'k4kck4k',
    'k4kck4k',
    'k4kck4k',
    'k4kkk4k',
    'k44444k',
    'k4kck4k',
    'k44444k',
    '.kkkkk.',
  ],
  coin: [
    '.kkkkk.',
    'k44444k',
    'k4e544k',
    'k4e544k',
    'k45544k',
    'k55555k',
    '.kkkkk.',
  ],
  cloud0: [
    '......wwwww.......',
    '....wwwwwwwww.....',
    '..wwwwwwwwwwwww...',
    '.wwwwwwwwwwwwwww..',
    'wwWWWWWWWWWWWWWww.',
    '.WWWWWWWWWWWWWWW..',
  ],
  cloud1: [
    '....wwww....',
    '..wwwwwwww..',
    '.wwwwwwwwww.',
    'wWWWWWWWWWWw',
  ],
  lighthouse: [
    '....kkk....',
    '...k4g4k...',
    '...kwwwk...',
    '...krrrk...',
    '...kwwwk...',
    '..krrrrrk..',
    '..kwwwwwk..',
    '..krrrrrk..',
    '..kwwwwwk..',
    '.kBBBBBBBk.',
    'kBBBBBBBBBk',
  ],
  anchor: [
    '....kkk....',
    '....k3k....',
    '..kk333kk..',
    '....k3k....',
    '....k3k....',
    'k...k3k...k',
    'kk..k3k..kk',
    '.k3k333k3k.',
    '..kk333kk..',
    '....kkk....',
  ],
  chest: [
    '..kkkkkkkkkk..',
    '.kBBBB44BBBBk.',
    'kbbbbb44bbbbbk',
    'kBBBB4444BBBBk',
    'kbbbbb44bbbbbk',
    'kBBBBBBBBBBBBk',
    '.kkkkkkkkkkkk.',
  ],
};

function makeCanvasFromRows(rows, options = {}) {
  const { flipX = false, silhouetteColor = null } = options;
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const color = PALETTE[ch];
      if (!color) continue;
      ctx.fillStyle = silhouetteColor || color;
      const dx = flipX ? w - 1 - x : x;
      ctx.fillRect(dx, y, 1, 1);
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

// Render a crisp scaled data URL for UI modals (Catch card, Fish Log).
export function spriteToDataURL(canvas, scale = 4) {
  const out = document.createElement('canvas');
  out.width = canvas.width * scale;
  out.height = canvas.height * scale;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out.toDataURL();
}

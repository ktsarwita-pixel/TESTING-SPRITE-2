// Crisp 16-bit 2D pixel-art side-POV renderer supporting 4 distinct fishing maps & rich animations.
import { getMapById } from './maps.js';
import { renderArticulatedAngler } from './anglerRenderer.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

function lerpColor(hexA, hexB, t) {
  const a = parseInt(hexA.slice(1), 16);
  const b = parseInt(hexB.slice(1), 16);
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return `rgb(${Math.round(lerp(ar, br, t))},${Math.round(lerp(ag, bg, t))},${Math.round(lerp(ab, bb, t))})`;
}

export function drawPixelLine(ctx, x0, y0, x1, y1, color) {
  x0 = Math.round(x0); y0 = Math.round(y0);
  x1 = Math.round(x1); y1 = Math.round(y1);
  ctx.fillStyle = color;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let guard = 0;
  while (guard++ < 1200) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}

export function drawPixelQuad(ctx, x0, y0, cx, cy, x1, y1, color, steps = 16) {
  let px = x0, py = y0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const nx = mt * mt * x0 + 2 * mt * t * cx + t * t * x1;
    const ny = mt * mt * y0 + 2 * mt * t * cy + t * t * y1;
    drawPixelLine(ctx, px, py, nx, ny, color);
    px = nx;
    py = ny;
  }
}

export function sampleSkyPalette(timeOfDay, map) {
  const keys = (map && map.skyKeys) || getMapById('harbor').skyKeys;
  const t = ((timeOfDay % 1) + 1) % 1;
  let a = keys[0], b = keys[1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (t >= keys[i].t && t <= keys[i + 1].t) {
      a = keys[i];
      b = keys[i + 1];
      break;
    }
  }
  const span = Math.max(0.0001, b.t - a.t);
  const f = (t - a.t) / span;
  return {
    sky: a.sky.map((c, i) => lerpColor(c, b.sky[i], f)),
    water: a.water.map((c, i) => lerpColor(c, b.water[i], f)),
    night: lerp(a.night, b.night, f),
  };
}

function getCelestialState(g) {
  const skyH = g.waterY;
  const sunAngle = (g.timeOfDay - 0.18) * Math.PI * 2;
  const oceanMidX = g.pierEndX + (g.vw - g.pierEndX) * 0.52;
  const orbitR = (g.vw - g.pierEndX) * 0.34;
  const sunX = Math.round(oceanMidX + Math.cos(sunAngle - Math.PI) * orbitR);
  const sunY = Math.round(skyH - 8 - Math.sin(sunAngle) * (skyH * 0.70));
  const sunVisible = sunY < skyH + 4 && Math.sin(sunAngle) > -0.1;

  const moonAngle = sunAngle + Math.PI;
  const moonX = Math.round(oceanMidX + Math.cos(moonAngle - Math.PI) * orbitR);
  const moonY = Math.round(skyH - 8 - Math.sin(moonAngle) * (skyH * 0.70));
  const moonVisible = moonY < skyH + 4 && Math.sin(moonAngle) > -0.1;

  return { sunX, sunY, sunVisible, moonX, moonY, moonVisible };
}

export function renderGameWorld(g, ctx) {
  ctx.imageSmoothingEnabled = false;
  ctx.save();

  if (g.shakeTime > 0) {
    ctx.translate(Math.round(rand(-g.shakeMag, g.shakeMag)), Math.round(rand(-g.shakeMag, g.shakeMag)));
  }

  const map = g.getCurrentMap ? g.getCurrentMap() : getMapById('harbor');
  const pal = sampleSkyPalette(g.timeOfDay, map);
  const cel = getCelestialState(g);

  renderSky(g, ctx, map, pal, cel);
  renderHorizon(g, ctx, map, pal);
  renderUnderwaterBg(g, ctx, map, pal);
  renderPierBack(g, ctx, map, pal);
  renderFishes(g, ctx, pal);
  renderLineAndHook(g, ctx);
  renderWaterSurface(g, ctx, map, pal, cel);
  renderPierFront(g, ctx, map, pal);
  renderAnglerAndRod(g, ctx);
  renderLandingFishForeground(g, ctx);
  renderEffects(g, ctx, map, pal);
  renderInWorldMeters(g, ctx);

  ctx.restore();
}

function renderSky(g, ctx, map, pal, cel) {
  const skyH = g.waterY;
  const bandH = Math.ceil(skyH / 4);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = pal.sky[i];
    ctx.fillRect(0, i * bandH, g.vw, bandH + 1);
    if (i > 0) {
      for (let x = i % 2; x < g.vw; x += 2) {
        ctx.fillRect(x, i * bandH - 1, 1, 1);
      }
    }
  }

  // Shimmering Aurora Borealis curtains in Frost Fjord
  if (map.id === 'fjord' && pal.night > 0.2) {
    ctx.save();
    for (let x = 0; x < g.vw; x += 3) {
      const wave = Math.sin(x * 0.045 + g.time * 0.9) * 7 + Math.cos(x * 0.09 - g.time * 0.6) * 4;
      const topY = Math.round(8 + wave);
      const colH = Math.round(14 + Math.sin(x * 0.07 + g.time * 1.4) * 5);
      ctx.globalAlpha = pal.night * 0.24;
      ctx.fillStyle = '#34d399';
      ctx.fillRect(x, topY, 2, colH);
      ctx.globalAlpha = pal.night * 0.16;
      ctx.fillStyle = '#a78bfa';
      ctx.fillRect(x, topY - 4, 2, 6);
    }
    ctx.restore();
  }

  // Twinkling stars
  if (pal.night > 0.15) {
    for (const s of g.stars) {
      const twinkle = 0.5 + 0.5 * Math.sin(g.time * 3.1 + s.phase);
      if (twinkle * pal.night < 0.25) continue;
      ctx.fillStyle = s.bright ? '#fef9c3' : '#cbd5e1';
      ctx.globalAlpha = clamp(twinkle * pal.night, 0, 1);
      const sx = Math.round(s.x * g.vw);
      const sy = Math.round(s.y * (skyH - 14));
      ctx.fillRect(sx, sy, 1, 1);
      if (s.bright && twinkle > 0.85) {
        ctx.globalAlpha *= 0.45;
        ctx.fillRect(sx - 1, sy, 3, 1);
        ctx.fillRect(sx, sy - 1, 1, 3);
      }
    }
    ctx.globalAlpha = 1;
  }

  // Pixel sun (tinted crimson-amber in Ember Caldera)
  if (cel.sunVisible) {
    const isVolc = map.id === 'abyss';
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = isVolc ? '#fb923c' : '#fef08a';
    ctx.fillRect(cel.sunX - 6, cel.sunY - 5, 13, 11);
    ctx.fillRect(cel.sunX - 5, cel.sunY - 6, 11, 13);
    ctx.restore();
    ctx.fillStyle = isVolc ? '#f97316' : '#facc15';
    ctx.fillRect(cel.sunX - 4, cel.sunY - 3, 9, 7);
    ctx.fillRect(cel.sunX - 3, cel.sunY - 4, 7, 9);
    ctx.fillStyle = isVolc ? '#fdba74' : '#fef08a';
    ctx.fillRect(cel.sunX - 3, cel.sunY - 2, 7, 5);
    ctx.fillStyle = '#fef9c3';
    ctx.fillRect(cel.sunX - 2, cel.sunY - 2, 4, 4);
  }

  // Crisp crescent moon matching sky band
  if (cel.moonVisible && pal.night > 0.1) {
    const moonBand = clamp(Math.floor(cel.moonY / Math.max(1, bandH)), 0, 3);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(cel.moonX - 3, cel.moonY - 2, 6, 5);
    ctx.fillRect(cel.moonX - 2, cel.moonY - 3, 4, 7);
    ctx.fillStyle = pal.sky[moonBand];
    ctx.fillRect(cel.moonX, cel.moonY - 2, 3, 4);
  }

  // Drifting pixel clouds
  ctx.globalAlpha = map.id === 'abyss' ? 0.42 : pal.night > 0.6 ? 0.32 : 0.92;
  for (const c of g.clouds) {
    const spr = g.sprites.props[c.sprite] || g.sprites.props.cloud0;
    ctx.drawImage(spr, Math.round(c.x), Math.round(c.y));
  }
  ctx.globalAlpha = 1;

  // 3-frame gliding seagulls (Harbor & Lagoon daytime)
  if ((map.id === 'harbor' || map.id === 'lagoon') && pal.night < 0.58) {
    const gullFrames = ['gull0', 'gull1', 'gull2', 'gull1'];
    for (const b of g.birds) {
      const fIdx = Math.floor(g.time * 6 + b.phase) % 4;
      const bob = Math.round(Math.sin(g.time * 6 + b.phase) * 1.2);
      ctx.drawImage(g.sprites.props[gullFrames[fIdx]], Math.round(b.x), Math.round(b.y + bob));
    }
  }
}

function renderHorizon(g, ctx, map, pal) {
  const wy = g.waterY;

  if (map.id === 'fjord') {
    // Jagged snow-capped fjord peaks
    for (let x = 0; x < g.vw; x += 2) {
      const peak = Math.max(4, Math.round(14 + Math.sin(x * 0.04) * 9 + Math.abs(Math.cos(x * 0.09)) * 6));
      ctx.fillStyle = lerpColor('#527499', '#1c2c4a', pal.night);
      ctx.fillRect(x, wy - peak, 2, peak);
      if (peak > 15) {
        ctx.fillStyle = lerpColor('#e2f1ff', '#7b99bd', pal.night);
        ctx.fillRect(x, wy - peak, 2, Math.min(5, peak - 13));
      }
    }
    const berg = g.sprites.props.iceberg;
    const bx = g.vw - (g.isPortrait ? 42 : 74);
    ctx.drawImage(berg, bx, wy - berg.height + 2);
    return;
  }

  if (map.id === 'sanctuary') {
    // Misty distant Atlantean monolith ridges
    ctx.fillStyle = lerpColor('#3c5580', '#1a1d47', pal.night);
    for (let x = 0; x < g.vw; x += 2) {
      const mh = Math.max(3, Math.round(9 + Math.sin(x * 0.032 + 0.8) * 5 + Math.cos(x * 0.08) * 2));
      ctx.fillRect(x, wy - mh, 2, mh);
    }
    const arch = g.sprites.props.sunkenArch;
    const ax = g.vw - (g.isPortrait ? 44 : 78);
    const ay = wy - arch.height + 2;
    // Soft aqua/rose shimmer around the floating temple crystal
    ctx.save();
    ctx.globalAlpha = 0.22 + 0.12 * Math.sin(g.time * 3.8);
    ctx.fillStyle = '#5eead4';
    ctx.fillRect(ax + 11, ay + 6, 6, 5);
    ctx.fillStyle = '#f9a8d4';
    ctx.fillRect(ax + 11, ay, 5, 4);
    ctx.restore();
    ctx.drawImage(arch, ax, ay);
    return;
  }

  if (map.id === 'abyss') {
    // Jagged dark volcanic caldera rim
    ctx.fillStyle = '#241421';
    for (let x = 0; x < g.vw; x += 2) {
      const mh = Math.max(3, Math.round(10 + Math.sin(x * 0.045 + 1.2) * 6 + Math.cos(x * 0.11) * 3));
      ctx.fillRect(x, wy - mh, 2, mh);
    }
    const volc = g.sprites.props.volcano;
    const vx = g.vw - (g.isPortrait ? 46 : 82);
    const vy = wy - volc.height + 2;
    // Lava glow behind crater
    ctx.save();
    ctx.globalAlpha = 0.25 + 0.12 * Math.sin(g.time * 4.5);
    ctx.fillStyle = '#f97316';
    ctx.fillRect(vx + 10, vy - 2, 12, 8);
    ctx.restore();
    ctx.drawImage(volc, vx, vy);
    return;
  }

  if (map.id === 'lagoon') {
    // Soft turquoise tropical atoll hills
    ctx.fillStyle = lerpColor('#4ca8b5', '#1b3d54', pal.night);
    for (let x = 0; x < g.vw; x += 2) {
      const mh = Math.max(2, Math.round(7 + Math.sin(x * 0.028 + 1.5) * 4 + Math.cos(x * 0.065) * 2));
      ctx.fillRect(x, wy - mh, 2, mh);
    }
    const atoll = g.sprites.props.atollIsle;
    const ax = g.vw - (g.isPortrait ? 38 : 68);
    ctx.drawImage(atoll, ax, wy - atoll.height + 2);
    return;
  }

  // Harbor (default): coastal mountains + pine-topped lighthouse island
  ctx.fillStyle = lerpColor('#5d84a6', '#212e52', pal.night);
  for (let x = 0; x < g.vw; x += 2) {
    const mh = Math.max(2, Math.round(9 + Math.sin(x * 0.025 + 1.9) * 6 + Math.cos(x * 0.06) * 3));
    ctx.fillRect(x, wy - mh, 2, mh);
  }
  ctx.fillStyle = lerpColor('#3f6587', '#16213d', pal.night);
  for (let x = 0; x < g.vw; x += 2) {
    const mh = Math.max(2, Math.round(5 + Math.sin(x * 0.036 + 0.5) * 4 + Math.cos(x * 0.085) * 2));
    ctx.fillRect(x, wy - mh, 2, mh);
  }

  const isleX = g.vw - (g.isPortrait ? 38 : 64);
  ctx.fillStyle = lerpColor('#2d4d63', '#111b30', pal.night);
  ctx.fillRect(isleX - 11, wy - 3, 36, 3);
  ctx.fillRect(isleX - 7, wy - 5, 28, 2);
  ctx.fillRect(isleX - 3, wy - 6, 20, 1);
  ctx.fillStyle = lerpColor('#225447', '#0f2926', pal.night);
  ctx.fillRect(isleX - 5, wy - 9, 3, 4);
  ctx.fillRect(isleX - 4, wy - 11, 1, 2);
  ctx.fillRect(isleX + 16, wy - 8, 3, 3);
  ctx.fillRect(isleX + 17, wy - 10, 1, 2);

  const lh = g.sprites.props.lighthouse;
  const lhY = wy - 5 - lh.height;
  ctx.drawImage(lh, isleX, lhY);

  const beaconPulse = 0.5 + 0.5 * Math.sin(g.time * 3.2);
  if (pal.night > 0.2) {
    ctx.save();
    ctx.globalAlpha = pal.night * (0.35 + 0.35 * beaconPulse);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(isleX + 5, lhY + 1, 5, 4);
    ctx.restore();
    const sweep = Math.sin(g.time * 1.35);
    if (sweep > -0.25) {
      ctx.save();
      ctx.globalAlpha = pal.night * 0.24 * (sweep + 0.25);
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.moveTo(isleX + 7, lhY + 3);
      ctx.lineTo(isleX - 48, lhY - 9);
      ctx.lineTo(isleX - 48, lhY + 13);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}

function lerpRgbStr(rgbA, rgbB, t) {
  const ma = rgbA.match(/\d+/g).map(Number);
  const mb = rgbB.match(/\d+/g).map(Number);
  return `rgb(${Math.round(lerp(ma[0], mb[0], t))},${Math.round(lerp(ma[1], mb[1], t))},${Math.round(lerp(ma[2], mb[2], t))})`;
}

function renderUnderwaterBg(g, ctx, map, pal) {
  const wy = g.waterY;
  const h = Math.max(12, g.vh - wy);

  // 6-band richly dithered underwater depth gradient (smooth 16-bit cross-section!)
  const bands = [
    pal.water[0],
    lerpRgbStr(pal.water[0], pal.water[1], 0.45),
    pal.water[1],
    lerpRgbStr(pal.water[1], pal.water[2], 0.48),
    pal.water[2],
    lerpRgbStr(pal.water[2], 'rgb(6,13,28)', 0.42),
  ];
  const bandH = Math.ceil(h / bands.length);
  for (let i = 0; i < bands.length; i++) {
    const by = wy + i * bandH;
    ctx.fillStyle = bands[i];
    ctx.fillRect(0, by, g.vw, bandH + 1);
    // 2-row 16-bit checkerboard Bayer dither across each depth seam
    if (i > 0) {
      const shift = Math.floor(Math.sin(g.time * 0.8 + i) * 2);
      for (let x = 0; x < g.vw; x += 2) {
        ctx.fillRect(x + ((i + shift) & 1), by - 1, 1, 1);
      }
      for (let x = 0; x < g.vw; x += 4) {
        ctx.fillRect(x + ((i + 1) & 1), by - 2, 1, 1);
      }
    }
  }

  // Animated underwater caustics web near surface & shimmering sunbeams
  if (pal.night < 0.78) {
    const dayStrength = 1 - pal.night;
    const beamColor = map.id === 'abyss' ? '#fdba74' : map.id === 'sanctuary' ? '#a7f3d0' : map.id === 'lagoon' ? '#a7f3d0' : '#bae6fd';
    ctx.save();
    ctx.fillStyle = beamColor;
    // Diagonal shimmering light shafts
    for (let i = 0; i < 5; i++) {
      const rx = Math.round(g.pierEndX + 10 + i * ((g.vw - g.pierEndX) / 4.6) + Math.sin(g.time * 0.7 + i * 1.4) * 8);
      const rayH = Math.round(h * 0.78);
      const pulse = 0.75 + 0.25 * Math.sin(g.time * 1.8 + i * 2.1);
      ctx.globalAlpha = dayStrength * (map.id === 'lagoon' ? 0.13 : 0.085) * pulse;
      for (let dy = 2; dy < rayH; dy += 2) {
        const shift = Math.round(dy * 0.24);
        const w = Math.max(2, Math.round(10 - dy * 0.032));
        ctx.fillRect(rx + shift, wy + dy, w, 2);
      }
    }
    // Shallow subsurface caustic shimmer lines right beneath the wave crest
    ctx.globalAlpha = dayStrength * (map.id === 'lagoon' ? 0.24 : 0.16);
    for (let x = 2; x < g.vw - 2; x += 6) {
      const cw = 2 + Math.round(Math.sin(x * 0.14 + g.time * 3.1) * 1.5);
      const cy = wy + 5 + Math.round(Math.cos(x * 0.11 - g.time * 2.4) * 2.5);
      if (cw > 1) ctx.fillRect(x, cy, cw, 1);
      const cy2 = wy + 12 + Math.round(Math.sin(x * 0.08 + g.time * 1.9) * 3);
      if (cw > 2) ctx.fillRect(x + 2, cy2, cw - 1, 1);
    }
    ctx.restore();
  }

  // Gently drifting translucent marine snow / plankton motes
  ctx.save();
  ctx.fillStyle = map.id === 'abyss' ? '#fca5a5' : map.id === 'sanctuary' ? '#f9a8d4' : '#e0f7ff';
  for (let i = 0; i < 16; i++) {
    const mx = Math.round(((i * 37 + g.time * (2.2 + (i % 3) * 0.9)) % (g.vw - 8)) + 4);
    const my = Math.round(wy + 10 + ((i * 23) % Math.max(18, h - 24)) + Math.sin(g.time * 1.5 + i) * 3);
    ctx.globalAlpha = 0.12 + 0.14 * (0.5 + 0.5 * Math.sin(g.time * 2.4 + i * 1.7));
    ctx.fillRect(mx, my, 1, 1);
  }
  ctx.restore();

  // Biome-specific background seabed landmarks
  const leftSpotX = Math.round(g.pierEndX + (g.vw - g.pierEndX) * 0.28);
  const rightSpotX = Math.round(g.pierEndX + (g.vw - g.pierEndX) * 0.74);
  if (map.id === 'lagoon') {
    const clam = g.sprites.props.giantClam;
    ctx.drawImage(clam, leftSpotX, g.getSeabedY(leftSpotX + 6) - clam.height + 2);
    if (g.vw > 210) {
      const chest = g.sprites.props.chest;
      ctx.drawImage(chest, rightSpotX, g.getSeabedY(rightSpotX + 6) - chest.height + 2);
    }
  } else if (map.id === 'fjord') {
    const crys = g.sprites.props.iceCrystal;

    ctx.drawImage(crys, leftSpotX, g.getSeabedY(leftSpotX + 4) - crys.height + 1);
    if (g.vw > 210) {
      ctx.globalAlpha = 0.65;
      ctx.drawImage(g.sprites.props.anchor, rightSpotX, g.getSeabedY(rightSpotX) - 12);
      ctx.globalAlpha = 1;
    }
  } else if (map.id === 'sanctuary') {
    const pil = g.sprites.props.sunkenPillar;
    const pc = g.sprites.props.prismCrystal;
    ctx.drawImage(pil, leftSpotX, g.getSeabedY(leftSpotX + 4) - pil.height + 2);
    if (g.vw > 210) {
      ctx.drawImage(pc, rightSpotX, g.getSeabedY(rightSpotX + 5) - pc.height + 2);
    }
  } else if (map.id === 'abyss') {
    const vent = g.sprites.props.hydroVent;
    for (const vx of g.vw > 210 ? [leftSpotX, rightSpotX] : [leftSpotX]) {
      const vy = g.getSeabedY(vx + 6) - vent.height + 2;
      ctx.save();
      ctx.globalAlpha = 0.24 + 0.14 * Math.sin(g.time * 5 + vx);
      ctx.fillStyle = '#f97316';
      ctx.fillRect(vx + 2, vy - 5, 10, 10);
      ctx.restore();
      ctx.drawImage(vent, vx, vy);
    }
  } else {
    ctx.globalAlpha = 0.68;
    ctx.drawImage(g.sprites.props.anchor, leftSpotX, g.getSeabedY(leftSpotX) - 12);
    if (g.vw > 210) {
      ctx.drawImage(g.sprites.props.chest, rightSpotX, g.getSeabedY(rightSpotX) - 7);
    }
    ctx.globalAlpha = 1;
  }

  // Multi-tone animated swaying kelp
  const kc = map.kelpColors;
  for (const k of g.kelp) {
    const base = g.getSeabedY(k.x);
    for (let seg = 0; seg < k.height; seg++) {
      const sway = Math.round(Math.sin(g.time * 2.4 + k.phase + seg * 0.34) * (seg / 5.5));
      ctx.fillStyle = seg > k.height - 4 ? kc[2] : (k.idx % 2 === 0 ? kc[0] : kc[1]);
      ctx.fillRect(k.x + sway, base - seg, 2, 1);
    }
  }

  // Biome-specific seabed flora & small fauna (corals, sea fans, crystals, starfish, shells)
  if (g.corals) {
    for (let i = 0; i < g.corals.length; i++) {
      const c = g.corals[i];
      let sprName = c.sprite;
      if (map.id === 'lagoon') sprName = i === 1 ? 'coralFan' : c.sprite;
      else if (map.id === 'fjord') sprName = 'iceCrystal';
      else if (map.id === 'abyss') sprName = i === 1 ? 'coralFan' : 'coral1';
      else if (map.id === 'sanctuary') sprName = i % 2 === 0 ? 'prismCrystal' : 'sunkenPillar';
      const spr = g.sprites.props[sprName];
      ctx.drawImage(spr, c.x, g.getSeabedY(c.x + 4) - spr.height + 1);
    }
  }

  // Layered pixel seabed sand/rock
  const sc = map.seabedColors;
  for (let x = 0; x < g.vw; x++) {
    const sy = g.getSeabedY(x);
    ctx.fillStyle = sc[0];
    ctx.fillRect(x, sy, 1, 1);
    ctx.fillStyle = sc[1];
    ctx.fillRect(x, sy + 1, 1, 2);
    ctx.fillStyle = sc[2];
    ctx.fillRect(x, sy + 3, 1, 4);
    ctx.fillStyle = sc[3];
    ctx.fillRect(x, sy + 7, 1, g.vh - (sy + 7));
  }
  for (const p of g.pebbles) {
    if (p.x >= g.vw) continue;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, g.getSeabedY(p.x) + p.dy, p.w, 1);
  }
  // Soft sunlit caustic glints dancing along the seabed ridge
  if (pal.night < 0.65) {
    ctx.save();
    ctx.globalAlpha = (1 - pal.night) * 0.24;
    ctx.fillStyle = map.id === 'abyss' ? '#fb923c' : '#e0f7ff';
    for (let x = g.pierEndX + 4; x < g.vw - 4; x += 11) {
      const cx = x + Math.round(Math.sin(g.time * 1.7 + x * 0.08) * 3);
      if (cx > 0 && cx < g.vw - 3) ctx.fillRect(cx, g.getSeabedY(cx), 3, 1);
    }
    ctx.restore();
  }

  // Cute seabed starfish & shell accents in Harbor & Lagoon
  if (map.id === 'harbor' || map.id === 'lagoon') {
    const s1 = Math.round(g.pierEndX + (g.vw - g.pierEndX) * 0.42);
    ctx.drawImage(g.sprites.props.starfish, s1, g.getSeabedY(s1) - 3);
    const s2 = Math.round(g.pierEndX + (g.vw - g.pierEndX) * 0.64);
    ctx.drawImage(g.sprites.props.shell, s2, g.getSeabedY(s2) - 3);
  }

  // Rising air / hydrothermal bubbles
  for (const b of g.bubbles) {
    const bx = Math.round(b.x);
    const by = Math.round(b.y);
    ctx.fillStyle = b.hot ? '#fb923c' : '#7dd3fc';
    ctx.fillRect(bx, by, 2, 2);
    ctx.fillStyle = b.hot ? '#fef08a' : '#eef7ff';
    ctx.fillRect(bx, by, 1, 1);
  }
}

function renderPierBack(g, ctx, map, pal) {
  const pilings = [];
  for (let px = 8; px <= g.pierEndX - 8; px += 22) pilings.push(px);
  if (pilings[pilings.length - 1] < g.pierEndX - 10) pilings.push(g.pierEndX - 8);

  const isBasalt = map.dockStyle === 'basalt';
  const isBamboo = map.dockStyle === 'bamboo';
  const isFrost = map.dockStyle === 'frost';
  const isMarble = map.dockStyle === 'marble';

  // Diagonal cross-braces
  const braceDark = isMarble ? '#3a4663' : isBasalt ? '#1f1d29' : isBamboo ? '#5c431f' : '#472a14';
  const braceMid = isMarble ? '#6f82a8' : isBasalt ? '#373445' : isBamboo ? '#8a6933' : '#5e381c';
  for (let i = 0; i < pilings.length - 1; i++) {
    drawPixelLine(ctx, pilings[i] + 4, g.pierY + 4, pilings[i + 1], g.waterY - 2, braceDark);
    drawPixelLine(ctx, pilings[i] + 4, g.pierY + 5, pilings[i + 1], g.waterY - 1, braceMid);
  }

  for (const px of pilings) {
    const bottom = g.getSeabedY(px) + 2;
    ctx.fillStyle = isMarble ? '#435070' : isBasalt ? '#1b1924' : isBamboo ? '#6b4e22' : '#472914';
    ctx.fillRect(px, g.pierY + 3, 6, g.waterY - g.pierY - 3);
    ctx.fillStyle = isMarble ? '#a9bed9' : isBasalt ? '#383447' : isBamboo ? '#a88342' : '#7d4e29';
    ctx.fillRect(px + 1, g.pierY + 3, 3, g.waterY - g.pierY - 3);
    ctx.fillStyle = isMarble ? '#e8f3ff' : isBasalt ? '#524d66' : isBamboo ? '#cfa65d' : '#9c6638';
    ctx.fillRect(px + 1, g.pierY + 3, 1, g.waterY - g.pierY - 3);
    ctx.fillStyle = '#140c08';
    ctx.fillRect(px, g.pierY + 4, 6, 2);

    ctx.fillStyle = '#232c38';
    ctx.fillRect(px, g.waterY, 6, bottom - g.waterY);
    ctx.fillStyle = '#334252';
    ctx.fillRect(px + 1, g.waterY, 3, bottom - g.waterY);
    ctx.fillStyle = isMarble ? '#2dd4bf' : isFrost ? '#7dd3fc' : isBasalt ? '#7a3366' : '#2a6f56';
    ctx.fillRect(px, g.waterY + 1, 6, 4);
  }

  // Biome-specific pier background structures & lighting!
  const postX = Math.max(8, g.pierEndX - 42);
  if (map.id === 'lagoon') {
    // Lush curving coconut palm behind dock + animated tiki torch!
    const palm = g.sprites.props.palmTree;
    ctx.drawImage(palm, Math.max(0, postX - 10), g.pierY - palm.height + 1);
    const torch = g.sprites.props[Math.floor(g.time * 7) % 2 === 0 ? 'tikiTorch0' : 'tikiTorch1'];
    const tx = Math.max(12, g.pierEndX - 36);
    const ty = g.pierY - torch.height + 1;
    ctx.save();
    ctx.globalAlpha = 0.22 + 0.08 * Math.sin(g.time * 8);
    ctx.fillStyle = '#fb923c';
    ctx.fillRect(tx - 4, ty - 3, 16, 12);
    ctx.restore();
    ctx.drawImage(torch, tx, ty);
  } else if (map.id === 'fjord') {
    // Snow-laden spruce tree + frosty hanging pier lantern
    if (g.pierEndX >= 60) {
      const pine = g.sprites.props.pineTree;
      ctx.drawImage(pine, 2, g.pierY - pine.height + 1);
    }
    renderLanternPost(g, ctx, Math.max(16, g.pierEndX - 38), pal, '#7dd3fc');
  } else if (map.id === 'sanctuary') {
    // Glowing Atlantean crystal shrine obelisk on the marble pier
    const ob = g.sprites.props[Math.floor(g.time * 2.5) % 2 === 0 ? 'runeObelisk0' : 'runeObelisk1'];
    const ox = Math.max(10, g.pierEndX - 42);
    const oy = g.pierY - ob.height + 1;
    ctx.drawImage(ob, ox, oy);
    // Subtle 1px orbiting crystal starlight motes (no rectangular glow box!)
    ctx.fillStyle = Math.floor(g.time * 4) % 2 === 0 ? '#5eead4' : '#f9a8d4';
    ctx.fillRect(ox + 5 + Math.round(Math.cos(g.time * 3.2) * 4), oy + 1 + Math.round(Math.sin(g.time * 3.2) * 2), 1, 1);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(ox + 5 + Math.round(Math.cos(g.time * 3.2 + 3.1) * 4), oy + 1 + Math.round(Math.sin(g.time * 3.2 + 3.1) * 2), 1, 1);
  } else if (map.id === 'abyss') {
    // Roaring iron fire brazier post
    const braz = g.sprites.props[Math.floor(g.time * 8) % 2 === 0 ? 'brazier0' : 'brazier1'];
    const bx = Math.max(10, g.pierEndX - 40);
    const by = g.pierY - braz.height + 1;
    ctx.save();
    const fp = 0.18 + 0.06 * Math.sin(g.time * 9);
    ctx.globalAlpha = fp * 0.55;
    ctx.fillStyle = '#f97316';
    ctx.fillRect(bx - 5, by - 2, 21, 10);
    ctx.fillRect(bx - 3, by - 4, 17, 14);
    ctx.globalAlpha = fp;
    ctx.fillStyle = '#fde047';
    ctx.fillRect(bx - 1, by - 1, 13, 8);
    ctx.restore();
    ctx.drawImage(braz, bx, by);
  } else {
    renderLanternPost(g, ctx, postX, pal, '#facc15');
  }
}

function renderLanternPost(g, ctx, postX, pal, glowColor) {
  const postTop = g.pierY - 27;
  ctx.fillStyle = '#381f0f';
  ctx.fillRect(postX, postTop, 3, 27);
  ctx.fillStyle = '#6e4222';
  ctx.fillRect(postX + 1, postTop, 1, 27);
  ctx.fillStyle = '#381f0f';
  ctx.fillRect(postX, postTop, 11, 2);
  ctx.fillStyle = '#6e4222';
  ctx.fillRect(postX + 1, postTop, 9, 1);
  drawPixelLine(ctx, postX + 2, postTop + 6, postX + 6, postTop + 2, '#4a2b16');

  const isLit = pal.night > 0.22;
  const swayIdx = Math.floor(g.time * 2.4) % 4;
  const litFrames = ['lanternLit0', 'lanternLit1', 'lanternLit2', 'lanternLit1'];
  const lx = postX + 6;
  const ly = postTop + 2;

  if (isLit) {
    ctx.save();
    const pulse = 0.22 + 0.06 * Math.sin(g.time * 5.2);
    ctx.globalAlpha = pal.night * pulse;
    ctx.fillStyle = glowColor;
    ctx.fillRect(lx - 4, ly - 3, 17, 14);
    ctx.globalAlpha = pal.night * pulse * 0.45;
    ctx.fillRect(lx - 10, ly - 8, 29, 24);
    ctx.restore();
  }
  ctx.drawImage(g.sprites.props[isLit ? litFrames[swayIdx] : 'lanternDim'], lx, ly);
}

function renderPierFront(g, ctx, map, pal) {
  const isBasalt = map.dockStyle === 'basalt';
  const isBamboo = map.dockStyle === 'bamboo';
  const isFrost = map.dockStyle === 'frost';
  const isMarble = map.dockStyle === 'marble';

  ctx.fillStyle = isMarble ? '#26304d' : isBasalt ? '#11101a' : '#29160a';
  ctx.fillRect(0, g.pierY - 1, g.pierEndX + 3, 6);
  ctx.fillStyle = isMarble ? '#eef7ff' : isFrost ? '#eef7ff' : isBasalt ? '#5b5570' : isBamboo ? '#d9b36c' : '#b87a42';
  ctx.fillRect(0, g.pierY, g.pierEndX + 2, 1);
  ctx.fillStyle = isMarble ? '#b4c9e4' : isFrost ? '#cbd5e1' : isBasalt ? '#3c384d' : isBamboo ? '#b58e4a' : '#945d2e';
  ctx.fillRect(0, g.pierY + 1, g.pierEndX + 2, 2);
  ctx.fillStyle = isMarble ? '#6f84ab' : isBasalt ? '#252233' : isBamboo ? '#7d5c29' : '#633a1b';
  ctx.fillRect(0, g.pierY + 3, g.pierEndX + 2, 2);

  for (let x = 6; x < g.pierEndX + 1; x += 8) {
    ctx.fillStyle = isBasalt ? '#171521' : '#331c0d';
    ctx.fillRect(x, g.pierY, 1, 5);
    ctx.fillStyle = isMarble ? '#facc15' : isBamboo ? '#f5cf6b' : '#475569';
    ctx.fillRect(x - 2, g.pierY + 1, 1, 1);
  }

  // Hanging pixel icicles beneath Frost Fjord pier
  if (isFrost) {
    ctx.fillStyle = '#bae6fd';
    for (let x = 5; x < g.pierEndX; x += 9) {
      const len = 2 + (x % 3);
      ctx.fillRect(x, g.pierY + 5, 2, 1);
      ctx.fillRect(x, g.pierY + 6, 1, len);
    }
  }

  // Harbor mooring bollard + perched seagull
  if (map.id === 'harbor' && g.pierEndX >= 68) {
    const bol = g.sprites.props.bollard;
    const bx = 4;
    const by = g.pierY - bol.height + 1;
    ctx.fillStyle = '#331c0d';
    ctx.fillRect(bx, g.pierY, bol.width, 1);
    ctx.drawImage(bol, bx, by);
    if (pal.night < 0.65) {
      const gullSpr = g.sprites.props[Math.floor(g.time * 1.1) % 5 === 0 ? 'perchedGull1' : 'perchedGull0'];
      ctx.drawImage(gullSpr, bx + 1, by - gullSpr.height + 1);
    }
  }

  // Wooden bait bucket grounded cleanly on pierY
  const bucket = g.sprites.props.bucket;
  const bucketX = (map.id === 'harbor' || map.id === 'fjord') && g.pierEndX >= 68 ? Math.max(18, g.pierEndX - 55) : 3;
  ctx.fillStyle = '#1f140d';
  ctx.fillRect(bucketX + 1, g.pierY, bucket.width - 2, 1);
  ctx.drawImage(bucket, bucketX, g.pierY - bucket.height + 1);

  // Red tackle box grounded cleanly on pierY
  const box = g.sprites.props.tacklebox;
  const boxX = Math.max(15, g.pierEndX - 34);
  ctx.fillStyle = '#1f140d';
  ctx.fillRect(boxX + 1, g.pierY, box.width - 2, 1);
  ctx.drawImage(box, boxX, g.pierY - box.height + 1);
}

function renderFishes(g, ctx, pal) {
  for (const f of g.fishes) {
    // During LANDING, the lifted fish is drawn in the foreground pass above water & pier (zero z-pop!)
    if (g.state === 'LANDING' && f === g.activeFish) continue;
    const sprSet = g.sprites.fish[f.species.id];
    const animSpeed =
      f.ai === 'HOOKED' && g.fishThrashing ? 18 :
      f.ai === 'FLEE' ? 14 :
      f.ai === 'APPROACH' ? 10 :
      6.4;
    const frameCount = sprSet.right.length;
    const frame = Math.floor(g.time * animSpeed + f.phase * 2) % frameCount;
    const img = f.dir >= 0 ? sprSet.right[frame] : sprSet.left[frame];
    const dx = Math.round(f.x - sprSet.w / 2);
    const dy = Math.round(f.y - sprSet.h / 2);

    const depthRatio = clamp((f.y - g.waterY) / Math.max(1, g.vh - g.waterY), 0, 1);
    ctx.save();
    if (f.ai !== 'HOOKED' && g.state !== 'LANDING') {
      ctx.globalAlpha = clamp(0.97 - depthRatio * 0.20 - pal.night * 0.10, 0.62, 0.98);
    }

    ctx.drawImage(img, dx, dy);

    // Subtle organic 1px bioluminescent / mythic starlight sparks trailing special species (no rectangular box!)
    if (f.species.id === 'leviathan' || f.species.id === 'magmaeel' || f.species.id === 'krakentitan' || f.species.id === 'celestialcarp') {
      const isMyth = f.species.id === 'krakentitan';
      const count = isMyth ? 4 : 2;
      ctx.save();
      for (let s = 0; s < count; s++) {
        const t = g.time * 4.5 + f.phase + s * 2.1;
        const alpha = 0.4 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = isMyth
          ? (s % 3 === 0 ? '#f9a8d4' : s % 3 === 1 ? '#fde047' : '#5eead4')
          : f.species.id === 'celestialcarp' ? '#fde047'
          : f.species.id === 'leviathan' ? '#7dd3fc' : '#fde047';
        const sx = Math.round(f.x - f.dir * (8 + s * 5) + Math.sin(t) * 2.5);
        const sy = Math.round(f.y + Math.cos(t * 1.4 + s) * (isMyth ? 6 : 3));
        ctx.fillRect(sx, sy, 1, 1);
      }
      ctx.restore();
    }

    if (f.species.id === 'angler') {
      const glow = 0.35 + 0.28 * Math.sin(g.time * 6 + f.phase);
      ctx.globalAlpha = glow;
      ctx.fillStyle = '#fef08a';
      const lx = f.dir >= 0 ? dx + sprSet.w - 6 : dx + 2;
      ctx.fillRect(lx, dy + 1, 4, 4);
    }

    if (f.ai === 'HOOKED' && g.state === 'REELING') {
      const rx = Math.round(f.x);
      const ry = Math.round(f.y);
      if (g.fishFightState === 'WARNING') {
        // Clear amber telegraph flash before thrash!
        const pulse = Math.floor(g.time * 16) % 2 === 0;
        ctx.globalAlpha = pulse ? 0.92 : 0.45;
        ctx.fillStyle = '#facc15';
        ctx.fillRect(rx - 1, dy - 7, 2, 4);
        ctx.fillRect(rx - 1, dy - 2, 2, 1);
      } else if (g.fishThrashing) {
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#f87171';
        const r = 9 + (Math.floor(g.time * 22) % 5);
        ctx.fillRect(rx - r, ry - 2, 2, 3);
        ctx.fillRect(rx + r - 1, ry - 2, 2, 3);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(rx - r + 2, ry - 5, 2, 1);
        ctx.fillRect(rx + r - 3, ry + 4, 2, 1);
      }
    } else if ((f.ai === 'CURIOUS' || f.ai === 'NIBBLE') && g.state === 'WAITING') {
      // Subtle curiosity cue as fish inspects / nibbles the lure
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = f.ai === 'NIBBLE' ? '#fef08a' : '#bae6fd';
      const cx = Math.round(f.x + f.dir * (sprSet.w * 0.35));
      ctx.fillRect(cx, dy - 4, 1, 2);
      ctx.fillRect(cx, dy - 1, 1, 1);
    }
    ctx.restore();
  }
}

// Foreground pass for the lifted fish during LANDING so it glides cleanly above the water & pier straight into the angler's hand (0px jump, 0 z-pop!)
function renderLandingFishForeground(g, ctx) {
  if (g.state !== 'LANDING' || !g.activeFish) return;
  const f = g.activeFish;
  const sprSet = g.sprites.fish[f.species.id];
  if (!sprSet) return;
  const frame = Math.floor(g.time * 9) % sprSet.right.length;
  const img = f.dir >= 0 ? sprSet.right[frame] : sprSet.left[frame];
  const dx = Math.round(f.x - sprSet.w / 2);
  const dy = Math.round(f.y - sprSet.h / 2);
  ctx.drawImage(img, dx, dy);
}

function renderWaterSurface(g, ctx, map, pal, cel) {
  const wy = g.waterY;

  const refX = cel.sunVisible ? cel.sunX : cel.moonVisible ? cel.moonX : null;
  if (refX !== null) {
    ctx.save();
    const refColor = cel.sunVisible ? (map.id === 'abyss' ? '#fb923c' : '#fef08a') : '#e2e8f0';
    ctx.fillStyle = refColor;
    for (let row = 0; row < 5; row++) {
      const y = wy + 1 + row * 2;
      const spread = 12 - row * 2;
      const shift = Math.round(Math.sin(g.time * 3.5 + row * 1.4) * 2.5);
      ctx.globalAlpha = (cel.sunVisible ? 0.34 : 0.24 * pal.night) * (1 - row * 0.16);
      ctx.fillRect(refX - Math.floor(spread / 2) + shift, y, spread, 1);
    }
    ctx.restore();
  }

  const crestDay = map.id === 'abyss' ? '#fdba74' : map.id === 'sanctuary' ? '#f5d0fe' : map.id === 'lagoon' ? '#ccfbf1' : '#bae6fd';
  const crestNight = map.id === 'abyss' ? '#9333ea' : map.id === 'sanctuary' ? '#5eead4' : '#4a76a8';
  const meniscusDay = map.id === 'abyss' ? '#ea580c' : map.id === 'sanctuary' ? '#2dd4bf' : map.id === 'lagoon' ? '#5eead4' : '#56c2db';
  const subDay = map.id === 'abyss' ? '#7c2d12' : map.id === 'lagoon' ? '#14b8a6' : '#2b88a8';
  const foamCol = lerpColor('#f8fafc', '#82a9d1', pal.night);

  const crestCol = lerpColor(crestDay, crestNight, pal.night);
  const menCol = lerpColor(meniscusDay, '#2e5782', pal.night);
  const subCol = lerpColor(subDay, '#1e3e61', pal.night);

  // Dual-harmonic animated surface waves with backlit underside meniscus & glinting crests
  for (let x = 0; x < g.vw; x++) {
    const w1 = Math.sin(x * 0.085 + g.time * 2.5) * 1.25;
    const w2 = Math.sin(x * 0.19 - g.time * 1.85) * 0.55;
    const wave = Math.round(w1 + w2);
    const y0 = wy + wave;

    // Bright surface highlight rim
    ctx.fillStyle = crestCol;
    ctx.fillRect(x, y0, 1, 1);
    // Glowing side-POV wave underside meniscus
    ctx.fillStyle = menCol;
    ctx.fillRect(x, y0 + 1, 1, 1);
    ctx.fillStyle = subCol;
    ctx.fillRect(x, y0 + 2, 1, 1);

    // Moving whitecap glints on wave peaks
    if (w1 + w2 > 0.95 && ((x + Math.floor(g.time * 6)) % 5 === 0)) {
      ctx.fillStyle = foamCol;
      ctx.fillRect(x, y0, 2, 1);
    }
  }

  // Animated lapping waterline foam around every dock piling
  const lap = Math.round(Math.sin(g.time * 3.8));
  ctx.fillStyle = foamCol;
  for (let px = 8; px <= g.pierEndX - 8; px += 22) {
    ctx.fillRect(px - 2 - (lap > 0 ? 1 : 0), wy, 3, 1);
    ctx.fillRect(px + 5 + (lap < 0 ? 1 : 0), wy, 3, 1);
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillRect(px - 1, wy + 2, 8, 1);
    ctx.restore();
  }

  for (const r of g.ripples) {
    ctx.save();
    ctx.globalAlpha = r.alpha;
    ctx.fillStyle = '#e0f7ff';
    const rx = Math.round(r.x);
    const ry = Math.round(r.y);
    const rad = Math.round(r.r);
    ctx.fillRect(rx - rad, ry, 2, 1);
    ctx.fillRect(rx + rad - 1, ry, 2, 1);
    if (rad > 5) {
      ctx.globalAlpha = r.alpha * 0.5;
      ctx.fillRect(rx - rad + 2, ry + 1, 2, 1);
      ctx.fillRect(rx + rad - 3, ry + 1, 2, 1);
    }
    ctx.restore();
  }

  if (g.state === 'CASTING' || g.state === 'WAITING' || g.state === 'BITE' || g.state === 'REELING') {
    const tilt = Math.sin(g.time * 4.5) > 0.35 || g.state === 'BITE' || g.state === 'REELING';
    const bob = g.sprites.props[tilt ? 'bobber1' : 'bobber0'];
    ctx.drawImage(bob, Math.round(g.bobberX - 3), Math.round(g.bobberY - 4));
  }
}

function renderLineAndHook(g, ctx) {
  if (g.state === 'IDLE' || g.state === 'CHARGING' || g.state === 'CAUGHT') return;
  const rod = g.getRodTipPos();

  const isDanger = g.state === 'REELING' && g.tension > 0.80;
  const isSweet = g.state === 'REELING' && g.inSweetSpot;
  const lineColor = isDanger ? '#fca5a5' : isSweet ? '#5eead4' : '#e2e8f0';

  if (g.state === 'LANDING') {
    if (g.landingT < 0.56) {
      drawPixelLine(ctx, rod.tipX, rod.tipY, g.hookX, g.hookY, '#e2e8f0');
    }
    return;
  }

  // Slack sag shrinks smoothly as line tension rises (realistic taut-vs-slack line!)
  const sag = g.state === 'WAITING'
    ? 6
    : g.state === 'REELING'
      ? Math.max(0, (1 - g.tension * 1.45) * 4.5)
      : 1.2;

  if (sag > 0.6) {
    const midX = (rod.tipX + g.bobberX) * 0.5;
    const midY = (rod.tipY + g.bobberY) * 0.5 + sag;
    drawPixelQuad(ctx, rod.tipX, rod.tipY, midX, midY, g.bobberX, g.bobberY - 2, lineColor, 14);
  } else {
    drawPixelLine(ctx, rod.tipX, rod.tipY, g.bobberX, g.bobberY - 2, lineColor);
  }

  if (g.state === 'WAITING' || g.state === 'BITE' || g.state === 'REELING') {
    const subColor = isDanger ? 'rgba(252,165,165,0.85)' : isSweet ? 'rgba(94,234,212,0.85)' : 'rgba(226,232,240,0.75)';
    drawPixelLine(ctx, g.bobberX, g.bobberY + 2, g.hookX, g.hookY, subColor);
    const hx = Math.round(g.hookX);
    const hy = Math.round(g.hookY);
    const lureLv = g.save.upgrades.lure || 1;
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(hx, hy, 1, 4);
    ctx.fillRect(hx - 2, hy + 3, 3, 1);
    ctx.fillRect(hx - 2, hy + 2, 1, 1);

    const wiggle = Math.round(Math.sin(g.time * 8));
    if (lureLv === 1) {
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(hx - 1, hy + 1, 2, 2);
    } else if (lureLv === 2) {
      ctx.fillStyle = '#fb7185';
      ctx.fillRect(hx - 1, hy + 1, 2, 2);
      ctx.fillRect(hx + wiggle, hy + 3, 1, 2);
    } else if (lureLv === 3) {
      ctx.fillStyle = Math.floor(g.time * 10) % 2 ? '#ffffff' : '#94a3b8';
      ctx.fillRect(hx - 1, hy + 1, 3, 2);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(hx, hy + 3, 1, 1);
    } else if (lureLv === 4) {
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = '#5eead4';
      ctx.fillRect(hx - 2, hy, 5, 5);
      ctx.restore();
      ctx.fillStyle = '#2dd4bf';
      ctx.fillRect(hx - 1, hy + 1, 3, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(hx, hy + 1, 1, 1);
    } else {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#fde047';
      ctx.fillRect(hx - 2, hy, 5, 5);
      ctx.restore();
      ctx.fillStyle = '#facc15';
      ctx.fillRect(hx - 1, hy + 1, 3, 2);
      ctx.fillStyle = '#fef9c3';
      ctx.fillRect(hx + wiggle, hy + 3, 2, 1);
    }
  }
}

function renderAnglerAndRod(g, ctx) {
  renderArticulatedAngler(g, ctx);
}

function renderEffects(g, ctx, map, pal) {
  // Biome weather particles: drifting snow in Frost Fjord, rising embers in Ember Caldera
  if (g.weatherParticles && g.weatherParticles.length) {
    for (const wp of g.weatherParticles) {
      ctx.fillStyle = wp.color;
      ctx.fillRect(Math.round(wp.x), Math.round(wp.y), wp.size, wp.size);
    }
  }

  // Nighttime fireflies in Harbor & Lagoon
  if ((map.id === 'harbor' || map.id === 'lagoon') && pal.night > 0.35 && g.fireflies) {
    for (const ff of g.fireflies) {
      const pulse = 0.35 + 0.65 * Math.sin(g.time * 4.2 + ff.phase);
      ctx.save();
      ctx.globalAlpha = pal.night * pulse;
      const fx = Math.round(ff.x + Math.sin(g.time * 1.4 + ff.phase) * 5);
      const fy = Math.round(ff.y + Math.cos(g.time * 1.9 + ff.phase) * 3);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(fx, fy, 1, 1);
      ctx.restore();
    }
  }

  for (const p of g.particles) {
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  }

  if (g.state === 'BITE') {
    const bounce = Math.round(Math.abs(Math.sin(g.time * 18)) * 4);
    const alertSpr = g.sprites.props[Math.floor(g.time * 12) % 2 === 0 ? 'alert0' : 'alert1'];
    ctx.drawImage(alertSpr, Math.round(g.bobberX - 4), Math.round(g.waterY - 20 - bounce));
  }

  if (g.floats.length) {
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    for (const f of g.floats) {
      ctx.globalAlpha = clamp(f.life / f.maxLife, 0, 1);
      const fx = Math.round(clamp(f.x, 30, g.vw - 30));
      const fy = Math.round(f.y);
      ctx.fillStyle = '#0f172a';
      ctx.fillText(f.text, fx + 1, fy + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, fx, fy);
    }
    ctx.globalAlpha = 1;
  }
}

function renderInWorldMeters(g, ctx) {
  if (g.state !== 'CHARGING') return;
  const bx = Math.round(g.anglerX - 1);
  const by = Math.round(g.anglerY - 9);
  const bw = 24;
  const bh = 5;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(bx, by, bw, bh);
  const fillW = Math.round(bw * g.chargePower);
  ctx.fillStyle = g.chargePower > 0.78 ? '#facc15' : g.chargePower > 0.45 ? '#34d399' : '#38bdf8';
  ctx.fillRect(bx, by, fillW, bh);

  const stats = g.getStats();
  const minCastX = g.pierEndX + 22;
  const maxCastX = g.pierEndX + (g.vw - g.pierEndX - 18) * stats.maxCastFrac;
  const previewX = Math.round(clamp(lerp(minCastX, maxCastX, g.chargePower), minCastX, g.vw - 14));
  const pulse = Math.floor(g.time * 10) % 2;
  ctx.fillStyle = '#fef08a';
  ctx.fillRect(previewX - 2 - pulse, g.waterY - 2, 5 + pulse * 2, 1);
  ctx.fillRect(previewX, g.waterY - 4 - pulse, 1, 5 + pulse);
}

// Crisp 16-bit 2D pixel-art side-POV renderer supporting 5 distinct fishing maps, rich night variations & zero-blur bitmap text.
import { getMapById } from './maps.js';
import { computeAnglerRig, renderArticulatedAngler } from './anglerRenderer.js';
import { drawPixelText } from './pixelFont.js';

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

// Crisp circular pixel-art halo (zero blocky rectangular glow boxes!)
function drawPixelHalo(ctx, cx, cy, r, color, alpha) {
  if (alpha <= 0.005 || r <= 0) return;
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  const rr = r * r;
  for (let dy = -r; dy <= r; dy++) {
    const span = Math.floor(Math.sqrt(Math.max(0, rr - dy * dy)));
    if (span >= 0) ctx.fillRect(cx - span, cy + dy, span * 2 + 1, 1);
  }
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

  // Map-specific animated night sky atmospheres!
  if (map.id === 'fjord' && pal.night > 0.16) {
    // Dual-layer sweeping Northern Lights (Aurora Borealis) curtains!
    ctx.save();
    for (let x = 0; x < g.vw; x += 2) {
      const w1 = Math.sin(x * 0.038 + g.time * 0.85) * 7 + Math.cos(x * 0.082 - g.time * 0.55) * 4;
      const top1 = Math.round(7 + w1);
      const h1 = Math.round(15 + Math.sin(x * 0.065 + g.time * 1.3) * 6);
      const shimmer = 0.65 + 0.35 * Math.sin(x * 0.14 + g.time * 2.4);
      ctx.globalAlpha = pal.night * 0.28 * shimmer;
      ctx.fillStyle = '#34d399';
      ctx.fillRect(x, top1, 2, h1);
      ctx.globalAlpha = pal.night * 0.22 * shimmer;
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(x, top1 + Math.floor(h1 * 0.45), 2, Math.max(4, Math.floor(h1 * 0.55)));
      ctx.globalAlpha = pal.night * 0.18 * shimmer;
      ctx.fillStyle = '#c084fc';
      ctx.fillRect(x, top1 - 5, 2, 7);
    }
    ctx.restore();
  } else if (map.id === 'sanctuary' && pal.night > 0.16) {
    // Cosmic Rose-Aqua Astral Nebula & Celestial Aurora ribbons!
    ctx.save();
    for (let x = 0; x < g.vw; x += 2) {
      const w1 = Math.sin(x * 0.032 - g.time * 0.7) * 6 + Math.cos(x * 0.07 + g.time * 0.45) * 3;
      const topY = Math.round(8 + w1);
      const h1 = Math.round(13 + Math.sin(x * 0.055 + g.time * 1.15) * 5);
      const shimmer = 0.68 + 0.32 * Math.sin(x * 0.12 - g.time * 2.0);
      ctx.globalAlpha = pal.night * 0.24 * shimmer;
      ctx.fillStyle = '#f472b6';
      ctx.fillRect(x, topY, 2, Math.floor(h1 * 0.65));
      ctx.globalAlpha = pal.night * 0.22 * shimmer;
      ctx.fillStyle = '#2dd4bf';
      ctx.fillRect(x, topY + Math.floor(h1 * 0.5), 2, Math.floor(h1 * 0.65));
      ctx.globalAlpha = pal.night * 0.14 * shimmer;
      ctx.fillStyle = '#a78bfa';
      ctx.fillRect(x, topY - 4, 2, 5);
    }
    // Delicate constellation thread connecting bright sanctuary stars
    ctx.globalAlpha = pal.night * 0.18;
    const cPts = [
      [Math.round(g.vw * 0.16), Math.round(skyH * 0.24)],
      [Math.round(g.vw * 0.26), Math.round(skyH * 0.16)],
      [Math.round(g.vw * 0.36), Math.round(skyH * 0.26)],
      [Math.round(g.vw * 0.44), Math.round(skyH * 0.14)],
    ];
    for (let i = 0; i < cPts.length - 1; i++) {
      drawPixelLine(ctx, cPts[i][0], cPts[i][1], cPts[i + 1][0], cPts[i + 1][1], '#e9d5ff');
    }
    ctx.restore();
  } else if (map.id === 'abyss' && pal.night > 0.25) {
    // Volcanic horizon heat-glow pulsing softly across the dark caldera sky
    ctx.save();
    const glowPulse = 0.14 + 0.08 * Math.sin(g.time * 2.8);
    ctx.globalAlpha = pal.night * glowPulse;
    ctx.fillStyle = '#ea580c';
    ctx.fillRect(Math.round(g.vw * 0.45), Math.max(0, skyH - 22), Math.round(g.vw * 0.55), 22);
    ctx.globalAlpha = pal.night * glowPulse * 0.65;
    ctx.fillStyle = '#f97316';
    ctx.fillRect(Math.round(g.vw * 0.58), Math.max(0, skyH - 12), Math.round(g.vw * 0.42), 12);
    ctx.restore();
  }

  // Rich multi-hue twinkling starfield
  if (pal.night > 0.15) {
    for (const s of g.stars) {
      const twinkle = 0.45 + 0.55 * Math.sin(g.time * 3.1 + s.phase);
      if (twinkle * pal.night < 0.24) continue;
      ctx.fillStyle = s.tint || (s.bright ? '#fef9c3' : '#cbd5e1');
      ctx.globalAlpha = clamp(twinkle * pal.night, 0, 1);
      const sx = Math.round(s.x * g.vw);
      const sy = Math.round(s.y * (skyH - 12));
      ctx.fillRect(sx, sy, 1, 1);
      if (s.bright && twinkle > 0.80) {
        ctx.globalAlpha *= 0.5;
        ctx.fillRect(sx - 1, sy, 3, 1);
        ctx.fillRect(sx, sy - 1, 1, 3);
      }
    }
    ctx.globalAlpha = 1;
  }

  // Animated nocturnal shooting stars / astral meteors with crisp pixel tails!
  if (pal.night > 0.25 && g.shootingStars && g.shootingStars.length) {
    ctx.save();
    for (const st of g.shootingStars) {
      const fade = clamp(st.life / st.maxLife, 0, 1) * pal.night;
      const sx = Math.round(st.x);
      const sy = Math.round(st.y);
      ctx.globalAlpha = fade;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx, sy, 2, 1);
      // 5-step tapering glowing meteor trail
      for (let seg = 1; seg <= 6; seg++) {
        ctx.globalAlpha = fade * (1 - seg / 7) * 0.85;
        ctx.fillStyle = seg <= 2 ? st.color : '#93c5fd';
        const tx = Math.round(st.x - (st.vx * 0.016) * seg * 1.4);
        const ty = Math.round(st.y - (st.vy * 0.016) * seg * 1.4);
        if (ty >= 0 && ty < skyH - 2) ctx.fillRect(tx, ty, 1, 1);
      }
    }
    ctx.restore();
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

  // Upgraded atmospheric Pixel Moon with soft stepped halo & biome tint!
  if (cel.moonVisible && pal.night > 0.1) {
    const moonBand = clamp(Math.floor(cel.moonY / Math.max(1, bandH)), 0, 3);
    const haloCol =
      map.id === 'abyss' ? '#fb923c' :
      map.id === 'sanctuary' ? '#f9a8d4' :
      map.id === 'lagoon' ? '#67e8f9' :
      '#bae6fd';
    const moonCore =
      map.id === 'abyss' ? '#fed7aa' :
      map.id === 'sanctuary' ? '#fdf2f8' :
      '#f8fafc';

    // Smooth circular pixel-art moon halo (zero square box!)
    ctx.save();
    drawPixelHalo(ctx, cel.moonX, cel.moonY, 9, haloCol, pal.night * 0.10);
    drawPixelHalo(ctx, cel.moonX, cel.moonY, 6, haloCol, pal.night * 0.16);
    drawPixelHalo(ctx, cel.moonX, cel.moonY, 4, moonCore, pal.night * 0.22);
    ctx.restore();

    if (map.id === 'sanctuary' || map.id === 'abyss') {
      // Full luminous Astral / Blood-Amber Moon with subtle crater shading
      ctx.fillStyle = map.id === 'abyss' ? '#f97316' : '#f5d0fe';
      ctx.fillRect(cel.moonX - 3, cel.moonY - 2, 7, 5);
      ctx.fillRect(cel.moonX - 2, cel.moonY - 3, 5, 7);
      ctx.fillStyle = moonCore;
      ctx.fillRect(cel.moonX - 2, cel.moonY - 2, 5, 5);
      ctx.fillStyle = map.id === 'abyss' ? '#fdba74' : '#e2e8f0';
      ctx.fillRect(cel.moonX + 1, cel.moonY, 1, 1);
      ctx.fillRect(cel.moonX - 1, cel.moonY + 1, 1, 1);
    } else {
      // Crisp glowing crescent moon with subtle shadow rim
      ctx.fillStyle = moonCore;
      ctx.fillRect(cel.moonX - 3, cel.moonY - 2, 6, 5);
      ctx.fillRect(cel.moonX - 2, cel.moonY - 3, 4, 7);
      ctx.fillStyle = pal.sky[moonBand];
      ctx.fillRect(cel.moonX, cel.moonY - 2, 3, 4);
    }
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
        // Soft emerald-cyan aurora rim glint on snowy peaks at night!
        if (pal.night > 0.35 && ((x + Math.floor(g.time * 4)) % 6 === 0)) {
          ctx.save();
          ctx.globalAlpha = pal.night * 0.35;
          ctx.fillStyle = '#6ee7b7';
          ctx.fillRect(x, wy - peak, 2, 1);
          ctx.restore();
        }
      }
    }
    const berg = g.sprites.props.iceberg;
    const bx = g.vw - (g.isPortrait ? 42 : 74);
    ctx.drawImage(berg, bx, wy - berg.height + 2);
    if (pal.night > 0.3) {
      // Shimmering aurora edge highlight along iceberg ridge
      ctx.save();
      ctx.globalAlpha = pal.night * (0.28 + 0.14 * Math.sin(g.time * 2.6));
      ctx.fillStyle = '#5eead4';
      ctx.fillRect(bx + 6, wy - berg.height + 3, 5, 1);
      ctx.fillRect(bx + 14, wy - berg.height + 6, 4, 1);
      ctx.restore();
    }
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
    // At night, the Sunken Archway awakens with a pulsing vertical starlight pillar & rising astral runes!
    if (pal.night > 0.25) {
      ctx.save();
      const beamPulse = 0.7 + 0.3 * Math.sin(g.time * 3.4);
      ctx.globalAlpha = pal.night * 0.14 * beamPulse;
      ctx.fillStyle = '#5eead4';
      ctx.fillRect(ax + 11, 2, 6, ay + 8);
      ctx.globalAlpha = pal.night * 0.22 * beamPulse;
      ctx.fillStyle = '#f9a8d4';
      ctx.fillRect(ax + 13, 6, 2, ay + 4);
      // Rising 1px glowing arcane rune motes ascending from the archway
      for (let i = 0; i < 5; i++) {
        const lift = ((g.time * 9 + i * 7.5) % 34);
        const rx = ax + 13 + Math.round(Math.sin(g.time * 3 + i * 1.9) * 4);
        const ry = Math.round(ay + 8 - lift);
        if (ry > 2) {
          ctx.globalAlpha = pal.night * (1 - lift / 34) * 0.9;
          ctx.fillStyle = i % 2 === 0 ? '#5eead4' : '#fde047';
          ctx.fillRect(rx, ry, 1, 1);
        }
      }
      ctx.restore();
    }
    // Soft aqua/rose shimmer around the floating temple crystal
    ctx.save();
    ctx.globalAlpha = 0.24 + 0.14 * Math.sin(g.time * 3.8);
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
    const eruptPulse = 0.5 + 0.5 * Math.sin(g.time * 3.8);
    // Backlit billowing volcanic smoke plume & circular crater glow at night!
    ctx.save();
    drawPixelHalo(ctx, vx + 16, vy + 1, 12, '#ef4444', (0.14 + 0.10 * eruptPulse) * pal.night);
    drawPixelHalo(ctx, vx + 16, vy + 1, 7, '#f97316', (0.24 + 0.14 * eruptPulse) * (0.65 + pal.night * 0.55));
    // Drifting dark-ember smoke puffs rising above crater
    for (let i = 0; i < 4; i++) {
      const rise = (g.time * 5.5 + i * 6) % 24;
      const sx = Math.round(vx + 13 + Math.sin(g.time * 1.6 + i) * 3 - rise * 0.2);
      const sy = Math.round(vy - 2 - rise);
      if (sy > 2) {
        ctx.globalAlpha = (1 - rise / 24) * 0.38;
        ctx.fillStyle = rise < 8 ? '#fb923c' : '#3b1d2e';
        ctx.fillRect(sx, sy, 5, 3);
      }
    }
    ctx.restore();
    ctx.drawImage(volc, vx, vy);
    // Animated lava sparks & pulsing magma veins down the caldera at night!
    if (pal.night > 0.25) {
      ctx.save();
      ctx.globalAlpha = pal.night * (0.65 + 0.35 * eruptPulse);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(vx + 15, vy + 2, 2, 1);
      ctx.fillStyle = '#fb923c';
      ctx.fillRect(vx + 14, vy + 4, 2, 2);
      ctx.fillRect(vx + 16, vy + 6, 1, 2);
      ctx.fillRect(vx + 13, vy + 8, 2, 2);
      // Periodic volcanic fountain sparks arcing from the crater
      for (let i = 0; i < 4; i++) {
        const spT = (g.time * 1.4 + i * 0.43) % 1.0;
        const dir = (i % 2 === 0 ? 1 : -1) * (2 + i * 1.5);
        const spx = Math.round(vx + 15 + dir * spT * 3.5);
        const spy = Math.round(vy + 1 - Math.sin(spT * Math.PI) * (7 + i * 1.5));
        ctx.globalAlpha = pal.night * (1 - spT) * 0.95;
        ctx.fillStyle = spT < 0.4 ? '#fef08a' : '#f97316';
        ctx.fillRect(spx, spy, 1, 1);
      }
      ctx.restore();
    }
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
    // Soft moonlit shoreline bioluminescence along the distant tropical atoll at night!
    if (pal.night > 0.3) {
      ctx.save();
      ctx.globalAlpha = pal.night * (0.45 + 0.3 * Math.sin(g.time * 3.1));
      ctx.fillStyle = '#5eead4';
      ctx.fillRect(ax + 2, wy - 1, Math.max(8, atoll.width - 4), 1);
      ctx.restore();
    }
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

  if (pal.night > 0.2) {
    const cx = isleX + 7;
    const cy = lhY + 2;
    // Serene coastal Fresnel rotation (100% C-infinity smooth — zero contrast jumps or snapping!)
    const rot = g.time * 0.62;
    const cosR = Math.cos(rot);
    const flash = Math.pow(Math.abs(cosR), 3.0);

    ctx.save();
    // Dual opposing Fresnel beams (180° apart) with continuous 3D depth modulation & smooth fade-to-zero
    for (let b = 0; b < 2; b++) {
      const ang = rot + b * Math.PI;
      const side = Math.sin(ang);     // -1 (full left) -> 0 (center) -> +1 (full right)
      const facing = Math.cos(ang);   // +1 (toward viewer) -> 0 (broadside) -> -1 (behind)
      const sideMag = Math.abs(side);

      // Smooth continuous depth factor from 0.45 (back) -> 0.725 (broadside) -> 1.0 (front): ZERO jump at facing=0!
      const depthDim = 0.45 + 0.55 * (0.5 + 0.5 * facing);
      // Smooth sine-squared envelope so beam glides to 0 brightness before reversing direction
      const beamStrength = sideMag * sideMag * depthDim * pal.night;
      if (beamStrength < 0.004) continue;

      const dir = side >= 0 ? 1 : -1;
      const maxLen = Math.round((g.isPortrait ? 46 : 74) * Math.pow(sideMag, 0.85));
      if (maxLen < 3) continue;

      for (let d = 2; d <= maxLen; d++) {
        const x = cx + dir * d;
        if (x < 0 || x >= g.vw) break;
        const frac = d / maxLen;
        // Smooth radial mist falloff to 0 at beam tip
        const falloff = Math.pow(1 - frac, 2.0) * beamStrength;
        if (falloff < 0.005) continue;

        const beamY = cy + d * 0.04;
        const outerHalf = 1.0 + d * 0.11;
        const coreHalf = 0.5 + d * 0.042;

        const oy0 = Math.round(beamY - outerHalf);
        const oy1 = Math.min(wy - 1, Math.round(beamY + outerHalf));
        if (oy1 >= oy0) {
          ctx.fillStyle = '#fde68a';
          ctx.globalAlpha = falloff * 0.14;
          ctx.fillRect(x, oy0, 1, oy1 - oy0 + 1);
        }

        const iy0 = Math.round(beamY - coreHalf);
        const iy1 = Math.min(wy - 1, Math.round(beamY + coreHalf));
        if (iy1 >= iy0) {
          ctx.fillStyle = '#fef9c3';
          ctx.globalAlpha = falloff * 0.22;
          ctx.fillRect(x, iy0, 1, iy1 - iy0 + 1);
        }
      }
    }

    // Continuous smooth circular lamp bloom & soft forward Fresnel glint (no threshold snap!)
    drawPixelHalo(ctx, cx, cy, 7, '#facc15', pal.night * (0.09 + 0.11 * flash));
    drawPixelHalo(ctx, cx, cy, 4, '#fef08a', pal.night * (0.20 + 0.24 * flash));
    drawPixelHalo(ctx, cx, cy, 2, '#fef9c3', pal.night * (0.56 + 0.36 * flash));
    if (flash > 0.05) {
      ctx.fillStyle = '#fef9c3';
      ctx.globalAlpha = pal.night * flash * 0.62;
      ctx.fillRect(cx - 4, cy, 9, 1);
      ctx.fillRect(cx, cy - 3, 1, 7);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = pal.night * flash * 0.85;
      ctx.fillRect(cx - 2, cy, 5, 1);
      ctx.fillRect(cx, cy - 1, 1, 3);
    }
    ctx.restore();
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

  // Nocturnal underwater moonbeams, bioluminescent plankton currents & arcane deep shimmer!
  if (pal.night > 0.22) {
    ctx.save();
    // Soft moonbeams piercing downward in clear nocturnal waters
    const nightBeamCol =
      map.id === 'lagoon' ? '#5eead4' :
      map.id === 'fjord' ? '#6ee7b7' :
      map.id === 'abyss' ? '#fb923c' :
      map.id === 'sanctuary' ? '#f9a8d4' :
      '#93c5fd';
    ctx.fillStyle = nightBeamCol;
    for (let i = 0; i < 3; i++) {
      const rx = Math.round(g.pierEndX + 24 + i * ((g.vw - g.pierEndX - 30) / 2.6) + Math.sin(g.time * 0.55 + i * 2.0) * 6);
      const rayH = Math.round(h * 0.62);
      const pulse = 0.65 + 0.35 * Math.sin(g.time * 1.6 + i * 1.7);
      ctx.globalAlpha = pal.night * (map.id === 'sanctuary' || map.id === 'lagoon' ? 0.095 : 0.065) * pulse;
      for (let dy = 3; dy < rayH; dy += 3) {
        const shift = Math.round(dy * 0.18);
        const w = Math.max(2, Math.round(8 - dy * 0.04));
        ctx.fillRect(rx + shift, wy + dy, w, 2);
      }
    }

    // Coral Lagoon: swirling electric-aqua bioluminescent plankton ribbon!
    if (map.id === 'lagoon') {
      for (let i = 0; i < 24; i++) {
        const px = Math.round(((i * 19 + g.time * (6 + (i % 4) * 1.5)) % Math.max(20, g.vw - g.pierEndX)) + g.pierEndX);
        const py = Math.round(wy + 7 + (i % 5) * 9 + Math.sin(g.time * 2.3 + i * 0.9) * 4);
        const glow = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(g.time * 4.2 + i * 1.3));
        ctx.globalAlpha = pal.night * glow * 0.85;
        ctx.fillStyle = i % 3 === 0 ? '#a7f3d0' : '#2dd4bf';
        ctx.fillRect(px, py, 1, 1);
      }
    } else if (map.id === 'sanctuary') {
      // Astral Ruins: drifting starlight motes & faint vertical arcane filaments rising from the seabed
      for (let i = 0; i < 20; i++) {
        const px = Math.round(g.pierEndX + 10 + ((i * 29 + g.time * 3.5) % Math.max(20, g.vw - g.pierEndX - 16)));
        const lift = (g.time * (5 + (i % 3) * 2) + i * 13) % Math.max(16, h - 18);
        const py = Math.round(g.vh - 14 - lift);
        ctx.globalAlpha = pal.night * (1 - lift / Math.max(16, h - 18)) * 0.78;
        ctx.fillStyle = i % 3 === 0 ? '#f9a8d4' : i % 3 === 1 ? '#5eead4' : '#fde047';
        ctx.fillRect(px, py, 1, 1);
      }
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

  // Biome-specific background seabed landmarks (with glowing nocturnal effects!)
  const leftSpotX = Math.round(g.pierEndX + (g.vw - g.pierEndX) * 0.28);
  const rightSpotX = Math.round(g.pierEndX + (g.vw - g.pierEndX) * 0.74);
  if (map.id === 'lagoon') {
    const clam = g.sprites.props.giantClam;
    const cy = g.getSeabedY(leftSpotX + 6) - clam.height + 2;
    if (pal.night > 0.25) {
      // Pulsing bioluminescent pearl-aqua clam glow at night
      ctx.save();
      ctx.globalAlpha = pal.night * (0.24 + 0.14 * Math.sin(g.time * 3.4));
      ctx.fillStyle = '#5eead4';
      ctx.fillRect(leftSpotX + 1, cy - 3, clam.width - 2, clam.height + 2);
      ctx.restore();
    }
    ctx.drawImage(clam, leftSpotX, cy);
    if (g.vw > 210) {
      const chest = g.sprites.props.chest;
      ctx.drawImage(chest, rightSpotX, g.getSeabedY(rightSpotX + 6) - chest.height + 2);
    }
  } else if (map.id === 'fjord') {
    const crys = g.sprites.props.iceCrystal;
    const cy = g.getSeabedY(leftSpotX + 4) - crys.height + 1;
    if (pal.night > 0.25) {
      // Glowing glacial cyan crystal shimmer at night
      ctx.save();
      ctx.globalAlpha = pal.night * (0.22 + 0.14 * Math.sin(g.time * 2.9));
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(leftSpotX - 1, cy - 3, crys.width + 2, crys.height + 2);
      ctx.restore();
    }
    ctx.drawImage(crys, leftSpotX, cy);
    if (g.vw > 210) {
      ctx.globalAlpha = 0.65;
      ctx.drawImage(g.sprites.props.anchor, rightSpotX, g.getSeabedY(rightSpotX) - 12);
      ctx.globalAlpha = 1;
    }
  } else if (map.id === 'sanctuary') {
    const pil = g.sprites.props.sunkenPillar;
    const pc = g.sprites.props.prismCrystal;
    const py = g.getSeabedY(leftSpotX + 4) - pil.height + 2;
    ctx.drawImage(pil, leftSpotX, py);
    if (g.vw > 210) {
      const pcy = g.getSeabedY(rightSpotX + 5) - pc.height + 2;
      if (pal.night > 0.22) {
        ctx.save();
        ctx.globalAlpha = pal.night * (0.24 + 0.16 * Math.sin(g.time * 3.6));
        ctx.fillStyle = '#f9a8d4';
        ctx.fillRect(rightSpotX - 1, pcy - 4, pc.width + 2, pc.height + 3);
        ctx.globalAlpha = pal.night * 0.16;
        ctx.fillStyle = '#5eead4';
        ctx.fillRect(rightSpotX + 2, pcy - 14, Math.max(4, pc.width - 4), 12);
        ctx.restore();
      }
      ctx.drawImage(pc, rightSpotX, pcy);
    }
  } else if (map.id === 'abyss') {
    const vent = g.sprites.props.hydroVent;
    for (const vx of g.vw > 210 ? [leftSpotX, rightSpotX] : [leftSpotX]) {
      const vy = g.getSeabedY(vx + 6) - vent.height + 2;
      ctx.save();
      const vp = 0.24 + 0.16 * Math.sin(g.time * 5 + vx);
      ctx.globalAlpha = vp * (0.85 + pal.night * 0.45);
      ctx.fillStyle = '#f97316';
      ctx.fillRect(vx + 2, vy - 6, 10, 11);
      if (pal.night > 0.3) {
        ctx.globalAlpha = pal.night * vp * 0.65;
        ctx.fillStyle = '#fde047';
        ctx.fillRect(vx + 4, vy - 14, 6, 10);
      }
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

  // Biome-specific pier background structures & animated nocturnal lighting!
  const postX = Math.max(8, g.pierEndX - 42);
  if (map.id === 'lagoon') {
    // Lush curving coconut palm behind dock + animated tiki torch!
    const palm = g.sprites.props.palmTree;
    ctx.drawImage(palm, Math.max(0, postX - 10), g.pierY - palm.height + 1);
    const torch = g.sprites.props[Math.floor(g.time * 7) % 2 === 0 ? 'tikiTorch0' : 'tikiTorch1'];
    const tx = Math.max(12, g.pierEndX - 36);
    const ty = g.pierY - torch.height + 1;
    ctx.save();
    const tGlow = (0.20 + 0.08 * Math.sin(g.time * 8.5)) * (0.65 + pal.night * 0.55);
    drawPixelHalo(ctx, tx + 4, ty + 3, 10, '#f97316', tGlow * 0.45);
    drawPixelHalo(ctx, tx + 4, ty + 3, 6, '#fb923c', tGlow * 0.85);
    // Live rising tiki flame sparks at night!
    if (pal.night > 0.2) {
      for (let i = 0; i < 3; i++) {
        const rise = (g.time * 12 + i * 5.2) % 15;
        const sx = Math.round(tx + 3 + Math.sin(g.time * 5 + i * 2) * 2.2);
        const sy = Math.round(ty - rise);
        ctx.globalAlpha = pal.night * (1 - rise / 15) * 0.95;
        ctx.fillStyle = rise < 6 ? '#fef08a' : '#fb923c';
        ctx.fillRect(sx, sy, 1, 1);
      }
    }
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
    // Orbiting double-ring crystal starlight motes (brighter & richer at night — zero blocky glow box!)
    const ringCount = pal.night > 0.3 ? 4 : 2;
    const orbCols = ['#5eead4', '#fef08a', '#f9a8d4', '#e0f2fe'];
    for (let i = 0; i < ringCount; i++) {
      const ang = g.time * (i < 2 ? 3.2 : -2.4) + i * (Math.PI * 2 / ringCount);
      const rx = i < 2 ? 4.5 : 6.5;
      const ry = i < 2 ? 2.2 : 3.2;
      ctx.fillStyle = orbCols[i % orbCols.length];
      ctx.fillRect(ox + 5 + Math.round(Math.cos(ang) * rx), oy + 2 + Math.round(Math.sin(ang) * ry), 1, 1);
    }
  } else if (map.id === 'abyss') {
    // Roaring iron fire brazier post with rising fiery sparks
    const braz = g.sprites.props[Math.floor(g.time * 8) % 2 === 0 ? 'brazier0' : 'brazier1'];
    const bx = Math.max(10, g.pierEndX - 40);
    const by = g.pierY - braz.height + 1;
    ctx.save();
    const fp = (0.18 + 0.08 * Math.sin(g.time * 9)) * (0.75 + pal.night * 0.45);
    drawPixelHalo(ctx, bx + 5, by + 3, 11, '#f97316', fp * 0.48);
    drawPixelHalo(ctx, bx + 5, by + 3, 6, '#fde047', fp * 0.85);
    // Rising fiery brazier sparks!
    for (let i = 0; i < 4; i++) {
      const rise = (g.time * 14 + i * 4.5) % 18;
      const sx = Math.round(bx + 5 + Math.sin(g.time * 4.5 + i * 1.8) * 3);
      const sy = Math.round(by - rise);
      ctx.globalAlpha = (1 - rise / 18) * 0.95;
      ctx.fillStyle = rise < 7 ? '#fef08a' : '#f97316';
      ctx.fillRect(sx, sy, 1, 1);
    }
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
    const pulse = 0.22 + 0.07 * Math.sin(g.time * 5.2);
    drawPixelHalo(ctx, lx + 4, ly + 4, 13, glowColor, pal.night * pulse * 0.36);
    drawPixelHalo(ctx, lx + 4, ly + 4, 8, glowColor, pal.night * pulse * 0.72);
    drawPixelHalo(ctx, lx + 4, ly + 4, 4, '#fef9c3', pal.night * pulse * 0.55);
    // Tiny fluttering nocturnal moths/sparkles orbiting the lit pier lantern
    for (let m = 0; m < 2; m++) {
      const ang = g.time * (3.6 + m * 1.4) + m * 3.1;
      const mx = Math.round(lx + 4 + Math.cos(ang) * (5 + m * 2));
      const my = Math.round(ly + 3 + Math.sin(ang * 1.3) * 3);
      ctx.globalAlpha = pal.night * 0.85;
      ctx.fillStyle = '#fef9c3';
      ctx.fillRect(mx, my, 1, 1);
    }
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
      f.ai === 'AMBUSH' ? 16 :
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
    if (f.ai !== 'HOOKED' && f.ai !== 'AMBUSH' && g.state !== 'LANDING') {
      ctx.globalAlpha = clamp(0.97 - depthRatio * 0.20 - pal.night * 0.10, 0.62, 0.98);
    }

    ctx.drawImage(img, dx, dy);

    // Subtle organic 1px bioluminescent / mythic starlight sparks trailing special species (no rectangular box!)
    if (f.species.id === 'leviathan' || f.species.id === 'magmaeel' || f.species.id === 'krakentitan' || f.species.id === 'celestialcarp') {
      const isMyth = f.species.id === 'krakentitan';
      const count = isMyth ? 8 : 2;
      ctx.save();
      for (let s = 0; s < count; s++) {
        const t = g.time * 4.4 + f.phase + s * 1.25;
        const alpha = 0.45 + 0.52 * (0.5 + 0.5 * Math.sin(t * 2.1));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = isMyth
          ? (s % 4 === 0 ? '#f9a8d4' : s % 4 === 1 ? '#fde047' : s % 4 === 2 ? '#5eead4' : '#fef9c3')
          : f.species.id === 'celestialcarp' ? '#fde047'
          : f.species.id === 'leviathan' ? '#7dd3fc' : '#fde047';
        const sx = Math.round(f.x - f.dir * (2 + s * 4.0) + Math.sin(t) * (isMyth ? 4.5 : 2.5));
        const sy = Math.round(f.y + Math.cos(t * 1.35 + s) * (isMyth ? 10.5 : 3));
        ctx.fillRect(sx, sy, 1, 1);
      }
      // Twin crisp 4-point twinkling pixel stars glinting on the Abyssal Kraken's diadem crown & trailing royal tentacles
      if (isMyth) {
        if (Math.sin(g.time * 6.5 + f.phase) > 0.15) {
          const cx = Math.round(f.x + f.dir * 6);
          const cy = dy + 1;
          ctx.globalAlpha = 0.95;
          ctx.fillStyle = '#fef9c3';
          ctx.fillRect(cx, cy - 1, 1, 3);
          ctx.fillRect(cx - 1, cy, 3, 1);
        }
        if (Math.cos(g.time * 5.2 + f.phase) > 0.35) {
          const tx = Math.round(f.x - f.dir * 19);
          const ty = Math.round(f.y + 8);
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = '#5eead4';
          ctx.fillRect(tx, ty - 1, 1, 3);
          ctx.fillRect(tx - 1, ty, 3, 1);
        }
      }
      ctx.restore();
    }

    if (f.species.id === 'angler') {
      renderAnglerBioluminescence(ctx, dx, dy, sprSet.w, f.dir, frame, g.time, f.phase, depthRatio, pal.night);
    }

    if (f.ai === 'AMBUSH' && g.state === 'REELING') {
      // Dramatic flashing predator lock-on '!' warning above the lunging bigger fish!
      const pulse = Math.floor(g.time * 18) % 2 === 0;
      const ax = Math.round(f.x + f.dir * (sprSet.w * 0.22));
      const ay = Math.max(g.waterY + 3, dy - 7);
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = '#111622';
      ctx.fillRect(ax - 2, ay - 1, 5, 8);
      ctx.fillStyle = pulse ? '#fb7185' : '#fde047';
      ctx.fillRect(ax - 1, ay, 3, 4);
      ctx.fillRect(ax - 1, ay + 5, 3, 1);
    } else if (f.ai === 'HOOKED' && g.state === 'REELING') {
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

// Realistic volumetric deep-sea bioluminescence for the Anglerfish esca bulb (zero blocky squares!)
// Tracks the exact swaying bulb center across all 4 swim frames with soft additive underwater scatter.
function renderAnglerBioluminescence(ctx, dx, dy, sprW, dir, frame, time, phase, depthRatio, night) {
  // Bulb center pixel coordinates in the 28x18 right-facing angler sprite per animation frame
  const tipX = [24.5, 25.5, 24.5, 23.5][frame % 4];
  const tipY = [6.5, 5.5, 6.5, 7.5][frame % 4];
  const lx = dir >= 0 ? dx + tipX : dx + (sprW - tipX);
  const ly = dy + tipY;

  // Organic symbiotic bacterial breathing shimmer (non-mechanical multi-harmonic modulation)
  const breathe = 0.78 + 0.14 * Math.sin(time * 2.9 + phase * 1.7) + 0.08 * Math.sin(time * 6.3 + phase * 3.1);
  // Glow stands out richer in deep abyssal water and at night
  const envBoost = 0.85 + depthRatio * 0.32 + night * 0.25;
  const intensity = clamp(breathe * envBoost, 0.55, 1.32);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // 1. Wide soft underwater cyan-teal scatter halo (realistic water light attenuation)
  const outerR = 15.5 + 2.0 * breathe;
  const gOuter = ctx.createRadialGradient(lx, ly, 0.5, lx, ly, outerR);
  gOuter.addColorStop(0.00, `rgba(125, 238, 252, ${(0.24 * intensity).toFixed(3)})`);
  gOuter.addColorStop(0.32, `rgba(45, 212, 191, ${(0.14 * intensity).toFixed(3)})`);
  gOuter.addColorStop(0.68, `rgba(14, 116, 144, ${(0.055 * intensity).toFixed(3)})`);
  gOuter.addColorStop(1.00, 'rgba(14, 116, 144, 0)');
  ctx.fillStyle = gOuter;
  ctx.beginPath();
  ctx.arc(lx, ly, outerR, 0, Math.PI * 2);
  ctx.fill();

  // 2. Inner luminous ice-aqua corona
  const midR = 5.2 + 0.8 * breathe;
  const gMid = ctx.createRadialGradient(lx, ly, 0.2, lx, ly, midR);
  gMid.addColorStop(0.00, `rgba(240, 253, 255, ${(0.68 * intensity).toFixed(3)})`);
  gMid.addColorStop(0.45, `rgba(167, 243, 228, ${(0.34 * intensity).toFixed(3)})`);
  gMid.addColorStop(1.00, 'rgba(56, 189, 248, 0)');
  ctx.fillStyle = gMid;
  ctx.beginPath();
  ctx.arc(lx, ly, midR, 0, Math.PI * 2);
  ctx.fill();

  // 3. Soft reflected aqua rim light grazing the angler's face & front fangs
  const faceX = lx - dir * 5.2;
  const faceY = ly + 4.4;
  const gFace = ctx.createRadialGradient(faceX, faceY, 0.4, faceX, faceY, 6.2);
  gFace.addColorStop(0.00, `rgba(103, 232, 249, ${(0.16 * intensity).toFixed(3)})`);
  gFace.addColorStop(1.00, 'rgba(56, 189, 248, 0)');
  ctx.fillStyle = gFace;
  ctx.beginPath();
  ctx.arc(faceX, faceY, 6.2, 0, Math.PI * 2);
  ctx.fill();

  // 4. Tiny organic drifting bioluminescent plankton motes attracted to the lure
  for (let m = 0; m < 2; m++) {
    const a = time * (1.8 + m * 0.7) + phase + m * 3.1;
    const mx = Math.round(lx + Math.cos(a) * (3.5 + m * 2.2));
    const my = Math.round(ly + Math.sin(a * 1.3) * (2.6 + m * 1.4));
    const ma = (0.28 + 0.25 * Math.sin(time * 4.5 + m * 2.1 + phase)) * intensity;
    ctx.fillStyle = `rgba(207, 250, 254, ${clamp(ma, 0, 0.65).toFixed(3)})`;
    ctx.fillRect(mx, my, 1, 1);
  }

  ctx.restore();
}

// Foreground pass for the lifted fish during LANDING: 100% crisp pixel-aligned sprite (zero jagged rotation!),
// gliding cleanly out of the water straight into the angler's outstretched hand with 0.00px continuity into CAUGHT!
function renderLandingFishForeground(g, ctx) {
  if (g.state !== 'LANDING' || !g.activeFish) return;
  const f = g.activeFish;
  const sprSet = g.sprites.fish[f.species.id];
  if (!sprSet) return;
  const dir = f.dir >= 0 ? 1 : -1;
  const animHz = (g.landingT || 0) < 0.62 ? 15 : 12.5;
  const frames = dir >= 0 ? sprSet.right : sprSet.left;
  const frame = Math.floor(g.time * animHz) % frames.length;
  const img = frames[frame];
  const sx = clamp(g.landingTurnScaleX ?? 1, 0.24, 1);
  if (sx < 0.99) {
    // Crisp 16-bit horizontal catch-turn flip (zero rotation tearing — keeps every scanline razor-sharp!)
    const drawW = Math.max(4, Math.round(sprSet.w * sx));
    const dx = Math.round(f.x - drawW / 2);
    const dy = Math.round(f.y - sprSet.h / 2);
    ctx.drawImage(img, dx, dy, drawW, sprSet.h);
  } else {
    const dx = Math.round(f.x - sprSet.w / 2);
    const dy = Math.round(f.y - sprSet.h / 2);
    ctx.drawImage(img, dx, dy);
    if (f.species.id === 'angler') {
      renderAnglerBioluminescence(ctx, dx, dy, sprSet.w, dir, frame, g.time, f.phase, 0.5, 0.4);
    }
  }

  // Once the angler catches the fish (t >= 0.62), draw crisp foreground gripping fingers over the grip point
  if ((g.landingT || 0) >= 0.62) {
    const rig = computeAnglerRig(g);
    ctx.fillStyle = '#ffe0c4';
    ctx.fillRect(Math.round(rig.reelX), Math.round(rig.reelY), 2, 1);
    ctx.fillStyle = '#c2815d';
    ctx.fillRect(Math.round(rig.reelX), Math.round(rig.reelY + 1), 2, 1);
  }
}

function renderWaterSurface(g, ctx, map, pal, cel) {
  const wy = g.waterY;

  // Celestial sun/moon shimmer path across the water!
  const refX = cel.sunVisible ? cel.sunX : cel.moonVisible ? cel.moonX : null;
  if (refX !== null) {
    ctx.save();
    const refColor = cel.sunVisible
      ? (map.id === 'abyss' ? '#fb923c' : '#fef08a')
      : (map.id === 'abyss' ? '#fdba74' : map.id === 'sanctuary' ? '#f9a8d4' : map.id === 'lagoon' ? '#a7f3d0' : '#e2e8f0');
    ctx.fillStyle = refColor;
    const rows = cel.sunVisible ? 5 : 7;
    for (let row = 0; row < rows; row++) {
      const y = wy + 1 + row * 2;
      const spread = (cel.sunVisible ? 12 : 16) - row * 2;
      if (spread <= 1) continue;
      const shift = Math.round(Math.sin(g.time * 3.5 + row * 1.4) * (2.5 + row * 0.35));
      ctx.globalAlpha = (cel.sunVisible ? 0.34 : 0.38 * pal.night) * (1 - row * 0.13);
      ctx.fillRect(refX - Math.floor(spread / 2) + shift, y, spread, 1);
    }
    ctx.restore();
  }

  // Nocturnal shimmering reflections on the water surface (pier lights, aurora, lighthouse, archway!)
  if (pal.night > 0.22) {
    ctx.save();
    // 1) Pier light source reflection directly beneath the pier
    const pierLightX =
      map.id === 'lagoon' ? Math.max(15, g.pierEndX - 33) :
      map.id === 'fjord' ? Math.max(22, g.pierEndX - 30) :
      map.id === 'abyss' ? Math.max(15, g.pierEndX - 35) :
      map.id === 'sanctuary' ? Math.max(15, g.pierEndX - 37) :
      Math.max(14, g.pierEndX - 34);
    const pierLightCol =
      map.id === 'lagoon' ? '#fb923c' :
      map.id === 'fjord' ? '#7dd3fc' :
      map.id === 'abyss' ? '#f97316' :
      map.id === 'sanctuary' ? (Math.floor(g.time * 3) % 2 === 0 ? '#5eead4' : '#f9a8d4') :
      '#facc15';
    ctx.fillStyle = pierLightCol;
    for (let r = 0; r < 4; r++) {
      const w = 10 - r * 2;
      const sx = Math.round(pierLightX - w * 0.5 + Math.sin(g.time * 4.5 + r * 1.6) * 2);
      ctx.globalAlpha = pal.night * (0.34 - r * 0.07);
      ctx.fillRect(sx, wy + 2 + r * 2, w, 1);
    }

    // 2) Horizon landmark reflections
    if (map.id === 'harbor') {
      const isleX = g.vw - (g.isPortrait ? 38 : 64) + 7;
      const flash = Math.pow(Math.abs(Math.cos(g.time * 0.62)), 3.0);
      ctx.fillStyle = '#fef08a';
      for (let r = 0; r < 4; r++) {
        ctx.globalAlpha = pal.night * (0.20 + 0.28 * flash) * (1 - r * 0.22);
        const w = Math.round((6 + flash * 3) - r * 1.5);
        if (w > 0) ctx.fillRect(isleX - Math.floor(w / 2) + Math.round(Math.sin(g.time * 2.6 + r) * 1.5), wy + 1 + r * 2, w, 1);
      }
    } else if (map.id === 'fjord') {
      // Emerald-aqua & violet aurora borealis reflections rippling across dark fjord waves!
      for (let x = g.pierEndX + 6; x < g.vw - 6; x += 7) {
        const wave = Math.sin(x * 0.045 + g.time * 1.1);
        if (wave > -0.1) {
          ctx.globalAlpha = pal.night * 0.22 * (wave + 0.2);
          ctx.fillStyle = (x % 14 === 0) ? '#c084fc' : '#34d399';
          ctx.fillRect(x + Math.round(Math.sin(g.time * 2.5 + x) * 2), wy + 3 + (x % 5), 5, 1);
        }
      }
    } else if (map.id === 'sanctuary') {
      // Arcane turquoise/rose archway shimmer reflection on the sanctuary sea!
      const ax = g.vw - (g.isPortrait ? 44 : 78) + 14;
      for (let r = 0; r < 5; r++) {
        ctx.globalAlpha = pal.night * (0.34 - r * 0.055);
        ctx.fillStyle = r % 2 === 0 ? '#5eead4' : '#f9a8d4';
        const sw = 12 - r * 2;
        ctx.fillRect(ax - Math.floor(sw / 2) + Math.round(Math.sin(g.time * 3.8 + r) * 2), wy + 1 + r * 2, sw, 1);
      }
    }
    ctx.restore();
  }

  const crestDay = map.id === 'abyss' ? '#fdba74' : map.id === 'sanctuary' ? '#f5d0fe' : map.id === 'lagoon' ? '#ccfbf1' : '#bae6fd';
  const crestNight =
    map.id === 'abyss' ? '#fb923c' :
    map.id === 'sanctuary' ? '#5eead4' :
    map.id === 'lagoon' ? '#2dd4bf' :
    map.id === 'fjord' ? '#6ee7b7' :
    '#60a5fa';
  const meniscusDay = map.id === 'abyss' ? '#ea580c' : map.id === 'sanctuary' ? '#2dd4bf' : map.id === 'lagoon' ? '#5eead4' : '#56c2db';
  const subDay = map.id === 'abyss' ? '#7c2d12' : map.id === 'lagoon' ? '#14b8a6' : '#2b88a8';
  const foamCol =
    map.id === 'lagoon' && pal.night > 0.35
      ? lerpColor('#f8fafc', '#67e8f9', pal.night)
      : map.id === 'sanctuary' && pal.night > 0.35
        ? lerpColor('#f8fafc', '#f5d0fe', pal.night)
        : lerpColor('#f8fafc', '#93c5fd', pal.night);

  const crestCol = lerpColor(crestDay, crestNight, pal.night);
  const menCol = lerpColor(meniscusDay, map.id === 'lagoon' ? '#0d9488' : '#2e5782', pal.night);
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

    // Moving whitecap / bioluminescent glints on wave peaks!
    if (w1 + w2 > 0.90 && ((x + Math.floor(g.time * 6)) % 5 === 0)) {
      ctx.fillStyle = foamCol;
      ctx.fillRect(x, y0, 2, 1);
      // Extra electric-aqua bioluminescent glow crest in Coral Lagoon at night!
      if (map.id === 'lagoon' && pal.night > 0.35) {
        ctx.fillStyle = '#a7f3d0';
        ctx.fillRect(x, y0 + 1, 1, 1);
      }
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
    const t = clamp(g.landingT || 0, 0, 1);
    if (t < 0.40) {
      // Taut loaded fishing line pulling the fish's mouth straight out of the water!
      drawPixelLine(ctx, rod.tipX, rod.tipY, g.hookX, g.hookY, '#f1f5f9');
    } else if (t < 0.58) {
      // Line smoothly goes slack into a natural catenary droop and fades cleanly before the trophy turn
      const p = (t - 0.40) / 0.18;
      const mx = (rod.tipX + g.hookX) * 0.5;
      const my = (rod.tipY + g.hookY) * 0.5 + 3 + p * 8;
      ctx.save();
      ctx.globalAlpha = clamp(1 - p * 0.92, 0.08, 1);
      drawPixelQuad(ctx, rod.tipX, rod.tipY, mx, my, g.hookX, g.hookY, '#cbd5e1', 12);
      ctx.restore();
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

  // Glowing pulsing fireflies in Harbor & Lagoon at night (with delicate 1px cross halo!)
  if ((map.id === 'harbor' || map.id === 'lagoon') && pal.night > 0.25 && g.fireflies) {
    for (const ff of g.fireflies) {
      const pulse = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(g.time * 4.2 + ff.phase));
      ctx.save();
      const fx = Math.round(ff.x + Math.sin(g.time * 1.4 + ff.phase) * 5.5);
      const fy = Math.round(ff.y + Math.cos(g.time * 1.9 + ff.phase) * 3.2);
      const coreCol = map.id === 'lagoon' ? '#a7f3d0' : '#fef08a';
      const haloCol = map.id === 'lagoon' ? '#2dd4bf' : '#facc15';
      if (pulse > 0.55) {
        ctx.globalAlpha = pal.night * pulse * 0.35;
        ctx.fillStyle = haloCol;
        ctx.fillRect(fx - 1, fy, 3, 1);
        ctx.fillRect(fx, fy - 1, 1, 3);
      }
      ctx.globalAlpha = pal.night * pulse;
      ctx.fillStyle = coreCol;
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
    for (const f of g.floats) {
      ctx.save();
      ctx.globalAlpha = clamp(f.life / f.maxLife, 0, 1);
      const fx = Math.round(clamp(f.x, 38, g.vw - 38));
      const fy = Math.round(f.y);
      drawPixelText(ctx, f.text, fx, fy, f.color, '#090f1d', 1, 'center');
      ctx.restore();
    }
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

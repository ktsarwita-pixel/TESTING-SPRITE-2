// Crisp 2D pixel-art side-POV renderer (sky, pier, underwater cross-section, fish, angler, rod & FX).

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

// Draw crisp 1px pixel line (Bresenham) on virtual canvas
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

const SKY_KEYS = [
  { t: 0.00, sky: ['#0c1226', '#162040', '#1f2d59', '#2b3e6e'], water: ['#153252', '#0f2440', '#091529'], night: 1.0 },
  { t: 0.18, sky: ['#1f274d', '#5c3c6b', '#c7646c', '#f2a663'], water: ['#2b5670', '#1d3b57', '#102138'], night: 0.45 },
  { t: 0.28, sky: ['#3876bf', '#569cd6', '#86c5e8', '#cdebf7'], water: ['#2d899e', '#1e5d80', '#113054'], night: 0.0 },
  { t: 0.58, sky: ['#2e6eb8', '#4d96d6', '#7ec4eb', '#bfe6f7'], water: ['#28879c', '#1c5a7d', '#102e52'], night: 0.0 },
  { t: 0.74, sky: ['#2c3566', '#7d446e', '#db6e5c', '#f7b267'], water: ['#2e5d73', '#1d3c59', '#102138'], night: 0.35 },
  { t: 0.85, sky: ['#121833', '#222b54', '#383d6b', '#524975'], water: ['#183757', '#102745', '#09172b'], night: 0.85 },
  { t: 1.00, sky: ['#0c1226', '#162040', '#1f2d59', '#2b3e6e'], water: ['#153252', '#0f2440', '#091529'], night: 1.0 },
];

export function sampleSkyPalette(timeOfDay) {
  const t = ((timeOfDay % 1) + 1) % 1;
  let a = SKY_KEYS[0], b = SKY_KEYS[1];
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    if (t >= SKY_KEYS[i].t && t <= SKY_KEYS[i + 1].t) {
      a = SKY_KEYS[i];
      b = SKY_KEYS[i + 1];
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

export function renderGameWorld(g, ctx) {
  ctx.imageSmoothingEnabled = false;
  ctx.save();

  if (g.shakeTime > 0) {
    ctx.translate(Math.round(rand(-g.shakeMag, g.shakeMag)), Math.round(rand(-g.shakeMag, g.shakeMag)));
  }

  const pal = sampleSkyPalette(g.timeOfDay);

  renderSky(g, ctx, pal);
  renderHorizon(g, ctx, pal);
  renderUnderwaterBg(g, ctx, pal);
  renderPierBack(g, ctx, pal);
  renderFishes(g, ctx, pal);
  renderLineAndHook(g, ctx);
  renderWaterSurface(g, ctx, pal);
  renderPierFront(g, ctx);
  renderAnglerAndRod(g, ctx);
  renderEffects(g, ctx);
  renderInWorldMeters(g, ctx);

  ctx.restore();
}

function renderSky(g, ctx, pal) {
  const skyH = g.waterY;
  const bandH = Math.ceil(skyH / 4);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = pal.sky[i];
    ctx.fillRect(0, i * bandH, g.vw, bandH + 1);
  }

  // Twinkling pixel stars
  if (pal.night > 0.15) {
    for (const s of g.stars) {
      const twinkle = 0.55 + 0.45 * Math.sin(g.time * 2.8 + s.phase);
      if (twinkle * pal.night < 0.25) continue;
      ctx.fillStyle = s.bright ? '#fef9c3' : '#cbd5e1';
      ctx.globalAlpha = clamp(twinkle * pal.night, 0, 1);
      ctx.fillRect(Math.round(s.x * g.vw), Math.round(s.y * (skyH - 12)), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  // Pixel sun & crescent moon framed over the open water
  const sunAngle = (g.timeOfDay - 0.18) * Math.PI * 2;
  const oceanMidX = g.pierEndX + (g.vw - g.pierEndX) * 0.52;
  const orbitR = (g.vw - g.pierEndX) * 0.34;
  const sunX = Math.round(oceanMidX + Math.cos(sunAngle - Math.PI) * orbitR);
  const sunY = Math.round(skyH - 8 - Math.sin(sunAngle) * (skyH * 0.70));
  if (sunY < skyH + 4 && Math.sin(sunAngle) > -0.1) {
    ctx.fillStyle = '#fde047';
    ctx.fillRect(sunX - 4, sunY - 3, 9, 7);
    ctx.fillRect(sunX - 3, sunY - 4, 7, 9);
    ctx.fillStyle = '#fef9c3';
    ctx.fillRect(sunX - 2, sunY - 2, 5, 5);
  }

  const moonAngle = sunAngle + Math.PI;
  const moonX = Math.round(oceanMidX + Math.cos(moonAngle - Math.PI) * orbitR);
  const moonY = Math.round(skyH - 8 - Math.sin(moonAngle) * (skyH * 0.70));
  if (moonY < skyH + 4 && pal.night > 0.1 && Math.sin(moonAngle) > -0.1) {
    const moonBand = clamp(Math.floor(moonY / Math.max(1, bandH)), 0, 3);
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(moonX - 3, moonY - 2, 6, 5);
    ctx.fillRect(moonX - 2, moonY - 3, 4, 7);
    ctx.fillStyle = pal.sky[moonBand];
    ctx.fillRect(moonX, moonY - 2, 3, 4);
  }

  // Drifting pixel clouds
  ctx.globalAlpha = pal.night > 0.6 ? 0.35 : 0.88;
  for (const c of g.clouds) {
    ctx.drawImage(g.sprites.props[c.sprite], Math.round(c.x), Math.round(c.y));
  }
  ctx.globalAlpha = 1;

  // Seabirds during daytime
  if (pal.night < 0.6) {
    ctx.fillStyle = '#1e293b';
    for (const b of g.birds) {
      const bx = Math.round(b.x);
      const by = Math.round(b.y);
      const flap = Math.sin(g.time * 8 + b.phase) > 0;
      ctx.fillRect(bx, by, 1, 1);
      ctx.fillRect(bx - 1, by - (flap ? 1 : 0), 1, 1);
      ctx.fillRect(bx - 2, by - (flap ? 1 : -1), 1, 1);
      ctx.fillRect(bx + 1, by - (flap ? 1 : 0), 1, 1);
      ctx.fillRect(bx + 2, by - (flap ? 1 : -1), 1, 1);
    }
  }
}

function renderHorizon(g, ctx, pal) {
  const wy = g.waterY;
  ctx.fillStyle = lerpColor('#4b7396', '#1b2644', pal.night);
  for (let x = 0; x < g.vw; x += 2) {
    const mh = Math.max(2, Math.round(6 + Math.sin(x * 0.032 + 0.8) * 5 + Math.cos(x * 0.07) * 3));
    ctx.fillRect(x, wy - mh, 2, mh);
  }

  const isleX = g.vw - (g.isPortrait ? 34 : 58);
  ctx.fillStyle = lerpColor('#35566e', '#141e36', pal.night);
  ctx.fillRect(isleX - 10, wy - 3, 28, 3);
  ctx.fillRect(isleX - 6, wy - 5, 20, 2);

  const lh = g.sprites.props.lighthouse;
  ctx.drawImage(lh, isleX, wy - 5 - lh.height);

  if (pal.night > 0.25) {
    const sweep = Math.sin(g.time * 1.4);
    if (sweep > -0.2) {
      ctx.save();
      ctx.globalAlpha = pal.night * 0.22 * (sweep + 0.2);
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.moveTo(isleX + 5, wy - 5 - lh.height + 2);
      ctx.lineTo(isleX - 42, wy - 5 - lh.height - 8);
      ctx.lineTo(isleX - 42, wy - 5 - lh.height + 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}

function renderUnderwaterBg(g, ctx, pal) {
  const wy = g.waterY;
  const h = g.vh - wy;
  const b1 = Math.round(h * 0.34);
  const b2 = Math.round(h * 0.68);

  ctx.fillStyle = pal.water[0];
  ctx.fillRect(0, wy, g.vw, b1 + 1);
  ctx.fillStyle = pal.water[1];
  ctx.fillRect(0, wy + b1, g.vw, b2 - b1 + 1);
  ctx.fillStyle = pal.water[2];
  ctx.fillRect(0, wy + b2, g.vw, h - b2 + 1);

  ctx.fillStyle = pal.water[1];
  for (let x = 0; x < g.vw; x += 2) ctx.fillRect(x, wy + b1 - 1, 1, 1);
  ctx.fillStyle = pal.water[2];
  for (let x = 1; x < g.vw; x += 2) ctx.fillRect(x, wy + b2 - 1, 1, 1);

  // Shimmering daytime god rays
  if (pal.night < 0.75) {
    ctx.save();
    ctx.globalAlpha = (1 - pal.night) * 0.09;
    ctx.fillStyle = '#bae6fd';
    for (let i = 0; i < 4; i++) {
      const rx = Math.round(g.pierEndX + 18 + i * ((g.vw - g.pierEndX) / 4) + Math.sin(g.time * 0.5 + i) * 6);
      const rayH = Math.round(h * 0.72);
      for (let dy = 0; dy < rayH; dy += 2) {
        const shift = Math.round(dy * 0.25);
        const w = Math.max(2, Math.round(8 - dy * 0.03));
        ctx.fillRect(rx + shift, wy + dy, w, 2);
      }
    }
    ctx.restore();
  }

  // Sunken anchor & chest on seabed
  const anchorX = Math.round(g.pierEndX + (g.vw - g.pierEndX) * 0.32);
  ctx.globalAlpha = 0.55;
  ctx.drawImage(g.sprites.props.anchor, anchorX, g.getSeabedY(anchorX) - 9);
  if (g.vw > 210) {
    const chestX = Math.round(g.pierEndX + (g.vw - g.pierEndX) * 0.76);
    ctx.drawImage(g.sprites.props.chest, chestX, g.getSeabedY(chestX) - 6);
  }
  ctx.globalAlpha = 1;

  // Swaying pixel kelp
  for (const k of g.kelp) {
    const base = g.getSeabedY(k.x);
    ctx.fillStyle = k.color;
    for (let seg = 0; seg < k.height; seg++) {
      const sway = Math.round(Math.sin(g.time * 2.2 + k.phase + seg * 0.35) * (seg / 6));
      ctx.fillRect(k.x + sway, base - seg, 2, 1);
    }
  }

  // Layered pixel seabed & pebbles
  for (let x = 0; x < g.vw; x++) {
    const sy = g.getSeabedY(x);
    ctx.fillStyle = '#a3875c';
    ctx.fillRect(x, sy, 1, 2);
    ctx.fillStyle = '#7d6342';
    ctx.fillRect(x, sy + 2, 1, 4);
    ctx.fillStyle = '#54412c';
    ctx.fillRect(x, sy + 6, 1, g.vh - (sy + 6));
  }
  for (const p of g.pebbles) {
    if (p.x >= g.vw) continue;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, g.getSeabedY(p.x) + p.dy, p.w, 1);
  }

  // Bubbles
  ctx.fillStyle = '#bae6fd';
  for (const b of g.bubbles) {
    ctx.fillRect(Math.round(b.x), Math.round(b.y), 1, 1);
  }
}

function renderPierBack(g, ctx, pal) {
  const pilings = [];
  for (let px = 10; px <= g.pierEndX - 6; px += 22) pilings.push(px);
  if (pilings[pilings.length - 1] < g.pierEndX - 10) pilings.push(g.pierEndX - 7);

  for (const px of pilings) {
    const bottom = g.getSeabedY(px) + 2;
    ctx.fillStyle = '#59361c';
    ctx.fillRect(px, g.pierY + 2, 5, g.waterY - g.pierY - 2);
    ctx.fillStyle = '#7a4d29';
    ctx.fillRect(px + 1, g.pierY + 2, 2, g.waterY - g.pierY - 2);
    ctx.fillStyle = '#29323d';
    ctx.fillRect(px, g.waterY, 5, bottom - g.waterY);
    ctx.fillStyle = '#384654';
    ctx.fillRect(px + 1, g.waterY, 2, bottom - g.waterY);
    ctx.fillStyle = '#2e6f56';
    ctx.fillRect(px, g.waterY + 1, 5, 3);
  }

  // Pier lantern post
  const postX = Math.max(8, g.pierEndX - 38);
  const postTop = g.pierY - 24;
  ctx.fillStyle = '#4a2b16';
  ctx.fillRect(postX, postTop, 2, 24);
  ctx.fillRect(postX, postTop, 9, 2);

  const isLit = pal.night > 0.25;
  const lx = postX + 5;
  const ly = postTop + 2;
  if (isLit) {
    ctx.save();
    const pulse = 0.22 + 0.06 * Math.sin(g.time * 5);
    ctx.globalAlpha = pal.night * pulse;
    ctx.fillStyle = '#facc15';
    ctx.fillRect(lx - 4, ly - 3, 15, 13);
    ctx.globalAlpha = pal.night * pulse * 0.55;
    ctx.fillRect(lx - 9, ly - 7, 25, 21);
    ctx.restore();
  }
  ctx.drawImage(g.sprites.props[isLit ? 'lanternLit' : 'lanternDim'], lx, ly);
}

function renderPierFront(g, ctx) {
  ctx.fillStyle = '#3b2211';
  ctx.fillRect(0, g.pierY, g.pierEndX + 2, 5);
  ctx.fillStyle = '#9c6633';
  ctx.fillRect(0, g.pierY, g.pierEndX + 1, 2);
  ctx.fillStyle = '#784b24';
  ctx.fillRect(0, g.pierY + 2, g.pierEndX + 1, 2);
  ctx.fillStyle = '#3b2211';
  for (let x = 6; x < g.pierEndX; x += 7) ctx.fillRect(x, g.pierY, 1, 4);

  const bucketX = Math.max(2, g.pierEndX - 50);
  if (bucketX > 2) ctx.drawImage(g.sprites.props.bucket, bucketX, g.pierY - 9);
  const boxX = Math.max(12, g.pierEndX - 31);
  ctx.drawImage(g.sprites.props.tacklebox, boxX, g.pierY - 7);
}

function renderFishes(g, ctx, pal) {
  for (const f of g.fishes) {
    const sprSet = g.sprites.fish[f.species.id];
    const animSpeed = f.ai === 'HOOKED' && g.fishThrashing ? 16 : 5.5;
    const frame = Math.floor(g.time * animSpeed + f.phase) % 2;
    const img = f.dir >= 0 ? sprSet.right[frame] : sprSet.left[frame];
    const dx = Math.round(f.x - sprSet.w / 2);
    const dy = Math.round(f.y - sprSet.h / 2);

    const depthRatio = clamp((f.y - g.waterY) / Math.max(1, g.vh - g.waterY), 0, 1);
    ctx.save();
    if (f.ai !== 'HOOKED' && g.state !== 'LANDING') {
      ctx.globalAlpha = clamp(0.95 - depthRatio * 0.25 - pal.night * 0.12, 0.55, 0.96);
    }
    ctx.drawImage(img, dx, dy);

    if (f.species.id === 'angler') {
      ctx.globalAlpha = 0.35 + 0.2 * Math.sin(g.time * 6);
      ctx.fillStyle = '#fef08a';
      const lx = f.dir >= 0 ? dx + sprSet.w - 4 : dx + 1;
      ctx.fillRect(lx, dy + 1, 3, 3);
    }

    if (f.ai === 'HOOKED' && g.state === 'REELING' && g.fishThrashing) {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#f87171';
      const rx = Math.round(f.x);
      const ry = Math.round(f.y);
      const r = 8 + (Math.floor(g.time * 18) % 4);
      ctx.fillRect(rx - r, ry - 1, 2, 2);
      ctx.fillRect(rx + r - 1, ry - 1, 2, 2);
    }
    ctx.restore();
  }
}

function renderWaterSurface(g, ctx, pal) {
  const wy = g.waterY;
  for (let x = 0; x < g.vw; x++) {
    const wave = Math.round(Math.sin(x * 0.12 + g.time * 2.8) * 1.1);
    ctx.fillStyle = lerpColor('#7dd3fc', '#335c85', pal.night);
    ctx.fillRect(x, wy + wave, 1, 1);
    if ((x + Math.floor(g.time * 6)) % 7 === 0) {
      ctx.fillStyle = lerpColor('#e0f7ff', '#6488b0', pal.night);
      ctx.fillRect(x, wy + wave, 2, 1);
    }
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
    ctx.restore();
  }

  if (g.state === 'CASTING' || g.state === 'WAITING' || g.state === 'BITE' || g.state === 'REELING') {
    ctx.drawImage(g.sprites.props.bobber, Math.round(g.bobberX - 2), Math.round(g.bobberY - 3));
  }
}

function renderLineAndHook(g, ctx) {
  if (g.state === 'IDLE' || g.state === 'CHARGING' || g.state === 'CAUGHT') return;
  const rod = g.getRodTipPos();

  const lineColor = g.state === 'REELING' && g.tension > 0.78 ? '#fca5a5' : '#e2e8f0';
  if (g.state === 'WAITING') {
    const midX = (rod.tipX + g.bobberX) * 0.5;
    const midY = Math.max(rod.tipY, g.bobberY) + 5;
    drawPixelQuad(ctx, rod.tipX, rod.tipY, midX, midY, g.bobberX, g.bobberY - 2, lineColor, 14);
  } else if (g.state === 'LANDING') {
    drawPixelLine(ctx, rod.tipX, rod.tipY, g.hookX, g.hookY, lineColor);
    return;
  } else {
    drawPixelLine(ctx, rod.tipX, rod.tipY, g.bobberX, g.bobberY - 2, lineColor);
  }

  if (g.state === 'WAITING' || g.state === 'BITE' || g.state === 'REELING') {
    drawPixelLine(ctx, g.bobberX, g.bobberY + 2, g.hookX, g.hookY, 'rgba(226,232,240,0.75)');
    const hx = Math.round(g.hookX);
    const hy = Math.round(g.hookY);
    const lureColors = ['#fde68a', '#f87171', '#e2e8f0', '#5eead4', '#facc15'];
    const baitColor = lureColors[(g.save.upgrades.lure - 1) % lureColors.length];
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(hx, hy, 1, 3);
    ctx.fillRect(hx - 1, hy + 2, 2, 1);
    ctx.fillStyle = baitColor;
    ctx.fillRect(hx - 1, hy + 1, 2, 2);
  }
}

function renderAnglerAndRod(g, ctx) {
  const pose = g.getAnglerPose();
  const spr = g.sprites.angler[pose];
  ctx.drawImage(spr.canvas, Math.round(g.anglerX), Math.round(g.anglerY));

  const rodColors = ['#c99755', '#60a5fa', '#cbd5e1', '#2dd4bf', '#facc15'];
  const rodColor = rodColors[(g.save.upgrades.rod - 1) % rodColors.length];
  const rod = g.getRodTipPos();
  drawPixelQuad(ctx, rod.handX, rod.handY, rod.ctrlX, rod.ctrlY, rod.tipX, rod.tipY, '#141824', 12);
  drawPixelQuad(ctx, rod.handX, rod.handY - 1, rod.ctrlX, rod.ctrlY - 1, rod.tipX, rod.tipY - 1, rodColor, 12);

  if (g.state === 'CAUGHT' && g.lastCatchInfo) {
    const fSpr = g.sprites.fish[g.lastCatchInfo.species.id].right[0];
    ctx.drawImage(fSpr, Math.round(g.anglerX + 12 - fSpr.width / 2), Math.round(g.anglerY + 2 - fSpr.height / 2));
  }
}

function renderEffects(g, ctx) {
  for (const p of g.particles) {
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  }

  if (g.state === 'BITE') {
    const bounce = Math.round(Math.abs(Math.sin(g.time * 16)) * 4);
    ctx.drawImage(g.sprites.props.alert, Math.round(g.bobberX - 3), Math.round(g.waterY - 18 - bounce));
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
  const bx = Math.round(g.anglerX - 2);
  const by = Math.round(g.anglerY - 10);
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
  ctx.fillStyle = '#fef08a';
  ctx.fillRect(previewX - 2, g.waterY - 2, 5, 1);
  ctx.fillRect(previewX, g.waterY - 4, 1, 5);
}

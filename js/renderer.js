// Crisp 16-bit 2D pixel-art side-POV renderer with grounded pier, rich animations, and underwater cross-section.

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

const SKY_KEYS = [
  { t: 0.00, sky: ['#0a1024', '#131d3d', '#1d2b57', '#2b3e6e'], water: ['#153252', '#0f2440', '#091529'], night: 1.0 },
  { t: 0.18, sky: ['#1f274d', '#5c3c6b', '#c7646c', '#f2a663'], water: ['#2b5670', '#1d3b57', '#102138'], night: 0.45 },
  { t: 0.28, sky: ['#326eb8', '#5097d6', '#84c5eb', '#cdebf7'], water: ['#2b8ba0', '#1d5d82', '#102e54'], night: 0.0 },
  { t: 0.58, sky: ['#2a6ab5', '#4a94d6', '#7ec4eb', '#bfe6f7'], water: ['#27869c', '#1b5a7d', '#0f2d52'], night: 0.0 },
  { t: 0.74, sky: ['#2c3566', '#7d446e', '#db6e5c', '#f7b267'], water: ['#2e5d73', '#1d3c59', '#102138'], night: 0.35 },
  { t: 0.85, sky: ['#121833', '#222b54', '#383d6b', '#524975'], water: ['#183757', '#102745', '#09172b'], night: 0.85 },
  { t: 1.00, sky: ['#0a1024', '#131d3d', '#1d2b57', '#2b3e6e'], water: ['#153252', '#0f2440', '#091529'], night: 1.0 },
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

  const pal = sampleSkyPalette(g.timeOfDay);
  const cel = getCelestialState(g);

  renderSky(g, ctx, pal, cel);
  renderHorizon(g, ctx, pal);
  renderUnderwaterBg(g, ctx, pal);
  renderPierBack(g, ctx, pal);
  renderFishes(g, ctx, pal);
  renderLineAndHook(g, ctx);
  renderWaterSurface(g, ctx, pal, cel);
  renderPierFront(g, ctx, pal);
  renderAnglerAndRod(g, ctx);
  renderEffects(g, ctx, pal);
  renderInWorldMeters(g, ctx);

  ctx.restore();
}

function renderSky(g, ctx, pal, cel) {
  const skyH = g.waterY;
  const bandH = Math.ceil(skyH / 4);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = pal.sky[i];
    ctx.fillRect(0, i * bandH, g.vw, bandH + 1);
    // Subtle pixel dither transition between sky bands
    if (i > 0) {
      for (let x = i % 2; x < g.vw; x += 2) {
        ctx.fillRect(x, i * bandH - 1, 1, 1);
      }
    }
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

  // Pixel sun with soft halo
  if (cel.sunVisible) {
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(cel.sunX - 6, cel.sunY - 5, 13, 11);
    ctx.fillRect(cel.sunX - 5, cel.sunY - 6, 11, 13);
    ctx.restore();
    ctx.fillStyle = '#facc15';
    ctx.fillRect(cel.sunX - 4, cel.sunY - 3, 9, 7);
    ctx.fillRect(cel.sunX - 3, cel.sunY - 4, 7, 9);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(cel.sunX - 3, cel.sunY - 2, 7, 5);
    ctx.fillStyle = '#fef9c3';
    ctx.fillRect(cel.sunX - 2, cel.sunY - 2, 4, 4);
  }

  // Crescent moon matching its sky band cleanly
  if (cel.moonVisible && pal.night > 0.1) {
    const moonBand = clamp(Math.floor(cel.moonY / Math.max(1, bandH)), 0, 3);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(cel.moonX - 3, cel.moonY - 2, 6, 5);
    ctx.fillRect(cel.moonX - 2, cel.moonY - 3, 4, 7);
    ctx.fillStyle = pal.sky[moonBand];
    ctx.fillRect(cel.moonX, cel.moonY - 2, 3, 4);
  }

  // Multi-tier pixel clouds
  ctx.globalAlpha = pal.night > 0.6 ? 0.32 : 0.92;
  for (const c of g.clouds) {
    const spr = g.sprites.props[c.sprite] || g.sprites.props.cloud0;
    ctx.drawImage(spr, Math.round(c.x), Math.round(c.y));
  }
  ctx.globalAlpha = 1;

  // 3-frame animated pixel seagulls in flight
  if (pal.night < 0.58) {
    const gullFrames = ['gull0', 'gull1', 'gull2', 'gull1'];
    for (const b of g.birds) {
      const fIdx = Math.floor(g.time * 6 + b.phase) % 4;
      const bob = Math.round(Math.sin(g.time * 6 + b.phase) * 1.2);
      ctx.drawImage(g.sprites.props[gullFrames[fIdx]], Math.round(b.x), Math.round(b.y + bob));
    }
  }
}

function renderHorizon(g, ctx, pal) {
  const wy = g.waterY;
  // Far misty headland
  ctx.fillStyle = lerpColor('#5d84a6', '#212e52', pal.night);
  for (let x = 0; x < g.vw; x += 2) {
    const mh = Math.max(2, Math.round(9 + Math.sin(x * 0.025 + 1.9) * 6 + Math.cos(x * 0.06) * 3));
    ctx.fillRect(x, wy - mh, 2, mh);
  }
  // Closer coastal mountain ridge
  ctx.fillStyle = lerpColor('#3f6587', '#16213d', pal.night);
  for (let x = 0; x < g.vw; x += 2) {
    const mh = Math.max(2, Math.round(5 + Math.sin(x * 0.036 + 0.5) * 4 + Math.cos(x * 0.085) * 2));
    ctx.fillRect(x, wy - mh, 2, mh);
  }

  // Lighthouse island on right horizon
  const isleX = g.vw - (g.isPortrait ? 38 : 64);
  ctx.fillStyle = lerpColor('#2d4d63', '#111b30', pal.night);
  ctx.fillRect(isleX - 11, wy - 3, 36, 3);
  ctx.fillRect(isleX - 7, wy - 5, 28, 2);
  ctx.fillRect(isleX - 3, wy - 6, 20, 1);
  // Tiny coastal pines beside lighthouse
  ctx.fillStyle = lerpColor('#225447', '#0f2926', pal.night);
  ctx.fillRect(isleX - 5, wy - 9, 3, 4);
  ctx.fillRect(isleX - 4, wy - 11, 1, 2);
  ctx.fillRect(isleX + 16, wy - 8, 3, 3);
  ctx.fillRect(isleX + 17, wy - 10, 1, 2);

  const lh = g.sprites.props.lighthouse;
  const lhY = wy - 5 - lh.height;
  ctx.drawImage(lh, isleX, lhY);

  // Beacon pulse + sweeping beam at dusk/night
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

  // Dithered depth-zone transitions
  ctx.fillStyle = pal.water[1];
  for (let x = 0; x < g.vw; x += 2) ctx.fillRect(x, wy + b1 - 1, 1, 1);
  ctx.fillStyle = pal.water[2];
  for (let x = 1; x < g.vw; x += 2) ctx.fillRect(x, wy + b2 - 1, 1, 1);

  // Shimmering daytime underwater light shafts
  if (pal.night < 0.75) {
    ctx.save();
    ctx.globalAlpha = (1 - pal.night) * 0.095;
    ctx.fillStyle = '#bae6fd';
    for (let i = 0; i < 4; i++) {
      const rx = Math.round(g.pierEndX + 18 + i * ((g.vw - g.pierEndX) / 4) + Math.sin(g.time * 0.6 + i) * 7);
      const rayH = Math.round(h * 0.74);
      for (let dy = 0; dy < rayH; dy += 2) {
        const shift = Math.round(dy * 0.25);
        const w = Math.max(2, Math.round(9 - dy * 0.032));
        ctx.fillRect(rx + shift, wy + dy, w, 2);
      }
    }
    ctx.restore();
  }

  // Sunken anchor & ornate chest on seabed
  const anchorX = Math.round(g.pierEndX + (g.vw - g.pierEndX) * 0.30);
  ctx.globalAlpha = 0.68;
  ctx.drawImage(g.sprites.props.anchor, anchorX, g.getSeabedY(anchorX) - 12);
  if (g.vw > 210) {
    const chestX = Math.round(g.pierEndX + (g.vw - g.pierEndX) * 0.74);
    ctx.drawImage(g.sprites.props.chest, chestX, g.getSeabedY(chestX) - 7);
  }
  ctx.globalAlpha = 1;

  // Multi-tone animated swaying kelp fronds
  for (const k of g.kelp) {
    const base = g.getSeabedY(k.x);
    for (let seg = 0; seg < k.height; seg++) {
      const sway = Math.round(Math.sin(g.time * 2.4 + k.phase + seg * 0.34) * (seg / 5.5));
      ctx.fillStyle = seg > k.height - 4 ? '#34a889' : k.color;
      ctx.fillRect(k.x + sway, base - seg, 2, 1);
      if (seg > 3 && seg % 4 === 0) {
        ctx.fillStyle = '#155446';
        ctx.fillRect(k.x + sway + (seg % 8 === 0 ? 2 : -1), base - seg, 1, 1);
      }
    }
  }

  // Branching seabed corals
  if (g.corals) {
    for (const c of g.corals) {
      const spr = g.sprites.props[c.sprite];
      ctx.drawImage(spr, c.x, g.getSeabedY(c.x + 4) - spr.height + 1);
    }
  }

  // Layered pixel seabed sand & pebbles
  for (let x = 0; x < g.vw; x++) {
    const sy = g.getSeabedY(x);
    ctx.fillStyle = '#b59769';
    ctx.fillRect(x, sy, 1, 1);
    ctx.fillStyle = '#9c7e52';
    ctx.fillRect(x, sy + 1, 1, 2);
    ctx.fillStyle = '#755c3c';
    ctx.fillRect(x, sy + 3, 1, 4);
    ctx.fillStyle = '#4f3d28';
    ctx.fillRect(x, sy + 7, 1, g.vh - (sy + 7));
  }
  for (const p of g.pebbles) {
    if (p.x >= g.vw) continue;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, g.getSeabedY(p.x) + p.dy, p.w, 1);
  }

  // Rising air bubbles with specular pixel
  for (const b of g.bubbles) {
    const bx = Math.round(b.x);
    const by = Math.round(b.y);
    ctx.fillStyle = '#7dd3fc';
    ctx.fillRect(bx, by, 2, 2);
    ctx.fillStyle = '#eef7ff';
    ctx.fillRect(bx, by, 1, 1);
  }
}

function renderPierBack(g, ctx, pal) {
  const pilings = [];
  for (let px = 8; px <= g.pierEndX - 8; px += 22) pilings.push(px);
  if (pilings[pilings.length - 1] < g.pierEndX - 10) pilings.push(g.pierEndX - 8);

  // Diagonal wooden cross-braces between pilings above water
  for (let i = 0; i < pilings.length - 1; i++) {
    drawPixelLine(ctx, pilings[i] + 4, g.pierY + 4, pilings[i + 1], g.waterY - 2, '#472a14');
    drawPixelLine(ctx, pilings[i] + 4, g.pierY + 5, pilings[i + 1], g.waterY - 1, '#5e381c');
  }

  for (const px of pilings) {
    const bottom = g.getSeabedY(px) + 2;
    // Above-water weathered wood piling
    ctx.fillStyle = '#472914';
    ctx.fillRect(px, g.pierY + 3, 6, g.waterY - g.pierY - 3);
    ctx.fillStyle = '#7d4e29';
    ctx.fillRect(px + 1, g.pierY + 3, 3, g.waterY - g.pierY - 3);
    ctx.fillStyle = '#9c6638';
    ctx.fillRect(px + 1, g.pierY + 3, 1, g.waterY - g.pierY - 3);
    // Deck drop shadow onto piling
    ctx.fillStyle = '#26140a';
    ctx.fillRect(px, g.pierY + 4, 6, 2);

    // Submerged piling with mossy barnacle collar
    ctx.fillStyle = '#232c38';
    ctx.fillRect(px, g.waterY, 6, bottom - g.waterY);
    ctx.fillStyle = '#334252';
    ctx.fillRect(px + 1, g.waterY, 3, bottom - g.waterY);
    ctx.fillStyle = '#2a6f56';
    ctx.fillRect(px, g.waterY + 1, 6, 4);
    ctx.fillStyle = '#3d9973';
    ctx.fillRect(px + 1, g.waterY + 1, 2, 2);
  }

  // Pier lantern timber post
  const postX = Math.max(10, g.pierEndX - 42);
  const postTop = g.pierY - 27;
  ctx.fillStyle = '#381f0f';
  ctx.fillRect(postX, postTop, 3, 27);
  ctx.fillStyle = '#6e4222';
  ctx.fillRect(postX + 1, postTop, 1, 27);
  // Top arm + diagonal knee brace
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
    ctx.fillStyle = '#facc15';
    ctx.fillRect(lx - 4, ly - 3, 17, 14);
    ctx.globalAlpha = pal.night * pulse * 0.45;
    ctx.fillRect(lx - 10, ly - 8, 29, 24);
    ctx.restore();
  }
  ctx.drawImage(g.sprites.props[isLit ? litFrames[swayIdx] : 'lanternDim'], lx, ly);
}

function renderPierFront(g, ctx, pal) {
  // Grounded pier deck with wood grain, side beam & iron nail pixels
  ctx.fillStyle = '#29160a';
  ctx.fillRect(0, g.pierY - 1, g.pierEndX + 3, 6);
  ctx.fillStyle = '#b87a42';
  ctx.fillRect(0, g.pierY, g.pierEndX + 2, 1);
  ctx.fillStyle = '#945d2e';
  ctx.fillRect(0, g.pierY + 1, g.pierEndX + 2, 2);
  ctx.fillStyle = '#633a1b';
  ctx.fillRect(0, g.pierY + 3, g.pierEndX + 2, 2);

  // Plank seams & iron nail glints
  for (let x = 6; x < g.pierEndX + 1; x += 8) {
    ctx.fillStyle = '#331c0d';
    ctx.fillRect(x, g.pierY, 1, 5);
    ctx.fillStyle = '#475569';
    ctx.fillRect(x - 2, g.pierY + 1, 1, 1);
  }

  // Mooring bollard + perched seagull on far left (landscape / wide pier)
  if (g.pierEndX >= 68) {
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
  const bucketX = g.pierEndX >= 68 ? Math.max(16, g.pierEndX - 55) : 3;
  ctx.fillStyle = '#331c0d';
  ctx.fillRect(bucketX + 1, g.pierY, bucket.width - 2, 1);
  ctx.drawImage(bucket, bucketX, g.pierY - bucket.height + 1);

  // Red tackle box grounded cleanly on pierY
  const box = g.sprites.props.tacklebox;
  const boxX = Math.max(15, g.pierEndX - 34);
  ctx.fillStyle = '#331c0d';
  ctx.fillRect(boxX + 1, g.pierY, box.width - 2, 1);
  ctx.drawImage(box, boxX, g.pierY - box.height + 1);
}

function renderFishes(g, ctx, pal) {
  for (const f of g.fishes) {
    const sprSet = g.sprites.fish[f.species.id];
    const animSpeed =
      f.ai === 'HOOKED' && g.fishThrashing ? 18 :
      f.ai === 'FLEE' ? 14 :
      f.ai === 'APPROACH' ? 10 :
      6.2;
    const frameCount = sprSet.right.length;
    const frame = Math.floor(g.time * animSpeed + f.phase * 2) % frameCount;
    const img = f.dir >= 0 ? sprSet.right[frame] : sprSet.left[frame];
    const dx = Math.round(f.x - sprSet.w / 2);
    const dy = Math.round(f.y - sprSet.h / 2);

    const depthRatio = clamp((f.y - g.waterY) / Math.max(1, g.vh - g.waterY), 0, 1);
    ctx.save();
    if (f.ai !== 'HOOKED' && g.state !== 'LANDING') {
      ctx.globalAlpha = clamp(0.97 - depthRatio * 0.22 - pal.night * 0.12, 0.58, 0.98);
    }
    ctx.drawImage(img, dx, dy);

    // Deep Angler glowing bioluminescent bulb synced to 4-frame stalk sway
    if (f.species.id === 'angler') {
      const glow = 0.35 + 0.28 * Math.sin(g.time * 6 + f.phase);
      ctx.globalAlpha = glow;
      ctx.fillStyle = '#fef08a';
      const lx = f.dir >= 0 ? dx + sprSet.w - 6 : dx + 2;
      ctx.fillRect(lx, dy + 1, 4, 4);
    }

    // Thrashing surge rings around hooked fish
    if (f.ai === 'HOOKED' && g.state === 'REELING' && g.fishThrashing) {
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = '#f87171';
      const rx = Math.round(f.x);
      const ry = Math.round(f.y);
      const r = 9 + (Math.floor(g.time * 20) % 5);
      ctx.fillRect(rx - r, ry - 2, 2, 3);
      ctx.fillRect(rx + r - 1, ry - 2, 2, 3);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(rx - r + 2, ry - 5, 2, 1);
      ctx.fillRect(rx + r - 3, ry + 4, 2, 1);
    }
    ctx.restore();
  }
}

function renderWaterSurface(g, ctx, pal, cel) {
  const wy = g.waterY;

  // Animated shimmering reflection column directly beneath sun or moon
  const refX = cel.sunVisible ? cel.sunX : cel.moonVisible ? cel.moonX : null;
  if (refX !== null) {
    ctx.save();
    const refColor = cel.sunVisible ? '#fef08a' : '#e2e8f0';
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

  // Layered animated wave surface
  for (let x = 0; x < g.vw; x++) {
    const wave = Math.round(Math.sin(x * 0.12 + g.time * 3.0) * 1.15);
    ctx.fillStyle = lerpColor('#7dd3fc', '#335c85', pal.night);
    ctx.fillRect(x, wy + wave, 1, 1);
    ctx.fillStyle = lerpColor('#3ca3b8', '#22456b', pal.night);
    ctx.fillRect(x, wy + wave + 1, 1, 1);
    if ((x + Math.floor(g.time * 7)) % 9 === 0) {
      ctx.fillStyle = lerpColor('#eef7ff', '#6b91ba', pal.night);
      ctx.fillRect(x, wy + wave, 2, 1);
    }
  }

  // Lapping foam around pier pilings
  const foamShift = Math.floor(g.time * 3) % 2;
  ctx.fillStyle = lerpColor('#e0f7ff', '#6488b0', pal.night);
  for (let px = 8; px <= g.pierEndX - 8; px += 22) {
    ctx.fillRect(px - 1 - foamShift, wy, 2, 1);
    ctx.fillRect(px + 5 + foamShift, wy, 2, 1);
  }

  // Expanding surface ripples
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

  // 2-frame bobbing bobber float
  if (g.state === 'CASTING' || g.state === 'WAITING' || g.state === 'BITE' || g.state === 'REELING') {
    const tilt = Math.sin(g.time * 4.5) > 0.35 || g.state === 'BITE' || g.state === 'REELING';
    const bob = g.sprites.props[tilt ? 'bobber1' : 'bobber0'];
    ctx.drawImage(bob, Math.round(g.bobberX - 3), Math.round(g.bobberY - 4));
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

  // Underwater line + animated lure matching upgrade level
  if (g.state === 'WAITING' || g.state === 'BITE' || g.state === 'REELING') {
    drawPixelLine(ctx, g.bobberX, g.bobberY + 2, g.hookX, g.hookY, 'rgba(226,232,240,0.72)');
    const hx = Math.round(g.hookX);
    const hy = Math.round(g.hookY);
    const lureLv = g.save.upgrades.lure || 1;
    // Steel J-hook
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(hx, hy, 1, 4);
    ctx.fillRect(hx - 2, hy + 3, 3, 1);
    ctx.fillRect(hx - 2, hy + 2, 1, 1);

    const wiggle = Math.round(Math.sin(g.time * 8));
    if (lureLv === 1) {
      // Bread crumb
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(hx - 1, hy + 1, 2, 2);
    } else if (lureLv === 2) {
      // Wriggling pink earthworm
      ctx.fillStyle = '#fb7185';
      ctx.fillRect(hx - 1, hy + 1, 2, 2);
      ctx.fillRect(hx + wiggle, hy + 3, 1, 2);
    } else if (lureLv === 3) {
      // Flashing silver spinner
      ctx.fillStyle = Math.floor(g.time * 10) % 2 ? '#ffffff' : '#94a3b8';
      ctx.fillRect(hx - 1, hy + 1, 3, 2);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(hx, hy + 3, 1, 1);
    } else if (lureLv === 4) {
      // Glowing cyan deep jig
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
      // Shimmering Golden Feather lure
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
  const pose = g.getAnglerPose();
  const spr = g.sprites.angler[pose] || g.sprites.angler.idle0;
  // Strictly ground boots onto g.pierY regardless of pose!
  const drawX = Math.round(g.anglerX);
  const drawY = Math.round(g.pierY - spr.h + 1);

  // Grounded plank contact shadow directly under the angler's boots
  ctx.fillStyle = '#29160a';
  ctx.fillRect(drawX + 3, g.pierY, 13, 1);
  ctx.fillStyle = '#3d2210';
  ctx.fillRect(drawX + 4, g.pierY + 1, 11, 1);

  ctx.drawImage(spr.canvas, drawX, drawY);

  // Detailed fishing rod (cork handle + spinning reel + outlined bending blank + metallic guide rings)
  const rodColors = ['#c99755', '#60a5fa', '#cbd5e1', '#2dd4bf', '#facc15'];
  const rodColor = rodColors[(g.save.upgrades.rod - 1) % rodColors.length];
  const rod = g.getRodTipPos();

  // Cork handle behind hand
  const dirX = rod.tipX >= rod.handX ? 1 : -1;
  ctx.fillStyle = '#111622';
  ctx.fillRect(Math.round(rod.handX - dirX * 3), Math.round(rod.handY + 1), 3, 2);
  ctx.fillStyle = '#b87a42';
  ctx.fillRect(Math.round(rod.handX - dirX * 2), Math.round(rod.handY + 1), 2, 1);

  // Rod blank (dark shadow + colored top edge)
  drawPixelQuad(ctx, rod.handX, rod.handY, rod.ctrlX, rod.ctrlY, rod.tipX, rod.tipY, '#111622', 14);
  drawPixelQuad(ctx, rod.handX, rod.handY - 1, rod.ctrlX, rod.ctrlY - 1, rod.tipX, rod.tipY - 1, rodColor, 14);

  // Spinning reel drum right under the rod grip
  ctx.fillStyle = '#111622';
  ctx.fillRect(Math.round(rod.handX + dirX * 2), Math.round(rod.handY + 1), 3, 3);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(Math.round(rod.handX + dirX * 2 + 1), Math.round(rod.handY + 2), 1, 1);

  // Hold up caught fish cleanly in the celebratory hands!
  if (g.state === 'CAUGHT' && g.lastCatchInfo) {
    const fSpr = g.sprites.fish[g.lastCatchInfo.species.id].right[Math.floor(g.time * 8) % 4];
    const bob = Math.round(Math.sin(g.time * 7) * 1.2);
    ctx.drawImage(
      fSpr,
      Math.round(drawX + spr.hand[0] - fSpr.width / 2),
      Math.round(drawY + spr.hand[1] - fSpr.height / 2 + bob)
    );
  }
}

function renderEffects(g, ctx, pal) {
  // Drifting golden fireflies near pier at twilight/night
  if (pal.night > 0.35 && g.fireflies) {
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

  // Particles (splashes, sparkles, sweat droplets)
  for (const p of g.particles) {
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  }

  // 2-frame animated pulsing "!" alert over bobber on BITE
  if (g.state === 'BITE') {
    const bounce = Math.round(Math.abs(Math.sin(g.time * 18)) * 4);
    const alertSpr = g.sprites.props[Math.floor(g.time * 12) % 2 === 0 ? 'alert0' : 'alert1'];
    ctx.drawImage(alertSpr, Math.round(g.bobberX - 4), Math.round(g.waterY - 20 - bounce));
  }

  // Floating pixel text popups
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
  // Animated target crosshair on water surface
  const pulse = Math.floor(g.time * 10) % 2;
  ctx.fillStyle = '#fef08a';
  ctx.fillRect(previewX - 2 - pulse, g.waterY - 2, 5 + pulse * 2, 1);
  ctx.fillRect(previewX, g.waterY - 4 - pulse, 1, 5 + pulse);
}

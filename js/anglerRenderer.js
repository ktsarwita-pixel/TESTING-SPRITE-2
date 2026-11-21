// Sculpted, non-blocky 16-bit/32-bit pixel-art articulated angler renderer.
// Uses tapered selective-outlined ("selout") anatomy, chamfered organic silhouettes,
// 2-bone IK limbs, secondary cloth physics (scarf + hat ribbon), expressive face,
// and seamless 60fps motion across IDLE, CHARGING, CASTING, WAITING/RETRIEVING,
// BITE, REELING, LANDING, and CAUGHT.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);

function px(ctx, x, y, color, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function drawPixelLineLocal(ctx, x0, y0, x1, y1, color) {
  x0 = Math.round(x0); y0 = Math.round(y0);
  x1 = Math.round(x1); y1 = Math.round(y1);
  ctx.fillStyle = color;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let guard = 0;
  while (guard++ < 400) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}

function drawPixelQuadLocal(ctx, x0, y0, cx, cy, x1, y1, color, steps = 16) {
  let lx = x0, ly = y0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const nx = mt * mt * x0 + 2 * mt * t * cx + t * t * x1;
    const ny = mt * mt * y0 + 2 * mt * t * cy + t * t * y1;
    drawPixelLineLocal(ctx, lx, ly, nx, ny, color);
    lx = nx; ly = ny;
  }
}

// Sleek organic selective-outlined limb (NO chunky black 4px bricks!)
// Draws a tapered capsule-like pixel stroke with lit top/left edge and shaded underside.
function drawOrganicLimb(ctx, x0, y0, x1, y1, lightCol, midCol, shadeCol, widthStart = 2.0, widthEnd = 1.6) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.max(1, Math.hypot(dx, dy));
  const steps = Math.ceil(len * 2.2);
  // Unit perpendicular pointing roughly "down/right" for underside shading
  const nx = -dy / len;
  const ny = dx / len;
  const sideSign = ny >= 0 ? 1 : -1;
  const ux = nx * sideSign;
  const uy = ny * sideSign;

  // Pass 1: subtle colored underside shadow rim (selout instead of heavy black box!)
  ctx.fillStyle = shadeCol;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const w = lerp(widthStart, widthEnd, t);
    const cx = lerp(x0, x1, t);
    const cy = lerp(y0, y1, t);
    ctx.fillRect(Math.round(cx + ux * (w * 0.55)), Math.round(cy + uy * (w * 0.55)), 1, 1);
    if (w >= 1.8) {
      ctx.fillRect(Math.round(cx - ux * (w * 0.45)), Math.round(cy - uy * (w * 0.45)), 1, 1);
    }
  }
  // Pass 2: core volume
  ctx.fillStyle = midCol;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const w = lerp(widthStart, widthEnd, t);
    const cx = lerp(x0, x1, t);
    const cy = lerp(y0, y1, t);
    ctx.fillRect(Math.round(cx), Math.round(cy), 1, 1);
    if (w >= 1.7) {
      ctx.fillRect(Math.round(cx + ux * 0.5), Math.round(cy + uy * 0.5), 1, 1);
    }
  }
  // Pass 3: sunlit top/leading edge highlight
  ctx.fillStyle = lightCol;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = lerp(x0, x1, t);
    const cy = lerp(y0, y1, t);
    ctx.fillRect(Math.round(cx - ux * 0.45), Math.round(cy - uy * 0.45), 1, 1);
  }
}

// 2-bone analytical IK for realistic elbow & knee joints
function solve2BoneIK(ax, ay, bx, by, len1, len2, bendSign = 1) {
  const dx = bx - ax;
  const dy = by - ay;
  const d = clamp(Math.hypot(dx, dy), 0.5, len1 + len2 - 0.08);
  const a = (len1 * len1 - len2 * len2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, len1 * len1 - a * a));
  const mx = ax + (a * dx) / d;
  const my = ay + (a * dy) / d;
  return {
    x: mx + (bendSign * h * (-dy)) / d,
    y: my + (bendSign * h * dx) / d,
  };
}

// Compute live physical angler rig coordinates (shared with game.js for exact rod tip & zero-TP fish landing!)
export function computeAnglerRig(g) {
  const footCenterX = g.anglerX + 11;
  const groundY = g.pierY; // exact plank top surface row

  // Natural athletic stance (widens smoothly when bracing/fighting)
  const stanceHalf = lerp(3.4, 5.1, clamp(g.animStance || 0, 0, 1));
  const backFootX = footCenterX - stanceHalf;
  const frontFootX = footCenterX + stanceHalf;

  // Smooth continuous body weight & breathing
  const lean = g.animLean || 0;
  const squat = g.animSquat || 0;
  const breath = Math.sin(g.time * 2.4) * 0.35;

  // Slightly taller, heroic proportions (sleeker, less stubby/blocky!)
  const hipX = footCenterX + lean * 0.45;
  const hipY = groundY - 11.2 + squat * 0.72;

  const shoulderX = hipX + lean * 0.68;
  const shoulderY = hipY - 8.4 + breath * 0.55;

  // Head sits seamlessly on top of the neck & spine (zero floating gap even on full lean-back!)
  const headX = shoulderX + clamp(lean * 0.12, -0.6, 0.8) + 0.35;
  const headY = shoulderY - 4.0;

  const rodAngle = g.rodAngle ?? -0.62;
  const cosA = Math.cos(rodAngle);
  const sinA = Math.sin(rodAngle);

  let gripX, gripY, reelX, reelY;
  if (g.state === 'CAUGHT' || g.state === 'LANDING') {
    // Stage 1 (landingT 0..0.55): hand reaches cleanly forward to meet incoming fish
    // Stage 2 (landingT 0.55..1.0): raises the caught fish smoothly overhead -> exact match for CAUGHT!
    const meetX = shoulderX + 8.5;
    const meetY = shoulderY + 0.5;
    const celX = shoulderX + 9.5;
    const celY = headY - 5.5;
    const raise = g.state === 'CAUGHT'
      ? 1
      : g.landingT <= 0.55
        ? 0
        : smoothstep(clamp((g.landingT - 0.55) / 0.45, 0, 1));
    gripX = lerp(meetX, celX, raise);
    gripY = lerp(meetY, celY, raise);
    // Back hand holds the tucked rod cleanly behind shoulder
    reelX = shoulderX - 4.2;
    reelY = hipY - 2.2;
  } else if (g.state === 'CHARGING') {
    const p = smoothstep(clamp(g.chargePower || 0, 0, 1));
    gripX = shoulderX + lerp(5.5, -5.8, p);
    gripY = shoulderY + lerp(1.0, -3.2, p);
    reelX = gripX - cosA * 2.8;
    reelY = gripY - sinA * 2.8 + 0.8;
  } else if (g.state === 'CASTING') {
    const t = smoothstep(clamp((g.castT || 0) * 2.1, 0, 1));
    gripX = shoulderX + lerp(-5.5, 8.0, t);
    gripY = shoulderY + lerp(-3.2, 0.4, t);
    reelX = gripX - cosA * 2.8;
    reelY = gripY - sinA * 2.8 + 0.8;
  } else {
    // Ready / waiting / retrieving / bite / reeling:
    const pullBack = g.state === 'REELING' ? (g.tension || 0) * 1.6 : 0;
    gripX = shoulderX + 6.8 - pullBack;
    gripY = shoulderY + 1.4 - (g.state === 'BITE' ? 1.4 : 0);

    const seatX = gripX - cosA * 2.5;
    const seatY = gripY - sinA * 2.5 + 1.6;

    const isCranking =
      (g.state === 'REELING' && (g.reelHold || g.devAutoLand) && !g.fishThrashing) ||
      (g.state === 'WAITING' && g.retrieving);

    if (isCranking) {
      const crankR = 2.5;
      const ca = g.crankAngle || 0;
      reelX = seatX + Math.cos(ca) * crankR;
      reelY = seatY + Math.sin(ca) * crankR;
    } else if (g.state === 'REELING' && (g.fishThrashing || g.tension > 0.72)) {
      reelX = gripX - cosA * 4.2;
      reelY = gripY - sinA * 4.2 + 0.4;
    } else {
      reelX = seatX + 0.8;
      reelY = seatY + 1.2;
    }
  }

  // Rod butt/tip anchored to gripping hand; smoothly tucks behind left shoulder during LANDING -> CAUGHT
  const rodLen = 28 + ((g.save && g.save.upgrades && g.save.upgrades.rod ? g.save.upgrades.rod : 1) - 1) * 2.2;
  const tuck = g.state === 'CAUGHT'
    ? 1
    : g.state === 'LANDING'
      ? smoothstep(clamp((g.landingT - 0.42) / 0.45, 0, 1))
      : 0;
  const rodHandX = lerp(gripX, shoulderX - 4.4, tuck);
  const rodHandY = lerp(gripY, shoulderY + 1.2, tuck);
  const tipBaseX = rodHandX + cosA * rodLen;
  const tipBaseY = rodHandY + sinA * rodLen;
  const bend = (g.rodFlex || 0) * 14.5;
  const tipX = tipBaseX + bend * 0.25;
  const tipY = tipBaseY + bend;
  const ctrlX = lerp(rodHandX, tipX, 0.56);
  const ctrlY = lerp(rodHandY, tipY, 0.56) - 4 + bend * 0.22;

  return {
    groundY,
    backFootX,
    frontFootX,
    hipX,
    hipY,
    shoulderX,
    shoulderY,
    headX,
    headY,
    gripX,
    gripY,
    reelX,
    reelY,
    rodHandX,
    rodHandY,
    ctrlX,
    ctrlY,
    tipX,
    tipY,
    cosA,
    sinA,
  };
}

// Sculpted non-blocky coastal leather boot with rounded toe, heel contour, and warm chestnut sheen
function drawCoastalBoot(ctx, fx, gy, isBack) {
  const bx = Math.round(fx - 2);
  const soleCol = isBack ? '#24140b' : '#2e190d';
  const bodyCol = isBack ? '#6e4021' : '#96592e';
  const sheenCol = isBack ? '#8c5530' : '#c78548';
  const cuffCol = isBack ? '#4e6f9e' : '#7ba0cf';

  // Rolled denim cuff right above boot
  px(ctx, bx + 1, gy - 3, cuffCol, 2, 1);
  // Boot upper & rounded toe cap (no boxy square!)
  px(ctx, bx + 1, gy - 2, bodyCol, 3, 1);
  px(ctx, bx + 2, gy - 2, sheenCol, 1, 1); // sunlit toe ridge
  px(ctx, bx, gy - 1, bodyCol, 5, 1);
  px(ctx, bx + 3, gy - 1, sheenCol, 1, 1); // rounded toe highlight
  // Solid grounded sole sitting flush on pier plank row gy
  px(ctx, bx, gy, soleCol, 5, 1);
}

// Tapered, contoured coastal fisherman torso (open teal vest over cream shirt — ZERO 9x9 square box!)
function drawSculptedTorso(ctx, rig) {
  const sx = rig.shoulderX;
  const sy = rig.shoulderY;
  const hx = rig.hipX;
  const hy = rig.hipY;

  // Interpolate 9 horizontal scan-slices from collar down to belt with natural shoulder->waist->hip taper!
  const rows = [
    // [t, halfL, halfR, kind]
    [0.00, 2.2, 2.2, 'collar'],
    [0.14, 3.2, 2.9, 'chest'],
    [0.28, 3.3, 3.0, 'chest'],
    [0.42, 3.0, 2.8, 'mid'],
    [0.56, 2.6, 2.6, 'waist'],
    [0.70, 2.5, 2.5, 'waist'],
    [0.84, 2.8, 2.7, 'belt'],
    [0.98, 2.9, 2.8, 'hip'],
  ];

  for (const [t, hl, hr, kind] of rows) {
    const cx = lerp(sx, hx, t);
    const cy = Math.round(lerp(sy, hy, t));
    const xL = Math.round(cx - hl);
    const xR = Math.round(cx + hr);
    const w = Math.max(3, xR - xL + 1);

    if (kind === 'collar') {
      // Soft dark teal outline + crimson bandana neck wrap
      px(ctx, xL - 1, cy, '#591620', 1, 1);
      px(ctx, xL, cy, '#d93d46', w, 1);
      px(ctx, xL, cy, '#ff6b6b', Math.min(2, w), 1);
      px(ctx, xR + 1, cy, '#591620', 1, 1);
    } else if (kind === 'belt') {
      px(ctx, xL, cy, '#422312', w, 1);
      px(ctx, xL + 1, cy, '#754120', Math.max(1, w - 2), 1);
      // Warm brass belt buckle on the front
      px(ctx, xR - 2, cy, '#facc15', 1, 1);
    } else if (kind === 'hip') {
      // Top of denim waistband
      px(ctx, xL, cy, '#1c3154', w, 1);
      px(ctx, xL + 1, cy, '#385d94', Math.max(1, w - 2), 1);
    } else {
      // Selective-outlined teal coastal vest over cream henley shirt!
      px(ctx, xL - 1, cy, '#133d3c', 1, 1); // soft back rim
      px(ctx, xL, cy, '#2c8f83', w, 1);     // main teal vest
      px(ctx, xL, cy, '#5bc9b4', 2, 1);     // sunlit back highlight
      // Cream henley shirt visible at front opening!
      if (w >= 5) {
        px(ctx, xR - 2, cy, '#f2ead9', 1, 1);
        px(ctx, xR - 1, cy, '#1e6b66', 1, 1); // front vest lapel
      }
      px(ctx, xR + 1, cy, '#133d3c', 1, 1); // soft front rim
    }
  }
  // Subtle vest pocket highlight on the side
  const pX = Math.round(lerp(sx, hx, 0.56) - 0.5);
  const pY = Math.round(lerp(sy, hy, 0.56));
  px(ctx, pX, pY, '#1a5c58', 2, 1);
}

// Sculpted non-blocky head, layered chestnut hair, expressive face, and curved woven straw hat!
function drawSculptedHeadAndHat(ctx, g, rig) {
  const hx = Math.round(rig.headX);
  const hy = Math.round(rig.headY);

  // Solid warm neck seamlessly bridging chin straight into the crimson bandana collar (ZERO gap!)
  drawPixelLineLocal(ctx, hx - 1, hy + 2, rig.shoulderX - 1, rig.shoulderY, '#b57451');
  drawPixelLineLocal(ctx, hx, hy + 2, rig.shoulderX, rig.shoulderY, '#e0a27b');
  drawPixelLineLocal(ctx, hx + 1, hy + 2, rig.shoulderX + 1, rig.shoulderY, '#f2ba91');

  // Chamfered organic head silhouette (NO flat 7x6 rectangle!)
  // Row hy-2 (forehead), hy-1 (brow/eye), hy (cheek/nose), hy+1 (mouth/jaw), hy+2 (tapered chin)
  px(ctx, hx - 3, hy - 1, '#5e3420', 1, 3); // back hair rim
  px(ctx, hx - 2, hy - 2, '#7d4628', 4, 1); // upper hair under hat
  px(ctx, hx - 2, hy - 1, '#995732', 2, 2); // hair sideburn/lock
  px(ctx, hx - 2, hy + 1, '#7d4628', 1, 1); // nape hair

  // Warm sculpted face profile
  px(ctx, hx, hy - 1, '#f7c8a4', 3, 1);     // brow
  px(ctx, hx - 1, hy, '#f7c8a4', 4, 1);     // cheek + slight nose bridge!
  px(ctx, hx, hy - 1, '#ffe4cc', 1, 1);     // forehead sunlit catchlight
  px(ctx, hx + 3, hy, '#e8a882', 1, 1);     // gentle 1px nose tip!
  px(ctx, hx - 1, hy + 1, '#f2b88f', 3, 1); // lower cheek
  px(ctx, hx, hy + 2, '#d4936a', 2, 1);     // tapered rounded chin (no boxy jaw!)
  // Warm ear pixel
  px(ctx, hx - 1, hy, '#e6a882', 1, 1);

  // Expressive eye + subtle mood (blinking, water-gaze, strain-squint, happy catch smile!)
  const blinking = (g.time % 4.3) > 4.16;
  const straining = g.state === 'REELING' && (g.fishThrashing || (g.tension || 0) > 0.72);
  const happy = g.state === 'CAUGHT' || (g.state === 'LANDING' && g.landingT > 0.55);

  if (blinking || happy) {
    // Happy curved squint-eye or gentle blink
    px(ctx, hx + 1, hy - 1, '#4a2616', 2, 1);
    if (happy) {
      // Warm celebratory smile pixel!
      px(ctx, hx + 1, hy + 1, '#b55b48', 2, 1);
      px(ctx, hx, hy, '#eb9482', 1, 1); // rosy happy cheek
    }
  } else if (straining) {
    // Focused determined furrowed brow!
    px(ctx, hx + 1, hy - 1, '#3b1e11', 2, 1);
    px(ctx, hx + 2, hy, '#1b1d2b', 1, 1);
    px(ctx, hx + 1, hy + 1, '#a85745', 1, 1);
  } else {
    // Bright readable eye tracking toward water/bobber
    const lookDown = (g.state === 'WAITING' || g.state === 'BITE' || g.state === 'REELING');
    px(ctx, hx + 1, hy - 1, '#fffaf5', 1, 1);
    px(ctx, hx + 2, hy - 1 + (lookDown ? 0 : 0), '#1f2336', 1, 1);
    if (lookDown) px(ctx, hx + 1, hy, '#e89b84', 1, 1); // soft cheek blush
  }

  // Curved woven coastal straw sun-hat (domed crown + upturned brim + fluttering red ribbon!)
  const hatTilt = Math.round(clamp((g.animLean || 0) * 0.22, -1, 1));
  const hatX = hx + hatTilt;
  const hatY = hy - 3;

  // Gently curved upturned straw brim (curved ends instead of flat brick!)
  px(ctx, hatX - 6, hatY, '#c98e30', 1, 1);      // upturned left brim tip
  px(ctx, hatX - 5, hatY + 1, '#784c18', 11, 1); // soft underside shadow of brim
  px(ctx, hatX - 5, hatY, '#f2c65e', 10, 1);     // main golden brim
  px(ctx, hatX - 4, hatY, '#fff3b8', 5, 1);      // sunlit straw brim highlight
  px(ctx, hatX + 5, hatY, '#d99e3b', 1, 1);      // upturned right brim tip

  // Crimson ribbon band around hat crown
  px(ctx, hatX - 3, hatY - 1, '#d93d46', 7, 1);
  px(ctx, hatX - 3, hatY - 1, '#ff6b6b', 3, 1);
  px(ctx, hatX + 2, hatY - 1, '#991f2b', 2, 1);

  // Rounded domed straw crown (tapered top row — zero sharp corners!)
  px(ctx, hatX - 3, hatY - 2, '#f2c65e', 7, 1);
  px(ctx, hatX - 3, hatY - 2, '#fff3b8', 3, 1);
  px(ctx, hatX + 2, hatY - 2, '#c98e30', 2, 1);
  px(ctx, hatX - 2, hatY - 3, '#f2c65e', 5, 1);
  px(ctx, hatX - 2, hatY - 3, '#fff6cc', 3, 1);
  px(ctx, hatX - 1, hatY - 4, '#c98e30', 3, 1); // soft woven crown top edge

  // Fluttering crimson hat-band tail streaming in the sea breeze!
  const ribbonWave = Math.sin(g.time * 6.2 + 1.1) * 1.1;
  px(ctx, hatX - 4, hatY - 1, '#b82532', 1, 1);
  px(ctx, hatX - 5, hatY - 1 + Math.round(ribbonWave * 0.5), '#d93d46', 2, 1);
  px(ctx, hatX - 7, hatY + Math.round(ribbonWave), '#ff6b6b', 1, 1);
}

export function renderArticulatedAngler(g, ctx) {
  const rig = computeAnglerRig(g);
  const gy = rig.groundY;

  // 1. Soft grounded contact shadow under both boots on the pier planks
  const minFoot = Math.min(rig.backFootX, rig.frontFootX) - 2;
  const maxFoot = Math.max(rig.backFootX, rig.frontFootX) + 3;
  ctx.save();
  ctx.globalAlpha = 0.42;
  ctx.fillStyle = '#1f1008';
  ctx.fillRect(Math.round(minFoot), gy, Math.round(maxFoot - minFoot), 1);
  ctx.globalAlpha = 0.24;
  ctx.fillRect(Math.round(minFoot + 1), gy + 1, Math.round(maxFoot - minFoot - 2), 1);
  ctx.restore();

  // 2. Back arm (left arm reaching to rod foregrip or lifting caught fish) — rolled sleeve + bare forearm
  const backShoulderX = rig.shoulderX + 1.2;
  const backShoulderY = rig.shoulderY + 0.8;
  const backArmBend = rig.gripX >= backShoulderX ? 1 : -1;
  const backElbow = solve2BoneIK(backShoulderX, backShoulderY, rig.gripX, rig.gripY, 4.9, 4.9, backArmBend);
  // Upper arm (shaded teal sleeve)
  drawOrganicLimb(ctx, backShoulderX, backShoulderY, backElbow.x, backElbow.y, '#339488', '#226f6c', '#133d3c', 2.0, 1.7);
  // Forearm (warm sunlit skin!)
  drawOrganicLimb(ctx, backElbow.x, backElbow.y, rig.gripX, rig.gripY, '#f7c8a4', '#e0a27b', '#8c5335', 1.6, 1.3);

  // 3. Fluttering layered crimson scarf streaming behind the neck
  const w1 = Math.sin(g.time * 5.0) * 1.4;
  const w2 = Math.cos(g.time * 7.8 + 0.8) * 1.2;
  const neckX = rig.shoulderX - 1.5;
  const neckY = rig.shoulderY + 0.2;
  drawOrganicLimb(ctx, neckX, neckY, neckX - 4.2, neckY + 0.8 + w1 * 0.45, '#ff6b6b', '#d93d46', '#7d1924', 1.7, 1.2);
  px(ctx, neckX - 5.5, neckY + 1 + w1 * 0.8, '#d93d46', 2, 1);
  px(ctx, neckX - 7, neckY + 1.2 + w2, '#ff6b6b', 1, 1);

  // 4. Tapered articulated legs (natural denim thighs -> knees -> calves -> cuffed coastal boots!)
  const backKnee = solve2BoneIK(rig.hipX - 1.4, rig.hipY, rig.backFootX, gy - 2.2, 4.8, 4.8, -1);
  const frontKnee = solve2BoneIK(rig.hipX + 1.4, rig.hipY, rig.frontFootX, gy - 2.2, 4.8, 4.8, -1);

  // Back leg (deeper indigo denim)
  drawOrganicLimb(ctx, rig.hipX - 1.4, rig.hipY, backKnee.x, backKnee.y, '#3d5f94', '#294470', '#162542', 2.2, 1.8);
  drawOrganicLimb(ctx, backKnee.x, backKnee.y, rig.backFootX, gy - 2.2, '#3d5f94', '#294470', '#162542', 1.8, 1.5);
  drawCoastalBoot(ctx, rig.backFootX, gy, true);

  // Front leg (bright sunlit coastal denim)
  drawOrganicLimb(ctx, rig.hipX + 1.4, rig.hipY, frontKnee.x, frontKnee.y, '#6490cc', '#446ca3', '#203861', 2.3, 1.9);
  drawOrganicLimb(ctx, frontKnee.x, frontKnee.y, rig.frontFootX, gy - 2.2, '#6490cc', '#446ca3', '#203861', 1.9, 1.5);
  drawCoastalBoot(ctx, rig.frontFootX, gy, false);

  // 5. Sculpted fisherman torso (open teal vest + cream henley + brass-buckled belt)
  drawSculptedTorso(ctx, rig);

  // 6. Sculpted head, layered hair, expressive face & curved woven straw hat
  drawSculptedHeadAndHat(ctx, g, rig);

  // 7. Fishing Rod (cork grip -> flexible tapered blank -> glowing tip guide -> spinning reel)
  const rodColors = ['#d49c59', '#60a5fa', '#e2e8f0', '#2dd4bf', '#facc15'];
  const rodColor = rodColors[((g.save && g.save.upgrades ? g.save.upgrades.rod : 1) - 1) % rodColors.length];

  const buttX = rig.rodHandX - rig.cosA * 5.2;
  const buttY = rig.rodHandY - rig.sinA * 5.2;
  drawPixelLineLocal(ctx, buttX, buttY + 1, rig.rodHandX, rig.rodHandY + 1, '#4a2b14');
  drawPixelLineLocal(ctx, buttX, buttY, rig.rodHandX, rig.rodHandY, '#c98c50');

  drawPixelQuadLocal(ctx, rig.rodHandX, rig.rodHandY, rig.ctrlX, rig.ctrlY, rig.tipX, rig.tipY, '#1c2638', 16);
  drawPixelQuadLocal(ctx, rig.rodHandX, rig.rodHandY - 1, rig.ctrlX, rig.ctrlY - 1, rig.tipX, rig.tipY - 1, rodColor, 16);
  px(ctx, rig.tipX, rig.tipY - 1, '#ffffff', 1, 1);

  // Sleek silver spinning reel & rotating crank arm
  const seatX = rig.rodHandX - rig.cosA * 2.2;
  const seatY = rig.rodHandY - rig.sinA * 2.2 + 1.4;
  px(ctx, seatX - 1, seatY, '#475569', 3, 2);
  px(ctx, seatX, seatY, '#cbd5e1', 2, 1);
  px(ctx, seatX, seatY, '#ffffff', 1, 1);

  if (g.state !== 'CHARGING' && g.state !== 'CASTING' && g.state !== 'CAUGHT' && g.state !== 'LANDING') {
    drawPixelLineLocal(ctx, seatX, seatY + 1, rig.reelX, rig.reelY, '#e2e8f0');
  }

  // Sculpted left hand gripping rod foregrip / holding fish (compact warm skin, zero giant black mitten!)
  px(ctx, rig.gripX - 1, rig.gripY, '#b57451', 3, 2);
  px(ctx, rig.gripX, rig.gripY, '#ffe0c4', 2, 1);

  // 8. Front arm (right cranking arm!) with sleek rolled sleeve + bare tanned forearm
  const frontShoulderX = rig.shoulderX - 1.4;
  const frontShoulderY = rig.shoulderY + 0.8;
  const frontArmBend = rig.reelX >= frontShoulderX ? 1 : -1;
  const frontElbow = solve2BoneIK(frontShoulderX, frontShoulderY, rig.reelX, rig.reelY, 4.9, 4.9, frontArmBend);
  // Rolled teal sleeve upper arm
  drawOrganicLimb(ctx, frontShoulderX, frontShoulderY, frontElbow.x, frontElbow.y, '#5bc9b4', '#2c8f83', '#133d3c', 2.0, 1.7);
  // Cream sleeve cuff accent at elbow
  px(ctx, frontElbow.x, frontElbow.y, '#f2ead9', 1, 1);
  // Warm tanned forearm
  drawOrganicLimb(ctx, frontElbow.x, frontElbow.y, rig.reelX, rig.reelY, '#ffe0c4', '#f2ba91', '#9c5d3c', 1.6, 1.3);
  // Sculpted right hand + brass crank knob
  px(ctx, rig.reelX - 1, rig.reelY, '#b57451', 3, 2);
  px(ctx, rig.reelX, rig.reelY, '#ffe0c4', 2, 1);
  if (g.state !== 'CAUGHT' && g.state !== 'LANDING') {
    px(ctx, rig.reelX + 1, rig.reelY + 1, '#facc15', 1, 1);
  }

  // 9. Celebrated caught fish held proudly right in the raised hand (0.00px continuity from LANDING!)
  if (g.state === 'CAUGHT' && g.lastCatchInfo) {
    const fSpr = g.sprites.fish[g.lastCatchInfo.species.id].right[Math.floor(g.time * 8) % 4];
    // Starts at exact 0.00px offset when catchTime === 0 so LANDING -> CAUGHT has ZERO jump!
    const bob = Math.sin((g.catchTime || 0) * 5.2) * 0.9;
    ctx.drawImage(
      fSpr,
      Math.round(rig.gripX - fSpr.width / 2),
      Math.round(rig.gripY - fSpr.height / 2 + bob)
    );
  }
}

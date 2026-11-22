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

  // Natural athletic stance with subtle weight-transfer bias during heave vs. forward catch!
  const stanceHalf = lerp(3.3, 5.0, clamp(g.animStance || 0, 0, 1));
  const backFootX = footCenterX - stanceHalf;
  const frontFootX = footCenterX + stanceHalf;

  // Smooth continuous body weight & breathing
  const lean = g.animLean || 0;
  const squat = g.animSquat || 0;
  const breath = Math.sin(g.time * 2.4) * 0.35;

  // Weight-shift: hips track smoothly between back brace and front foot during catch
  const hipX = footCenterX + lean * 0.48;
  const hipY = groundY - 11.2 + squat * 0.74;

  const shoulderX = hipX + lean * 0.68;
  const shoulderY = hipY - 8.4 + breath * 0.55;

  // Dynamic head-tracking, panic hat-pop & over-the-shoulder lookback during Over-Reel Back-of-Dock Launch!
  let headTrackX = 0;
  let headTrackY = 0;
  let hatPopY = 0;
  let lookBack = false;
  let expr = 'normal';
  if (g.state === 'LANDING') {
    const lt = clamp(g.landingT || 0, 0, 1);
    const wfl = g.landingWeightFactor ?? 0.35;
    if (lt < 0.22) {
      // Beat 1: TURBO OVER-REEL YANK — intense strain leaning back watching the water explode!
      const p = smoothstep(lt / 0.22);
      headTrackX = lerp(0.1, -0.35, p);
      headTrackY = lerp(0.1, 0.25, p);
      expr = 'strain';
    } else if (lt < 0.56) {
      // Beat 2: SUPERSONIC OVERHEAD FLYBY — duck low, look up/back as fish zooms over hat, HAT POPS UP!
      const p = smoothstep((lt - 0.22) / 0.34);
      headTrackX = lerp(-0.35, -0.65, p);
      headTrackY = -0.45 * Math.sin(p * Math.PI);
      if (lt >= 0.28 && lt <= 0.52) {
        hatPopY = Math.sin(((lt - 0.28) / 0.24) * Math.PI) * (2.4 + wfl * 1.1);
      }
      lookBack = lt >= 0.42;
      expr = 'shock';
    } else if (lt < 0.85) {
      // Beat 3 & 4: EARTH-SHATTERING DOCK SLAM — flinch jolt + wide-eyed lookback at back of dock!
      const jolt = Math.exp(-Math.pow((lt - 0.57) / 0.045, 2)) * (0.9 + wfl * 0.6);
      headTrackX = -0.55;
      headTrackY = -jolt;
      hatPopY = jolt * 1.2;
      lookBack = true;
      expr = 'shock';
    } else {
      // Beat 5: Settle into hilarious proud-yet-sheepish grin looking back at flopping fish!
      const p = smoothstep((lt - 0.85) / 0.15);
      headTrackX = lerp(-0.55, -0.45, p);
      headTrackY = lerp(0, -0.2, p);
      lookBack = true;
      expr = 'happy';
    }
  } else if (g.state === 'CAUGHT') {
    headTrackX = -0.45;
    headTrackY = -0.2;
    lookBack = true;
    expr = 'happy';
  }

  // Head sits seamlessly on top of the neck & spine (zero floating gap even on full lean-back!)
  const headX = shoulderX + clamp(lean * 0.12, -0.6, 0.8) + 0.35 + headTrackX;
  const headY = shoulderY - 4.0 + headTrackY;

  const rodAngle = g.rodAngle ?? -0.62;
  const cosA = Math.cos(rodAngle);
  const sinA = Math.sin(rodAngle);

  const wf = g.landingWeightFactor ?? 0.35;
  const twoHandCatch = false;
  let gripX, gripY, reelX, reelY;
  let catchHoldX = shoulderX + 13.5;
  let catchHoldY = shoulderY + 0.5;
  let tuck = 0;

  if (g.state === 'CAUGHT' || g.state === 'LANDING') {
    const t = g.state === 'CAUGHT' ? 1 : clamp(g.landingT || 0, 0, 1);

    // Beat 1 (0..0.22): Explosive over-reel power yank starting from exact REELING hand offsets (0.00px snap!)
    const initGDX = Number.isFinite(g.landingInitGripDX) ? g.landingInitGripDX : 5.6;
    const initGDY = Number.isFinite(g.landingInitGripDY) ? g.landingInitGripDY : 1.2;
    const initRDX = Number.isFinite(g.landingInitReelDX) ? g.landingInitReelDX : (initGDX - cosA * 3.0);
    const initRDY = Number.isFinite(g.landingInitReelDY) ? g.landingInitReelDY : (initGDY - sinA * 3.0 + 0.4);
    const yankP = smoothstep(clamp(t / 0.22, 0, 1));
    const yankGX = lerp(shoulderX + initGDX, shoulderX + 2.8, yankP);
    const yankGY = lerp(shoulderY + initGDY, shoulderY - 2.4 - wf * 0.5, yankP);
    const yankRX = lerp(shoulderX + initRDX, shoulderX + 1.4, yankP);
    const yankRY = lerp(shoulderY + initRDY, shoulderY - 0.5, yankP);

    // Back hand keeps holding the rod cleanly behind the rear shoulder after the mega yank!
    const rodRestX = shoulderX - 3.4;
    const rodRestY = shoulderY + 2.0;

    // Front hand: raises defensively near chest/collar during overhead flyby -> points cleanly back at dock below chin!
    const duckHandX = shoulderX + 2.2;
    const duckHandY = shoulderY - 0.8;
    const ct = g.state === 'CAUGHT' ? (g.catchTime || 0) : 0;
    const cheerBob = g.state === 'CAUGHT' ? Math.sin(ct * 4.5) * 0.45 : 0;
    const pointBackX = shoulderX - 5.4;
    const pointBackY = shoulderY + 1.6 + cheerBob;

    if (t < 0.22) {
      gripX = yankGX;
      gripY = yankGY;
      reelX = yankRX;
      reelY = yankRY;
      tuck = 0;
    } else if (t < 0.56) {
      // Beat 2: Rod whips behind rear shoulder while front hand shields hat as fish zooms overhead!
      const flyP = smoothstep((t - 0.22) / 0.34);
      tuck = flyP;
      gripX = lerp(yankGX, rodRestX, flyP);
      gripY = lerp(yankGY, rodRestY, flyP);
      reelX = lerp(yankRX, duckHandX, flyP);
      reelY = lerp(yankRY, duckHandY, flyP);
    } else if (t < 0.85) {
      // Beat 3 & 4: Fish slams onto back of dock — front arm swings back gesturing toward the dock chaos!
      const reactP = smoothstep((t - 0.56) / 0.29);
      tuck = 1;
      gripX = rodRestX;
      gripY = rodRestY;
      reelX = lerp(duckHandX, pointBackX, reactP);
      reelY = lerp(duckHandY, pointBackY, reactP);
    } else {
      tuck = 1;
      gripX = rodRestX;
      gripY = rodRestY;
      reelX = pointBackX;
      reelY = pointBackY;
    }
    catchHoldX = g.pierEndX ? g.pierEndX * 0.27 : (g.anglerX - 24);
    catchHoldY = groundY - 8;
  } else if (g.state === 'IDLE') {
    // Relaxed, natural two-hand ready grip cleanly spaced along the cork rod handle
    gripX = shoulderX + 6.4;
    gripY = shoulderY + 2.0;
    reelX = gripX - cosA * 3.4;
    reelY = gripY - sinA * 3.4 + 0.6;
  } else if (g.state === 'CHARGING') {
    // Classic smooth two-hand casting backswing arc over the back shoulder (cleanly spaced along cork handle!)
    const p = smoothstep(clamp(g.chargePower || 0, 0, 1));
    const swingAng = lerp(-0.18, -2.08, p);
    const arcR = lerp(6.4, 5.8, p);
    gripX = shoulderX + Math.cos(swingAng) * arcR;
    gripY = (shoulderY + 0.4) + Math.sin(swingAng) * arcR;
    // Lower hand stays cleanly 3.2px down the cork butt along the rod shaft!
    reelX = gripX - cosA * 3.2;
    reelY = gripY - sinA * 3.2;
  } else if (g.state === 'CASTING') {
    const t = smoothstep(clamp((g.castT || 0) * 2.1, 0, 1));
    const swingAng = lerp(-2.08, 0.06, t);
    gripX = shoulderX + Math.cos(swingAng) * 6.8;
    gripY = (shoulderY + 0.4) + Math.sin(swingAng) * 6.0;
    reelX = gripX - cosA * 3.2;
    reelY = gripY - sinA * 3.2;
  } else {
    // Waiting / retrieving / bite / reeling:
    const pullBack = g.state === 'REELING' ? (g.tension || 0) * 1.5 : 0;
    gripX = shoulderX + 6.2 - pullBack;
    gripY = shoulderY + 1.4 - (g.state === 'BITE' ? 1.4 : 0);

    const seatX = gripX - cosA * 2.8;
    const seatY = gripY - sinA * 2.8 + 1.4;

    const isCranking =
      (g.state === 'REELING' && (g.reelHold || g.devAutoLand) && !g.fishThrashing) ||
      (g.state === 'WAITING' && g.retrieving);

    if (isCranking) {
      const crankR = 1.65;
      const ca = g.crankAngle || 0;
      reelX = seatX + Math.cos(ca) * crankR;
      reelY = seatY + Math.sin(ca) * crankR;
    } else if (g.state === 'REELING' && (g.fishThrashing || g.tension > 0.72)) {
      reelX = gripX - cosA * 3.8;
      reelY = gripY - sinA * 3.8 + 0.3;
    } else {
      // Poised neatly on the reel handle knob, clearly separated from the foregrip hand
      reelX = seatX + 1.1;
      reelY = seatY + 1.1;
    }
  }

  // Rod butt/tip stays 100% locked in the back gripping hand (gripX, gripY) — ZERO floating rod or hand swap!
  const rodLen = 28 + ((g.save && g.save.upgrades && g.save.upgrades.rod ? g.save.upgrades.rod : 1) - 1) * 2.2;
  const rodHandX = gripX;
  const rodHandY = gripY;
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
    hatPopY,
    lookBack,
    expr,
    gripX,
    gripY,
    reelX,
    reelY,
    catchHoldX,
    catchHoldY,
    holdMode: (g.state === 'CAUGHT' || g.state === 'LANDING') ? 'backDock' : null,
    twoHandCatch,
    tuck,
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

  // Fill EVERY integer scanline from shoulder down to hip so lean/breathing NEVER creates a 1px gap!
  const y0 = Math.round(sy);
  const y1 = Math.round(hy);
  const span = Math.max(1, y1 - y0);

  for (let cy = y0; cy <= y1; cy++) {
    const t = (cy - y0) / span;
    const cx = lerp(sx, hx, t);
    let hl, hr, kind;
    if (cy === y0) {
      hl = 2.2; hr = 2.2; kind = 'collar';
    } else if (cy === y1) {
      hl = 2.9; hr = 2.8; kind = 'hip';
    } else if (cy === y1 - 1) {
      hl = 2.8; hr = 2.7; kind = 'belt';
    } else if (t < 0.40) {
      hl = 3.2; hr = 2.9; kind = 'chest';
    } else {
      hl = 2.6; hr = 2.6; kind = 'waist';
    }
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

// Sculpted non-blocky head, layered chestnut hair, expressive face (forward & lookBack!), and curved woven straw hat!
function drawSculptedHeadAndHat(ctx, g, rig) {
  const hx = Math.round(rig.headX);
  const hy = Math.round(rig.headY);
  const lookBack = Boolean(rig.lookBack);
  const expr = rig.expr || 'normal';

  // Solid warm neck seamlessly bridging chin straight into the crimson bandana collar (ZERO gap!)
  drawPixelLineLocal(ctx, hx - 1, hy + 2, rig.shoulderX - 1, rig.shoulderY, '#b57451');
  drawPixelLineLocal(ctx, hx, hy + 2, rig.shoulderX, rig.shoulderY, '#e0a27b');
  drawPixelLineLocal(ctx, hx + 1, hy + 2, rig.shoulderX + 1, rig.shoulderY, '#f2ba91');

  const blinking = (g.time % 4.6) > 4.48 && g.state === 'IDLE';
  const straining =
    expr === 'strain' ||
    (g.state === 'REELING' && (g.fishThrashing || (g.tension || 0) > 0.72));
  const shocked = expr === 'shock';
  const happy = expr === 'happy' || g.state === 'CAUGHT';

  if (!lookBack) {
    // Chamfered organic RIGHT-facing head silhouette
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
    px(ctx, hx, hy + 2, '#d4936a', 2, 1);     // tapered rounded chin
    px(ctx, hx - 1, hy, '#e6a882', 1, 1);     // warm ear pixel

    // Crisp always-visible eye on row hy-1
    if (blinking) {
      px(ctx, hx + 1, hy - 1, '#3b1e11', 2, 1);
    } else if (shocked) {
      // Wide shocked eye + open "O" gasp mouth!
      px(ctx, hx + 1, hy - 1, '#ffffff', 2, 1);
      px(ctx, hx + 2, hy - 1, '#111622', 1, 1);
      px(ctx, hx + 1, hy + 1, '#7a2520', 1, 1);
    } else if (happy) {
      px(ctx, hx + 1, hy - 1, '#ffffff', 1, 1);
      px(ctx, hx + 2, hy - 1, '#111622', 1, 1);
      px(ctx, hx, hy, '#eb8a78', 1, 1);
      px(ctx, hx + 1, hy + 1, '#b54d3e', 2, 1);
    } else if (straining) {
      px(ctx, hx + 1, hy - 1, '#fff5eb', 1, 1);
      px(ctx, hx + 2, hy - 1, '#111622', 1, 1);
      px(ctx, hx + 1, hy + 1, '#a85745', 1, 1);
    } else {
      const lookDown = (g.state === 'WAITING' || g.state === 'BITE' || g.state === 'REELING');
      px(ctx, hx + 1, hy - 1, '#ffffff', 1, 1);
      px(ctx, hx + 2, hy - 1, '#111622', 1, 1);
      if (lookDown) px(ctx, hx + 1, hy, '#e89b84', 1, 1);
    }
  } else {
    // Chamfered organic LEFT-facing over-the-shoulder lookback watching the fish on the back of the dock!
    px(ctx, hx + 3, hy - 1, '#5e3420', 1, 3); // back hair rim (right)
    px(ctx, hx - 1, hy - 2, '#7d4628', 4, 1); // upper hair under hat
    px(ctx, hx + 1, hy - 1, '#995732', 2, 2); // hair sideburn/lock
    px(ctx, hx + 2, hy + 1, '#7d4628', 1, 1); // nape hair

    // Warm sculpted face profile facing LEFT
    px(ctx, hx - 2, hy - 1, '#f7c8a4', 3, 1); // brow
    px(ctx, hx - 2, hy, '#f7c8a4', 4, 1);     // cheek + nose bridge
    px(ctx, hx, hy - 1, '#ffe4cc', 1, 1);     // sunlit forehead catchlight
    px(ctx, hx - 3, hy, '#e8a882', 1, 1);     // gentle 1px nose tip facing back of dock!
    px(ctx, hx - 1, hy + 1, '#f2b88f', 3, 1); // lower cheek
    px(ctx, hx - 1, hy + 2, '#d4936a', 2, 1); // tapered chin
    px(ctx, hx + 1, hy, '#e6a882', 1, 1);     // warm ear pixel

    if (shocked) {
      // Wide stunned eye staring at the dock slam + gasp mouth + comic blue sweat drop!
      px(ctx, hx - 1, hy - 1, '#ffffff', 1, 1);
      px(ctx, hx - 2, hy - 1, '#111622', 1, 1);
      px(ctx, hx - 1, hy + 1, '#7a2520', 1, 1);
      px(ctx, hx + 2, hy - 1, '#38bdf8', 1, 2); // animated comic sweat drop!
      px(ctx, hx + 2, hy - 1, '#e0f2fe', 1, 1);
    } else {
      // Proud & sheepish celebratory lookback grin at the fish flopping on the back of the dock!
      px(ctx, hx - 1, hy - 1, '#ffffff', 1, 1);
      px(ctx, hx - 2, hy - 1, '#111622', 1, 1);
      px(ctx, hx, hy, '#eb8a78', 1, 1);         // rosy cheek
      px(ctx, hx - 2, hy + 1, '#b54d3e', 2, 1); // big warm grin
    }
  }

  // Curved woven coastal straw sun-hat — pops up in mid-air when the supersonic fish zooms overhead!
  const hatTilt = Math.round(clamp((g.animLean || 0) * 0.22, -1, 1));
  const hatX = hx + hatTilt;
  const hatY = hy - 3 - Math.round(rig.hatPopY || 0);

  // Gently curved upturned straw brim
  px(ctx, hatX - 6, hatY, '#c98e30', 1, 1);      // upturned left brim tip
  px(ctx, hatX - 5, hatY + 1, '#784c18', 11, 1); // soft underside shadow of brim
  px(ctx, hatX - 5, hatY, '#f2c65e', 10, 1);     // main golden brim
  px(ctx, hatX - 4, hatY, '#fff3b8', 5, 1);      // sunlit straw brim highlight
  px(ctx, hatX + 5, hatY, '#d99e3b', 1, 1);      // upturned right brim tip

  // Crimson ribbon band around hat crown
  px(ctx, hatX - 3, hatY - 1, '#d93d46', 7, 1);
  px(ctx, hatX - 3, hatY - 1, '#ff6b6b', 3, 1);
  px(ctx, hatX + 2, hatY - 1, '#991f2b', 2, 1);

  // Rounded domed straw crown
  px(ctx, hatX - 3, hatY - 2, '#f2c65e', 7, 1);
  px(ctx, hatX - 3, hatY - 2, '#fff3b8', 3, 1);
  px(ctx, hatX + 2, hatY - 2, '#c98e30', 2, 1);
  px(ctx, hatX - 2, hatY - 3, '#f2c65e', 5, 1);
  px(ctx, hatX - 2, hatY - 3, '#fff6cc', 3, 1);
  px(ctx, hatX - 1, hatY - 4, '#c98e30', 3, 1); // soft woven crown top edge

  // Fluttering crimson hat-band tail streaming in the sea breeze!
  const gustMult = (g.state === 'LANDING' && (g.landingT || 0) > 0.22 && (g.landingT || 0) < 0.56) ? 2.4 : 1.0;
  const ribbonWave = Math.sin(g.time * 6.2 * gustMult + 1.1) * (1.1 * Math.min(1.6, gustMult));
  px(ctx, hatX - 4, hatY - 1, '#b82532', 1, 1);
  px(ctx, hatX - 5, hatY - 1 + Math.round(ribbonWave * 0.5), '#d93d46', 2, 1);
  px(ctx, hatX - 7, hatY + Math.round(ribbonWave), '#ff6b6b', 1, 1);

  // Comic "!" shock mark popping beside the angler during the overhead flyby & dock slam!
  if (g.state === 'LANDING' && (g.landingT || 0) >= 0.34 && (g.landingT || 0) <= 0.78) {
    const pulse = Math.floor(g.time * 20) % 2 === 0;
    const ex = hx + 7;
    const ey = hy - 5;
    px(ctx, ex, ey, pulse ? '#fef08a' : '#fb7185', 1, 3);
    px(ctx, ex, ey + 4, '#fef08a', 1, 1);
  }
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
  const gustBoost = g.state === 'LANDING' ? 1.55 : g.state === 'CASTING' ? 1.8 : 1.0;
  const w1 = Math.sin(g.time * 5.0 * gustBoost) * (1.35 * Math.min(1.4, gustBoost));
  const w2 = Math.cos(g.time * 7.8 * gustBoost + 0.8) * (1.15 * Math.min(1.4, gustBoost));
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

  // Helper to render the fishing rod + reel cleanly (placed behind torso when tucked during catch trophy hold!)
  const drawRodAndReel = () => {
    const rodColors = ['#d49c59', '#60a5fa', '#e2e8f0', '#2dd4bf', '#facc15'];
    const rodColor = rodColors[((g.save && g.save.upgrades ? g.save.upgrades.rod : 1) - 1) % rodColors.length];

    const buttX = rig.rodHandX - rig.cosA * 5.2;
    const buttY = rig.rodHandY - rig.sinA * 5.2;
    drawPixelLineLocal(ctx, buttX, buttY + 1, rig.rodHandX, rig.rodHandY + 1, '#4a2b14');
    drawPixelLineLocal(ctx, buttX, buttY, rig.rodHandX, rig.rodHandY, '#c98c50');

    drawPixelQuadLocal(ctx, rig.rodHandX, rig.rodHandY, rig.ctrlX, rig.ctrlY, rig.tipX, rig.tipY, '#1c2638', 16);
    drawPixelQuadLocal(ctx, rig.rodHandX, rig.rodHandY - 1, rig.ctrlX, rig.ctrlY - 1, rig.tipX, rig.tipY - 1, rodColor, 16);
    px(ctx, rig.tipX, rig.tipY - 1, '#ffffff', 1, 1);

    const seatX = rig.rodHandX - rig.cosA * 2.2;
    const seatY = rig.rodHandY - rig.sinA * 2.2 + 1.4;
    px(ctx, seatX - 1, seatY, '#475569', 3, 2);
    px(ctx, seatX, seatY, '#cbd5e1', 2, 1);
    px(ctx, seatX, seatY, '#ffffff', 1, 1);

    const onReel = g.state === 'WAITING' || g.state === 'BITE' || g.state === 'REELING';
    if (onReel) {
      drawPixelLineLocal(ctx, seatX, seatY + 1, rig.reelX, rig.reelY, '#e2e8f0');
    }
  };

  // Draw rod BEHIND head & torso as soon as tuck begins or rod swings past vertical so it NEVER slices through face/hat!
  const rodBehindBody = (rig.tuck || 0) > 0.08 || (g.rodAngle || -0.7) < -1.32;
  if (rodBehindBody) drawRodAndReel();

  // 5. Sculpted fisherman torso (open teal vest + cream henley + brass-buckled belt)
  drawSculptedTorso(ctx, rig);

  // 6. Sculpted head, layered hair, expressive face & curved woven straw hat
  drawSculptedHeadAndHat(ctx, g, rig);

  // 7. Fishing Rod (in front during active fishing; already tucked neatly behind back during trophy hold!)
  if (!rodBehindBody) drawRodAndReel();
  const onReel = g.state === 'WAITING' || g.state === 'BITE' || g.state === 'REELING';

  // Sculpted left hand gripping rod foregrip / holding fish (clean compact 2x2 hand!)
  px(ctx, rig.gripX, rig.gripY, '#ffe0c4', 1, 1);
  px(ctx, rig.gripX + 1, rig.gripY, '#f0b58b', 1, 1);
  px(ctx, rig.gripX, rig.gripY + 1, '#c2815d', 2, 1);

  // 8. Front arm (right arm gripping rod butt when getting ready / cranking reel / pointing back at dock!)
  const frontShoulderX = rig.shoulderX - 1.4;
  const frontShoulderY = rig.shoulderY + 0.8;
  const frontArmBend = (rig.reelX < frontShoulderX + 0.5) ? -1 : 1;
  const frontElbow = solve2BoneIK(frontShoulderX, frontShoulderY, rig.reelX, rig.reelY, 4.9, 4.9, frontArmBend);
  // Rolled teal sleeve upper arm
  drawOrganicLimb(ctx, frontShoulderX, frontShoulderY, frontElbow.x, frontElbow.y, '#5bc9b4', '#2c8f83', '#133d3c', 2.0, 1.7);
  // Cream sleeve cuff accent at elbow
  px(ctx, frontElbow.x, frontElbow.y, '#f2ead9', 1, 1);
  // Warm tanned forearm
  drawOrganicLimb(ctx, frontElbow.x, frontElbow.y, rig.reelX, rig.reelY, '#ffe0c4', '#f2ba91', '#9c5d3c', 1.6, 1.3);
  // Sculpted right hand (compact 2x2 hand + subtle brass crank knob ONLY while reeling/waiting!)
  px(ctx, rig.reelX, rig.reelY, '#ffe0c4', 1, 1);
  px(ctx, rig.reelX + 1, rig.reelY, '#f0b58b', 1, 1);
  px(ctx, rig.reelX, rig.reelY + 1, '#c2815d', 2, 1);
  if (onReel && !(g.state === 'REELING' && (g.fishThrashing || g.tension > 0.72))) {
    px(ctx, rig.reelX + 1, rig.reelY + 1, '#facc15', 1, 1);
  }
  // Caught & landing fish are now rendered on the back of the dock in js/renderer.js (renderLandingFishForeground)!
}

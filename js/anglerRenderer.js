// Articulated 16-bit pixel-art angler renderer.
// Renders crisp integer-pixel anatomy with locked pier-grounded boots, hinged knees,
// leaning torso, fluttering scarf, gaze-tracking head/hat, and true 60fps two-arm rod + reel cranking!

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

function px(ctx, x, y, color, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

// Crisp outlined 2px-thick pixel limb segment (used for legs, thighs, upper arms, forearms)
function drawPixelLimb(ctx, x0, y0, x1, y1, mainCol, shadeCol, outlineCol = '#111622', thick = 2) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.4));
  // Pass 1: ink outline
  ctx.fillStyle = outlineCol;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = Math.round(lerp(x0, x1, t));
    const cy = Math.round(lerp(y0, y1, t));
    ctx.fillRect(cx - 1, cy - 1, thick + 2, thick + 2);
  }
  // Pass 2: inner shade & highlight
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = Math.round(lerp(x0, x1, t));
    const cy = Math.round(lerp(y0, y1, t));
    ctx.fillStyle = shadeCol;
    ctx.fillRect(cx, cy, thick, thick);
    ctx.fillStyle = mainCol;
    ctx.fillRect(cx, cy, Math.max(1, thick - 1), Math.max(1, thick - 1));
  }
}

// 2-bone analytical IK for realistic elbow/knee bend in pixel space
function solve2BoneIK(ax, ay, bx, by, len1, len2, bendSign = 1) {
  const dx = bx - ax;
  const dy = by - ay;
  const d = clamp(Math.hypot(dx, dy), 0.5, len1 + len2 - 0.1);
  const a = (len1 * len1 - len2 * len2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, len1 * len1 - a * a));
  const mx = ax + (a * dx) / d;
  const my = ay + (a * dy) / d;
  return {
    x: mx + (bendSign * h * (-dy)) / d,
    y: my + (bendSign * h * dx) / d,
  };
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

// Compute live physical angler rig coordinates (also shared by game.js for exact rod tip & celebrate hand!)
export function computeAnglerRig(g) {
  const footCenterX = g.anglerX + 11;
  const groundY = g.pierY; // exact plank top row!

  // Locked, solidly planted boots (wide athletic stance when fighting/reeling, natural stance when idle)
  const stanceHalf = lerp(3.5, 5.2, clamp(g.animStance || 0, 0, 1));
  const backFootX = footCenterX - stanceHalf;
  const frontFootX = footCenterX + stanceHalf;

  // Smooth continuous lean (-back when charging/straining, +forward when watching/casting)
  const lean = g.animLean || 0; // range roughly -4.5 .. +3.0 px
  const squat = g.animSquat || 0; // range 0 .. 2.5 px knee bend
  const breath = Math.sin(g.time * 2.5) * 0.35;

  const hipX = footCenterX + lean * 0.45;
  const hipY = groundY - 10.5 + squat * 0.72;

  const shoulderX = hipX + lean * 0.65;
  const shoulderY = hipY - 7.5 + breath * 0.5;

  const headX = shoulderX + lean * 0.25 + 0.5;
  const headY = shoulderY - 5.5;

  // Compute target gripping hand (rod foregrip) + spinning reel cranking hand!
  const rodAngle = g.rodAngle ?? -0.62;
  const cosA = Math.cos(rodAngle);
  const sinA = Math.sin(rodAngle);

  let gripX, gripY, reelX, reelY;
  if (g.state === 'CAUGHT' || (g.state === 'LANDING' && g.landingT > 0.55)) {
    // Celebratory raised front hand holding the caught fish cleanly clear of head & hat!
    const raise = g.state === 'CAUGHT' ? 1 : clamp((g.landingT - 0.55) / 0.45, 0, 1);
    const holdX = shoulderX + 6.5;
    const holdY = shoulderY + 1.5;
    const celX = shoulderX + 9.5;
    const celY = headY - 4.5;
    gripX = lerp(holdX, celX, raise);
    gripY = lerp(holdY, celY, raise);
    reelX = shoulderX - 4.0;
    reelY = hipY - 1.5;
  } else if (g.state === 'CHARGING') {
    const p = g.chargePower || 0;
    gripX = shoulderX + lerp(5, -6.5, p);
    gripY = shoulderY + lerp(1, -2.8, p);
    reelX = gripX - cosA * 2.8;
    reelY = gripY - sinA * 2.8 + 1;
  } else if (g.state === 'CASTING') {
    const t = clamp(g.castT * 2.1, 0, 1);
    gripX = shoulderX + lerp(-5, 7.5, t);
    gripY = shoulderY + lerp(-4.5, 0.5, t);
    reelX = gripX - cosA * 3;
    reelY = gripY - sinA * 3 + 1;
  } else {
    // Ready-to-reel / waiting / bite / retrieving / reeling:
    // Left hand grips the rod foregrip firmly forward; right hand grips & orbits the reel crank!
    const pullBack = g.state === 'REELING' ? (g.tension || 0) * 1.6 : 0;
    gripX = shoulderX + 6.5 - pullBack;
    gripY = shoulderY + 1.5 - (g.state === 'BITE' ? 1.5 : 0);

    const seatX = gripX - cosA * 2.5;
    const seatY = gripY - sinA * 2.5 + 1.8;

    const isCranking =
      (g.state === 'REELING' && (g.reelHold || g.devAutoLand) && !g.fishThrashing) ||
      (g.state === 'WAITING' && g.retrieving);

    if (isCranking) {
      const crankR = 2.6;
      const ca = g.crankAngle || 0;
      reelX = seatX + Math.cos(ca) * crankR;
      reelY = seatY + Math.sin(ca) * crankR;
    } else if (g.state === 'REELING' && (g.fishThrashing || g.tension > 0.72)) {
      // Both hands locked onto rod butt & foregrip bracing hard!
      reelX = gripX - cosA * 4.2;
      reelY = gripY - sinA * 4.2 + 0.5;
    } else {
      // Poised right on the reel crank ready to reel!
      reelX = seatX + 0.8;
      reelY = seatY + 1.2;
    }
  }

  // Rod tip geometry anchored directly to the gripping hand (smoothly tucked behind shoulder during LANDING -> CAUGHT)
  const rodLen = 27 + ((g.save && g.save.upgrades && g.save.upgrades.rod ? g.save.upgrades.rod : 1) - 1) * 2.2;
  const tuck = g.state === 'CAUGHT' ? 1 : (g.state === 'LANDING' && g.landingT > 0.55 ? clamp((g.landingT - 0.55) / 0.45, 0, 1) : 0);
  const rodHandX = lerp(gripX, shoulderX - 4.5, tuck);
  const rodHandY = lerp(gripY, shoulderY + 1.5, tuck);
  const tipBaseX = rodHandX + cosA * rodLen;
  const tipBaseY = rodHandY + sinA * rodLen;
  const bend = (g.rodFlex || 0) * 14;
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

export function renderArticulatedAngler(g, ctx) {
  const rig = computeAnglerRig(g);
  const gy = rig.groundY;

  // 1. Grounded contact shadow on pier planks (anchored directly under both boots!)
  const minFoot = Math.min(rig.backFootX, rig.frontFootX) - 2;
  const maxFoot = Math.max(rig.backFootX, rig.frontFootX) + 4;
  ctx.fillStyle = '#29160a';
  ctx.fillRect(Math.round(minFoot), gy, Math.round(maxFoot - minFoot), 1);
  ctx.fillStyle = '#3d2210';
  ctx.fillRect(Math.round(minFoot + 1), gy + 1, Math.round(maxFoot - minFoot - 2), 1);

  // 2. Back arm (left arm reaching to rod foregrip) drawn behind torso
  const backShoulderX = rig.shoulderX + 1.5;
  const backShoulderY = rig.shoulderY + 0.5;
  const backArmBend = rig.gripX >= backShoulderX ? 1 : -1;
  const backElbow = solve2BoneIK(backShoulderX, backShoulderY, rig.gripX, rig.gripY, 4.6, 4.6, backArmBend);
  drawPixelLimb(ctx, backShoulderX, backShoulderY, backElbow.x, backElbow.y, '#226f6c', '#184e4c', '#111622', 2);
  drawPixelLimb(ctx, backElbow.x, backElbow.y, rig.gripX, rig.gripY, '#226f6c', '#184e4c', '#111622', 2);

  // 3. Articulated Legs (ankles locked onto pierY, knees smoothly bending FORWARD toward the water!)
  const backKnee = solve2BoneIK(rig.hipX - 1.5, rig.hipY, rig.backFootX, gy - 2, 4.5, 4.5, -1);
  const frontKnee = solve2BoneIK(rig.hipX + 1.8, rig.hipY, rig.frontFootX, gy - 2, 4.5, 4.5, -1);

  // Back leg (darker denim)
  drawPixelLimb(ctx, rig.hipX - 1.5, rig.hipY, backKnee.x, backKnee.y, '#2b4770', '#1d3252', '#111622', 2);
  drawPixelLimb(ctx, backKnee.x, backKnee.y, rig.backFootX, gy - 2, '#2b4770', '#1d3252', '#111622', 2);
  // Front leg (brighter denim)
  drawPixelLimb(ctx, rig.hipX + 1.8, rig.hipY, frontKnee.x, frontKnee.y, '#466da6', '#2a4773', '#111622', 2);
  drawPixelLimb(ctx, frontKnee.x, frontKnee.y, rig.frontFootX, gy - 2, '#466da6', '#2a4773', '#111622', 2);

  // Grounded pixel leather boots sitting flush on gy (bottom ink pixel strictly ON row gy!)
  for (const fx of [rig.backFootX, rig.frontFootX]) {
    const bx = Math.round(fx - 1);
    px(ctx, bx - 1, gy - 3, '#111622', 6, 4);
    px(ctx, bx, gy - 2, '#9e6232', 3, 1);
    px(ctx, bx, gy - 1, '#693c1e', 4, 1);
    px(ctx, bx + 1, gy - 2, '#c7884a', 1, 1);
  }

  // 4. Fluttering red scarf tail trailing behind neck in the coastal breeze
  const wind = Math.sin(g.time * 5.2) * 1.4 + Math.cos(g.time * 8.4) * 0.6;
  const neckX = rig.shoulderX - 1;
  const neckY = rig.shoulderY - 1;
  drawPixelLimb(ctx, neckX - 1, neckY, neckX - 4.5, neckY + 1 + wind * 0.5, '#e64848', '#a32430', '#111622', 1);
  px(ctx, neckX - 6, neckY + 1 + wind, '#e64848', 2, 1);

  // 5. Torso / Coastal Teal Jacket & Belt (smoothly angled from hip to shoulder)
  const tx = Math.round(lerp(rig.hipX, rig.shoulderX, 0.5));
  const ty = Math.round(lerp(rig.hipY, rig.shoulderY, 0.5));
  // Ink silhouette
  px(ctx, tx - 4, ty - 4, '#111622', 9, 9);
  // Teal jacket fill + highlight + shadow fold
  px(ctx, tx - 3, ty - 3, '#3ea899', 7, 6);
  px(ctx, tx - 3, ty - 3, '#6ad4c0', 2, 5); // sunlit back rim
  px(ctx, tx + 2, ty - 2, '#226f6c', 2, 5); // shaded chest fold
  // Belt + brass buckle
  px(ctx, tx - 3, ty + 3, '#693c1e', 7, 1);
  px(ctx, tx + 1, ty + 3, '#facc15', 1, 1);
  // Red bandana collar around neck
  px(ctx, Math.round(rig.shoulderX - 3), Math.round(rig.shoulderY - 2), '#111622', 7, 3);
  px(ctx, Math.round(rig.shoulderX - 2), Math.round(rig.shoulderY - 1), '#e64848', 5, 1);
  px(ctx, Math.round(rig.shoulderX + 1), Math.round(rig.shoulderY - 1), '#a32430', 2, 1);

  // 6. Head, Hair, Gaze-Tracking Eye & Sculpted Straw Hat
  const hx = Math.round(rig.headX);
  const hy = Math.round(rig.headY);
  // Head outline + skin
  px(ctx, hx - 3, hy - 2, '#111622', 7, 6);
  px(ctx, hx - 2, hy - 1, '#f7c8a4', 5, 4);
  px(ctx, hx - 2, hy + 2, '#d99870', 4, 1); // chin shade
  px(ctx, hx - 2, hy - 1, '#a66849', 1, 3); // hair sideburn

  // Natural blinking + subtle gaze tracking toward water/bobber!
  const blinking = (g.time % 4.3) > 4.15;
  const eyeY = hy + (g.state === 'WAITING' || g.state === 'BITE' || g.state === 'REELING' ? 1 : 0);
  if (blinking) {
    px(ctx, hx + 1, eyeY, '#a66849', 2, 1);
  } else {
    px(ctx, hx + 1, eyeY, '#f8fafc', 1, 1);
    px(ctx, hx + 2, eyeY, '#111622', 1, 1);
  }

  // Straw hat (tilts slightly with lean/strain!)
  const hatShift = Math.round(clamp((g.animLean || 0) * 0.2, -1, 1));
  const hatX = hx + hatShift;
  const hatY = hy - 3;
  // Crown outline
  px(ctx, hatX - 4, hatY - 3, '#111622', 8, 4);
  px(ctx, hatX - 3, hatY - 2, '#f5cf6b', 6, 2);
  px(ctx, hatX - 3, hatY - 2, '#fff3b0', 3, 1);
  // Red hat band
  px(ctx, hatX - 4, hatY, '#e64848', 8, 1);
  px(ctx, hatX + 1, hatY, '#a32430', 3, 1);
  // Wide sun brim
  px(ctx, hatX - 6, hatY + 1, '#111622', 12, 2);
  px(ctx, hatX - 5, hatY + 1, '#f5cf6b', 10, 1);
  px(ctx, hatX - 5, hatY + 1, '#fff3b0', 4, 1);
  px(ctx, hatX + 3, hatY + 1, '#cf983c', 2, 1);

  // 7. Fishing Rod (cork butt -> flexible curved blank -> tip ring -> spinning reel seat)
  const rodColors = ['#c99755', '#60a5fa', '#cbd5e1', '#2dd4bf', '#facc15'];
  const rodColor = rodColors[((g.save && g.save.upgrades ? g.save.upgrades.rod : 1) - 1) % rodColors.length];

  const buttX = rig.rodHandX - rig.cosA * 5.5;
  const buttY = rig.rodHandY - rig.sinA * 5.5;
  drawPixelLineLocal(ctx, buttX, buttY + 1, rig.rodHandX, rig.rodHandY + 1, '#111622');
  drawPixelLineLocal(ctx, buttX, buttY, rig.rodHandX, rig.rodHandY, '#b87a42');

  drawPixelQuadLocal(ctx, rig.rodHandX, rig.rodHandY, rig.ctrlX, rig.ctrlY, rig.tipX, rig.tipY, '#111622', 16);
  drawPixelQuadLocal(ctx, rig.rodHandX, rig.rodHandY - 1, rig.ctrlX, rig.ctrlY - 1, rig.tipX, rig.tipY - 1, rodColor, 16);
  px(ctx, rig.tipX, rig.tipY - 1, '#f8fafc', 1, 1);

  // Spinning reel body + rotating crank arm connected straight to the right hand!
  const seatX = rig.rodHandX - rig.cosA * 2.2;
  const seatY = rig.rodHandY - rig.sinA * 2.2 + 1.5;
  px(ctx, seatX - 2, seatY - 1, '#111622', 4, 4);
  px(ctx, seatX - 1, seatY, '#94a3b8', 2, 2);
  px(ctx, seatX - 1, seatY, '#f8fafc', 1, 1);

  if (g.state !== 'CHARGING' && g.state !== 'CASTING' && g.state !== 'CAUGHT') {
    drawPixelLineLocal(ctx, seatX, seatY + 1, rig.reelX, rig.reelY, '#cbd5e1');
  }

  // Left (gripping) hand fingers over rod foregrip
  px(ctx, rig.gripX - 1, rig.gripY - 1, '#111622', 4, 3);
  px(ctx, rig.gripX, rig.gripY, '#f7c8a4', 2, 1);

  // 8. Front arm (right cranking arm!) drawn in foreground with full 60fps IK to the reel handle!
  const frontShoulderX = rig.shoulderX - 1.5;
  const frontShoulderY = rig.shoulderY + 0.5;
  const frontArmBend = rig.reelX >= frontShoulderX ? 1 : -1;
  const frontElbow = solve2BoneIK(frontShoulderX, frontShoulderY, rig.reelX, rig.reelY, 4.6, 4.6, frontArmBend);
  drawPixelLimb(ctx, frontShoulderX, frontShoulderY, frontElbow.x, frontElbow.y, '#3ea899', '#226f6c', '#111622', 2);
  drawPixelLimb(ctx, frontElbow.x, frontElbow.y, rig.reelX, rig.reelY, '#3ea899', '#226f6c', '#111622', 2);
  // Right hand gripping crank knob
  px(ctx, rig.reelX - 1, rig.reelY - 1, '#111622', 4, 3);
  px(ctx, rig.reelX, rig.reelY, '#f7c8a4', 2, 1);
  px(ctx, rig.reelX + 1, rig.reelY, '#facc15', 1, 1);

  // 9. Celebrated caught fish held proudly right in the raised hand (0px jump from LANDING!)
  if (g.state === 'CAUGHT' && g.lastCatchInfo) {
    const fSpr = g.sprites.fish[g.lastCatchInfo.species.id].right[Math.floor(g.time * 8) % 4];
    const bob = Math.sin(g.time * 6) * 1.0;
    ctx.drawImage(
      fSpr,
      Math.round(rig.gripX - fSpr.width / 2),
      Math.round(rig.gripY - fSpr.height / 2 + bob)
    );
  }
}

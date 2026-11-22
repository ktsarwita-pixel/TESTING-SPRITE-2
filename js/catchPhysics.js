// Single-source-of-truth physics & choreography for the Over-Reel Back-of-Dock Launch!
// Shared by js/game.js, js/renderer.js, js/anglerRenderer.js, and /ultra sub-agents (30 workers).

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);
const smootherstep = (t) => t * t * t * (t * (t * 6 - 15) + 10);

function rotatedBounds(w, h, angle, sx = 1, sy = 1) {
  const sw = w * Math.abs(sx);
  const sh = h * Math.abs(sy);
  const c = Math.abs(Math.cos(angle));
  const s = Math.abs(Math.sin(angle));
  return {
    w: sw * c + sh * s,
    h: sw * s + sh * c,
  };
}

function getAnglerSafetyBounds(g, rig) {
  const footCenterX = g.anglerX + 11;
  // Frame-invariant worst-case angler envelope during the overhead duck pass!
  // Using constant bounds prevents instantaneous hatPopY / lean steps from jittering the Bezier parabola!
  const staticHatTopY = g.pierY - 29.0;
  const staticBackSafeX = footCenterX - 9.5;
  const staticFrontSafeX = footCenterX + 9.5;
  const hx = rig ? rig.headX : footCenterX;
  const hy = rig ? rig.headY : (g.pierY - 23.6);
  const sx = rig ? rig.shoulderX : footCenterX;
  const backFootX = rig ? rig.backFootX : (footCenterX - 4.5);
  const frontFootX = rig ? rig.frontFootX : (footCenterX + 4.5);
  const hatPop = rig && Number.isFinite(rig.hatPopY) ? rig.hatPopY : 0;
  const liveHatTopY = Math.round(hy) - 7 - Math.ceil(hatPop);
  const anglerBackSafeX = Math.min(staticBackSafeX, backFootX - 3.5, sx - 6.5, hx - 7.0);
  const anglerFrontSafeX = Math.max(staticFrontSafeX, frontFootX + 3.5, sx + 6.5, hx + 6.5);
  return {
    hatTopY: staticHatTopY,
    liveHatTopY,
    anglerBackSafeX,
    anglerFrontSafeX,
    staticBackSafeX,
    staticFrontSafeX,
  };
}

// Quadratic Bezier position & analytical first derivative
function quadBezier(p0x, p0y, p1x, p1y, p2x, p2y, u) {
  const inv = 1 - u;
  const x = inv * inv * p0x + 2 * inv * u * p1x + u * u * p2x;
  const y = inv * inv * p0y + 2 * inv * u * p1y + u * u * p2y;
  const dx = 2 * inv * (p1x - p0x) + 2 * u * (p2x - p1x);
  const dy = 2 * inv * (p1y - p0y) + 2 * u * (p2y - p1y);
  return { x, y, dx, dy };
}

// Pure deterministic C2-continuous trajectory evaluator for any landing progress `t` (0..1) or CAUGHT time `ct`
export function computeBackDockLanding(g, rig, overrideT = null) {
  const isCaught = overrideT === null ? (g.state === 'CAUGHT') : (overrideT >= 1.0);
  const t = isCaught ? 1.0 : clamp(overrideT === null ? (g.landingT || 0) : overrideT, 0, 1);
  const ct = isCaught ? Math.max(0, g.catchTime || 0) : 0;
  const wf = g.landingWeightFactor ?? 0.35;

  const fishId = isCaught
    ? (g.lastCatchInfo && g.lastCatchInfo.species && g.lastCatchInfo.species.id)
    : (g.activeFish && g.activeFish.species && g.activeFish.species.id);
  const sprSet = fishId && g.sprites && g.sprites.fish && g.sprites.fish[fishId];
  const sprW = sprSet ? (sprSet.w || 20) : 20;
  const sprH = sprSet ? (sprSet.h || 13) : 13;
  const botPad = sprSet && Number.isFinite(sprSet.botPad) ? sprSet.botPad : 0;
  const topPad = sprSet && Number.isFinite(sprSet.topPad) ? sprSet.topPad : 0;

  const pierY = g.pierY;
  const pierEndX = g.pierEndX;
  const waterY = g.waterY;
  const bounds = getAnglerSafetyBounds(g, rig);

  // EXACT FLUSH DOCK GROUNDING (0.0px air gap — lowest opaque pixel sits right on row pierY!)
  const restY = pierY + 1 + botPad - sprH * 0.5;
  const isBig = sprW >= 26;
  const isGiant = sprW >= 40;

  // Leave generous breathing room behind the angler (even during impact squash!)
  const maxImpactSX = isBig ? 1.0 : 1.18;
  const maxSafeBackX = bounds.staticBackSafeX - (sprW * maxImpactSX) * 0.5 - 1.5;
  const restSafeBackX = bounds.staticBackSafeX - sprW * 0.5 - 1.5;
  const minScreenX = sprW * 0.5 + 2.0;

  let restX, slamX;
  if (restSafeBackX >= minScreenX) {
    const idealRest = clamp(pierEndX * 0.27, minScreenX, Math.min(restSafeBackX, maxSafeBackX));
    const slideDist = clamp(lerp(12, 5, wf), 2, Math.max(2, maxSafeBackX - idealRest));
    restX = idealRest;
    slamX = clamp(restX + slideDist, minScreenX, maxSafeBackX);
  } else {
    restX = Math.min(restSafeBackX, maxSafeBackX);
    slamX = restX;
  }

  // Water-surface origin & launch handoff (seamless C1 position/slope transition at t=0.20!)
  const startX = Math.max(
    Number.isFinite(g.landingStartX) ? g.landingStartX : (pierEndX + Math.max(12, sprW * 0.5 + 4)),
    pierEndX + sprW * 0.5 + 3
  );
  const startY = Number.isFinite(g.landingStartY) ? g.landingStartY : (waterY + 4);
  const launchX = pierEndX + Math.max(8, sprW * 0.5 + 3.0);
  const launchY = Math.min(pierY - sprH * 0.5 - 8, bounds.hatTopY - sprH * 0.5 + 10);

  // Smooth ballistic pitch limits — gentle, weighty, pixel-clean angles (ZERO jagged 360-deg blender spins!)
  // For 'left' facing fish (-X), positive angle lifts nose UP, negative angle dips nose DOWN.
  const launchPitch = isGiant ? 0.34 : isBig ? 0.40 : 0.48; // +19.5° / +23° / +27.5° nose-up!
  const divePitch = isGiant ? -0.20 : isBig ? -0.26 : -0.34; // -11.5° / -15° / -19.5° nose-down!

  // At the apex above the angler's hat, the fish glides nearly level (angle ~ 0), so its true half-height
  // is closely sprH*0.5 + subtle tilt margin — keeping the ENTIRE flight arc dramatically framed in the sky!
  const apexHalfH = sprH * 0.5 + (isGiant ? 2.0 : 2.5);
  const apexX = lerp(launchX, slamX, isGiant ? 0.74 : 0.46);
  const desiredPeakY = Math.min(
    bounds.hatTopY - apexHalfH - 1.5,
    pierY - (isGiant ? 36 : 31) - wf * 2
  );
  let ctrlY = desiredPeakY * 2 - 0.5 * (launchY + restY);

  // Single-pass exact hat-clearance using the angler's actual hat width (+/-5.5px around footCenterX)
  // so every fish (Minnow -> Kraken Titan) arcs tightly over the popping straw hat, 100% framed in the sky!
  const footCenterX = g.anglerX + 11;
  const hatMinX = footCenterX - 5.5;
  const hatMaxX = footCenterX + 5.5;
  let worstShift = 0;
  const maxSu = isGiant ? 0.85 : 0.75;
  for (let su = 0.30; su <= maxSu; su += 0.03) {
    const test = quadBezier(launchX, launchY, apexX, ctrlY, slamX, restY, su);
    const estAng = su < 0.82 ? lerp(launchPitch, divePitch, smootherstep(su / 0.82)) : 0;
    const estHalfH = (sprH * Math.abs(Math.cos(estAng)) + sprW * Math.abs(Math.sin(estAng))) * 0.5 + 0.5;
    const estHalfW = (sprW * Math.abs(Math.cos(estAng)) + sprH * Math.abs(Math.sin(estAng))) * 0.46;
    const ov = (test.x + estHalfW) >= hatMinX && (test.x - estHalfW) <= hatMaxX;
    const ceilY = bounds.hatTopY - estHalfH - 0.5;
    if (ov && test.y > ceilY) {
      const neededShift = (test.y - ceilY) / Math.max(0.42, 2 * (1 - su) * su);
      if (neededShift > worstShift) worstShift = neededShift;
    }
  }
  ctrlY -= Math.min(worstShift, isGiant ? 15 : 12);

  // Smooth C2 ballistic curve evaluator (zero clamps, zero jitter!)
  const evalPureBezier = (p) => {
    // Subtle natural hang-time near apex (C2 smooth!)
    const u = clamp(p + Math.sin(p * Math.PI * 2) * 0.022, 0, 1);
    const bz = quadBezier(launchX, launchY, apexX, ctrlY, slamX, restY, u);
    const speed = Math.hypot(bz.dx, bz.dy) || 1;
    const tx = bz.dx / speed;
    const ty = bz.dy / speed;
    return { x: bz.x, y: bz.y, tx, ty, nx: -ty, ny: tx };
  };

  // Smooth C2 pitch angle along launch arc:
  // Starts at launchPitch (matching end of yank!), glides smoothly through 0 at apex,
  // peaks gently nose-down during dive, then levels smoothly toward 0 right before belly-slam!
  const evalLaunchAngle = (p) => {
    if (p < 0.82) {
      const a = smootherstep(p / 0.82);
      return lerp(launchPitch, divePitch, a);
    }
    // Last 18% smoothly levels out into a heavy belly-flop slam (ZERO sudden snap at t=0.56!)
    const lv = smootherstep((p - 0.82) / 0.18);
    return lerp(divePitch, 0, lv);
  };

  const evalLaunchState = (p) => {
    const bz = evalPureBezier(p);
    const angle = evalLaunchAngle(p);
    // Subtle, natural aerodynamic stretch during launch & dive; relaxed 1.0 at apex!
    const endBoost = Math.pow(Math.abs(p * 2 - 1), 1.5);
    const stretchAmt = isBig ? 0.0 : 0.08;
    const sx = 1 + stretchAmt * endBoost;
    const sy = 1 - stretchAmt * 0.72 * endBoost;
    const rb = rotatedBounds(sprW, sprH, angle, sx, sy);
    return { x: bz.x, y: bz.y, tx: bz.tx, ty: bz.ty, nx: bz.nx, ny: bz.ny, angle, sx, sy, w: rb.w, h: rb.h };
  };

  let fx = restX;
  let fy = restY;
  let mode = 'right';
  let phase = 'flop';
  let angle = 0;
  let squashX = 1;
  let squashY = 1;
  let flipScaleX = 1; // smooth foreshortened turnaround (1 -> 0.22 -> 1 while swapping left->right!)
  let hitFlash = false;
  let bowWave = null;
  const ghosts = [];
  const windTrail = [];

  if (!isCaught) {
    if (t < 0.20) {
      // BEAT 1: Elastic over-reel yank ripping the fish smoothly nose-up out of the ocean!
      phase = 'yank';
      const p = clamp(t / 0.20, 0, 1);
      const u = smootherstep(p);
      fx = lerp(startX, launchX, u);
      fy = lerp(startY, launchY, Math.pow(u, 0.85)) - Math.sin(u * Math.PI) * 3.5;
      mode = 'left';
      // Smoothly pitches from 0 -> launchPitch so t=0.20 handoff has ZERO angular jump!
      angle = lerp(0, launchPitch, smootherstep(p));
      const str = Math.sin(u * Math.PI * 0.5) * (isBig ? 0.0 : 0.08);
      squashX = 1 + str;
      squashY = 1 - str * 0.72;

      const rb = rotatedBounds(sprW, sprH, angle, squashX, squashY);
      if (fx - rb.w * 0.5 <= pierEndX + 1.5) {
        fy = Math.min(fy, pierY - rb.h * 0.5);
      }
      if (fx - rb.w * 0.5 <= bounds.anglerFrontSafeX + 1) {
        fx = Math.max(fx, bounds.anglerFrontSafeX + rb.w * 0.5 + 1.5);
      }
      if (p > 0.52 && fy < waterY - 2) {
        for (let wi = 0; wi <= 5; wi++) {
          const wu = clamp(u - wi * 0.10, 0, 1);
          const wx = lerp(startX, launchX, wu);
          const wy = Math.min(waterY - 1, lerp(startY, launchY, Math.pow(wu, 0.85)) - Math.sin(wu * Math.PI) * 3.5);
          windTrail.push({ x: wx, y: wy, nx: 0.75, ny: 0.66, u: wi / 5 });
        }
      }
    } else if (t < 0.56) {
      // BEAT 2: SILKY C2-CONTINUOUS BALLISTIC SOAR OVER THE ANGLER'S POPPING STRAW HAT!
      phase = 'launch';
      const p = clamp((t - 0.20) / 0.36, 0, 1);
      const cur = evalLaunchState(p);
      fx = cur.x;
      fy = cur.y;
      mode = 'left';
      angle = cur.angle;
      squashX = cur.sx;
      squashY = cur.sy;

      // 2 crisp subtle motion afterimages (soft opacity so big fish never look cluttered!)
      for (let gi = 1; gi <= 2; gi++) {
        const gp = p - gi * 0.042;
        if (gp > 0.02) {
          const gPt = evalLaunchState(gp);
          ghosts.push({
            x: gPt.x,
            y: gPt.y,
            mode: 'left',
            angle: gPt.angle,
            sx: gPt.sx,
            sy: gPt.sy,
            alpha: (isGiant ? 0.22 : 0.30) - gi * 0.08,
          });
        }
      }

      // 16-point pure kink-free parabolic tapered aerodynamic smear ribbon!
      const trailSamples = 16;
      const trailSpan = lerp(0.18, 0.44, Math.min(1, p * 2.0));
      for (let wi = 0; wi < trailSamples; wi++) {
        const frac = wi / (trailSamples - 1);
        const wp = clamp(p - frac * trailSpan, 0, 1);
        const pt = evalPureBezier(wp);
        windTrail.push({ x: pt.x, y: Math.min(waterY - 1, pt.y), nx: pt.nx, ny: pt.ny, u: frac });
      }

      // Crisp curved aerodynamic bow-wave crescent hugging the leading nose!
      if (p >= 0.06 && p <= 0.84) {
        const leadDist = sprW * 0.36 + 2;
        bowWave = {
          x: cur.x + cur.tx * leadDist,
          y: cur.y + cur.ty * leadDist,
          velAngle: Math.atan2(cur.ty, cur.tx),
          radius: Math.max(5.0, Math.min(10, sprH * 0.48)),
          alpha: Math.sin(clamp((p - 0.06) / 0.78, 0, 1) * Math.PI) * 0.85,
        };
      }
    } else if (t < 0.76) {
      // BEAT 3: CRISP DOCK SLAM #1 + CLEAN BOUNCE — ALL 26 FISH TURN TO LOOK RIGHT AT THE HUMAN!
      // ZERO white cutout blob, ZERO accordion pinch, ZERO pixel-row-dropping squash on big fish!
      phase = 'bounce1';
      const b1 = clamp((t - 0.56) / 0.20, 0, 1);
      const midX = lerp(slamX, restX, 0.66);
      mode = 'right'; // Looking straight at the shocked human!
      flipScaleX = 1;

      if (b1 < 0.14) {
        fx = slamX;
        fy = restY;
        angle = 0;
        if (!isBig) {
          const sqAmt = Math.sin((b1 / 0.14) * Math.PI);
          squashX = 1 + 0.16 * sqAmt;
          squashY = 1 - 0.16 * sqAmt;
        }
        hitFlash = false; // Zero solid-white cutout glitch — keep full vibrant pixel art!
      } else {
        const airP = (b1 - 0.14) / 0.86;
        fx = lerp(slamX, midX, smootherstep(airP));
        const bounceH1 = lerp(10.0, 5.5, wf);
        fy = restY - Math.sin(airP * Math.PI) * bounceH1;
        // Pure 1:1 native crisp pixels on big fish (angle = 0 -> ZERO RotSprite boundary flicker on dock!)
        angle = isBig ? 0 : Math.sin(airP * Math.PI * 2) * 0.18 * Math.sin(airP * Math.PI);
      }
    } else if (t < 0.90) {
      // BEAT 4: Dampened secondary bounce sliding cleanly onto restX, looking at the human!
      phase = 'bounce2';
      const b2 = clamp((t - 0.76) / 0.14, 0, 1);
      const midX = lerp(slamX, restX, 0.66);
      fx = lerp(midX, restX, smootherstep(b2));
      const bounceH2 = lerp(4.5, 2.2, wf);
      fy = restY - Math.sin(b2 * Math.PI) * bounceH2;
      mode = 'right';
      flipScaleX = 1;
      angle = isBig ? 0 : (b2 < 0.15 ? 0 : Math.sin(((b2 - 0.15) / 0.85) * Math.PI * 2) * 0.10 * Math.sin(b2 * Math.PI));
    } else {
      // BEAT 5: Crisp grounded skid-settle ending 0px flush on pierY, looking right at the human!
      phase = 'settle';
      const s = clamp((t - 0.90) / 0.10, 0, 1);
      fx = restX;
      const settleHop = s < 0.50 ? Math.sin((s / 0.50) * Math.PI) * lerp(1.5, 0.7, wf) : 0;
      fy = restY - settleHop;
      mode = 'right';
      flipScaleX = 1;
      angle = 0;
    }
  } else {
    // LIVE CAUGHT STATE: FIRMLY GROUNDED ON THE BACK OF THE DOCK, LOOKING AT THE HUMAN!
    phase = 'flop';
    const cycle = 1.55;
    const local = ct % cycle;
    let flopHop = 0;
    let flopSlide = 0;
    mode = 'right';
    flipScaleX = 1;
    angle = 0;
    if (ct > 0.35 && local > 0.82 && local < 1.10) {
      const fp = (local - 0.82) / 0.28;
      flopHop = Math.sin(fp * Math.PI) * lerp(3.6, 1.9, wf);
      flopSlide = Math.sin(fp * Math.PI * 2) * lerp(0.9, 0.4, wf);
      angle = isBig ? 0 : Math.sin(fp * Math.PI * 2) * 0.10 * Math.sin(fp * Math.PI);
    } else if (!isBig && ct > 0.35 && local >= 1.10 && local < 1.22) {
      const amt = Math.sin(((local - 1.10) / 0.12) * Math.PI);
      squashX = 1 + 0.08 * amt;
      squashY = 1 - 0.07 * amt;
    }
    fx = clamp(restX + flopSlide, minScreenX <= restSafeBackX ? minScreenX : restX, restSafeBackX);
    fy = restY - flopHop;
  }

  const effSX = squashX * flipScaleX;
  const effBounds = Math.abs(angle) > 0.015
    ? rotatedBounds(sprW, sprH, angle, effSX, squashY)
    : { w: sprW * effSX, h: sprH * squashY };

  const activePad = (Math.abs(angle) <= 0.015) ? botPad : 0;
  const scaledPad = squashY < 0.99 ? Math.floor(activePad * squashY) : activePad;
  const maxGroundedCenterY = Math.abs(angle) <= 0.015
    ? (pierY + 1 + scaledPad - effBounds.h * 0.5)
    : (pierY - effBounds.h * 0.5);

  if ((fx - effBounds.w * 0.5) <= pierEndX + 1.5) {
    fy = Math.min(fy, maxGroundedCenterY);
  }
  if (t >= 0.56 || isCaught) {
    const dynSafeBackX = bounds.anglerBackSafeX - effBounds.w * 0.5 - 1.5;
    fx = Math.min(fx, Math.min(restSafeBackX, dynSafeBackX));
  }

  const hookX = fx - Math.cos(angle) * sprW * 0.42;
  const hookY = fy - Math.sin(angle) * sprW * 0.42 + 0.5;

  const breachPlume = (!isCaught && t >= 0.10 && t < 0.48)
    ? { x: lerp(startX, launchX, 0.55), y: waterY, progress: (t - 0.10) / 0.38, wf }
    : null;

  let impactFlash = null;
  if (!isCaught && t >= 0.56 && t < 0.75) {
    impactFlash = { x: fx, y: pierY, progress: (t - 0.56) / 0.19, big: true, wf, halfW: sprW * 0.54 };
  } else if (!isCaught && t >= 0.76 && t < 0.89) {
    impactFlash = { x: fx, y: pierY, progress: (t - 0.76) / 0.13, big: false, wf, halfW: sprW * 0.50 };
  }

  return {
    phase,
    x: fx,
    y: fy,
    mode,
    angle,
    flipScaleX,
    w: effBounds.w,
    h: effBounds.h,
    sprW,
    sprH,
    botPad,
    topPad,
    activePad,
    squashX,
    squashY,
    effSX,
    hitFlash,
    hookX,
    hookY,
    ghosts,
    windTrail,
    bowWave,
    breachPlume,
    sonicRing: bowWave,
    hatGust: (!isCaught && t >= 0.24 && t <= 0.52) ? Math.sin(((t - 0.24) / 0.28) * Math.PI) : 0,
    impactFlash,
    slamX,
    restX,
    restY,
    showPuddle: isCaught || t >= 0.56,
    showDizzyStars: isCaught || t >= 0.75,
    hatPopY: rig && Number.isFinite(rig.hatPopY) ? rig.hatPopY : 0,
    lookBack: rig ? !!rig.lookBack : (isCaught || t >= 0.44),
  };
}

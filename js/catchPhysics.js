// Single-source-of-truth physics & choreography for the Over-Reel Back-of-Dock Launch!
// Shared by js/game.js, js/renderer.js, js/anglerRenderer.js, and /sub-agents QA workers.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);

function rotatedBounds(w, h, angle, sx = 1, sy = 1) {
  const sw = w * sx;
  const sh = h * sy;
  const c = Math.abs(Math.cos(angle));
  const s = Math.abs(Math.sin(angle));
  return {
    w: sw * c + sh * s,
    h: sw * s + sh * c,
  };
}

function getAnglerSafetyBounds(g, rig) {
  const footCenterX = g.anglerX + 11;
  const hx = rig ? rig.headX : footCenterX;
  const hy = rig ? rig.headY : (g.pierY - 23.6);
  const sx = rig ? rig.shoulderX : footCenterX;
  const backFootX = rig ? rig.backFootX : (footCenterX - 4.5);
  const frontFootX = rig ? rig.frontFootX : (footCenterX + 4.5);
  const hatPop = rig && Number.isFinite(rig.hatPopY) ? rig.hatPopY : 0;
  const hatTopY = Math.round(hy) - 7 - Math.ceil(hatPop);
  const anglerBackSafeX = Math.min(backFootX - 3.5, sx - 6.5, hx - 7.0);
  const anglerFrontSafeX = Math.max(frontFootX + 3.5, sx + 6.5, hx + 6.5);
  return { hatTopY, anglerBackSafeX, anglerFrontSafeX };
}

// Quadratic Bezier position & analytical derivative
function quadBezier(p0x, p0y, p1x, p1y, p2x, p2y, u) {
  const inv = 1 - u;
  const x = inv * inv * p0x + 2 * inv * u * p1x + u * u * p2x;
  const y = inv * inv * p0y + 2 * inv * u * p1y + u * u * p2y;
  const dx = 2 * inv * (p1x - p0x) + 2 * u * (p2x - p1x);
  const dy = 2 * inv * (p1y - p0y) + 2 * u * (p2y - p1y);
  return { x, y, dx, dy };
}

// Pure deterministic trajectory evaluator for any landing progress `t` (0..1) or CAUGHT time `ct`
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
  const flipRestY = pierY + 1 + topPad - sprH * 0.5;

  const maxSafeBackX = bounds.anglerBackSafeX - sprW * 0.5 - 1.5;
  const minScreenX = sprW * 0.5 + 2.0;

  let restX, slamX;
  if (maxSafeBackX >= minScreenX) {
    const idealRest = clamp(pierEndX * 0.27, minScreenX, maxSafeBackX);
    const slideDist = clamp(lerp(13, 6, wf), 3, Math.max(3, maxSafeBackX - idealRest));
    restX = idealRest;
    slamX = clamp(restX + slideDist, minScreenX, maxSafeBackX);
  } else {
    restX = maxSafeBackX;
    slamX = maxSafeBackX;
  }

  const startX = Math.max(
    Number.isFinite(g.landingStartX) ? g.landingStartX : (pierEndX + Math.max(12, sprW * 0.5 + 4)),
    pierEndX + sprW * 0.5 + 3
  );
  const startY = Number.isFinite(g.landingStartY) ? g.landingStartY : (waterY + 4);
  const launchX = pierEndX + Math.max(8, sprW * 0.5 + 3.0);
  const launchY = Math.min(pierY - sprH * 0.5 - 8, bounds.hatTopY - sprH * 0.5 + 10);

  // Pure, mathematically kink-free ballistic Bezier arc soaring cleanly over the angler's popping straw hat!
  const spinRevs = sprW <= 26 ? 2.0 : (sprW >= 42 ? 0.0 : 1.0);
  const apexX = lerp(launchX, slamX, 0.45);
  const maxRotHalfH = spinRevs === 0
    ? (sprH * 0.55 + sprW * 0.16)
    : (Math.hypot(sprW, sprH) * 0.54);
  const desiredPeakY = Math.min(
    bounds.hatTopY - maxRotHalfH - 3.5,
    pierY - 34 - wf * 5
  );
  // Solve quadratic Bezier control point P1.y so the smooth curve ITSELF clears the hat cleanly with ZERO step-kinks!
  const ctrlY = desiredPeakY * 2 - 0.5 * (launchY + restY);

  // Pure smooth Bezier path sampler (used for butter-smooth slipstream comet ribbon!)
  const evalPureBezier = (p) => {
    const u = clamp(p + Math.sin(p * Math.PI * 2) * 0.028, 0, 1);
    const bz = quadBezier(launchX, launchY, apexX, ctrlY, slamX, restY, u);
    const speed = Math.hypot(bz.dx, bz.dy) || 1;
    const tx = bz.dx / speed;
    const ty = bz.dy / speed;
    return { x: bz.x, y: bz.y, tx, ty, nx: -ty, ny: tx };
  };

  const evalLaunchState = (p) => {
    const bz = evalPureBezier(p);

    // Smooth continuous aerial flip (or graceful nose-up->apex->nose-dive arc for colossi like Kraken Titan!)
    const startPitch = spinRevs === 0 ? 0.36 : 0.50;
    const endPitch = spinRevs === 0 ? -0.28 : -0.34;
    const spinEase = Math.pow(p, 0.92);
    const angle = lerp(startPitch, endPitch, smoothstep(p)) - spinEase * spinRevs * Math.PI * 2;

    // Velocity-driven squash & stretch: sleek stretched rocket on launch & dive, rounded hang-time at apex!
    const endBoost = Math.pow(Math.abs(p * 2 - 1), 1.4);
    const sx = lerp(1.01, spinRevs === 0 ? 1.12 : 1.22, endBoost);
    const sy = lerp(0.99, spinRevs === 0 ? 0.90 : 0.82, endBoost);

    let px = bz.x;
    let py = bz.y;

    // Final safety envelope (purely defensive — the smooth Bezier above already clears cleanly!)
    const rb = rotatedBounds(sprW, sprH, angle, sx, sy);
    const overlapsAnglerX = (px + rb.w * 0.5) >= (bounds.anglerBackSafeX - 1.0) &&
                            (px - rb.w * 0.5) <= (bounds.anglerFrontSafeX + 1.0);
    if (overlapsAnglerX) {
      py = Math.min(py, bounds.hatTopY - rb.h * 0.5 - 2.0);
    }
    if ((px - rb.w * 0.5) <= pierEndX + 1.5) {
      py = Math.min(py, pierY - rb.h * 0.5);
    }

    return { x: px, y: py, tx: bz.tx, ty: bz.ty, nx: bz.nx, ny: bz.ny, angle, sx, sy, w: rb.w, h: rb.h };
  };

  let fx = restX;
  let fy = restY;
  let mode = 'right';
  let phase = 'flop';
  let angle = 0;
  let squashX = 1;
  let squashY = 1;
  let hitFlash = false;
  let bowWave = null;
  const ghosts = [];
  const windTrail = [];

  if (!isCaught) {
    if (t < 0.20) {
      // BEAT 1: Elastic over-reel yank ripping the fish nose-up out of the ocean!
      phase = 'yank';
      const p = clamp(t / 0.20, 0, 1);
      // Anticipation dip (0..0.18) -> explosive whip rocket upward!
      const whipP = p < 0.18 ? -Math.sin((p / 0.18) * Math.PI) * 0.04 : smoothstep((p - 0.18) / 0.82);
      const u = clamp(whipP, 0, 1);
      fx = lerp(startX, launchX, u);
      fy = lerp(startY, launchY, Math.pow(u, 0.82)) - Math.sin(u * Math.PI) * 4.5;
      mode = 'left';
      angle = lerp(0.10, 0.54, smoothstep(u));
      squashX = lerp(1.0, 1.22, Math.sin(u * Math.PI * 0.75));
      squashY = lerp(1.0, 0.82, Math.sin(u * Math.PI * 0.75));

      const rb = rotatedBounds(sprW, sprH, angle, squashX, squashY);
      if (fx - rb.w * 0.5 <= pierEndX + 1.5) {
        fy = Math.min(fy, pierY - rb.h * 0.5);
      }
      if (fx - rb.w * 0.5 <= bounds.anglerFrontSafeX + 1) {
        fx = Math.max(fx, bounds.anglerFrontSafeX + rb.w * 0.5 + 1.5);
      }
      if (p > 0.50 && fy < waterY - 2) {
        // Short above-water launch wake connecting the ocean surface breach up to the fish!
        for (let wi = 0; wi <= 5; wi++) {
          const wu = clamp(u - wi * 0.10, 0, 1);
          const wx = lerp(startX, launchX, wu);
          const wy = Math.min(waterY - 1, lerp(startY, launchY, Math.pow(wu, 0.82)) - Math.sin(wu * Math.PI) * 4.5);
          windTrail.push({ x: wx, y: wy, nx: 0.75, ny: 0.66, u: wi / 5 });
        }
      }
    } else if (t < 0.56) {
      // BEAT 2: SUPERSONIC BALLISTIC LAUNCH ARC OVER THE ANGLER'S POPPING HAT!
      phase = 'launch';
      const p = clamp((t - 0.20) / 0.36, 0, 1);
      const cur = evalLaunchState(p);
      fx = cur.x;
      fy = cur.y;
      mode = 'left';
      angle = cur.angle;
      squashX = cur.sx;
      squashY = cur.sy;

      // 3 silky rotated afterimage echoes trailing smoothly along the exact flight arc!
      for (let gi = 1; gi <= 3; gi++) {
        const gp = p - gi * 0.045;
        if (gp > 0.01) {
          const gPt = evalLaunchState(gp);
          ghosts.push({
            x: gPt.x,
            y: gPt.y,
            mode: 'left',
            angle: gPt.angle,
            sx: gPt.sx,
            sy: gPt.sy,
            alpha: 0.38 - gi * 0.095,
          });
        }
      }

      // 16-point pure kink-free parabolic tapered aerodynamic smear ribbon!
      const trailSamples = 16;
      const trailSpan = lerp(0.22, 0.54, Math.min(1, p * 2.2));
      const yBias = cur.y - evalPureBezier(p).y;
      for (let wi = 0; wi < trailSamples; wi++) {
        const frac = wi / (trailSamples - 1);
        const wp = clamp(p - frac * trailSpan, 0, 1);
        const pt = evalPureBezier(wp);
        const blendY = pt.y + yBias * (1 - frac);
        windTrail.push({ x: pt.x, y: Math.min(waterY - 1, blendY), nx: pt.nx, ny: pt.ny, u: frac });
      }

      // Crisp curved aerodynamic bow-wave crescent hugging the leading edge of the speeding fish!
      if (p >= 0.04 && p <= 0.88) {
        const leadDist = Math.max(sprW, sprH) * 0.34 + 2;
        bowWave = {
          x: cur.x + cur.tx * leadDist,
          y: cur.y + cur.ty * leadDist,
          velAngle: Math.atan2(cur.ty, cur.tx),
          radius: Math.max(5.5, Math.min(11, sprH * 0.52)),
          alpha: Math.sin(clamp((p - 0.04) / 0.84, 0, 1) * Math.PI) * 0.92,
        };
      }
    } else if (t < 0.75) {
      // BEAT 3: MEGA DOCK SLAM #1 (with 2-frame pure white hit-flash & big squash) -> clean aerial bounce!
      phase = 'bounce1';
      const b1 = clamp((t - 0.56) / 0.19, 0, 1);
      const midX = lerp(slamX, restX, 0.68);
      if (b1 < 0.14) {
        // Impact squash frame right on the slammed wooden planks!
        fx = slamX;
        fy = restY;
        mode = 'right';
        angle = 0;
        const sp = b1 / 0.14;
        squashX = lerp(lerp(1.34, 1.14, wf), lerp(1.16, 1.06, wf), sp);
        squashY = lerp(lerp(0.66, 0.76, wf), lerp(0.84, 0.90, wf), sp);
        hitFlash = b1 < 0.08;
      } else {
        const airP = (b1 - 0.14) / 0.86;
        fx = lerp(slamX, midX, smoothstep(airP));
        const bounceH1 = lerp(11.5, 6.8, wf);
        fy = restY - Math.sin(airP * Math.PI) * bounceH1;
        mode = 'right';
        // Clean smooth single tumble flip in mid-air -> lands upright at angle = 0!
        angle = -smoothstep(airP) * Math.PI * 2;
        if (airP < 0.22) {
          squashX = lerp(0.86, 1.0, airP / 0.22);
          squashY = lerp(1.16, 1.0, airP / 0.22);
        } else {
          squashX = 1.0;
          squashY = 1.0;
        }
      }
    } else if (t < 0.90) {
      // BEAT 4: Secondary dampened bounce settling onto restX!
      phase = 'bounce2';
      const b2 = clamp((t - 0.75) / 0.15, 0, 1);
      const midX = lerp(slamX, restX, 0.68);
      fx = lerp(midX, restX, smoothstep(b2));
      const bounceH2 = lerp(5.2, 2.8, wf);
      fy = restY - Math.sin(b2 * Math.PI) * bounceH2;
      mode = 'right';
      angle = b2 < 0.18 ? 0 : Math.sin(((b2 - 0.18) / 0.82) * Math.PI * 2) * 0.20;
      if (b2 < 0.18) {
        squashX = lerp(1.18, 1.0, b2 / 0.18);
        squashY = lerp(0.84, 1.0, b2 / 0.18);
      }
    } else {
      // BEAT 5: Crisp grounded skid-settle ending 0px flush on pierY!
      phase = 'settle';
      const s = clamp((t - 0.90) / 0.10, 0, 1);
      fx = restX;
      const settleHop = s < 0.52 ? Math.sin((s / 0.52) * Math.PI) * lerp(1.8, 0.9, wf) : 0;
      fy = restY - settleHop;
      mode = 'right';
      angle = 0;
      if (s >= 0.52 && s < 0.78) {
        squashX = 1.08;
        squashY = 0.93;
      }
    }
  } else {
    // LIVE CAUGHT STATE: FIRMLY GROUNDED ON THE BACK OF THE DOCK with snappy periodic wet flop hops!
    phase = 'flop';
    const cycle = 1.55;
    const local = ct % cycle;
    let flopHop = 0;
    let flopSlide = 0;
    mode = 'right';
    angle = 0;
    if (ct > 0.35 && local > 0.82 && local < 1.10) {
      const fp = (local - 0.82) / 0.28;
      flopHop = Math.sin(fp * Math.PI) * lerp(4.2, 2.2, wf);
      flopSlide = Math.sin(fp * Math.PI * 2) * lerp(1.1, 0.5, wf);
      angle = Math.sin(fp * Math.PI * 2) * 0.16;
    } else if (ct > 0.35 && local >= 1.10 && local < 1.22) {
      squashX = 1.12;
      squashY = 0.90;
    }
    fx = clamp(restX + flopSlide, minScreenX <= maxSafeBackX ? minScreenX : restX, maxSafeBackX);
    fy = restY - flopHop;
  }

  // Exact bounds & strict zero-noclip guards (0px pier interior noclip, 0px body noclip!)
  const effBounds = Math.abs(angle) > 0.02
    ? rotatedBounds(sprW, sprH, angle, squashX, squashY)
    : { w: sprW * squashX, h: sprH * squashY };

  const activePad = (Math.abs(angle) <= 0.02)
    ? (mode === 'flip' ? topPad : (mode === 'right' || mode === 'left') ? botPad : 0)
    : 0;
  const maxGroundedCenterY = Math.abs(angle) <= 0.02
    ? (pierY + 1 + activePad - effBounds.h * 0.5)
    : (pierY - effBounds.h * 0.5);

  if ((fx - effBounds.w * 0.5) <= pierEndX + 1.5) {
    fy = Math.min(fy, maxGroundedCenterY);
  }
  if (t >= 0.56 || isCaught) {
    const dynSafeBackX = bounds.anglerBackSafeX - effBounds.w * 0.5 - 1.5;
    fx = Math.min(fx, Math.min(maxSafeBackX, dynSafeBackX));
  }

  // Re-check angler overhead clearance when rotated near the angler
  if (!isCaught && t >= 0.18 && t < 0.56) {
    const ov = (fx + effBounds.w * 0.5) >= (bounds.anglerBackSafeX - 1.0) &&
               (fx - effBounds.w * 0.5) <= (bounds.anglerFrontSafeX + 1.0);
    if (ov) {
      fy = Math.min(fy, bounds.hatTopY - effBounds.h * 0.5 - 2.5);
    }
  }

  const hookX = fx - Math.cos(angle) * sprW * 0.42;
  const hookY = fy - Math.sin(angle) * sprW * 0.42 + 0.5;

  // Explosive ocean breach water column right where the fish rips out of the sea!
  const breachPlume = (!isCaught && t >= 0.10 && t < 0.48)
    ? { x: lerp(startX, launchX, 0.55), y: waterY, progress: (t - 0.10) / 0.38, wf }
    : null;

  // Clean dock slam impact windows (Slam #1 at t=0.56..0.75, Bounce Slam #2 at t=0.75..0.89)
  let impactFlash = null;
  if (!isCaught && t >= 0.56 && t < 0.75) {
    impactFlash = { x: fx, y: pierY, progress: (t - 0.56) / 0.19, big: true, wf, halfW: sprW * 0.45 };
  } else if (!isCaught && t >= 0.75 && t < 0.89) {
    impactFlash = { x: fx, y: pierY, progress: (t - 0.75) / 0.14, big: false, wf, halfW: sprW * 0.40 };
  }

  return {
    phase,
    x: fx,
    y: fy,
    mode,
    angle,
    w: effBounds.w,
    h: effBounds.h,
    sprW,
    sprH,
    botPad,
    topPad,
    activePad,
    squashX,
    squashY,
    hitFlash,
    hookX,
    hookY,
    ghosts,
    windTrail,
    bowWave,
    breachPlume,
    sonicRing: bowWave, // legacy alias for QA compatibility
    hatGust: (!isCaught && t >= 0.24 && t <= 0.52) ? Math.sin(((t - 0.24) / 0.28) * Math.PI) : 0,
    impactFlash,
    slamX,
    restX,
    restY,
    showPuddle: isCaught || t >= 0.56,
    showDizzyStars: isCaught || t >= 0.74,
    hatPopY: rig && Number.isFinite(rig.hatPopY) ? rig.hatPopY : 0,
    lookBack: rig ? !!rig.lookBack : (isCaught || t >= 0.44),
  };
}

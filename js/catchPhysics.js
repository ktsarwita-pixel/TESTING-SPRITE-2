// Single-source-of-truth physics & choreography for the Over-Reel Back-of-Dock Launch!
// Shared by js/game.js, js/renderer.js, js/anglerRenderer.js, and /sub-agents QA workers.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);

function modeDims(mode, sprW, sprH) {
  return (mode === 'hang' || mode === 'hangCW')
    ? { w: sprH, h: sprW }
    : { w: sprW, h: sprH };
}

function pickSpinMode(p, sprW, wf) {
  if (sprW <= 26) {
    const spins = lerp(3.0, 2.0, wf);
    const seq = ['left', 'hangCW', 'flip', 'hang'];
    return seq[Math.floor(p * spins * 4) % 4];
  }
  const spins = lerp(2.2, 1.5, wf);
  const seq = ['left', 'flip'];
  return seq[Math.floor(p * spins * 2) % 2];
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

  // EXACT FLUSH DOCK GROUNDING (0.0px air gap — matches angler boot soles & bucket bottom on row pierY!):
  // When drawn at dy = Math.round(restY - sprH / 2), the lowest opaque pixel row is:
  //   dy + (sprH - 1 - botPad) === pierY  =>  restY = pierY + 1 + botPad - sprH * 0.5
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
  const launchX = pierEndX + Math.max(7, sprW * 0.5 + 2.5);
  const launchY = Math.min(pierY - sprH * 0.5 - 10, bounds.hatTopY - sprH * 0.5 + 8);

  const evalLaunchArc = (p) => {
    const px = lerp(launchX, slamX, p);
    const mode = pickSpinMode(p, sprW, wf);
    const dims = modeDims(mode, sprW, sprH);
    const baseY = lerp(launchY, restY, p);
    const targetPeakY = bounds.hatTopY - dims.h * 0.5 - 3.5;
    const neededLift = Math.max(16, baseY - targetPeakY);
    let py = baseY - Math.sin(p * Math.PI) * neededLift;

    const overlapsAnglerX = (px + dims.w * 0.5) >= (bounds.anglerBackSafeX - 1) &&
                            (px - dims.w * 0.5) <= (bounds.anglerFrontSafeX + 1);
    if (overlapsAnglerX) {
      py = Math.min(py, bounds.hatTopY - dims.h * 0.5 - 2.5);
    }
    if ((px - dims.w * 0.5) <= pierEndX + 1.5) {
      py = Math.min(py, pierY - dims.h * 0.5);
    }
    return { x: px, y: py, mode, w: dims.w, h: dims.h };
  };

  let fx = restX;
  let fy = restY;
  let mode = 'right';
  let phase = 'flop';
  let squashX = 1;
  let squashY = 1;
  const ghosts = [];
  const windTrail = [];

  if (!isCaught) {
    if (t < 0.22) {
      phase = 'yank';
      const p = smoothstep(t / 0.22);
      const whipP = Math.pow(p, 0.85);
      fx = lerp(startX, launchX, whipP);
      fy = lerp(startY, launchY, whipP) - Math.sin(whipP * Math.PI) * 5;
      mode = 'left';
      if (fx - sprW * 0.5 <= pierEndX + 1.5) {
        fy = Math.min(fy, pierY - sprH * 0.5);
      }
      if (fx - sprW * 0.5 <= bounds.anglerFrontSafeX + 1) {
        fx = Math.max(fx, bounds.anglerFrontSafeX + sprW * 0.5 + 1.5);
      }
    } else if (t < 0.56) {
      phase = 'launch';
      const p = clamp((t - 0.22) / 0.34, 0, 1);
      const cur = evalLaunchArc(p);
      fx = cur.x;
      fy = cur.y;
      mode = cur.mode;
      for (let gi = 1; gi <= 3; gi++) {
        const gp = p - gi * 0.048;
        if (gp > 0.02) {
          const gPt = evalLaunchArc(gp);
          ghosts.push({ x: gPt.x, y: gPt.y, mode: gPt.mode, alpha: 0.44 - gi * 0.11 });
        }
      }
      // Sample exact curved slipstream wind ribbon points along the recent flight trajectory!
      for (let wi = 0; wi <= 7; wi++) {
        const wp = clamp(p - wi * 0.045, 0, 1);
        const pt = evalLaunchArc(wp);
        windTrail.push({ x: pt.x, y: pt.y, u: wi / 7 });
      }
    } else if (t < 0.75) {
      phase = 'bounce1';
      const b1 = clamp((t - 0.56) / 0.19, 0, 1);
      const midX = lerp(slamX, restX, 0.68);
      fx = lerp(slamX, midX, smoothstep(b1));
      const bounceH1 = lerp(12.5, 7.8, wf);
      mode = (b1 > 0.18 && b1 < 0.80) ? 'flip' : 'right';
      const floorY = mode === 'flip' ? flipRestY : restY;
      fy = floorY - Math.sin(b1 * Math.PI) * bounceH1;
      if (b1 < 0.16) {
        squashX = 1.28;
        squashY = 0.74;
      } else if (b1 < 0.30) {
        squashX = 0.86;
        squashY = 1.15;
      }
    } else if (t < 0.90) {
      phase = 'bounce2';
      const b2 = clamp((t - 0.75) / 0.15, 0, 1);
      const midX = lerp(slamX, restX, 0.68);
      fx = lerp(midX, restX, smoothstep(b2));
      const bounceH2 = lerp(5.8, 3.2, wf);
      fy = restY - Math.sin(b2 * Math.PI) * bounceH2;
      mode = 'right';
      if (b2 < 0.18) {
        squashX = 1.16;
        squashY = 0.86;
      }
    } else {
      phase = 'settle';
      const s = clamp((t - 0.90) / 0.10, 0, 1);
      fx = restX;
      // Quick grounded skid-settle ending flush on pierY (0px gap!)
      const settleHop = s < 0.55 ? Math.sin((s / 0.55) * Math.PI) * lerp(2.0, 1.1, wf) : 0;
      fy = restY - settleHop;
      mode = 'right';
      if (s >= 0.55 && s < 0.78) {
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
    // Rests firmly flush on wooden planks ~76% of the time; bursts into snappy wet flop hops!
    if (ct > 0.35 && local > 0.82 && local < 1.10) {
      const fp = (local - 0.82) / 0.28;
      flopHop = Math.sin(fp * Math.PI) * lerp(4.4, 2.4, wf);
      flopSlide = Math.sin(fp * Math.PI * 2) * lerp(1.2, 0.5, wf);
      mode = (sprW <= 26 && fp > 0.28 && fp < 0.70 && Math.floor(ct / cycle) % 2 === 1) ? 'flip' : 'right';
    } else if (ct > 0.35 && local >= 1.10 && local < 1.22) {
      // Tactile belly slap-down squash on the wooden planks!
      squashX = 1.12;
      squashY = 0.90;
      mode = 'right';
    } else {
      mode = 'right';
    }
    fx = clamp(restX + flopSlide, minScreenX <= maxSafeBackX ? minScreenX : restX, maxSafeBackX);
    const floorY = mode === 'flip' ? flipRestY : restY;
    fy = floorY - flopHop;
  }

  const dims = modeDims(mode, sprW, sprH);
  // Floor guard: lowest opaque pixel strictly <= pierY (flush ON TOP of planks, ZERO sinking into pierY+1..pierY+4!)
  const activePad = mode === 'flip' ? topPad : (mode === 'right' || mode === 'left') ? botPad : 0;
  const maxGroundedCenterY = pierY + 1 + activePad - dims.h * 0.5;
  if ((fx - dims.w * 0.5) <= pierEndX + 1.5) {
    fy = Math.min(fy, maxGroundedCenterY);
  }
  if (t >= 0.56 || isCaught) {
    fx = Math.min(fx, maxSafeBackX);
  }

  const hookX = fx - sprW * 0.42;
  const hookY = fy + 0.5;

  // Sonic air-break shock ring at launch breakout (t = 0.20..0.40)
  const sonicRing = (!isCaught && t >= 0.20 && t < 0.40)
    ? { x: launchX - 2, y: launchY, progress: (t - 0.20) / 0.20 }
    : null;

  // Rich dock slam impact FX windows (Slam #1 at t=0.56..0.76, Bounce Slam #2 at t=0.75..0.90)
  let impactFlash = null;
  if (!isCaught && t >= 0.56 && t < 0.76) {
    impactFlash = { x: slamX, y: pierY, progress: (t - 0.56) / 0.20, big: true, wf };
  } else if (!isCaught && t >= 0.75 && t < 0.90) {
    impactFlash = { x: lerp(slamX, restX, 0.68), y: pierY, progress: (t - 0.75) / 0.15, big: false, wf };
  }

  return {
    phase,
    x: fx,
    y: fy,
    mode,
    w: dims.w,
    h: dims.h,
    botPad,
    topPad,
    activePad,
    squashX,
    squashY,
    hookX,
    hookY,
    ghosts,
    windTrail,
    sonicRing,
    impactFlash,
    hatGust: !isCaught && t >= 0.26 && t <= 0.54 ? Math.sin(((t - 0.26) / 0.28) * Math.PI) : 0,
    showPuddle: isCaught || t >= 0.56,
    showDizzyStars: isCaught || t >= 0.76,
    slamX,
    restX,
    restY,
    lineAttached: !isCaught && t < 0.24,
    lineWhipT: !isCaught && t >= 0.24 && t < 0.44 ? (t - 0.24) / 0.20 : -1,
  };
}

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
    // Full 4-way crisp lossless pixel cartwheel somersault!
    const spins = lerp(3.0, 2.0, wf);
    const seq = ['left', 'hangCW', 'flip', 'hang'];
    return seq[Math.floor(p * spins * 4) % 4];
  }
  // Large / giant fish: high-speed barrel-flip keeping vertical height compact over hat!
  const spins = lerp(2.2, 1.5, wf);
  const seq = ['left', 'flip'];
  return seq[Math.floor(p * spins * 2) % 2];
}

// Compute the angler's safe bounding box & hat top for strict zero-noclip clearance
function getAnglerSafetyBounds(g, rig) {
  const footCenterX = g.anglerX + 11;
  const hx = rig ? rig.headX : footCenterX;
  const hy = rig ? rig.headY : (g.pierY - 23.6);
  const sx = rig ? rig.shoulderX : footCenterX;
  const backFootX = rig ? rig.backFootX : (footCenterX - 4.5);
  const frontFootX = rig ? rig.frontFootX : (footCenterX + 4.5);

  // Hat crown top pixel (accounting for the 2-3px panic hat-pop gust!)
  const hatPop = rig && Number.isFinite(rig.hatPopY) ? rig.hatPopY : 0;
  const hatTopY = Math.round(hy) - 7 - Math.ceil(hatPop);

  // Strict horizontal clearance behind the angler (clearing back boot, hat brim, and fluttering scarf!)
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

  const pierY = g.pierY;
  const pierEndX = g.pierEndX;
  const waterY = g.waterY;
  const bounds = getAnglerSafetyBounds(g, rig);

  // ── Back-of-Dock Visible Arena Coordinates (0px angler noclip, 0px pier noclip!) ──
  // Exact resting Y so sprite bottom pixel sits strictly at pierY - 1 (flush ON TOP of planks!)
  const restY = pierY - sprH * 0.5 - 0.8;

  // Maximum right centerX that keeps the fish strictly behind the angler's back & scarf
  const maxSafeBackX = bounds.anglerBackSafeX - sprW * 0.5 - 1.5;
  const minScreenX = sprW * 0.5 + 2.0;

  let restX, slamX;
  if (maxSafeBackX >= minScreenX) {
    // Generous visible back-of-dock zone! Slams closer to center-back, skids deeper onto dock!
    const idealRest = clamp(pierEndX * 0.27, minScreenX, maxSafeBackX);
    const slideDist = clamp(lerp(13, 6, wf), 3, Math.max(3, maxSafeBackX - idealRest));
    restX = idealRest;
    slamX = clamp(restX + slideDist, minScreenX, maxSafeBackX);
  } else {
    // Ultra-narrow mobile portrait fallback for giant 56px Kraken: stays clear of angler & visible!
    restX = maxSafeBackX;
    slamX = maxSafeBackX;
  }

  // Launch coordinates right over the water edge
  const startX = Math.max(
    Number.isFinite(g.landingStartX) ? g.landingStartX : (pierEndX + Math.max(12, sprW * 0.5 + 4)),
    pierEndX + sprW * 0.5 + 3
  );
  const startY = Number.isFinite(g.landingStartY) ? g.landingStartY : (waterY + 4);
  const launchX = pierEndX + Math.max(7, sprW * 0.5 + 2.5);
  const launchY = Math.min(pierY - sprH * 0.5 - 10, bounds.hatTopY - sprH * 0.5 + 8);

  // Helper to evaluate a point along the overhead supersonic launch arc (p in 0..1)
  const evalLaunchArc = (p) => {
    const px = lerp(launchX, slamX, p);
    const mode = pickSpinMode(p, sprW, wf);
    const dims = modeDims(mode, sprW, sprH);
    const baseY = lerp(launchY, restY, p);
    const targetPeakY = bounds.hatTopY - dims.h * 0.5 - 3.5;
    const neededLift = Math.max(16, baseY - targetPeakY);
    let py = baseY - Math.sin(p * Math.PI) * neededLift;

    // Hard overhead clearance guard over angler head/hat/body!
    const overlapsAnglerX = (px + dims.w * 0.5) >= (bounds.anglerBackSafeX - 1) &&
                            (px - dims.w * 0.5) <= (bounds.anglerFrontSafeX + 1);
    if (overlapsAnglerX) {
      py = Math.min(py, bounds.hatTopY - dims.h * 0.5 - 2.5);
    }
    // Hard wooden pier plank clearance guard!
    if ((px - dims.w * 0.5) <= pierEndX + 1.5) {
      py = Math.min(py, pierY - dims.h * 0.5 - 0.8);
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

  if (!isCaught) {
    if (t < 0.22) {
      // PHASE 1: TURBO OVER-REEL YANK — fish ripped violently out of the ocean!
      phase = 'yank';
      const p = smoothstep(t / 0.22);
      // Slight explosive acceleration curve (ease-in-out whip)
      const whipP = Math.pow(p, 0.85);
      fx = lerp(startX, launchX, whipP);
      fy = lerp(startY, launchY, whipP) - Math.sin(whipP * Math.PI) * 5;
      mode = 'left';
      if (fx - sprW * 0.5 <= pierEndX + 1.5) {
        fy = Math.min(fy, pierY - sprH * 0.5 - 1.5);
      }
      if (fx - sprW * 0.5 <= bounds.anglerFrontSafeX + 1) {
        fx = Math.max(fx, bounds.anglerFrontSafeX + sprW * 0.5 + 1.5);
      }
    } else if (t < 0.56) {
      // PHASE 2: SUPERSONIC BALLISTIC LAUNCH OVER THE ANGLER'S HAT!
      phase = 'launch';
      const p = clamp((t - 0.22) / 0.34, 0, 1);
      const cur = evalLaunchArc(p);
      fx = cur.x;
      fy = cur.y;
      mode = cur.mode;
      // 3 glowing pixel-art speed afterimage echoes trailing behind the soaring fish!
      for (let gi = 1; gi <= 3; gi++) {
        const gp = p - gi * 0.048;
        if (gp > 0.02) {
          const gPt = evalLaunchArc(gp);
          ghosts.push({
            x: gPt.x,
            y: gPt.y,
            mode: gPt.mode,
            alpha: 0.42 - gi * 0.11,
          });
        }
      }
    } else if (t < 0.75) {
      // PHASE 3: MEGA DOCK SLAM #1 + HIGH ELASTIC CARTOON BOUNCE + SKID!
      phase = 'bounce1';
      const b1 = clamp((t - 0.56) / 0.19, 0, 1);
      const midX = lerp(slamX, restX, 0.68);
      fx = lerp(slamX, midX, smoothstep(b1));
      const bounceH1 = lerp(13.5, 8.2, wf);
      fy = restY - Math.sin(b1 * Math.PI) * bounceH1;
      mode = (b1 > 0.18 && b1 < 0.80) ? 'flip' : 'right';
      // Impact squash right at slam, stretch at rebound launch
      if (b1 < 0.16) {
        squashX = 1.24;
        squashY = 0.78;
      } else if (b1 < 0.32) {
        squashX = 0.88;
        squashY = 1.14;
      }
    } else if (t < 0.90) {
      // PHASE 4: SLAM #2 + SPRINGY BOUNCE #2 + SKID TO REST SPOT!
      phase = 'bounce2';
      const b2 = clamp((t - 0.75) / 0.15, 0, 1);
      const midX = lerp(slamX, restX, 0.68);
      fx = lerp(midX, restX, smoothstep(b2));
      const bounceH2 = lerp(6.8, 3.8, wf);
      fy = restY - Math.sin(b2 * Math.PI) * bounceH2;
      mode = 'right';
      if (b2 < 0.18) {
        squashX = 1.14;
        squashY = 0.88;
      }
    } else {
      // PHASE 5: SETTLE DOUBLE TAIL-SLAP ON BACK OF DOCK -> SEAMLESS INTO CAUGHT!
      phase = 'settle';
      const s = clamp((t - 0.90) / 0.10, 0, 1);
      fx = restX;
      // Smoothly ends at 0 hop at s=1.0 for 0.00px continuity into CAUGHT!
      const settleHop = Math.sin(s * Math.PI) * Math.abs(Math.sin(s * Math.PI * 2)) * lerp(2.8, 1.6, wf);
      fy = restY - settleHop;
      mode = 'right';
    }
  } else {
    // LIVE CAUGHT STATE: VISIBLY FLOPPING ON THE BACK OF THE DOCK!
    phase = 'flop';
    const cycle = 1.28;
    const local = ct % cycle;
    let flopHop = 0;
    let flopSlide = 0;
    // Energetic wet-fish flop burst every 1.28s (starts gently after ct=0.14 so ct=0 matches t=1.0 seamlessly!)
    if (ct > 0.10 && local > 0.14 && local < 0.54) {
      const fp = (local - 0.14) / 0.40;
      const hopPeak = lerp(5.8, 3.2, wf);
      flopHop = Math.sin(fp * Math.PI) * hopPeak;
      flopSlide = Math.sin(fp * Math.PI * 2) * lerp(1.4, 0.6, wf);
      // Small/medium fish even briefly flip upside-down mid-flop for pure arcade comedy!
      if (sprW <= 26 && fp > 0.25 && fp < 0.72 && Math.floor(ct / cycle) % 2 === 1) {
        mode = 'flip';
      } else {
        mode = 'right';
      }
    } else if (ct > 0.10 && local > 0.64 && local < 0.84) {
      // Secondary quick tail-slap twitch!
      const tp = (local - 0.64) / 0.20;
      flopHop = Math.sin(tp * Math.PI) * lerp(2.6, 1.4, wf);
      mode = 'right';
    } else {
      mode = 'right';
    }
    fx = clamp(restX + flopSlide, minScreenX <= maxSafeBackX ? minScreenX : restX, maxSafeBackX);
    fy = restY - flopHop;
  }

  // Final hard plank floor safety clamp: ZERO pixels EVER clip into wooden pier planks!
  const dims = modeDims(mode, sprW, sprH);
  if ((fx - dims.w * 0.5) <= pierEndX + 1.5) {
    fy = Math.min(fy, pierY - dims.h * 0.5 - 0.8);
  }
  // Final hard back-dock body safety clamp once landed
  if (t >= 0.56 || isCaught) {
    fx = Math.min(fx, maxSafeBackX);
  }

  // Hook attaches to fish mouth while line is taut during Beat 1 yank!
  const hookX = fx - sprW * 0.42;
  const hookY = fy + 0.5;

  // Impact comic starburst / shockwave ring progress for Slam #1 and Slam #2
  let impactFlash = null;
  if (!isCaught && t >= 0.56 && t < 0.70) {
    impactFlash = { x: slamX, y: pierY - 1, progress: (t - 0.56) / 0.14, big: true };
  } else if (!isCaught && t >= 0.75 && t < 0.84) {
    impactFlash = { x: lerp(slamX, restX, 0.68), y: pierY - 1, progress: (t - 0.75) / 0.09, big: false };
  }

  return {
    phase,
    x: fx,
    y: fy,
    mode,
    w: dims.w,
    h: dims.h,
    squashX,
    squashY,
    hookX,
    hookY,
    ghosts,
    impactFlash,
    showPuddle: isCaught || t >= 0.56,
    showDizzyStars: isCaught || t >= 0.76,
    slamX,
    restX,
    restY,
    lineAttached: !isCaught && t < 0.24,
    lineWhipT: !isCaught && t >= 0.24 && t < 0.44 ? (t - 0.24) / 0.20 : -1,
  };
}

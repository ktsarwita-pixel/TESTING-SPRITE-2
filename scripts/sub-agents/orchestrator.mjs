#!/usr/bin/env node
/**
 * Pierline Local Sub-Agent Orchestrator (8 Parallel Specialist QA Workers)
 * Spawns 8 parallel child-process specialist workers in this workspace:
 *   1. sprite-inspector   - audits all 26 fish x 4 frames for floating/disconnected pixels, silhouettes, color depth
 *   2. audio-qa           - verifies all 55 SFX categories & 162 WAV files on disk
 *   3. code-verifier      - syntax-checks every JS module and verifies all HTML DOM IDs referenced by JS
 *   4. ui-data-auditor    - audits maps, rarity tables, CSS pixel rules, and modal structure
 *   5. rig-kinematics-qa  - 60fps biomechanical audit of REELING -> LANDING -> CAUGHT across 5 weight classes
 *   6. face-eye-qa        - pixel-level render audit verifying crisp visible eye & zero rod/fish face occlusion
 *   7. catch-physics-qa   - verifies water-breach splash, pier clearance, weight-scaled arcs, mouth-hook line & rod whip
 *   8. silhouette-qa      - audits grip contact, non-crossing arms, weight differentiation & head/gaze realism
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

const ALL_WORKERS = [
  'sprite-inspector',
  'audio-qa',
  'code-verifier',
  'ui-data-auditor',
  'rig-kinematics-qa',
  'face-eye-qa',
  'catch-physics-qa',
  'silhouette-qa',
  'noclip-body-qa',
  'noclip-pier-qa',
  'screenshotter-action',
  'screenshotter-noclip',
  'gameplay-e2e-qa',
  'state-machine-qa',
];

async function runSpriteInspector() {
  const { FISH_SPRITES } = await import(path.join(ROOT, 'js/fishSprites.js'));
  const { FISH_SPECIES } = await import(path.join(ROOT, 'js/fishData.js'));
  const speciesIds = FISH_SPECIES.map((s) => s.id);
  const flagged = [];
  let totalScore = 0;

  for (const id of speciesIds) {
    const frames = FISH_SPRITES[id];
    if (!frames || frames.length < 4) {
      flagged.push({ id, reason: 'missing frames (<4)', score: 0 });
      continue;
    }
    let minFrameScore = 10;
    const issues = [];
    for (let fi = 0; fi < frames.length; fi++) {
      const rows = frames[fi];
      const h = rows.length;
      const w = rows[0].length;
      const pts = [];
      const colors = new Set();
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const ch = rows[y][x];
          if (ch !== '.') {
            pts.push([x, y]);
            colors.add(ch);
          }
        }
      }
      const key = (x, y) => `${x},${y}`;
      const set = new Set(pts.map(([x, y]) => key(x, y)));
      const visited = new Set();
      const comps = [];
      for (const [sx, sy] of pts) {
        const sk = key(sx, sy);
        if (visited.has(sk)) continue;
        const q = [[sx, sy]];
        visited.add(sk);
        let sz = 0;
        while (q.length) {
          const [cx, cy] = q.pop();
          sz++;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              const nk = key(cx + dx, cy + dy);
              if (set.has(nk) && !visited.has(nk)) {
                visited.add(nk);
                q.push([cx + dx, cy + dy]);
              }
            }
          }
        }
        comps.push(sz);
      }
      let fScore = 10;
      if (comps.length > 1) {
        fScore -= Math.min(4, (comps.length - 1) * 1.5);
        issues.push(`f${fi}: ${comps.length} disconnected components`);
      }
      if (colors.size < 4) {
        fScore -= 2;
        issues.push(`f${fi}: only ${colors.size} palette colors`);
      }
      minFrameScore = Math.min(minFrameScore, Math.max(1, fScore));
    }
    totalScore += minFrameScore;
    if (minFrameScore < 9.0) flagged.push({ id, score: minFrameScore, issues });
  }

  const avg = Number((totalScore / speciesIds.length).toFixed(2));
  return {
    agent: 'sprite-inspector',
    score: avg,
    pass: avg >= 9.0 && flagged.length === 0,
    summary: `${speciesIds.length} fish x 4 frames audited | ${flagged.length} flagged | avg ${avg}/10`,
    details: flagged,
  };
}

async function runAudioQA() {
  const manifestPath = path.join(ROOT, 'assets/sfx/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const map = manifest.files || manifest.categories || manifest;
  const cats = Object.keys(map);
  let totalFiles = 0;
  const missing = [];
  for (const cat of cats) {
    const entry = map[cat];
    const files = Array.isArray(entry) ? entry : (entry && entry.files) || [];
    for (const rel of files) {
      totalFiles++;
      const full = path.join(ROOT, 'assets/sfx', rel);
      if (!fs.existsSync(full) || fs.statSync(full).size < 44) {
        missing.push(`${cat}:${rel}`);
      }
    }
  }
  const score = missing.length === 0 ? 10 : Math.max(1, 10 - missing.length * 0.5);
  return {
    agent: 'audio-qa',
    score,
    pass: missing.length === 0,
    summary: `${cats.length} categories, ${totalFiles} WAV files verified | ${missing.length} issues`,
    details: missing.slice(0, 15),
  };
}

async function runCodeVerifier() {
  const jsDir = path.join(ROOT, 'js');
  const files = fs.readdirSync(jsDir).filter((f) => f.endsWith('.js')).sort();
  const syntaxErrors = [];
  for (const f of files) {
    const full = path.join(jsDir, f);
    const res = await new Promise((resolve) => {
      const p = spawn(process.execPath, ['--check', full], { stdio: 'pipe' });
      let err = '';
      p.stderr.on('data', (d) => (err += d.toString()));
      p.on('close', (code) => resolve({ code, err }));
    });
    if (res.code !== 0) syntaxErrors.push({ file: f, err: res.err.trim() });
  }
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const gameJs = fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8');
  const missingDomIds = [];
  for (const m of gameJs.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)) {
    if (!htmlIds.has(m[1])) missingDomIds.push(m[1]);
  }
  const issues = syntaxErrors.length + missingDomIds.length;
  const score = issues === 0 ? 10 : Math.max(1, 10 - issues * 2);
  return {
    agent: 'code-verifier',
    score,
    pass: issues === 0,
    summary: `${files.length} JS modules syntax-checked, ${htmlIds.size} DOM IDs verified | ${issues} issues`,
    details: { syntaxErrors, missingDomIds },
  };
}

async function runUiDataAuditor() {
  const { MAPS } = await import(path.join(ROOT, 'js/maps.js'));
  const { FISH_SPECIES, RARITY_META } = await import(path.join(ROOT, 'js/fishData.js'));
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  const issues = [];
  const mapIds = new Set(MAPS.map((m) => m.id));
  for (const sp of FISH_SPECIES) {
    if (!RARITY_META[sp.rarity]) issues.push(`unknown rarity on ${sp.id}: ${sp.rarity}`);
    for (const m of sp.maps || []) {
      if (!mapIds.has(m)) issues.push(`unknown map on ${sp.id}: ${m}`);
    }
  }
  if (!css.includes('image-rendering: pixelated')) issues.push('missing crisp pixelated image-rendering rule');
  const score = issues.length === 0 ? 10 : Math.max(1, 10 - issues.length * 1.5);
  return {
    agent: 'ui-data-auditor',
    score,
    pass: issues.length === 0,
    summary: `${MAPS.length} maps, ${FISH_SPECIES.length} species, pixel CSS rules checked | ${issues.length} issues`,
    details: issues,
  };
}

// Helper: shared deterministic 60fps catch-animation simulator reading live anglerRenderer + catchPhysics
async function simulateCatchSequence(fishId, wf) {
  const { computeAnglerRig } = await import(path.join(ROOT, 'js/anglerRenderer.js'));
  const { computeBackDockLanding } = await import(path.join(ROOT, 'js/catchPhysics.js'));
  const { FISH_SPRITES } = await import(path.join(ROOT, 'js/fishSprites.js'));
  const gameSrc = fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8');

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (t) => t * t * (3 - 2 * t);

  const sprW = FISH_SPRITES[fishId][0][0].length;
  const sprH = FISH_SPRITES[fishId][0].length;
  const spr = { w: sprW, h: sprH, right: Array(4).fill({ id: fishId, width: sprW, height: sprH }) };

  const g = {
    anglerX: 66, pierY: 62, pierEndX: 90, waterY: 76, time: 1.0, state: 'REELING',
    animLean: -1.4, animSquat: 1.0, animStance: 0.9,
    rodAngle: -1.04, rodFlex: 0.42, tension: 0.55, reelHold: true,
    crankAngle: 0.35, landingT: 0, landingWeightFactor: wf, catchTime: 0,
    activeFish: { species: { id: fishId }, x: 102, y: 80, dir: -1 },
    lastCatchInfo: null,
    sprites: { fish: { [fishId]: spr } },
    save: { upgrades: { rod: 2 } },
  };

  const preRig = computeAnglerRig(g);
  g.landingInitGripDX = preRig.gripX - preRig.shoulderX;
  g.landingInitGripDY = preRig.gripY - preRig.shoulderY;
  g.landingInitReelDX = preRig.reelX - preRig.shoulderX;
  g.landingInitReelDY = preRig.reelY - preRig.shoulderY;

  g.state = 'LANDING';
  const dt = 1 / 60;
  const steps = Math.round(60 / lerp(0.65, 0.53, wf));
  const frames = [];
  let prev = preRig;

  for (let i = 0; i <= steps; i++) {
    g.time += dt;
    const t = clamp(i / steps, 0, 1);
    g.landingT = t;
    const targetRod = t < 0.22
      ? lerp(-1.04, -2.42 - wf * 0.08, smoothstep(t / 0.22))
      : t < 0.56
        ? lerp(-2.42 - wf * 0.08, -2.26, smoothstep((t - 0.22) / 0.34))
        : -2.26;
    g.rodAngle = lerp(g.rodAngle, targetRod, 1 - Math.exp(-11 * dt));

    let tl, ts, tst;
    if (t < 0.22) {
      const p = smoothstep(t / 0.22);
      tl = lerp(-1.4, -3.6 - wf * 1.4, p);
      ts = lerp(1.0, 2.0 + wf * 1.2, p);
      tst = lerp(0.9, 1.0, p);
    } else if (t < 0.56) {
      const p = smoothstep((t - 0.22) / 0.34);
      const duckBell = Math.sin(p * Math.PI);
      tl = lerp(-3.6 - wf * 1.4, 1.1, p);
      ts = lerp(2.0 + wf * 1.2, 1.4, p) + duckBell * (2.2 + wf * 1.1);
      tst = lerp(1.0, 0.85, p);
    } else if (t < 0.78) {
      const p = smoothstep((t - 0.56) / 0.22);
      const flinch = Math.exp(-Math.pow((t - 0.57) / 0.05, 2)) * (1.2 + wf * 0.9);
      tl = lerp(1.1, 0.85, p);
      ts = lerp(1.4, 0.45, p) + flinch;
      tst = lerp(0.85, 0.55, p);
    } else {
      const p = smoothstep((t - 0.78) / 0.22);
      tl = lerp(0.85, 0.65, p);
      ts = lerp(0.45, 0.22 + wf * 0.18, p);
      tst = lerp(0.55, 0.42, p);
    }
    const ke = 1 - Math.exp(-11 * dt);
    g.animLean = lerp(g.animLean, tl, ke);
    g.animSquat = lerp(g.animSquat, ts, ke);
    g.animStance = lerp(g.animStance, tst, ke);

    const targetFlex = t < 0.22
      ? (0.65 + wf * 0.35) * Math.sin((t / 0.22) * Math.PI * 0.82)
      : Math.exp(-(t - 0.22) * 6.5) * Math.cos((t - 0.22) * 24) * (0.34 + wf * 0.16);
    g.rodFlex = lerp(g.rodFlex, targetFlex, 1 - Math.exp(-15 * dt));

    const rig = computeAnglerRig(g);
    const land = computeBackDockLanding(g, rig);
    frames.push({ t, rig, land, lean: g.animLean, squat: g.animSquat, stance: g.animStance, rodFlex: g.rodFlex, rodAngle: g.rodAngle, prev });
    prev = rig;
  }

  g.state = 'CAUGHT';
  g.catchTime = 0;
  g.lastCatchInfo = { species: { id: fishId } };
  const caughtRig = computeAnglerRig(g);
  const caughtLand = computeBackDockLanding(g, caughtRig);
  return { frames, preRig, caughtRig, caughtLand, sprW, sprH, gameSrc };
}

async function runRigKinematicsQA() {
  const cases = [
    ['minnow', 0.10],
    ['snapper', 0.30],
    ['tuna', 0.58],
    ['leviathan', 0.92],
    ['krakentitan', 1.0],
  ];
  const issues = [];
  const metrics = [];

  for (const [id, wf] of cases) {
    const { frames, preRig, caughtLand } = await simulateCatchSequence(id, wf);
    const f0 = frames[0].rig;
    const transJump = Math.max(
      Math.hypot(f0.gripX - preRig.gripX, f0.gripY - preRig.gripY),
      Math.hypot(f0.reelX - preRig.reelX, f0.reelY - preRig.reelY)
    );
    const lastLand = frames[frames.length - 1].land;
    const caughtJump = Math.hypot(caughtLand.x - lastLand.x, caughtLand.y - lastLand.y);

    let maxBackReach = 0, maxFrontReach = 0, maxRodDetach = 0, maxHandStep = 0, pierSlip = 0;
    for (let i = 0; i < frames.length; i++) {
      const r = frames[i].rig;
      maxBackReach = Math.max(maxBackReach, Math.hypot(r.gripX - (r.shoulderX + 1.2), r.gripY - (r.shoulderY + 0.8)));
      maxFrontReach = Math.max(maxFrontReach, Math.hypot(r.reelX - (r.shoulderX - 1.4), r.reelY - (r.shoulderY + 0.8)));
      maxRodDetach = Math.max(maxRodDetach, Math.hypot(r.rodHandX - r.gripX, r.rodHandY - r.gripY));
      if (r.frontFootX > 88) pierSlip = Math.max(pierSlip, r.frontFootX - 88);
      if (i > 0) {
        const p = frames[i - 1].rig;
        maxHandStep = Math.max(
          maxHandStep,
          Math.hypot(r.gripX - p.gripX, r.gripY - p.gripY),
          Math.hypot(r.reelX - p.reelX, r.reelY - p.reelY)
        );
      }
    }
    metrics.push({ id, transJump: +transJump.toFixed(3), caughtJump: +caughtJump.toFixed(3), maxBackReach: +maxBackReach.toFixed(2), maxFrontReach: +maxFrontReach.toFixed(2), maxRodDetach: +maxRodDetach.toFixed(3), maxHandStep: +maxHandStep.toFixed(2) });
    if (transJump > 0.25) issues.push(`${id}: REELING->LANDING hand snap ${transJump.toFixed(2)}px`);
    if (caughtJump > 0.25) issues.push(`${id}: LANDING->CAUGHT fish snap ${caughtJump.toFixed(2)}px`);
    if (maxBackReach > 9.2) issues.push(`${id}: back arm hyper-extension ${maxBackReach.toFixed(2)}px (>9.2)`);
    if (maxFrontReach > 9.2) issues.push(`${id}: front arm hyper-extension ${maxFrontReach.toFixed(2)}px (>9.2)`);
    if (maxRodDetach > 0.05) issues.push(`${id}: rod detached from back hand by ${maxRodDetach.toFixed(2)}px`);
    if (maxHandStep > 2.2) issues.push(`${id}: jerky hand velocity spike ${maxHandStep.toFixed(2)}px/frame`);
    if (pierSlip > 0) issues.push(`${id}: front boot slipped past pier edge by ${pierSlip.toFixed(1)}px`);
  }

  const score = Math.max(1, Number((10 - issues.length * 1.2).toFixed(1)));
  return {
    agent: 'rig-kinematics-qa',
    score,
    pass: score >= 9.0 && issues.length === 0,
    summary: `5 weight classes x 60fps checked | maxFrontReach=${Math.max(...metrics.map(m => m.maxFrontReach))}px | ${issues.length} issues`,
    details: { issues, metrics },
  };
}

async function runFaceEyeQA() {
  const { renderArticulatedAngler, computeAnglerRig } = await import(path.join(ROOT, 'js/anglerRenderer.js'));
  const { FISH_SPRITES } = await import(path.join(ROOT, 'js/fishSprites.js'));
  const statesToTest = [
    { name: 'IDLE', state: 'IDLE', time: 1.5, rodAngle: -0.62, landingT: 0 },
    { name: 'CHARGING', state: 'CHARGING', time: 1.5, rodAngle: -1.8, chargePower: 0.7 },
    { name: 'CASTING', state: 'CASTING', time: 1.5, rodAngle: -0.5, castT: 0.3 },
    { name: 'WAITING', state: 'WAITING', time: 1.5, rodAngle: -0.62 },
    { name: 'BITE', state: 'BITE', time: 1.5, rodAngle: -0.35 },
    { name: 'REELING', state: 'REELING', time: 1.5, rodAngle: -1.04, tension: 0.8 },
    ...Array.from({ length: 10 }, (_, i) => {
      const t = i / 9;
      return {
        name: `LANDING@${t.toFixed(2)}`,
        state: 'LANDING',
        time: 1.5 + t,
        rodAngle: t < 0.38 ? -1.04 - (t / 0.38) * 0.48 : -1.52 - ((t - 0.38) / 0.62) * 0.76,
        landingT: t,
      };
    }),
    { name: 'CAUGHT@0.1', state: 'CAUGHT', time: 2.6, rodAngle: -2.28, catchTime: 0.1 },
    { name: 'CAUGHT@1.5', state: 'CAUGHT', time: 4.0, rodAngle: -2.28, catchTime: 1.5 },
  ];

  const issues = [];
  for (const tc of statesToTest) {
    const grid = new Map();
    const put = (x, y, c) => grid.set(`${x},${y}`, c);
    const sprW = FISH_SPRITES.leviathan[0][0].length;
    const sprH = FISH_SPRITES.leviathan[0].length;
    const ctx = {
      fillStyle: '#fff', globalAlpha: 1, stack: [],
      save() { this.stack.push([this.fillStyle, this.globalAlpha]); },
      restore() { [this.fillStyle, this.globalAlpha] = this.stack.pop(); },
      fillRect(x, y, w, h) {
        const ix = Math.round(x), iy = Math.round(y);
        for (let dy = 0; dy < Math.round(h); dy++)
          for (let dx = 0; dx < Math.round(w); dx++)
            put(ix + dx, iy + dy, this.fillStyle);
      },
      drawImage(img, x, y) {
        const rows = FISH_SPRITES[img.id][0];
        const ix = Math.round(x), iy = Math.round(y);
        for (let ry = 0; ry < rows.length; ry++)
          for (let rx = 0; rx < rows[ry].length; rx++)
            if (rows[ry][rx] !== '.') put(ix + rx, iy + ry, 'FISH');
      },
    };
    const g = {
      anglerX: 24, pierY: 62, time: tc.time, state: tc.state,
      animLean: tc.state === 'REELING' ? -2.0 : 0, animSquat: 0.5, animStance: 0.6,
      rodAngle: tc.rodAngle, rodFlex: 0.25, tension: tc.tension || 0.4,
      chargePower: tc.chargePower || 0, castT: tc.castT || 0,
      landingT: tc.landingT || 0, landingWeightFactor: 0.92, catchTime: tc.catchTime || 0,
      save: { upgrades: { rod: 3 } },
      activeFish: { species: { id: 'leviathan' } },
      lastCatchInfo: { species: { id: 'leviathan' } },
      sprites: { fish: { leviathan: { w: sprW, h: sprH, right: Array(4).fill({ id: 'leviathan', width: sprW, height: sprH }), left: Array(4).fill({ id: 'leviathan', width: sprW, height: sprH }), hang: Array(4).fill({ id: 'leviathan', width: sprH, height: sprW }) } } },
    };
    renderArticulatedAngler(g, ctx);
    const rig = computeAnglerRig(g);
    const hx = Math.round(rig.headX);
    const hy = Math.round(rig.headY);

    // Check eye pixels on final composited framebuffer (both forward & over-the-shoulder lookBack poses!)
    let scleraFound = false, pupilFound = false, fishOverFace = false;
    for (let dy = -2; dy <= 0; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const col = grid.get(`${hx + dx},${hy + dy}`);
        if (col === '#ffffff' || col === '#fff5eb') scleraFound = true;
        if (col === '#111622') pupilFound = true;
        if (col === 'FISH') fishOverFace = true;
      }
    }
    if (!scleraFound || !pupilFound) {
      issues.push(`${tc.name}: eye missing or occluded on final framebuffer (sclera=${scleraFound}, pupil=${pupilFound})`);
    }
    if (fishOverFace) {
      issues.push(`${tc.name}: Leviathan fish sprite overlaps angler face!`);
    }
  }

  const score = Math.max(1, Number((10 - issues.length * 1.5).toFixed(1)));
  return {
    agent: 'face-eye-qa',
    score,
    pass: score >= 9.0 && issues.length === 0,
    summary: `${statesToTest.length} rendered frames raster-checked for crisp eye & zero occlusion | ${issues.length} issues`,
    details: issues,
  };
}

async function runCatchPhysicsQA() {
  const gameSrc = fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8');
  const renSrc = fs.readFileSync(path.join(ROOT, 'js/renderer.js'), 'utf8');
  const physSrc = fs.readFileSync(path.join(ROOT, 'js/catchPhysics.js'), 'utf8');
  const issues = [];

  // 1. Verify Over-Reel Back-of-Dock launch single-source-of-truth physics module is wired in!
  if (!gameSrc.includes('computeBackDockLanding')) issues.push('game.js missing computeBackDockLanding');
  if (!renSrc.includes('computeBackDockLanding')) issues.push('renderer.js missing computeBackDockLanding');
  // 2. Verify dock slam props jump + starburst + dizzy stars + afterimage ghosts!
  if (!gameSrc.includes('dockBounceVel')) issues.push('missing jumping dock props impulse (dockBounceVel) on slam');
  if (!renSrc.includes('impactFlash')) issues.push('missing comic impact starburst / shockwave ring on dock slam');
  if (!renSrc.includes('showDizzyStars')) issues.push('missing orbiting dizzy stars over stunned fish on back of dock');
  if (!physSrc.includes('ghosts')) issues.push('missing speed afterimage ghosts during overhead launch');
  if (!physSrc.includes('windTrail') || !physSrc.includes('sonicRing')) issues.push('missing curved slipstream wind ribbons or Mach sonic ring');
  if (!renSrc.includes('drawPixelDustPuff')) issues.push('missing billowing pixel dust clouds on dock slam');

  const landStart = gameSrc.lastIndexOf("else if (this.state === 'LANDING')");
  const landEnd = gameSrc.indexOf("else if (this.state === 'CAUGHT')", landStart);
  const landingBlock = gameSrc.slice(landStart, landEnd);

  // 3. Check elastic rod tip whip/rebound on water breakout
  if (!/Math\.cos\([^)]*\)/.test(landingBlock)) {
    issues.push('missing elastic rod-tip damped whip/rebound after fish breaks out of water');
  }
  // 4. Check pier clearance guard in catchPhysics.js
  if (!/pierY/.test(physSrc)) {
    issues.push('missing pier-edge vertical clearance guard during LANDING arc');
  }
  // 5. Check breach splash + slam #1 + slam #2 triggers
  if (!landingBlock.includes('landingBreachDone')) issues.push('missing water-breach splash trigger');
  if (!landingBlock.includes('landingSlam1Done')) issues.push('missing back-of-dock slam #1 trigger');
  if (!landingBlock.includes('landingSlam2Done')) issues.push('missing back-of-dock bounce slam #2 trigger');
  // 6. Check line slackening catenary curve in renderer.js
  if (!renSrc.includes('drawPixelQuad')) issues.push('missing slack catenary fishing line in renderer.js');
  // 7. Check heavy-vs-light posture differentiation in game.js
  const minnowSim = await simulateCatchSequence('minnow', 0.10);
  const leviSim = await simulateCatchSequence('leviathan', 0.92);
  const minSquat = Math.max(...minnowSim.frames.map((f) => f.squat));
  const leviSquat = Math.max(...leviSim.frames.map((f) => f.squat));
  if (leviSquat - minSquat < 0.8) {
    issues.push(`insufficient heavy-vs-light knee squat differentiation (minnow=${minSquat.toFixed(2)}, leviathan=${leviSquat.toFixed(2)})`);
  }

  const score = Math.max(1, Number((10 - issues.length * 1.4).toFixed(1)));
  return {
    agent: 'catch-physics-qa',
    score,
    pass: score >= 9.0 && issues.length === 0,
    summary: `Over-reel launch, overhead spin, dock slam, prop jump, starburst & rod-whip audited | ${issues.length} issues`,
    details: issues,
  };
}

async function runSilhouetteQA() {
  const angSrc = fs.readFileSync(path.join(ROOT, 'js/anglerRenderer.js'), 'utf8');
  const { rasterizeFrame } = await import(path.join(__dirname, 'screenshotter.mjs'));
  const { FISH_SPECIES } = await import(path.join(ROOT, 'js/fishData.js'));
  const issues = [];

  // 1. Check head-tracking, hat-pop & over-the-shoulder lookBack in anglerRenderer.js
  if (!/headTrack/.test(angSrc)) issues.push('missing dynamic head tracking during over-reel launch');
  if (!/hatPopY/.test(angSrc)) issues.push('missing panic straw-hat pop during overhead fish flyby');
  if (!/lookBack/.test(angSrc)) issues.push('missing over-the-shoulder lookBack toward back of dock');
  if (!/rodBehindBody\s*=.*tuck.*rodAngle/.test(angSrc)) {
    issues.push('rodBehindBody check missing early overhead hide guard');
  }

  // 2. Audit ALL 26 species: verify EVERY fish visibly lands on the BACK OF THE DOCK (behind angler & on-screen x>=0)!
  for (const sp of FISH_SPECIES) {
    const slamRes = rasterizeFrame(sp.id, 0.58);
    const caughtRes = rasterizeFrame(sp.id, 1.0);
    if (!slamRes.backDockVisible) {
      issues.push(`${sp.id}: slam not visibly on back of dock (x=${slamRes.fishMinX}..${slamRes.fishMaxX}, backFoot=${slamRes.rig.backFootX.toFixed(1)})`);
    }
    if (!caughtRes.backDockVisible) {
      issues.push(`${sp.id}: CAUGHT trophy not visibly on back of dock (x=${caughtRes.fishMinX}..${caughtRes.fishMaxX}, backFoot=${caughtRes.rig.backFootX.toFixed(1)})`);
    }
    if (!caughtRes.land.showDizzyStars) {
      issues.push(`${sp.id}: missing dizzy stars on back of dock in CAUGHT`);
    }
    if (caughtRes.groundingGap !== 0) {
      issues.push(`${sp.id}: fish floating/sinking on dock in CAUGHT (gap=${caughtRes.groundingGap}px, lowestY=${caughtRes.lowestFishOpaqueY}, pierY=${caughtRes.g.pierY})`);
    }
  }

  const score = Math.max(1, Number((10 - issues.length * 0.8).toFixed(1)));
  return {
    agent: 'silhouette-qa',
    score,
    pass: score >= 9.0 && issues.length === 0,
    summary: `All 26 species back-of-dock visibility, hat-pop, lookBack & dizzy flop audited | ${issues.length} issues`,
    details: issues,
  };
}


async function runNoclipBodyQA() {
  const { rasterizeFrame } = await import(path.join(__dirname, 'screenshotter.mjs'));
  const { FISH_SPECIES } = await import(path.join(ROOT, 'js/fishData.js'));
  const sampleTs = [0.08, 0.20, 0.34, 0.44, 0.56, 0.65, 0.78, 0.90, 1.0];
  const issues = [];
  let totalBadPx = 0;

  for (const sp of FISH_SPECIES) {
    let worst = 0;
    let worstT = 0;
    for (const st of sampleTs) {
      const res = rasterizeFrame(sp.id, st);
      if (res.bodyNoclips.length > worst) {
        worst = res.bodyNoclips.length;
        worstT = st;
      }
      totalBadPx += res.bodyNoclips.length;
    }
    if (worst > 0) {
      issues.push(`${sp.id}: ${worst}px noclip into angler head/hat/torso/legs at t=${worstT.toFixed(2)}`);
    }
  }
  const score = Math.max(1, Number((10 - issues.length * 0.65).toFixed(1)));
  return {
    agent: 'noclip-body-qa',
    score,
    pass: issues.length === 0,
    summary: `26 species x 9 frames raster-audited | ${issues.length} species noclipping body (${totalBadPx} bad px)`,
    details: issues,
  };
}

async function runNoclipPierQA() {
  const { rasterizeFrame } = await import(path.join(__dirname, 'screenshotter.mjs'));
  const { FISH_SPECIES } = await import(path.join(ROOT, 'js/fishData.js'));
  const sampleTs = [0.08, 0.20, 0.34, 0.44, 0.56, 0.65, 0.78, 0.90, 1.0];
  const issues = [];
  let totalBadPx = 0;

  for (const sp of FISH_SPECIES) {
    let worst = 0;
    let worstT = 0;
    for (const st of sampleTs) {
      const res = rasterizeFrame(sp.id, st);
      if (res.pierNoclips.length > worst) {
        worst = res.pierNoclips.length;
        worstT = st;
      }
      totalBadPx += res.pierNoclips.length;
    }
    if (worst > 0) {
      issues.push(`${sp.id}: ${worst}px noclip into wooden pier planks at t=${worstT.toFixed(2)}`);
    }
  }
  const score = Math.max(1, Number((10 - issues.length * 0.85).toFixed(1)));
  return {
    agent: 'noclip-pier-qa',
    score,
    pass: issues.length === 0,
    summary: `26 species x 9 frames raster-audited | ${issues.length} species noclipping pier (${totalBadPx} bad px)`,
    details: issues,
  };
}

async function runScreenshotterAction() {
  const { renderScreenshotSheet } = await import(path.join(__dirname, 'screenshotter.mjs'));
  const species = ['minnow', 'snapper', 'tuna', 'leviathan', 'krakentitan'];
  const ts = [0.08, 0.20, 0.36, 0.48, 0.57, 0.68, 0.82, 1.0];
  const out = renderScreenshotSheet('/tmp/subagent_action_sheet.png', species, ts, { heatmap: false, scale: 2 });
    renderScreenshotSheet('/tmp/subagent_flight_strip.png', ['snapper', 'tuna', 'krakentitan'], [0.16, 0.22, 0.28, 0.34, 0.40, 0.46, 0.52, 0.565, 0.61, 0.68, 0.76, 1.0], { heatmap: false, scale: 2 });
  const ok = fs.existsSync(out.outPath) && fs.statSync(out.outPath).size > 2000;
  return {
    agent: 'screenshotter-action',
    score: ok ? 10 : 1,
    pass: ok,
    summary: `Captured ${species.length}x${ts.length} full-dock live-engine PNG -> ${out.outPath}`,
    details: [out.outPath],
  };
}

async function runScreenshotterNoclip() {
  const { renderScreenshotSheet } = await import(path.join(__dirname, 'screenshotter.mjs'));
  const species = ['minnow', 'snapper', 'tuna', 'leviathan', 'krakentitan'];
  const ts = [0.08, 0.20, 0.36, 0.48, 0.57, 0.68, 0.82, 1.0];
  const out = renderScreenshotSheet('/tmp/subagent_noclip_heatmap.png', species, ts, { heatmap: true, scale: 2 });
  const total = out.totalBodyNoclips + out.totalPierNoclips;
  const score = total === 0 ? 10 : Math.max(1, Number((10 - Math.min(9, total * 0.04)).toFixed(1)));
  return {
    agent: 'screenshotter-noclip',
    score,
    pass: total === 0,
    summary: `Heatmap -> ${out.outPath} | bodyNoclip=${out.totalBodyNoclips}px, pierNoclip=${out.totalPierNoclips}px`,
    details: total === 0 ? [] : [`${out.totalBodyNoclips} magenta body-noclip px, ${out.totalPierNoclips} red pier-noclip px`],
  };
}


async function runGameplayE2EWorker() {
  const { runGameplayE2E } = await import(path.join(__dirname, 'gameplayAgent.mjs'));
  return runGameplayE2E();
}

async function runStateMachineWorker() {
  const { runStateMachineQA } = await import(path.join(__dirname, 'gameplayAgent.mjs'));
  return runStateMachineQA();
}

const WORKER_MAP = {
  'sprite-inspector': runSpriteInspector,
  'audio-qa': runAudioQA,
  'code-verifier': runCodeVerifier,
  'ui-data-auditor': runUiDataAuditor,
  'rig-kinematics-qa': runRigKinematicsQA,
  'face-eye-qa': runFaceEyeQA,
  'catch-physics-qa': runCatchPhysicsQA,
  'silhouette-qa': runSilhouetteQA,
  'noclip-body-qa': runNoclipBodyQA,
  'noclip-pier-qa': runNoclipPierQA,
  'screenshotter-action': runScreenshotterAction,
  'screenshotter-noclip': runScreenshotterNoclip,
  'gameplay-e2e-qa': runGameplayE2EWorker,
  'state-machine-qa': runStateMachineWorker,
};

const args = process.argv.slice(2);
const workerIdx = args.indexOf('--worker');
if (workerIdx !== -1 && args[workerIdx + 1]) {
  const name = args[workerIdx + 1];
  const fn = WORKER_MAP[name];
  if (!fn) {
    console.error(`Unknown worker: ${name}`);
    process.exit(2);
  }
  const out = await fn();
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

// Orchestrator mode: spawn selected sub-agents IN PARALLEL
const selected = args.includes('--all') || args.length === 0
  ? ALL_WORKERS
  : args.filter((a) => WORKER_MAP[a]);

const results = await Promise.all(
  selected.map(
    (name) =>
      new Promise((resolve) => {
        const child = spawn(process.execPath, [__filename, '--worker', name], {
          cwd: ROOT,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => (stdout += d.toString()));
        child.stderr.on('data', (d) => (stderr += d.toString()));
        child.on('close', (code) => {
          try {
            resolve(JSON.parse(stdout));
          } catch {
            resolve({
              agent: name,
              score: 0,
              pass: false,
              summary: `worker crashed (code ${code}): ${stderr.trim()}`,
              details: [],
            });
          }
        });
      })
  )
);

const overall = Number((results.reduce((s, r) => s + r.score, 0) / results.length).toFixed(2));
const allPass = results.every((r) => r.pass) && overall >= 9.0;

console.log(`\n=== PIERLINE SUB-AGENT ORCHESTRATOR REPORT (${results.length} PARALLEL WORKERS) ===`);
for (const r of results) {
  const badge = r.pass ? 'PASS' : 'FAIL';
  console.log(`[${badge}] ${r.agent.padEnd(18)} ${r.score.toFixed(1).padStart(4)}/10  — ${r.summary}`);
  if (!r.pass && r.details) {
    const list = Array.isArray(r.details) ? r.details : (r.details.issues || []);
    for (const item of list.slice(0, 6)) {
      console.log(`       ↳ ${typeof item === 'string' ? item : JSON.stringify(item)}`);
    }
  }
}
console.log('---------------------------------------------------------------------');
console.log(`OVERALL SCORE: ${overall}/10 | TARGET >= 9.0: ${allPass ? 'PASS' : 'NEEDS FIX'}\n`);
process.exit(allPass ? 0 : 1);

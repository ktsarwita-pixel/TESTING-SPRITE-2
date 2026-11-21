#!/usr/bin/env node
/**
 * Pierline Local Sub-Agent Orchestrator
 * Runs specialized parallel worker agents (Sprite QA, Audio QA, Code & DOM Integrity,
 * Species/Map Data Consistency) and aggregates a scored 1-10 report.
 *
 * Usage:
 *   node scripts/sub-agents/orchestrator.mjs [--all | --sprites | --audio | --code | --ui]
 */

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function hexToLum(hex) {
  if (!hex) return 0;
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

// ── WORKER 1: SPRITE PIXEL-ART AUDITOR ────────────────────────────────────
async function runSpriteAgent() {
  const { FISH_SPRITES } = await import(path.join(ROOT, 'js/fishSprites.js'));
  const { PALETTE } = await import(path.join(ROOT, 'js/palette.js'));
  const { FISH_SPECIES } = await import(path.join(ROOT, 'js/fishData.js'));

  const DARK_KEYS = new Set(['k', 'K', 'N', 'x', 'P', '0', 'B', '8', 'O', 'C', 'V', 'd', 'R', 'n', 'T']);
  const D8 = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
  const D4 = [[1,0],[-1,0],[0,1],[0,-1]];
  const MIN_COLS = { common: 7, uncommon: 8, rare: 8, epic: 9, legendary: 9, myth: 14 };

  const findings = [];
  let sum = 0;

  for (const sp of FISH_SPECIES) {
    const frames = FISH_SPRITES[sp.id];
    if (!frames) {
      findings.push({ id: sp.id, score: 1.0, issues: ['MISSING_SPRITE'] });
      sum += 1.0;
      continue;
    }

    let maxF8 = 0, maxD4 = 0, maxHoles = 0, maxSpurs = 0, minOutl = 100, minCols = 99;
    let badStruct = false;

    for (const grid of frames) {
      const h = grid.length;
      const w = Math.max(...grid.map((r) => r.length));
      if (grid.some((r) => r.length !== w) || w !== frames[0][0].length || h !== frames[0].length) badStruct = true;
      const isSolid = (x, y) => y >= 0 && y < h && x >= 0 && x < grid[y].length && grid[y][x] !== '.' && grid[y][x] !== ' ';
      const filled = [];
      const cols = new Set();
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < grid[y].length; x++) {
          const ch = grid[y][x];
          if (ch === '.' || ch === ' ') continue;
          if (!(ch in PALETTE)) badStruct = true;
          cols.add(ch);
          filled.push({ x, y, ch });
        }
      }
      const countComps = (dirs) => {
        const vis = new Set();
        let c = 0;
        for (const p of filled) {
          const k = `${p.x},${p.y}`;
          if (vis.has(k)) continue;
          c++;
          const q = [p];
          vis.add(k);
          while (q.length) {
            const cur = q.shift();
            for (const [dx, dy] of dirs) {
              const nx = cur.x + dx, ny = cur.y + dy, nk = `${nx},${ny}`;
              if (!vis.has(nk) && isSolid(nx, ny)) { vis.add(nk); q.push({ x: nx, y: ny }); }
            }
          }
        }
        return c;
      };
      maxF8 = Math.max(maxF8, countComps(D8) - 1);
      maxD4 = Math.max(maxD4, countComps(D4) - 1);

      let bTot = 0, bDark = 0, spurs = 0, holes = 0;
      for (const p of filled) {
        let n4 = 0;
        for (const [dx, dy] of D4) if (isSolid(p.x + dx, p.y + dy)) n4++;
        if (n4 < 4) {
          bTot++;
          if (DARK_KEYS.has(p.ch) || hexToLum(PALETTE[p.ch]) < 0.30) bDark++;
        }
        if (n4 === 1) {
          let n8 = 0;
          for (const [dx, dy] of D8) if (isSolid(p.x + dx, p.y + dy)) n8++;
          if (n8 <= 2) spurs++;
        }
      }
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          if (!isSolid(x, y) && isSolid(x - 1, y) && isSolid(x + 1, y) && isSolid(x, y - 1) && isSolid(x, y + 1)) holes++;
        }
      }
      maxHoles = Math.max(maxHoles, holes);
      maxSpurs = Math.max(maxSpurs, spurs);
      minOutl = Math.min(minOutl, +(bDark / Math.max(1, bTot) * 100).toFixed(1));
      minCols = Math.min(minCols, cols.size);
    }

    let score = 10.0;
    const issues = [];
    if (badStruct) { score -= 3.0; issues.push('BAD_STRUCT'); }
    if (maxF8 > 0) { score -= 3.0 * maxF8; issues.push(`FLOAT8:${maxF8}`); }
    if (maxD4 > 0) { score -= 1.5 * maxD4; issues.push(`DIAG4:${maxD4}`); }
    if (maxHoles > 0) { score -= 0.8 * maxHoles; issues.push(`HOLE:${maxHoles}`); }
    if (minOutl < 95) { score -= (98 - minOutl) * 0.14; issues.push(`OUTL:${minOutl}%`); }
    if (minCols < (MIN_COLS[sp.rarity] || 7)) { score -= 0.5; issues.push(`COLS:${minCols}`); }
    if (maxSpurs > 2) { score -= 0.35 * (maxSpurs - 2); issues.push(`SPURS:${maxSpurs}`); }
    score = Math.max(1.0, Math.min(10.0, +score.toFixed(1)));
    sum += score;
    if (issues.length) findings.push({ id: sp.id, score, issues });
  }

  const avg = +(sum / FISH_SPECIES.length).toFixed(2);
  return {
    agent: 'sprite-inspector',
    score: avg,
    summary: `${FISH_SPECIES.length} fish x 4 frames audited | ${findings.length} flagged | avg ${avg}/10`,
    issues: findings,
  };
}

// ── WORKER 2: AUDIO & SFX INTEGRITY AGENT ─────────────────────────────────
async function runAudioAgent() {
  const manifestPath = path.join(ROOT, 'assets/sfx/manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return { agent: 'audio-qa', score: 2.0, summary: 'Missing assets/sfx/manifest.json', issues: ['MISSING_MANIFEST'] };
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const cats = manifest.files || manifest.categories || manifest;
  const issues = [];
  let totalFiles = 0;

  for (const [cat, files] of Object.entries(cats)) {
    const list = Array.isArray(files) ? files : (files.files || []);
    for (const rel of list) {
      totalFiles++;
      const p = path.join(ROOT, rel.startsWith('assets/') ? rel : path.join('assets/sfx', rel));
      if (!fs.existsSync(p)) issues.push(`MISSING_WAV:${cat}:${rel}`);
      else if (fs.statSync(p).size < 100) issues.push(`EMPTY_WAV:${cat}:${rel}`);
    }
  }
  const score = Math.max(1.0, +(10.0 - issues.length * 1.5).toFixed(1));
  return {
    agent: 'audio-qa',
    score,
    summary: `${Object.keys(cats).length} categories, ${totalFiles} WAV files verified | ${issues.length} issues`,
    issues,
  };
}

// ── WORKER 3: CODE & SYNTAX INTEGRITY AGENT ───────────────────────────────
async function runCodeAgent() {
  const jsDir = path.join(ROOT, 'js');
  const files = fs.readdirSync(jsDir).filter((f) => f.endsWith('.js')).sort();
  const issues = [];

  await Promise.all(files.map(async (f) => {
    try {
      await execFileAsync('node', ['--check', path.join(jsDir, f)]);
    } catch (err) {
      issues.push(`SYNTAX:${f}:${err.stderr.split('\n')[0]}`);
    }
  }));

  // Verify every getElementById(...) in js/game.js exists in index.html
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const gameJs = fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8');
  const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const jsIds = [...new Set([...gameJs.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]))];
  for (const id of jsIds) {
    if (!htmlIds.has(id)) issues.push(`MISSING_DOM_ID:#${id}`);
  }

  const score = Math.max(1.0, +(10.0 - issues.length * 1.5).toFixed(1));
  return {
    agent: 'code-verifier',
    score,
    summary: `${files.length} JS modules syntax-checked, ${jsIds.length} DOM IDs verified | ${issues.length} issues`,
    issues,
  };
}

// ── WORKER 4: UI & DATA CONSISTENCY AGENT ─────────────────────────────────
async function runUiDataAgent() {
  const { MAPS } = await import(path.join(ROOT, 'js/maps.js'));
  const { FISH_SPECIES, RARITY_META } = await import(path.join(ROOT, 'js/fishData.js'));
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  const issues = [];

  const mapIds = new Set(MAPS.map((m) => m.id));
  for (const sp of FISH_SPECIES) {
    if (!RARITY_META[sp.rarity]) issues.push(`UNKNOWN_RARITY:${sp.id}:${sp.rarity}`);
    for (const m of (sp.maps || [])) {
      if (!mapIds.has(m)) issues.push(`UNKNOWN_MAP:${sp.id}:${m}`);
    }
  }
  for (const m of MAPS) {
    const count = FISH_SPECIES.filter((sp) => (sp.maps || []).includes(m.id)).length;
    if (count === 0) issues.push(`EMPTY_MAP:${m.id}`);
  }
  // Enforce zero-blur crisp pixel typography rule
  const blurTextShadows = [...css.matchAll(/text-shadow\s*:[^;]*\b[1-9]\d*px\s+[1-9]\d*px\s+[1-9]\d*px/g)];
  if (blurTextShadows.length) issues.push(`BLUR_TEXT_SHADOW:${blurTextShadows.length}`);

  const score = Math.max(1.0, +(10.0 - issues.length * 1.2).toFixed(1));
  return {
    agent: 'ui-data-auditor',
    score,
    summary: `${MAPS.length} maps, ${FISH_SPECIES.length} species, pixel CSS rules checked | ${issues.length} issues`,
    issues,
  };
}

// ── COORDINATOR: RUN ALL SPECIALIST WORKERS IN PARALLEL ───────────────────
const args = new Set(process.argv.slice(2));
const runAll = args.size === 0 || args.has('--all');
const tasks = [];
if (runAll || args.has('--sprites')) tasks.push(runSpriteAgent());
if (runAll || args.has('--audio')) tasks.push(runAudioAgent());
if (runAll || args.has('--code')) tasks.push(runCodeAgent());
if (runAll || args.has('--ui')) tasks.push(runUiDataAgent());

const results = await Promise.all(tasks);
const overall = +(results.reduce((a, r) => a + r.score, 0) / results.length).toFixed(2);

console.log('\n=== PIERLINE SUB-AGENT ORCHESTRATOR REPORT ===');
for (const r of results) {
  const status = r.score >= 9.0 ? 'PASS' : 'REWORK';
  console.log(`[${status}] ${r.agent.padEnd(18)} ${r.score.toFixed(1).padStart(4)}/10  — ${r.summary}`);
  if (r.issues.length) {
    for (const iss of r.issues.slice(0, 12)) {
      console.log(`       - ${typeof iss === 'string' ? iss : JSON.stringify(iss)}`);
    }
  }
}
console.log('----------------------------------------------');
console.log(`OVERALL SCORE: ${overall}/10 | TARGET >= 9.0: ${overall >= 9.0 ? 'PASS' : 'NEEDS ANOTHER PASS'}\n`);
process.exit(overall >= 9.0 ? 0 : 1);

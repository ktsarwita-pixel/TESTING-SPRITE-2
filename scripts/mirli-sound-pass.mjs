#!/usr/bin/env node
/**
 * Pierline Fishing — Mirli (formerly Soundbox) Automated SFX Sound Pass
 * Connects to a locally running Mirli server (https://github.com/HamSanders/soundbox)
 * at http://127.0.0.1:17494/mcp, generates realistic Foley audio for every game SFX,
 * saves WAV files into assets/sfx/, and writes assets/sfx/manifest.json which js/audio.js
 * automatically loads on startup.
 *
 * Usage:
 *   1. Install & launch Mirli (Soundbox) on your machine.
 *   2. Run: node scripts/mirli-sound-pass.mjs
 *   (Optional env: MIRLI_URL=http://127.0.0.1:17494 MIRLI_API_TOKEN=...)
 */

import fs from 'fs';
import path from 'path';

const MIRLI_URL = (process.env.MIRLI_URL || 'http://127.0.0.1:17494').replace(/\/$/, '');
const API_TOKEN = process.env.MIRLI_API_TOKEN || '';
const OUT_DIR = path.resolve(process.cwd(), 'assets/sfx');

// Prompts crafted using Mirli's material + action + space Foley formula
const SFX_RECIPES = [
  { key: 'cast_start',     dur: 0.6, prompt: 'metal spinning fishing reel bail arm clicking open sharply, dry close-mic foley, outdoor pier' },
  { key: 'cast',           dur: 1.0, prompt: 'carbon fiber fishing rod whipping smoothly through coastal air with faint monofilament line zipping off spool, crisp outdoor foley' },
  { key: 'splash_small',   dur: 0.9, prompt: 'small fishing bobber and sinker plopping cleanly into calm ocean harbor water with light splash and bubbles, close-mic water foley' },
  { key: 'splash_big',     dur: 1.4, prompt: 'large fish splashing heavily on ocean surface with wet water spray and bubbling turmoil, realistic outdoor coastal water foley' },
  { key: 'nibble',         dur: 0.7, prompt: 'cork fishing bobber bobbing and dipping quickly underwater with gentle water bloops, close-mic' },
  { key: 'bite',           dur: 1.2, prompt: 'fish striking bait hard underwater with sudden splash and bright brass fishing rod tip bell ringing twice, realistic outdoor foley' },
  { key: 'bite_big',       dur: 1.6, prompt: 'huge monster fish violently striking fishing lure with massive splash and urgent brass rod bell ringing rapidly, coastal water foley' },
  { key: 'hook_set',       dur: 0.8, prompt: 'fishing rod snapping upward sharply to set hook with taut nylon line tug and water splash, close-mic foley' },
  { key: 'reel_tick',      dur: 0.2, prompt: 'single crisp metallic fishing reel gear pawl ratchet click, mechanical close-mic foley' },
  { key: 'drag_out',       dur: 0.6, prompt: 'spinning fishing reel drag clutch clicking rapidly as fish pulls line out under tension, crisp metallic foley' },
  { key: 'fish_warning',   dur: 0.7, prompt: 'underwater fish tail surge and quick double metallic fishing reel drag click, tense close-mic foley' },
  { key: 'fish_thrash',    dur: 1.2, prompt: 'hooked fish thrashing wildly at the water surface with churning whitewater splashes and tail slaps, realistic water foley' },
  { key: 'tension_warn',   dur: 0.6, prompt: 'stretched nylon fishing line creaking and fiberglass rod groaning under heavy tension, close-mic foley' },
  { key: 'line_snap',      dur: 0.9, prompt: 'taut monofilament fishing line snapping sharply like a whip crack followed by water recoil splash, realistic foley' },
  { key: 'fish_escape',    dur: 1.0, prompt: 'fish shaking loose and diving back underwater with a retreating splash and fading bubbles, outdoor water foley' },
  { key: 'landing_lift',   dur: 1.2, prompt: 'heavy wet fish pulled out of ocean water with dripping water spray landing onto wooden pier planks, coastal foley' },
  { key: 'ambush_alert',   dur: 1.2, prompt: 'deep ominous underwater predator surge rushing through dark ocean water with swirling bubbles, cinematic water foley' },
  { key: 'predator_chomp', dur: 1.3, prompt: 'giant underwater sea predator jaws snapping shut with heavy bite crunch and turbulent water shockwave splash, realistic foley' },
  { key: 'myth_spawn',     dur: 2.5, prompt: 'colossal deep ocean kraken rising from the abyss, deep resonant whale-like rumble with ethereal underwater shimmer, cinematic sound design' },
  { key: 'coins',          dur: 0.8, prompt: 'handful of real heavy gold coins clinking together crisply on a wooden counter, close-mic metallic foley' },
  { key: 'shop_buy',       dur: 1.0, prompt: 'gold coins clinking into wooden tackle box with satisfying brass latch click, realistic foley' },
  { key: 'ui_click',       dur: 0.25, prompt: 'crisp soft wooden button tap, tactile clean dry close-mic foley' },
  { key: 'ui_open',        dur: 0.45, prompt: 'wooden fishing tackle box lid unlatching and opening smoothly, crisp close-mic foley' },
  { key: 'ui_close',       dur: 0.4, prompt: 'wooden tackle box closing gently with soft wooden thud, dry close-mic foley' },
];

async function mcpCall(method, params = {}, id = 1) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  if (API_TOKEN) headers.Authorization = `Bearer ${API_TOKEN}`;
  const res = await fetch(`${MIRLI_URL}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  if (!res.ok) throw new Error(`Mirli MCP HTTP ${res.status}: ${await res.text()}`);
  const text = await res.text();
  // Support both direct JSON and SSE-wrapped JSON-RPC payloads
  const jsonLine = text.split('\n').find((l) => l.startsWith('data:'))?.slice(5).trim() || text.trim();
  const parsed = JSON.parse(jsonLine);
  if (parsed.error) throw new Error(`Mirli MCP error: ${parsed.error.message || JSON.stringify(parsed.error)}`);
  return parsed.result;
}

async function main() {
  console.log(`Connecting to Mirli / Soundbox at ${MIRLI_URL}/mcp ...`);
  await mcpCall('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'pierline-sound-pass', version: '1.0.0' },
  }, 1);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const manifest = { generatedBy: 'Mirli / Soundbox', files: {} };

  let reqId = 2;
  for (const item of SFX_RECIPES) {
    console.log(`Generating [${item.key}] (${item.dur}s): ${item.prompt}`);
    const result = await mcpCall('tools/call', {
      name: 'soundbox.generate',
      arguments: {
        prompt: item.prompt,
        duration: item.dur,
        kind: 'sfx',
        title: `pierline_${item.key}`,
      },
    }, reqId++);

    const payloadText = result?.content?.map((c) => c.text).filter(Boolean).join('\n') || '';
    const pathMatch = payloadText.match(/(\/[^\s"']+\.(?:wav|mp3|ogg|flac)|[A-Za-z]:\\[^\s"']+\.(?:wav|mp3|ogg|flac))/i);
    if (pathMatch && fs.existsSync(pathMatch[1])) {
      const ext = path.extname(pathMatch[1]) || '.wav';
      const outName = `${item.key}${ext}`;
      fs.copyFileSync(pathMatch[1], path.join(OUT_DIR, outName));
      manifest.files[item.key] = outName;
      console.log(`  -> Saved assets/sfx/${outName}`);
    } else {
      console.warn(`  ! Generated in Mirli library; copy output to assets/sfx/${item.key}.wav if needed.`);
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`Done! Wrote assets/sfx/manifest.json with ${Object.keys(manifest.files).length} clips.`);
}

main().catch((err) => {
  console.error('Mirli sound pass failed:', err.message);
  console.error('Make sure Mirli (https://github.com/HamSanders/soundbox) is running locally on port 17494.');
  process.exit(1);
});

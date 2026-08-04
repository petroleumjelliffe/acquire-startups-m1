#!/usr/bin/env node
// Measures the things jsdom cannot see: whether the board fits, whether panel
// zones hold their height as content changes, and whether the reveal curtain
// really covers the surface.
//
// Phase 1b's jsdom test asserted that a `min-h-` class existed and matched
// between empty and filled states. Both were true while the zone still shifted
// 62px -> 68px, because jsdom reports 0 for every layout property. Only a real
// page catches an insufficient reservation.

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import WebSocket from 'ws';

const CHROME = process.env.CHROME_PATH
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VITE_PORT = 5199;
const CDP_PORT = 9333;
const VIEWPORTS = [768, 1440];

const children = [];
function cleanup() {
  for (const child of children) { try { child.kill('SIGTERM'); } catch { /* already gone */ } }
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

async function waitFor(url, label, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error(`${label} did not come up at ${url}`);
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl, { maxPayload: 64 * 1024 * 1024 });
  let id = 0;
  const pending = new Map();

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });

  const ready = new Promise((resolve) => ws.on('open', resolve));
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const myId = (id += 1);
      pending.set(myId, resolve);
      ws.send(JSON.stringify({ id: myId, method, params }));
    });
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.result?.exceptionDetails) {
      throw new Error(res.result.exceptionDetails.exception?.description ?? 'page threw');
    }
    return res.result.result?.value;
  };

  return { ws, ready, send, evaluate };
}

// Runs in the page. Starts a two-player game, walks to the first turn, then
// plays into founding and buying — measuring panel geometry at each stage,
// because height *stability* is the property that matters and a single
// snapshot cannot show it.
//
// `Panel` marks its five slots with `data-slot`; `StagingZone` marks its
// internal reservations with `data-zone`. Both are collected: the 1b bug was
// in a `data-zone` reservation, but a slot that grows is just as bad.
const MEASURE = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // Match the accessible name, not just the visible text: a buy button reads
  // "MSLA $200" on screen and carries "Buy one Messla" as its aria-label.
  // Searching innerText alone silently never finds it, and the staging stage
  // then never happens — which would leave the pile reservation unmeasured.
  const nameOf = (b) => (b.getAttribute('aria-label') || b.innerText || '');
  const byText = (re) => [...document.querySelectorAll('button')].find((b) => re.test(nameOf(b)));
  const click = async (re, label) => {
    const btn = byText(re);
    if (!btn) throw new Error('no button matching ' + label);
    btn.click();
    await wait(300);
  };
  // The curtain only rises when the actor changes, and whether seat one wins
  // the turn-order draw depends on the seed. Claim it when it is there.
  const clickIfPresent = async (re) => {
    const btn = byText(re);
    if (btn) { btn.click(); await wait(300); }
  };

  const stepCount = () =>
    document.querySelectorAll('[data-slot="stepstack"] [data-step-phase]').length;

  // Try every clickable board cell until one actually places. The first
  // candidate is often the already-placed tile (still clickable, so it can be
  // undone) or a blocked dead tile, and clicking those changes nothing — a
  // walk that only tried the first would stall without ever saying so.
  const placeAny = async () => {
    const before = stepCount();
    for (const cell of document.querySelectorAll('[data-board="grid"] button:not([disabled])')) {
      cell.click();
      await wait(220);
      if (stepCount() > before) return true;
    }
    return false;
  };

  const geometry = () => {
    const out = {};
    for (const el of document.querySelectorAll('[data-slot], [data-zone]')) {
      const key = el.getAttribute('data-slot') ?? el.getAttribute('data-zone');
      out[key] = Math.round(el.getBoundingClientRect().height);
    }
    return out;
  };

  // Four seats, not the default two: the players strip only overflowed its
  // panel once there were more than two of them, and a gate that always plays
  // heads-up would never see it.
  await click(/add player/i, 'add player');
  await click(/add player/i, 'add player');

  await click(/start game/i, 'start game');
  await click(/reveal/i, 'reveal (opening)');
  await click(/draw for turn order/i, 'draw for turn order');
  await clickIfPresent(/reveal/i);

  const stages = { play: geometry() };

  // Place the first hand tile. Hand cells are the only clickable board cells.
  const handCell = document.querySelector('[data-board="grid"] button:not([disabled])');
  if (!handCell) throw new Error('no placeable tile at the first turn');
  handCell.click();
  await wait(300);
  stages.afterPlace = geometry();

  // Keep playing until a chain has been founded and its shares are on sale.
  // One placement is almost never enough: with a random seed the opening tile
  // usually lands isolated, nothing is founded, and the buy list is empty — so
  // a walk that stopped here would never fill the staging pile, and the pile
  // reservation (where the Phase 1b bug lived) would go unmeasured.
  const isBrand = (b) =>
    /^(gobble|scrapple|wrecksonmobil|paperfulpost|zuckface|messla|camcrooned)$/i.test(nameOf(b).trim());

  for (let turn = 0; turn < 40; turn += 1) {
    if (stages.afterFound && stages.afterStaging) break;

    const brand = [...document.querySelectorAll('button')].find(isBrand);
    if (brand) {
      brand.click();
      await wait(250);
      if (!stages.afterFound) stages.afterFound = geometry();
      continue;
    }

    const buy = byText(/^buy one /i);
    if (buy && !buy.disabled) {
      buy.click();
      await wait(250);
      if (!stages.afterStaging) stages.afterStaging = geometry();
      continue;
    }

    const endTurn = byText(/^end turn$/i);
    if (endTurn) {
      endTurn.click();
      await wait(250);
      await clickIfPresent(/reveal/i);
      continue;
    }

    if (await placeAny()) continue;

    break; // nothing left this walk knows how to do
  }

  if (!stages.afterFound || !stages.afterStaging) {
    throw new Error(
      'walk never reached founding and staging — the pile reservation would go unmeasured',
    );
  }

  const surface = document.querySelector('[data-testid="game-surface"]');
  const grid = document.querySelector('[data-board="grid"]');
  const strip = document.querySelector('[data-slot="players"]');

  return {
    // Zones that clip their content rather than fitting it. The players strip
    // did exactly this at four seats and up — six seats wanted 1061px inside a
    // 319px panel — and nothing visible said so: the extra seats were just
    // gone. Horizontal overflow inside a fixed-width panel is always a bug.
    clipped: [strip, ...document.querySelectorAll('[data-zone]')]
      .filter((el) => el && el.scrollWidth > el.clientWidth + 1)
      .map((el) => (el.getAttribute('data-slot') ?? el.getAttribute('data-zone')) +
        ' ' + el.scrollWidth + '>' + el.clientWidth),
    docScrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    surface: surface ? surface.getBoundingClientRect().toJSON() : null,
    board: grid ? grid.getBoundingClientRect().toJSON() : null,
    stages,
    reachedFirstTurn: Object.keys(stages.play).length > 0,
  };
})()`;

const CURTAIN = `(() => {
  const surface = document.querySelector('[data-testid="game-surface"]');
  const curtain = document.querySelector('[data-testid="curtain"]');
  if (!surface || !curtain) return null;
  const s = surface.getBoundingClientRect();
  const c = curtain.getBoundingClientRect();
  return { surface: { w: Math.round(s.width), h: Math.round(s.height) },
           curtain: { w: Math.round(c.width), h: Math.round(c.height) } };
})()`;

// The curtain lives behind the setup screen: a game has to be started before
// there is a surface to cover at all.
const START_GAME = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const find = (re) => [...document.querySelectorAll('button')].find((b) => re.test(b.innerText));
  for (let i = 0; i < 2; i += 1) { const a = find(/add player/i); if (a) { a.click(); await wait(150); } }
  const btn = find(/start game/i);
  if (!btn) throw new Error('no start game button');
  btn.click();
  await wait(400);
  return true;
})()`;

async function main() {
  children.push(spawn('npx', ['vite', '--port', String(VITE_PORT), '--strictPort'], {
    stdio: 'ignore', detached: false,
  }));
  await waitFor(`http://localhost:${VITE_PORT}/`, 'vite');

  children.push(spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--user-data-dir=/tmp/acquire-verify-layout-profile',
    '--no-first-run',
    'about:blank',
  ], { stdio: 'ignore' }));
  await waitFor(`http://127.0.0.1:${CDP_PORT}/json/version`, 'chrome');

  const failures = [];

  for (const width of VIEWPORTS) {
    const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const page = targets.find((t) => t.type === 'page');
    const { ws, ready, send, evaluate } = connect(page.webSocketDebuggerUrl);
    await ready;
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width, height: 900, deviceScaleFactor: 1, mobile: false,
    });
    await send('Page.navigate', { url: `http://localhost:${VITE_PORT}/pass-and-play` });
    await sleep(2000);

    await evaluate(START_GAME);
    const curtain = await evaluate(CURTAIN);
    if (!curtain) {
      failures.push(`${width}px: no curtain on the opening screen`);
    } else if (curtain.curtain.w !== curtain.surface.w || curtain.curtain.h !== curtain.surface.h) {
      failures.push(
        `${width}px: curtain ${curtain.curtain.w}x${curtain.curtain.h} does not cover ` +
        `surface ${curtain.surface.w}x${curtain.surface.h}`,
      );
    }

    // The measuring walk starts from the setup screen, so reload to undo the
    // game the curtain check just started.
    await send('Page.navigate', { url: `http://localhost:${VITE_PORT}/pass-and-play` });
    await sleep(1500);

    const m = await evaluate(MEASURE);

    if (m.docScrollWidth > m.innerWidth) {
      failures.push(`${width}px: page scrolls horizontally (${m.docScrollWidth} > ${m.innerWidth})`);
    }
    if (!m.board) {
      failures.push(`${width}px: no board rendered at the first turn`);
    } else {
      if (m.board.bottom > m.surface.bottom + 1) {
        failures.push(`${width}px: board bottom ${Math.round(m.board.bottom)} overflows surface ${Math.round(m.surface.bottom)}`);
      }
      if (m.board.width < 200) {
        failures.push(`${width}px: board collapsed to ${Math.round(m.board.width)}px wide`);
      }
    }
    if (!m.reachedFirstTurn) {
      failures.push(`${width}px: never reached the first turn`);
    }
    for (const zone of m.clipped ?? []) {
      failures.push(`${width}px: zone clips its content horizontally — ${zone}`);
    }

    // The load-bearing check. A panel zone that is 62px when empty and 68px
    // when filled passes every jsdom test ever written about it, because jsdom
    // reports 0 for both. Comparing real heights across real stages is the
    // only thing that catches an under-sized reservation.
    //
    // Two zones are exempt from per-zone equality and checked as a pair
    // instead. `active` holds the current decision, so its content genuinely
    // differs by stage, and `stepstack` is `flex-1` — it exists to absorb
    // exactly what `active` does not use. Their *sum* is the real invariant:
    // if it drifts, the panel itself grew, which is the thing the rule
    // forbids. Every other zone must not move by so much as a pixel.
    const SPACER_PAIR = ['stepstack', 'active'];
    const sumOf = (g) => SPACER_PAIR.reduce((n, k) => n + (g[k] ?? 0), 0);

    const stageNames = Object.keys(m.stages);
    const baseline = m.stages[stageNames[0]];
    for (const name of stageNames.slice(1)) {
      const current = m.stages[name];
      for (const key of Object.keys(baseline)) {
        if (!(key in current)) continue; // zone legitimately absent at this stage
        if (SPACER_PAIR.includes(key)) continue;
        if (current[key] !== baseline[key]) {
          failures.push(
            `${width}px: zone "${key}" moved ${baseline[key]}px -> ${current[key]}px ` +
            `between ${stageNames[0]} and ${name}`,
          );
        }
      }
      if (sumOf(current) !== sumOf(baseline)) {
        failures.push(
          `${width}px: stepstack+active grew ${sumOf(baseline)}px -> ${sumOf(current)}px ` +
          `between ${stageNames[0]} and ${name} — the panel resized`,
        );
      }
    }

    console.log(
      `${width}px  board ${m.board ? Math.round(m.board.width) + 'x' + Math.round(m.board.height) : 'none'}` +
      `\n         ` + stageNames.map((n) => `${n} ${JSON.stringify(m.stages[n])}`).join('\n         '),
    );
    ws.close();
  }

  if (failures.length > 0) {
    console.error('\nverify:layout FAILED');
    for (const f of failures) console.error('  - ' + f);
    process.exitCode = 1;
    return;
  }
  console.log('\nverify:layout OK');
}

// The spawned vite and Chrome keep the event loop alive forever, so the run
// has to end itself rather than waiting for node to run out of work.
main()
  .catch((err) => {
    console.error('verify:layout errored:', err.message);
    process.exitCode = 1;
  })
  .finally(() => {
    cleanup();
    process.exit(process.exitCode ?? 0);
  });

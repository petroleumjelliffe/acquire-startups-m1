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

  // A zone's reservation is a *floor*, not a fixed height. The rule it exists
  // for is "do not jitter": reserve enough that ordinary content changes move
  // nothing, and grow gracefully when content genuinely needs another row.
  // So there are two things to check, and height equality is neither of them:
  //   - the floor is honoured (a zone shorter than its own min-height is the
  //     Phase 1b bug, where 62px of reservation held 68px of content);
  //   - zones that have not declared they may grow do not change at all.
  const floors = () => {
    const out = {};
    for (const el of document.querySelectorAll('[data-zone]')) {
      const key = el.getAttribute('data-zone');
      // How many rows the content actually occupies. Counted by distinct
      // *bottom* edges, not tops: these zones are items-end, so a short label
      // and a tall card share a row while their tops differ by design. Counting
      // tops reported two rows for a hand holding nothing at all, which would
      // have let a real jitter through as "it gained a row".
      const rowEdges = new Set(
        [...el.children].map((c) => Math.round(c.getBoundingClientRect().bottom)),
      );
      out[key] = {
        height: Math.round(el.getBoundingClientRect().height),
        min: Math.round(parseFloat(getComputedStyle(el).minHeight) || 0),
        rows: rowEdges.size,
        // A reservation smaller than the content it holds clips it. This is
        // the Phase 1b failure stated directly, and unlike comparing height to
        // min-height (which a min-height box can never fail) it is real: a
        // fixed height too small for its content overflows silently.
        // NB: no backticks anywhere in here — this whole block is a template
        // literal, and one would end it mid-comment.
        overflows: el.scrollHeight > el.clientHeight + 1,
        mayGrow: el.getAttribute('data-may-grow') === 'true',
      };
    }
    return out;
  };

  // The roster clips on purpose, so the property worth guarding is that the
  // seat whose turn it is stays on screen — which only holds because the strip
  // rotates it to the front. Sampled at every stage, not once: whether the
  // active seat happens to be visible at one arbitrary moment says nothing.
  // Two halves, because either alone would pass while the guarantee is broken:
  // "the active seat is the first one" is what rotation provides, and "the
  // first seat is fully visible" is what makes that worth anything. Checking
  // only whether the active seat happens to be on screen is not enough — with
  // rotation removed it still reads true whenever the active player is one of
  // the first few, which is most of the time.
  const seatVisible = {};
  const noteSeat = (tag) => {
    const roster = document.querySelector('[data-zone="roster"]');
    const seats = roster ? [...roster.querySelectorAll('[data-seat]')] : [];
    const active = roster && roster.querySelector('.border-blue-600');
    if (!roster || !active || seats.length === 0) return;
    const r = roster.getBoundingClientRect();
    const f = seats[0].getBoundingClientRect();
    // Legibility, not just presence: with every seat allowed to shrink, a
    // six-handed table rendered six 33px slivers that were all "visible" and
    // none readable. The active seat's name must fit inside its own card.
    const name = seats[0].querySelector('.truncate');
    seatVisible[tag] = {
      activeIsFirst: seats[0] === active,
      firstSeatVisible: f.left >= r.left - 1 && f.right <= r.right + 1,
      activeNameReadable: name ? name.scrollWidth <= name.clientWidth + 1 : null,
      activeWidth: Math.round(f.width),
      seats: seats.length,
    };
  };

  // A full table of six, not the default two. The roster only clips once the
  // seats can no longer shrink to fit — emoji, cash and padding put a floor of
  // ~73px on each — which happens above four seats. A gate that played
  // heads-up, or even four-handed, would never exercise the rotation that
  // keeps the active seat on screen.
  for (let i = 0; i < 4; i += 1) await click(/add player/i, 'add player');

  await click(/start game/i, 'start game');
  // No curtain before the draw: it is a gate in front of the game and nobody's
  // hand is on screen yet. The handoff after it is unconditional, because seat
  // one pressed the button for the table and the winner's hand is about to
  // appear — so this is a plain click, not a conditional one.
  await click(/draw for turn order/i, 'draw for turn order');
  await click(/^start$/i, 'start (curtain, first turn)');

  const stages = { play: geometry() };
  const zoneFloors = { play: floors() };
  noteSeat('play');

  // Place the first hand tile. Hand cells are the only clickable board cells.
  const handCell = document.querySelector('[data-board="grid"] button:not([disabled])');
  if (!handCell) throw new Error('no placeable tile at the first turn');
  handCell.click();
  await wait(300);
  stages.afterPlace = geometry();
  zoneFloors.afterPlace = floors();
  noteSeat('afterPlace');

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
      if (!stages.afterFound) { stages.afterFound = geometry(); zoneFloors.afterFound = floors(); }
      noteSeat('found' + turn);
      continue;
    }

    const buy = byText(/^buy one /i);
    if (buy && !buy.disabled) {
      buy.click();
      await wait(250);
      if (!stages.afterStaging) { stages.afterStaging = geometry(); zoneFloors.afterStaging = floors(); }
      noteSeat('staging' + turn);
      continue;
    }

    // The buy step commits and ends the turn with one button: "Confirm
    // purchase" with something staged, "End turn" without. There is no second
    // button beside it, and a walk looking for the wrong label stalls here —
    // which is exactly how this check went hollow once before, reporting
    // green while never reaching the staging state it exists to measure.
    const endTurn = byText(/^(end turn|confirm purchase)$/i);
    if (endTurn) {
      endTurn.click();
      await wait(250);
      await clickIfPresent(/^start$/i);
      // The sample that matters most: the turn has just changed hands, so the
      // active seat is a different one each time round the table. Without
      // rotation this is where a later seat is clipped off the end.
      noteSeat('turn' + turn);
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
  const panel = document.querySelector('[data-slot="stepstack"]')?.parentElement ?? null;
  noteSeat('final');

  return {
    seatVisible,
    zoneFloors,
    // Zones that clip their content rather than fitting it. Horizontal
    // overflow inside a fixed-width panel is a bug everywhere except the
    // roster, which is exempt above and by name.
    clipped: [...document.querySelectorAll('[data-zone]')]
      .filter((el) => el.getAttribute('data-zone') !== 'roster')
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.getAttribute('data-zone') + ' ' + el.scrollWidth + '>' + el.clientWidth),
    // If the walk ever does reach a finished game, hold the overlay to the
    // same coverage rule as the curtain. Normally absent — reaching an end
    // state by playing takes far longer than this gate should run.
    finalOverlay: (() => {
      const o = document.querySelector('[data-testid="final-overlay"]');
      if (!o || !surface) return null;
      const s = surface.getBoundingClientRect();
      const r = o.getBoundingClientRect();
      return { covers: Math.round(r.width) === Math.round(s.width) && Math.round(r.height) === Math.round(s.height) };
    })(),
    // The panel scrolls rather than clipping, so a column taller than the
    // viewport is survivable — but it should still be rare enough to notice.
    panelScrolls: panel ? panel.scrollHeight > panel.clientHeight + 1 : null,
    docScrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    surface: surface ? surface.getBoundingClientRect().toJSON() : null,
    board: grid ? grid.getBoundingClientRect().toJSON() : null,
    stages,
    reachedFirstTurn: Object.keys(stages.play).length > 0,
  };
})()`;

// `active` holds the current decision, so its content genuinely differs by
// stage — `stepstack` is `flex-1` and exists to absorb exactly what `active`
// does not use, so the pair is compared by *sum*, not by zone. Hoisted here
// (not just inside the per-width loop below) because the waiting-panel check
// reuses the same exemption.
const SPACER_PAIR = ['stepstack', 'active'];

const CURTAIN = `(() => {
  const surface = document.querySelector('[data-testid="game-surface"]');
  const curtain = document.querySelector('[data-testid="curtain"]');
  if (!surface || !curtain) return null;
  const s = surface.getBoundingClientRect();
  const c = curtain.getBoundingClientRect();
  return { surface: { w: Math.round(s.width), h: Math.round(s.height) },
           curtain: { w: Math.round(c.width), h: Math.round(c.height) } };
})()`;

// The not-my-turn waiting panel exists online (`GameScreen`'s `canAct` goes
// false whenever `viewerId` is not the actor, or the connection drops) but
// never on `/pass-and-play`, which is the only route everything above this
// point measures — so nothing above ever renders it, let alone measures it.
// Standing up two networked `NetworkSession`s and a server inside this script
// just to reach that one panel state was judged not worth it; the catalog
// route already reaches the identical DOM the real hook produces
// (`src/game/catalog/sections.tsx`'s `TurnPanelDemo`, composed from the same
// golden state as its "my turn" neighbour) for the price of one page
// navigation this script already knows how to do.
/**
 * How little of the step stack is still usable. Two rows plus the zone's own
 * padding — enough to see a step and reach its undo — rather than a round
 * number chosen for looking like one.
 */
const STACK_FLOOR = 72;

const WAITING_PANEL = `(() => {
  const zonesIn = (label) => {
    const fig = [...document.querySelectorAll('[data-catalog-state]')]
      .find((f) => f.getAttribute('data-catalog-state') === label);
    if (!fig) return null;
    const out = {};
    for (const el of fig.querySelectorAll('[data-slot], [data-zone]')) {
      const key = el.getAttribute('data-slot') ?? el.getAttribute('data-zone');
      out[key] = Math.round(el.getBoundingClientRect().height);
    }
    return out;
  };
  // The merger card additionally reports whether the step stack is reachable.
  // A zone can be present in the DOM, and counted by zonesIn above, while a
  // tall active zone squeezes it to nothing. That is the defect reported by
  // hand: during a merger the undo could not be scrolled to.
  const stackReach = (label) => {
    const fig = [...document.querySelectorAll('[data-catalog-state]')]
      .find((f) => f.getAttribute('data-catalog-state') === label);
    if (!fig) return null;
    const stack = fig.querySelector('[data-slot="stepstack"]');
    const column = stack && stack.parentElement;
    if (!stack || !column) return null;
    return {
      height: Math.round(stack.getBoundingClientRect().height),
      // Whether the column scrolls rather than clipping, and by how much.
      overflow: Math.max(0, column.scrollHeight - column.clientHeight),
      scrollable: getComputedStyle(column).overflowY,
    };
  };

  // Sell and trade are alternatives and must read as a pair. Same top edge
  // means one row; different tops mean the second wrapped underneath.
  const liqRow = () => {
    const fig = [...document.querySelectorAll('[data-catalog-state]')]
      .find((f) => f.getAttribute('data-catalog-state') === 'panel · mid-merger (the worst squeeze)');
    const wrap = fig && fig.querySelector('[data-liq-actions]');
    if (!wrap) return null;
    const tops = [...wrap.querySelectorAll('button')].map((b) => Math.round(b.getBoundingClientRect().top));
    const widths = [...wrap.querySelectorAll('button')].map((b) => Math.round(b.getBoundingClientRect().width));
    return { count: tops.length, sameRow: tops.length > 1 && new Set(tops).size === 1, tops, widths };
  };

  return {
    liq: liqRow(),
    myTurn: zonesIn('panel · my turn (waiting-panel baseline)'),
    waiting: zonesIn('panel · not my turn (waiting)'),
    merger: zonesIn('panel · mid-merger (the worst squeeze)'),
    mergerStack: stackReach('panel · mid-merger (the worst squeeze)'),
  };
})()`;

// The curtain lives behind the setup screen *and* behind the turn-order draw:
// a game has to be started and drawn for before there is a curtain to measure.
// The draw itself raises no curtain — it is a gate in front of the game and
// shows nobody's hand — so the first one appears when play is handed to
// whoever won it.
const START_GAME = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const find = (re) => [...document.querySelectorAll('button')].find((b) => re.test(b.innerText));
  for (let i = 0; i < 4; i += 1) { const a = find(/add player/i); if (a) { a.click(); await wait(150); } }
  const btn = find(/start game/i);
  if (!btn) throw new Error('no start game button');
  btn.click();
  await wait(400);
  const draw = find(/draw for turn order/i);
  if (!draw) throw new Error('no draw button after starting');
  draw.click();
  await wait(500);
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
    if (m.finalOverlay && !m.finalOverlay.covers) {
      failures.push(`${width}px: the final scoring overlay does not cover the surface`);
    }
    const seatSamples = Object.entries(m.seatVisible ?? {});
    if (seatSamples.length < 3) {
      failures.push(
        `${width}px: only ${seatSamples.length} roster samples — too few to say the ` +
        `active seat stays visible as the turn moves round the table`,
      );
    }
    for (const [tag, s] of seatSamples) {
      if (!s.activeIsFirst) {
        failures.push(
          `${width}px: at ${tag} the active player is not the first seat in the roster — ` +
          `the strip clips, so rotating them to the front is the only thing keeping ` +
          `them on screen (${s.seats} seats)`,
        );
      }
      if (!s.firstSeatVisible) {
        failures.push(`${width}px: at ${tag} even the first roster seat is clipped (${s.seats} seats)`);
      }
      if (s.activeNameReadable === false) {
        failures.push(
          `${width}px: at ${tag} the active player's name does not fit its own seat ` +
          `(${s.activeWidth}px wide, ${s.seats} seats) — being first is no use if it is unreadable`,
        );
      }
    }

    // The load-bearing check. A panel zone that is 62px when empty and 68px
    // when filled passes every jsdom test ever written about it, because jsdom
    // reports 0 for both. Comparing real heights across real stages is the
    // only thing that catches an under-sized reservation.
    //
    // Two zones (module-level `SPACER_PAIR`) are exempt from per-zone
    // equality and checked as a pair instead. Their *sum* is the real
    // invariant: if it drifts, the panel itself grew, which is the thing the
    // rule forbids. Every other zone must not move by so much as a pixel.
    const sumOf = (g) => SPACER_PAIR.reduce((n, k) => n + (g[k] ?? 0), 0);

    // A reservation too small for its content clips it — Phase 1b's bug, and
    // the one thing a `min-height` box genuinely can get wrong.
    for (const [stage, zones] of Object.entries(m.zoneFloors ?? {})) {
      for (const [key, z] of Object.entries(zones)) {
        if (z.overflows) {
          failures.push(
            `${width}px: at ${stage} zone "${key}" clips its own content ` +
            `(${z.height}px tall, reservation ${z.min}px)`,
          );
        }
      }
    }

    // Growth is fine when a row was added; the same change with the same row
    // count is jitter, which is the whole thing the reservations exist to stop.
    const floorStages = Object.keys(m.zoneFloors ?? {});
    for (const stage of floorStages.slice(1)) {
      const before = m.zoneFloors[floorStages[0]];
      const after = m.zoneFloors[stage];
      for (const [key, z] of Object.entries(after)) {
        const was = before[key];
        if (!was || !z.mayGrow) continue;
        if (z.height !== was.height && z.rows === was.rows) {
          failures.push(
            `${width}px: zone "${key}" changed ${was.height}px -> ${z.height}px between ` +
            `${floorStages[0]} and ${stage} without gaining a row — that is jitter, ` +
            `not growth (${was.rows} rows both times)`,
          );
        }
      }
    }

    const growable = new Set(
      Object.values(m.zoneFloors ?? {}).flatMap((zones) =>
        Object.entries(zones).filter(([, z]) => z.mayGrow).map(([key]) => key),
      ),
    );

    const stageNames = Object.keys(m.stages);
    const baseline = m.stages[stageNames[0]];
    for (const name of stageNames.slice(1)) {
      const current = m.stages[name];
      for (const key of Object.keys(baseline)) {
        if (!(key in current)) continue; // zone legitimately absent at this stage
        if (SPACER_PAIR.includes(key)) continue;
        // Zones that declare `data-may-grow` are allowed to get taller when
        // their content genuinely needs another row — that is graceful growth,
        // not jitter. They may never get *shorter* than they started, which
        // would be the same jump in reverse.
        if (growable.has(key)) {
          if (current[key] < baseline[key]) {
            failures.push(
              `${width}px: growable zone "${key}" shrank ${baseline[key]}px -> ${current[key]}px ` +
              `between ${stageNames[0]} and ${name}`,
            );
          }
          continue;
        }
        if (current[key] !== baseline[key]) {
          failures.push(
            `${width}px: zone "${key}" moved ${baseline[key]}px -> ${current[key]}px ` +
            `between ${stageNames[0]} and ${name}`,
          );
        }
      }
      // The spacer pair absorbs growth elsewhere in the column, so it is only
      // meaningful to compare when nothing growable actually grew.
      const grew = [...growable].some((k) => (current[k] ?? 0) !== (baseline[k] ?? 0));
      if (!grew && sumOf(current) !== sumOf(baseline)) {
        failures.push(
          `${width}px: stepstack+active grew ${sumOf(baseline)}px -> ${sumOf(current)}px ` +
          `between ${stageNames[0]} and ${name} — the panel resized`,
        );
      }
    }

    console.log(
      `${width}px  roster samples ${JSON.stringify(m.seatVisible)}` +
      `\n         board ${m.board ? Math.round(m.board.width) + 'x' + Math.round(m.board.height) : 'none'}` +
      `\n         finalOverlay: ${JSON.stringify(m.finalOverlay)}` +
      `\n         ` + stageNames.map((n) => `${n} ${JSON.stringify(m.stages[n])}`).join('\n         '),
    );

    // The not-my-turn waiting panel — see `WAITING_PANEL`, above, for why
    // this is a catalog page rather than a second `/pass-and-play` walk.
    await send('Page.navigate', { url: `http://localhost:${VITE_PORT}/catalog` });
    await sleep(1500);
    const wp = await evaluate(WAITING_PANEL);

    // The undo you most want during a merger lives in the step stack, and the
    // step stack is the flex spacer that gives way when the active zone grows.
    // Reported by hand: "sidebar scrolling doesn't let me scroll up to undo
    // tile placement during mergers". A zone squeezed to nothing is still in
    // the DOM, so only a real height can tell you it is there.
    if (!wp.mergerStack) {
      failures.push(`${width}px: the mid-merger panel catalog demo did not render`);
    } else {
      console.log(`${width}px  merger panel ${JSON.stringify(wp.merger)}` +
                  `\n         step stack ${JSON.stringify(wp.mergerStack)}`);
      if (wp.mergerStack.height < STACK_FLOOR) {
        failures.push(
          `${width}px: the step stack collapses to ${wp.mergerStack.height}px during a merger ` +
          `(floor ${STACK_FLOOR}px) — the undo is unreachable exactly when it is most wanted`,
        );
      }
      if (wp.liq && !wp.liq.sameRow) {
        failures.push(
          `${width}px: the liquidation actions wrapped instead of sharing a row ` +
          `(tops ${JSON.stringify(wp.liq.tops)}, widths ${JSON.stringify(wp.liq.widths)})`,
        );
      } else if (wp.liq) {
        console.log(`${width}px  liq actions side by side, widths ${JSON.stringify(wp.liq.widths)}`);
      }
      if (wp.mergerStack.overflow > 0 && !/auto|scroll/.test(wp.mergerStack.scrollable)) {
        failures.push(
          `${width}px: the merger panel overflows by ${wp.mergerStack.overflow}px ` +
          `with overflow-y: ${wp.mergerStack.scrollable} — the bottom zones are clipped, not scrollable`,
        );
      }
    }

    if (!wp.myTurn || !wp.waiting) {
      failures.push(`${width}px: the my-turn / waiting-panel catalog demo did not render`);
    } else {
      for (const key of Object.keys(wp.myTurn)) {
        if (SPACER_PAIR.includes(key)) continue;
        // Unlike the per-stage walk above, no zone is legitimately absent
        // here: `waiting` and `myTurn` render the exact same golden state
        // through the exact same `Panel`, so a zone vanishing (not just
        // shrinking) between them is itself the jitter this exists to catch
        // — `StagingZone`'s reservation is supposed to hold regardless of
        // `canAct`, not disappear when it goes false.
        if (!(key in wp.waiting)) {
          failures.push(
            `${width}px: waiting-panel is missing zone "${key}" entirely ` +
            `(present at ${wp.myTurn[key]}px on the my-turn baseline)`,
          );
          continue;
        }
        if (wp.myTurn[key] !== wp.waiting[key]) {
          failures.push(
            `${width}px: waiting-panel zone "${key}" is ${wp.waiting[key]}px vs ` +
            `${wp.myTurn[key]}px on the my-turn baseline — going inert moved a zone ` +
            `it should not have`,
          );
        }
      }
      if (sumOf(wp.waiting) === 0) {
        failures.push(`${width}px: the waiting panel's stepstack+active pair collapsed to 0px`);
      }
    }

    console.log(`${width}px  waiting-panel ${JSON.stringify(wp)}`);
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

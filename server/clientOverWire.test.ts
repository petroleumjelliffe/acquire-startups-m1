import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ALL_GOLDEN_GAMES } from '../engine/golden/index.js';
import { buildFixture } from '../engine/golden/fixtures.js';
import { DRAWS, toWire } from '../session/protocol.js';
import { project } from './projection.js';
import {
  startTestServer,
  connectPlayer,
  settleSocket,
  type TestClient,
  type TestServer,
} from './socketHarness.js';
import { createNetworkSession, type NetworkSession } from '../src/net/NetworkSession.js';
import { createSocketTransport } from '../src/net/transport.js';

let server: TestServer;

beforeAll(async () => { server = await startTestServer(); });
afterAll(async () => { await server.close(); });

/**
 * The transport half of the optimistic-client claim.
 *
 * `server/goldenSocket.test.ts` proves the inbound leg — every assertion in it
 * reads `room.draft()`, the authority's own in-process state, and eight of the
 * seventeen games kept passing when the outbound delivery was suppressed
 * entirely. This file asserts only on what a *client* holds: the state a
 * `NetworkSession` arrived at, by predicting six of nine intents locally and
 * being corrected on the rest. If projection, the commit boundary, or the
 * optimistic reducer disagree with the server, it is this file that notices.
 *
 * That makes this a **consistency** oracle, not a **privacy** oracle — worth
 * stating plainly, because the two are easy to conflate under one green run.
 * Every per-seat assertion here compares a client's state to
 * `project(room.committed(), seat.id)` — the same `project` under test on
 * both sides. If `project` stopped hiding hands entirely, both sides would
 * move together and all seventeen games would stay green; nothing here would
 * notice. The privacy oracle — the thing that actually proves a hand stays
 * hidden — is `server/projectionOverWire.test.ts`, which asserts the literal
 * shape a non-actor receives (`hand === []`, `seed === ''`, `bag === []`),
 * not just "equal to what the other side computed."
 */
describe('two networked clients reach the same state the server holds', () => {
  // Summed across every game and floored after the loop. A comparison count
  // that silently drops to zero — a harness that stops finding predictable
  // steps, say — would otherwise leave every per-step assertion vacuous while
  // the suite stayed green.
  let predictions = 0;
  // Same floor discipline, for the complementary claim: on a bag-drawing
  // intent the client cannot predict, it must not move at all until the
  // server answers. See the `deferred` assertion below.
  let deferred = 0;

  for (const game of ALL_GOLDEN_GAMES) {
    it(`${game.id}: ${game.title}`, async () => {
      const fixture = buildFixture(game.setup);
      const names = fixture.players.map((p) => p.name);
      const room = server.rooms.fromState(`client-${game.id}`, names, fixture);

      const clients: Record<string, TestClient> = {};
      const sessions: Record<string, NetworkSession> = {};

      for (const seat of room.players) {
        clients[seat.id] = await connectPlayer(server.port, room.id, seat.name, seat.id, seat.token);
      }
      // The server sends a state on join for a room already in play. Settling
      // each connection is what makes "it has arrived" true rather than
      // likely: socket.io delivers one connection's messages in order, so an
      // acknowledged round trip lands behind everything sent before it.
      for (const seat of room.players) {
        await settleSocket(clients[seat.id].socket);
        const initial = clients[seat.id].latest();
        expect(initial, `${game.id} — ${seat.id} never received an opening state`).toBeDefined();
        sessions[seat.id] = createNetworkSession({
          transport: createSocketTransport(clients[seat.id].socket),
          playerId: seat.id,
          initial: initial!,
        });
      }

      try {
        for (const step of game.steps) {
          const actor = step.intent.playerId;
          const session = sessions[actor];
          const where = `${game.id} / ${step.name}`;
          const wire = toWire(step.intent);
          const predictable = !DRAWS.has(wire.type) && !step.expectError;
          // The complement of `predictable`, minus the steps that are
          // expected to be refused: a legal bag-drawing intent is the one
          // case the client cannot compute for itself at all, so dispatching
          // it must leave the client's state untouched — no bogus board may
          // ever be visible — until the server's own answer arrives.
          const awaitsServer = DRAWS.has(wire.type) && !step.expectError;
          const beforeDispatch = awaitsServer ? session.getView().state : null;

          session.dispatch(step.intent);

          // Captured before the server can answer: this is the client's own
          // prediction, not the server's reply relabelled.
          const predicted = predictable ? session.getView().state : null;

          if (awaitsServer) {
            // Asserted immediately after `dispatch`, before the settle below
            // gives the server any chance to reply — this is the state of a
            // client that has sent the intent and is still waiting, not one
            // the server has since corrected. `predictions` cannot cover this
            // case: it only ever captures a state for `predictable` steps,
            // which by definition excludes every `DRAWS` type.
            expect(session.getView().state, `${where} — the client moved before the server answered`)
              .toBe(beforeDispatch);
            deferred++;
          }

          for (const seat of room.players) await settleSocket(clients[seat.id].socket);

          if (step.expectError) {
            // The client refuses most illegal intents itself, on the same
            // visible state the server would judge, so many never reach the
            // wire at all. Either way the player is told the same thing, and
            // the code is the engine's.
            expect(session.getView().error?.code, `${where} — expected a refusal`)
              .toBe(step.expectError);
            continue;
          }

          expect(session.getView().error, `${where} — unexpected refusal`).toBeNull();

          if (predicted !== null) {
            expect(predicted, `${where} — the client predicted a different state`)
              .toEqual(project(room.draft(), actor));
            predictions++;
          }

          // Everyone who has been told something holds exactly what the
          // server would project for them. A client mid-way through its own
          // segment is ahead of the committed state, which is the one case
          // this cannot claim — so it is asserted for every other seat.
          for (const seat of room.players) {
            if (seat.id === room.actorId()) continue;
            expect(sessions[seat.id].getView().state, `${where} — ${seat.id} is out of step`)
              .toEqual(project(room.committed(), seat.id));
          }
        }
      } finally {
        for (const seat of room.players) {
          sessions[seat.id].dispose();
          clients[seat.id].close();
        }
      }
    });
  }

  it('made enough predictions across the corpus to trust the count', () => {
    // Phase 3a's 42 (server/projection.test.ts) counts every non-DRAWS step,
    // including ones that `expectError` — a rejection reduces identically
    // against a projected or full state, so that comparison is predictable
    // too. This file counts something narrower: steps where the *client*
    // computes a predicted post-dispatch state to diff against the server's,
    // which by construction excludes `expectError` steps (they produce a
    // refusal to compare, not a state — see the `error` assertion below).
    // Measured at 29 under that definition; floored well below it so a new
    // golden game cannot break this, while a harness that stops predicting
    // fails loudly.
    expect(predictions).toBeGreaterThanOrEqual(25);
  });

  it('made enough deferred-to-server checks across the corpus to trust the count', () => {
    // 7 legal bag-drawing steps across the corpus at measurement time (far
    // fewer than the 29 predictable ones — most turns end without exhausting
    // the bag or trading in a dead tile). Floored at 5, still comfortably
    // above zero, so this branch cannot silently stop being reached either.
    expect(deferred).toBeGreaterThanOrEqual(5);
  });
});

/**
 * A two-player, `stage: 'play'` fixture built exactly as `server/rooms.test.ts`'s
 * own `fixture()` (lines 5-14) does: Alex holds `E6`, Sam holds `A1`, and `E5`
 * sits on the board as a lone tile — so placing `E6` founds a new startup
 * (`E5`/`E6` are horizontally adjacent) rather than merely extending one,
 * which is what keeps the segment open through `foundStartup` rather than
 * closing it outright.
 *
 * Unlike `rooms.test.ts`'s fixture, this one starts on Sam's turn
 * (`currentPlayerIndex: 1`) with Sam's hand empty. That is not part of the
 * scenario under test — it exists so the room can be driven through one
 * genuine closed segment (Sam's empty-handed `endTurn`) before the segment
 * this file actually exercises opens, so `previousSegmentStart` has a real
 * value to assert on rather than `undefined` on both sides of the wire.
 */
function midTurnFixture() {
  return buildFixture({
    players: [
      { name: 'Alex', cash: 6000, hand: ['E6'] },
      { name: 'Sam', cash: 6000, hand: [] },
    ],
    loners: ['E5'],
    bag: [],
    currentPlayerIndex: 1,
  });
}

describe('a socket that drops mid-segment and comes back', () => {
  it('returns the actor to their own open draft, not to the start of the turn', async () => {
    const room = server.rooms.fromState('DROP01', ['Alex', 'Sam'], midTurnFixture());
    const [alex, sam] = room.players;

    // Closes one real segment before the one under test, via the room's own
    // synchronous API (no socket involved — the same way
    // `server/clientOverWire.test.ts`'s "a player id that was never seated"
    // test dispatches directly). Sam's hand is empty, so `endTurn` is legal
    // straight from `play` and hands the turn to Alex. Without this,
    // `room.previousSegmentStart()` would still be `undefined` when the drop
    // happens below, and the new assertion on it would pass trivially with
    // both sides `undefined` — exactly the hollow gate this task exists to
    // close.
    const preClose = room.dispatch(sam.id, { type: 'endTurn' });
    expect(preClose).toEqual({ kind: 'commit' });
    expect(room.actorId()).toBe(alex.id);
    expect(room.previousSegmentStart()).toBeDefined();

    const a = await connectPlayer(server.port, 'DROP01', 'Alex', alex.id, alex.token);
    const s = await connectPlayer(server.port, 'DROP01', 'Sam', sam.id, sam.token);
    // Both sockets are joining a room already `playing`, so each gets an
    // immediate 'resume' send from the join handler — asynchronously, over
    // the wire, the same hazard `projectionOverWire.test.ts`'s `openSegment`
    // tests call out. Settle Sam's own channel before reading its length, or
    // that join-time send can be misread as a leak below.
    await settleSocket(s.socket);

    // Alex opens a segment and does not close it.
    await a.send({ type: 'placeTile', coord: 'E6' });
    const draftedBoard = room.draft().board;
    expect(draftedBoard).not.toEqual(room.committed().board);
    // The placement founds a chain (E5/E6 are adjacent): same actor, segment
    // still open, now parked on `foundStartup` waiting for a brand choice.
    expect(room.draft().stage).toBe('foundStartup');

    const seenBySamBefore = s.states.length;
    const previousSegmentStartBeforeDrop = room.previousSegmentStart();

    // The drop.
    a.socket.disconnect();
    await settleSocket(s.socket);
    expect(room.players.find((p) => p.id === alex.id)!.connected).toBe(false);

    // The return: a new socket presenting the same token, which is exactly
    // what `useRoom` sends when the transport comes back.
    const again = await connectPlayer(server.port, 'DROP01', 'Alex', alex.id, alex.token);
    // `connectPlayer` only waits for `joined`, not for the 'resume' send that
    // follows it in the same handler — settle Alex's own new channel before
    // reading it, the same ordering primitive used everywhere else in this
    // file.
    await settleSocket(again.socket);

    const resumed = again.latest()!;
    expect(resumed.reason).toBe('resume');
    // The tile Alex placed is still placed. Sending `commit` here — which is
    // what this did before Phase 4 — handed back the pre-placement board
    // while the server still held the placement.
    expect(resumed.state.board).toEqual(draftedBoard);
    expect(resumed.segmentStart).toBe(room.segmentStart());
    expect(room.players.find((p) => p.id === alex.id)!.connected).toBe(true);

    // Task 5's coverage-gap requirement: Task 3 put `previousSegmentStart`
    // on the wire but nothing ever asserted it on a real message. The
    // pre-close dispatch above is what makes this non-trivial — the segment
    // that just closed (Sam's) is a real, defined boundary, not `undefined`
    // on both sides.
    expect(previousSegmentStartBeforeDrop).toBeDefined();
    expect(resumed.previousSegmentStart).toBe(previousSegmentStartBeforeDrop);
    expect(resumed.previousSegmentStart).toBe(room.previousSegmentStart());

    // And the next intent lands on the state Alex can actually see: only the
    // real draft has `foundStartup`'s pending tile recorded. `endTurn` is not
    // that intent here — it is illegal until the founding brand is chosen —
    // so `chooseFoundingBrand` is the one that actually proves the point.
    // It moves the stage to `buy` but keeps the same actor, so `deliver`
    // sends nothing (`{ kind: 'none' }`) — closing the segment with a real
    // `endTurn` right after is what actually produces a broadcast, and it is
    // what makes the "Sam never received any of it" check below non-vacuous:
    // without it, `samsNew` stays empty and the loop over it would pass on
    // zero iterations, no different from asserting nothing at all.
    await again.send({ type: 'chooseFoundingBrand', startupId: 'Gobble' });
    expect(again.rejections).toEqual([]);
    await again.send({ type: 'endTurn' });
    expect(again.rejections).toEqual([]);
    expect(room.actorId()).toBe(sam.id);

    // Sam never received any of it. The draft is one player's, and a
    // reconnection is not an excuse to broadcast one — Sam does get the
    // `endTurn` commit above (the segment genuinely closed, and the whole
    // table hears a commit), but nothing carrying Alex's open draft.
    await settleSocket(s.socket);
    const samsNew = s.states.slice(seenBySamBefore);
    expect(samsNew.length).toBeGreaterThan(0);
    for (const message of samsNew) {
      expect(message.reason).toBe('commit');
    }

    a.close(); s.close(); again.close();
  });
});

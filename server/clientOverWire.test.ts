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
              .toEqual(beforeDispatch);
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

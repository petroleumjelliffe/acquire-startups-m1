# Pass-and-play persistence — decisions so far

**Status: not a design yet.** These are the owner's rulings on the five
questions that were blocking one, recorded on 2026-08-06 so they survive the
Phase 5 work happening in front of them. The design doc and its plan come after
Phase 5.

**The finding that started it:** a pass-and-play game lives entirely in React
state. Refresh the page, or use the browser's back button, and the game is
gone. One device should hold **one** active local game and keep it until it is
finished.

## Rulings

| Question | Ruling |
|---|---|
| Route shape | `/pass-and-play` is the lobby; `/pass-and-play/game` is the board. The game gets its own route, so the back button leaves the game rather than destroying it. |
| Save cadence | **On commit only** — a segment close, the same boundary the server treats as authoritative online. Uncommitted staging is not saved; a refresh mid-turn returns you to the start of that turn. |
| Finishing a game | The final-scoring screen gains an **End game** button. Pressing it marks the game fully over and returns to the lobby, which then offers a new game rather than a continue. Nothing else clears the save. |
| Curtain on reload | **Yes** — the reveal curtain comes up on load, so the device confirms whose turn it is before showing anyone's hand. A refresh is exactly the moment nobody is sure who is holding the phone. |
| Where a game in progress is advertised | The pass-and-play lobby only. The home screen does not change. |

## Carried forward, not yet designed

- **A library of finished games.** The owner's TODO: results of a completed
  game should be saved somewhere viewable rather than discarded by **End game**.
  Out of scope for the first pass — but the save format should not make it
  impossible, so whatever is written should keep the final state rather than
  only a "finished" flag.

## Open questions the design must still answer

- What is written: the whole `GameState` and `segmentStart`, or the seed plus
  the intent log replayed on load? The second is smaller and self-verifying, the
  first is simpler and survives a rules change badly. This is the real design
  decision and has not been made.
- Storage key and versioning — one key per device, and what happens when a save
  predates a rules change and no longer replays or loads cleanly.
- Whether the lobby's "continue" needs to show anything about the saved game
  (whose turn, how far in) or is just a button.
- `src/net/identity.ts` already keeps per-room identity in `localStorage`; a
  second storage module should either reuse its conventions or say why not.

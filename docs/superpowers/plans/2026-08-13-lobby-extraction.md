# Lobby Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the lobby into `petroleumjelliffe/multiplayer-game-lobby` with its history intact, and consume it from Acquire as a git submodule — so the shared half lives in one place and each game pins its own commit.

**Architecture:** `git filter-repo` against a throwaway clone extracts `lobby/`, `server/lobby/` and `src/lobby/` into `protocol/`, `server/` and `client/`, carrying all 15 commits. Acquire then adds it at `vendor/lobby`, deletes its originals, and repoints imports. Rail Baron follows separately.

**Tech Stack:** git 2.4x, `git-filter-repo`, TypeScript 5, Vite 7, Vitest 4.

**Spec:** [2026-08-12-lobby-lift-sequencing.md](../specs/2026-08-12-lobby-lift-sequencing.md), step 7. Step 6 was deleted on 2026-08-13 — see that doc for why subtree split could not do this.

## Global Constraints

- **Repo:** `github.com/petroleumjelliffe/multiplayer-game-lobby`, **public**. Both games are public; a private submodule inside them breaks `--recurse-submodules` for everyone and needs a PAT in CI.
- **Submodule URL is HTTPS**, not SSH. SSH works for the owner and fails for everyone else and most CI.
- **Submodule path is `vendor/lobby`** in both games. The URL already says what it is.
- **`filter-repo` runs against a clone, never the working repo.** It rewrites history irreversibly and removes the `origin` remote by design.
- **`PROTOCOL_VERSION` does not change.** This moves files; it changes no behaviour.
- **Baseline: 857 tests in 81 files** on Acquire's `main`. The number must not move.
- **Acquire and Rail Baron are separate PRs.** Rail Baron has no server, so it consumes only part of the submodule.
- **Never run bare `tsc`** — use `npm run typecheck`.

## The layout being created

```
multiplayer-game-lobby/
  protocol/   ← was lobby/          wire types, node-safe
  server/     ← was server/lobby/   registry, handlers
  client/     ← was src/lobby/      identity, connection, useLobbyRoom, view
```

Acquire's imports change shape accordingly:

| Was | Becomes |
|---|---|
| `../../lobby/protocol` | `../../vendor/lobby/protocol/protocol` |
| `./lobby/rooms.js` | `../vendor/lobby/server/rooms.js` |
| `../lobby/view` | `../../vendor/lobby/client/view` |

---

### Task 1: Extract the repo

**Files:** none in Acquire. This task produces a new repository.

**Interfaces:**
- Consumes: Acquire's `main` at the commit this runs against — record its SHA.
- Produces: `petroleumjelliffe/multiplayer-game-lobby` with `protocol/`, `server/`, `client/`.

- [ ] **Step 1: Install filter-repo and record the source SHA**

```bash
brew install git-filter-repo
git -C ~/Developer/personal/acquire-startups-m1 rev-parse main
```

Write the SHA down — the new repo's README should name what it came from.

- [ ] **Step 2: Clone and filter**

```bash
cd /tmp
git clone https://github.com/petroleumjelliffe/acquire-startups-m1 lobby-extract
cd lobby-extract
git filter-repo \
  --path lobby --path server/lobby --path src/lobby \
  --path-rename lobby:protocol \
  --path-rename server/lobby:server \
  --path-rename src/lobby:client
```

`/tmp`, not `~/Developer/personal/` — this clone is disposable and must never be mistaken for a working copy.

- [ ] **Step 3: Verify the extraction before pushing anything**

```bash
git log --oneline | wc -l          # expect 15
git log --oneline | tail -3        # oldest should be the wire split, 859931f's content
ls                                 # protocol/ server/ client/ and nothing else
git log --oneline -- protocol/     # history reaches back past the rename
```

**The check that matters** is that last one: if `protocol/` shows only one commit, the rename did not carry history and this whole approach failed — stop and report rather than pushing.

- [ ] **Step 4: Create the repo and push**

```bash
gh repo create petroleumjelliffe/multiplayer-game-lobby --public \
  --description "Rooms, seats, tokens and presence — the lobby shared by Acquire and Rail Baron"
git remote add origin https://github.com/petroleumjelliffe/multiplayer-game-lobby
git push -u origin main
```

- [ ] **Step 5: Give it a README**

`lobby/README.md` came across as `protocol/README.md`. Add a root `README.md` that says what the repo is, names the source SHA, and states the two rules a consumer must follow:

```markdown
# multiplayer-game-lobby

Rooms, seats, join/rejoin tokens, presence, rename and leave — game-agnostic,
shared by Acquire and Rail Baron. Extracted from `acquire-startups-m1` at
`<SHA>`, with history.

    protocol/   wire types, node-safe
    server/     seating registry and socket handlers
    client/     headless React: identity, connection, useLobbyRoom, view

**Shared as source, not as a package.** Acquire is on React 18's successor and
Rail Baron on React 19; a built artifact would bake one React's JSX runtime in.
Each consumer compiles these files with its own toolchain.

**Include only what you use.** A game with no server should keep
`server/` out of its `tsconfig` include, or `tsc` will fail on a missing
`socket.io`.

See `protocol/README.md` for the contract a consuming game implements.
```

---

### Task 2: Acquire consumes the submodule

**Files:**
- Create: `.gitmodules`, `vendor/lobby` (submodule)
- Delete: `lobby/`, `server/lobby/`, `src/lobby/`
- Modify: every importer of those; `tsconfig.json`; `vite.config.ts` (vitest globs)

**Interfaces:**
- Consumes: the repo from Task 1.
- Produces: an Acquire whose lobby code lives in a submodule. No API changes.

- [ ] **Step 1: Add the submodule**

```bash
cd ~/Developer/personal/acquire-startups-m1
git checkout main && git pull --ff-only
git checkout -b chore/lobby-submodule
git submodule add https://github.com/petroleumjelliffe/multiplayer-game-lobby vendor/lobby
```

- [ ] **Step 2: List every importer before deleting anything**

```bash
grep -rln "lobby/protocol\|lobby/rooms\|lobby/handlers\|lobby/identity\|lobby/connection\|lobby/useLobbyRoom\|lobby/view" \
  src server session engine lobby --include='*.ts' --include='*.tsx'
```

Keep that list — it is the checklist for step 4, and the thing that tells you when you are done.

- [ ] **Step 3: Delete the originals**

```bash
git rm -r lobby server/lobby src/lobby
```

The import-boundary test goes with them. That is correct: it existed to keep the lobby importable-in-isolation *while it lived inside Acquire*. In its own repo, the boundary is the repo edge, and the test belongs there — it moved across in Task 1 as `protocol/importBoundary.test.ts`. Confirm it still passes in the new repo before relying on that.

- [ ] **Step 4: Repoint every import**

Work the list from step 2. The three shapes are in the table at the top of this plan. Note the doubled segment — `vendor/lobby/protocol/protocol` — because the file inside `protocol/` is still called `protocol.ts`.

- [ ] **Step 5: Teach the toolchain about `vendor/`**

`tsconfig.json`'s `include` currently reads `["engine", "session", "src", "server", "vite.config.ts"]`. Add `"vendor/lobby"`.

`vite.config.ts`'s vitest projects include `lobby/**/*.test.ts` in the `node` project. Repoint to `vendor/lobby/protocol/**/*.test.ts` and `vendor/lobby/server/**/*.test.ts`; the `client/` tests are jsdom and belong to the `app` project, whose `src/**` glob no longer reaches them — add `vendor/lobby/client/**/*.test.{ts,tsx}`.

**This is the step most likely to silently lose tests.** The count is the check.

- [ ] **Step 6: Verify by count, not by colour**

```bash
npm run typecheck
npx vitest run
```

Expected: **857 tests in 81 files** — the same numbers as before the move. Fewer means a glob missed a directory, which is exactly the failure this step invites and which a green run would otherwise hide.

- [ ] **Step 7: Build gates**

```bash
npm run check:bundle && npm run verify:layout
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: consume the lobby as a submodule

vendor/lobby points at multiplayer-game-lobby, extracted with its
history by git filter-repo. Acquire's copies are deleted and every
import repointed.

857 tests in 81 files, unchanged — the count is the check, because a
missed vitest glob loses a whole directory and still reports green."
```

---

### Task 3: Prove a fresh clone works

A submodule that only works in the directory where it was created is the classic failure, and it is invisible locally.

- [ ] **Step 1: Clone fresh, into /tmp**

```bash
cd /tmp && rm -rf acq-clone
git clone --recurse-submodules https://github.com/petroleumjelliffe/acquire-startups-m1 acq-clone
cd acq-clone && git checkout chore/lobby-submodule && git submodule update --init --recursive
```

- [ ] **Step 2: Install and run everything there**

```bash
npm ci
npm run typecheck && npx vitest run
```

Expected: 857 tests. A failure here and not locally means the submodule commit was never pushed — the single most common submodule mistake, and the reason this task exists.

- [ ] **Step 3: Confirm the pointer is pushed**

```bash
git -C vendor/lobby log --oneline -1
git ls-tree HEAD vendor/lobby
```

The SHA in the tree must exist on `origin` of the lobby repo. If it does not, push the submodule first, then re-commit the pointer.

- [ ] **Step 4: Push and open the PR**

```bash
cd ~/Developer/personal/acquire-startups-m1
git push -u origin chore/lobby-submodule
gh pr create --title "Consume the lobby as a submodule" --body "…"
```

The body must state that **clones now need `--recurse-submodules`**, and that CI needs `actions/checkout` with `submodules: true` — a reviewer who clones normally will get an empty `vendor/lobby` and a wall of missing-module errors.

---

### Task 4: Rail Baron consumes it

Separate repo, separate PR. Rail Baron has **no server**, which is the whole subtlety.

- [ ] **Step 1: Add the submodule and the missing dependency**

```bash
cd ~/Developer/personal/railbaron
git checkout main && git pull --ff-only
git checkout -b feat/lobby-submodule
git submodule add https://github.com/petroleumjelliffe/multiplayer-game-lobby vendor/lobby
npm install socket.io-client
```

- [ ] **Step 2: Include only `protocol` and `client`**

Rail Baron's `tsconfig.json` `include` is `["engine", "src", "vite.config.ts", "basePath.ts"]`. Add `"vendor/lobby/protocol"` and `"vendor/lobby/client"` — **not** `vendor/lobby` wholesale, and **not** `server/`.

`vendor/lobby/server/` imports `socket.io`, which Rail Baron does not have and does not need until it has a server. Including it fails `npm run typecheck` with a missing module, and the fix is not to install `socket.io` — it is to stop including code you do not run.

- [ ] **Step 3: Point vitest at the client tests**

Rail Baron's `app` project includes `src/**/*.test.{ts,tsx}`. Add `vendor/lobby/client/**/*.test.{ts,tsx}` so the shared tests run here too — a consumer that does not run the shared tests will not notice when a bump breaks it.

- [ ] **Step 4: Verify**

```bash
npm run typecheck && npx vitest run
```

Expected: Rail Baron's own tests plus the lobby's client tests. Nothing is wired to a screen yet — this task proves the submodule compiles and tests in a second consumer, which is the whole claim the extraction rests on.

- [ ] **Step 5: Commit, push, PR**

```bash
git add -A
git commit -m "feat: consume the shared lobby as a submodule

protocol/ and client/ only: Rail Baron has no server, and including
vendor/lobby/server/ would fail typecheck on a socket.io it does not
need. Boards 1d/1e/1f are the next piece."
git push -u origin feat/lobby-submodule
gh pr create --title "Consume the shared lobby as a submodule" --body "…"
```

---

## Deferred — not in this plan

- **Rail Baron's online boards** `1d`/`1e`/`1f`, and its server. This plan proves the submodule compiles in a second consumer; building the screens is the next piece of work.
- **Hosting** — a second Render service versus both games' servers in one process. Untouched.
- **The honor-reclaim policy** and the game-flavoured rejection codes (`notYourTurn` meaning "not the host"), both of which cost a protocol bump to change.
- **[#14](https://github.com/petroleumjelliffe/acquire-startups-m1/issues/14)**, the `RoomRefused` dead end — now a shared-repo concern, which is an argument for fixing it there rather than in either game.

# MemPalace Integration — Plan

Local memory + search for the aggregator, backed by
[MemPalace](https://github.com/MemPalace/mempalace). Opt-in via
`agents-aggregator serve --mempalace`. No API keys, no cloud, no extra cost — MemPalace's
default path is fully local (verbatim storage + ONNX MiniLM embeddings +
ChromaDB).

This sits inside the OSS viewer (Phase 1-5 in `PLAN.md`). The commercial
`InsightProvider` in `ROADMAP.md` Phase 7 is a strict superset; MemPalace
gives the free tier credible memory search without the synthesis layer.

## Goal

After running `agents-aggregator serve --mempalace`:

1. Every session the viewer indexes also gets filed into MemPalace.
2. The project directory (`session.cwd`) gets filed too, sharing the
   session's wing.
3. `GET /api/search?q=…` returns hits across both, deep-linked to the
   original session in the viewer.

Nothing about the existing viewer changes when the flag is off.

## Pipeline

```
Entry[]  ──[render.ts]──▶  Markdown file  ──[mempalace mine]──▶  palace
                              │
                              └── stable path = stable identity
```

One unified pipeline for all four agents (Claude, Codex, Pi, OpenCode).
We **do not** rely on MemPalace's auto-detection of Claude `.jsonl` — we
render Markdown ourselves so the format is stable, agent-agnostic, and
not vulnerable to MemPalace parser changes.

## Staging layout

```
~/.config/agents-aggregator/
  mempalace-stage/
    <sourceId>/
      <sessionId>.md
```

One file per session, overwritten on update. Idempotent — re-mine the
same path and MemPalace updates that document's chunks. Search hits
encode `(sourceId, sessionId)` in the filename, so no sidecar lookup
table.

`agents-aggregator memory rescan` wipes the stage dir and rebuilds from SQLite.

## Module layout

New directory: `src/server/memory/`

| File | Responsibility |
|---|---|
| `detect.ts` | `command -v mempalace`, check `~/.mempalace/config.json` exists, return capabilities |
| `render.ts` | `(Session, Entry[]) → Markdown` |
| `wing.ts` | `cwd → wing slug` with collision handling, persisted in SQLite |
| `stage.ts` | Atomic write to staging path |
| `sync.ts` | Pubsub subscriber, per-session 30s debounce |
| `miner.ts` | Spawn `mempalace mine` for sessions and projects |
| `search.ts` | Spawn `mempalace search`, parse, enrich with `(sourceId, sessionId)` |

New SQLite table: `wing` — `(slug PRIMARY KEY, cwd, lastMinedAt)`.

## Markdown format

```markdown
---
sessionId: 0d3f...
sourceId: claude-work
agent: claude
cwd: /home/anh/work/orion
startedAt: 2026-05-15T09:32:01Z
updatedAt: 2026-05-16T11:04:55Z
---

## User
{text}

## Assistant
{text}

### Tool: Read /src/app.ts
{preview, truncated to ~500 chars}

## Assistant
{more text}

## Bash
$ pnpm test
{output, truncated}
```

Role mapping:

| `Entry.role` | Render as |
|---|---|
| `user` | `## User` block |
| `assistant` | `## Assistant` block |
| `toolCall` + `toolResult` | `### Tool: <name> <args>` + truncated body, folded into preceding assistant turn |
| `bash` | `## Bash` with command + truncated output |
| `thinking` | **drop** — hurts retrieval signal |
| `system`, `summary`, `custom` | drop, or fold as minor section if obviously useful |

Tool / bash output truncation: > ~2KB → first 500 chars +
`[…truncated…]`. The viewer still has the raw payload in SQLite/files;
the palace only needs enough to *retrieve* on.

The frontmatter is belt-and-braces for identity recovery in case
MemPalace surfaces YAML in hit metadata. Filename is the primary key.

## Wing strategy

- Slug = `path.basename(cwd)`, lowercased, non-alphanumerics → `-`
  - `/home/anh/work/orion` → `orion`
- On collision (two cwds, same basename), append `-<6-char-hash>` to
  the loser
- Persisted in the new `wing` table — slugs are sticky across restarts
- `wing.slugFor(cwd)` is idempotent: returns the existing slug or
  creates and persists a new one

## CLI surface

- `agents-aggregator serve --mempalace` — explicit on; fails loud if mempalace missing
- `agents-aggregator serve --no-mempalace` — explicit off
- `agents-aggregator serve` (default) — auto-on when binary detected, silent skip
  otherwise
- `agents-aggregator memory rescan` — re-render and re-mine every session (force)
- `agents-aggregator memory export <sessionId>` — render to stdout (debugging)
- `agents-aggregator memory status` — show detection result, palace dir, session
  counts staged vs. mined

## Server flow

### On `agents-aggregator serve --mempalace` startup

1. `detect.ts` runs. If unusable, log + bail out of mem integration.
2. `indexAll()` runs as today (unchanged).
3. Backfill loop: for every unique `cwd` in `sessions`:
   - `wing.slugFor(cwd)` (creates if new)
   - If `wing.lastMinedAt` is null or older than ~7d, queue
     `mempalace mine <cwd> --wing <slug>` (project code)
   - For each session in this cwd not yet staged or older than its
     `session.updatedAt`: render → write to stage → mine with
     `--mode convos --wing <slug>`
4. `startMemorySync()` subscribes to pubsub.

### On `session_updated` (live)

1. Debounce 30s per `(sourceId, sessionId)`.
2. Re-render the session from current entries.
3. Atomic write to stage path.
4. `mempalace mine <stage-path> --mode convos --wing <slug>`.
5. Log success/failure through existing `logger.ts`.

### On `GET /api/search?q=…&limit=20`

1. Spawn `mempalace search "<q>" --limit 20 [--json]`.
2. Parse hits. Each hit ideally carries the file path → decode
   `(sourceId, sessionId)`.
3. Look up session metadata from SQLite to enrich (label, cwd, agent,
   updatedAt).
4. Return `[{ sourceId, sessionId, wing, snippet, score, sessionMeta }]`.

UI work: search bar in `AppShell.tsx` (or a `/search` route in
`router.tsx`), each hit deep-links into `SessionDetail`.

## Implementation order

1. **Spike** (a few hours, no commits). Answer:
   - What Markdown shape does `mempalace mine --mode convos`
     recognize? Read `mempalace/convo_miner.py` /
     `convo_scanner.py`.
   - Does `mempalace search` have `--json`? If not, parse stdout, or
     use MCP server over stdio.
   - Does a hit carry the source file path (so we can decode IDs from
     filename)? If not, we need a sidecar map.
   - Cost of re-mining a single ~10MB session file: tens of ms or
     several seconds? Determines whether 30s debounce is enough.
2. **`detect.ts` + `render.ts` + CLI export command.** Manually verify
   the round-trip: export → mine → search → recover identity.
3. **`wing.ts` + SQLite migration.** Idempotent slug assignment.
4. **`stage.ts` + `sync.ts` + `miner.ts`.** Live sync from pubsub.
   Wire into `serve` behind the flag.
5. **`search.ts` + `/api/search` route.** UI search bar.
6. **Backfill loop + `agents-aggregator memory rescan`.** Project mining included.
7. **Polish:** `agents-aggregator memory status`, error surfacing in UI when palace
   is unreachable, README section.

## Open questions

- **Project mining cost on a large monorepo.** May need an
  `--exclude node_modules` style flag or a per-source opt-out for
  ingesting the project tree.
- **Dedup with MemPalace's own hooks.** If the user has the MemPalace
  Claude Code hooks installed *and* runs us with `--mempalace`, both
  paths file the same session. MemPalace has `dedup.py` — verify it
  works at the chunk level before declaring this safe.
- **Multi-machine palaces.** A single `~/.mempalace/` is shared
  across users on the box; fine for single-user laptops, awkward
  later. Out of scope for v1.
- **Search ranking.** MemPalace's "hybrid v4" pipeline (keyword +
  temporal boost) is configurable. Defaults are probably fine, but
  if results are noisy we'll need to dig into their config.

## Non-goals (for v1)

- MemPalace's auto-save hooks. Our watcher already gives us the
  trigger; hooks would add setup steps for marginal gain. Document as
  an optional power-user upgrade.
- MemPalace's MCP server pass-through. Exposing `agents_search` to
  Claude Code directly is nice eventually, but a viewer feature first.
- Per-agent renderer specialisation. The unified Markdown is the
  whole point — only revisit if retrieval quality demands it.
- Custom embedding models. MiniLM is what MemPalace ships; that's
  fine.

## Risks

- **Python runtime dependency for end users.** Document in README;
  treat as opt-in. Detection falls back gracefully.
- **MemPalace format drift.** Markdown is the most stable input; we
  control it, not them. Pin a tested MemPalace version in docs
  ("verified against v3.3.x").
- **Performance on long-running sessions.** A live Claude session can
  append many entries per minute. 30s debounce + re-render-the-whole-
  file is wasteful at the tail. Acceptable for v1; optimise to
  append-only chunks if it bites.

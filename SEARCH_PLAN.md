# Search plan — making the search bar actually useful

Captured 2026-05-14. Search today is a single debounced `q` in the URL fed to a `LIKE %q%` against `session.name`, `session.cwd`, `session.model` (`db.ts:162/174/192`). It only matches session-header metadata — anything you typed or the agent said inside a transcript is invisible to it. This plan adds full-text search over entry content via SQLite FTS5, then layers UI on top.

Already shipped: the existing `LIKE` path was broken because the empty-string default in `COALESCE(name,"")` was being parsed by SQLite as a column identifier, returning 500 on every non-empty `q`. Replaced `""` with `''` in `db.ts:162/174/192`. With that, header-only filtering works again — typing `opus` trims the sidebar correctly. Everything below builds on top of that working baseline.

## 1. FTS5 entry index

**Problem.** `LIKE %q%` over three header columns can't answer "the session where I worked on SSE retries" because nothing about the entry text is indexed. FTS5 is SQLite's built-in inverted-index virtual table — tokenized, ranked (BM25), supports phrase/prefix/boolean operators, and ships with `better-sqlite3` so there's no extension to load. Schema is the design call.

**Fix.** Add an entry-grain FTS table. One row per `Entry` in `shared/types.ts:59`. Denormalize the session columns we want as filters so we don't need a join at query time:

```sql
CREATE VIRTUAL TABLE entry_fts USING fts5(
  text,         -- Entry.text ?? Entry.fullText ?? '' (the main searchable body)
  tool,         -- Entry.tool (e.g. "Bash", "Edit", "Read") — '' for plain messages
  cmd,          -- Entry.cmd (bash commands)
  out,          -- Entry.out (tool stdout / results)
  args_path,    -- Entry.args?.path (file paths touched)
  role,         -- Entry.role: user|assistant|toolCall|toolResult|thinking|bash|...
  cwd UNINDEXED,        -- denormalized from session — filter only
  agent UNINDEXED,
  model UNINDEXED,
  sourceId UNINDEXED,
  sessionId UNINDEXED,
  entryId UNINDEXED,
  timestamp UNINDEXED,
  tokenize = 'porter unicode61'
);
```

`UNINDEXED` columns don't enter the tokenizer (no inverted index cost) but are returned alongside hits, so the API can render a row without a second query. `porter` gives mild stemming ("retried" → "retri" matches "retry"); `unicode61` normalizes case and unicode without needing ICU.

Also add a thin per-session FTS row so a query like `cwd:agents-aggregator` returns the *session* even when no entry matches — keeps the "session-by-header" experience intact:

```sql
CREATE VIRTUAL TABLE session_fts USING fts5(
  name, cwd, model, agent UNINDEXED, sourceId UNINDEXED, sessionId UNINDEXED,
  tokenize = 'porter unicode61'
);
```

**Risk.** Disk: FTS5 indexes roughly double the size of the tokenized columns. For this app's volumes (hundreds of sessions, hundreds of entries each) that's tens of MB at most — fine. Schema lock-in: changing tokenizer or column set later means a full rebuild, so settle the column list before populating.

## 2. Populate at parse time

**Problem.** `indexer.ts` only writes session-header rows. Entries are produced on demand by `parser.parseEntries(filePath)` (`api.ts:62`), never persisted. For FTS to be useful we need entry rows in the DB, kept in sync with the JSONL/SQLite source files.

**Fix.** Two write points:

1. **Initial / full scan** (`indexer.ts:21` `indexSource`): after `parseSession`, also call `parseEntries` once and bulk-insert into `entry_fts` plus refresh `session_fts`. Wrap in a transaction per session for speed.
2. **Live tail** (`watcher.ts` + the existing `entry_offset` byte-tracking already in `db.ts:50`): on every appended chunk, the watcher already knows the new byte range. Have it parse just the delta and append to `entry_fts`. Use `entryId` as a deterministic key so re-parsing the same range is idempotent (delete-by-`entryId` before insert, or use `INSERT OR REPLACE` via a rowid-keyed shadow table).

For OpenCode (`parsers/opencode.ts`, SQLite-backed) the same parseEntries call works — it just reads from `opencode.db` instead of a JSONL stream.

**Risk.** First-run reindex cost. Existing users will see a one-time backfill the next time the server starts on the upgraded schema. For an archive with ~50k entries this is seconds, not minutes — better-sqlite3 + a transaction handles it. Add a `PRAGMA user_version` check so we only rebuild once per migration.

## 3. `/api/search` endpoint

**Problem.** The current `/api/sessions?q=` returns sessions filtered by header LIKE. That shape is wrong for content search — one session can have many matching entries, each deserves its own ranked hit with a snippet, and we want field operators (`tool:Bash`, `cwd:foo`) without overloading `q`.

**Fix.** New endpoint, leave `/api/sessions?q=` alone for now (it stays the cheap header-only path used by the sidebar list when no content search is active):

```
GET /api/search?q=<query>&limit=50&sessionId=<optional>
→ {
    hits: [
      {
        sourceId, sessionId, entryId, role, tool,
        timestamp, snippet,            -- FTS5 snippet() with <mark>…</mark>
        rank,                          -- bm25 score
        sessionName, cwd, agent, model -- joined so client renders without N+1
      }, ...
    ],
    sessionMatches: [{ sourceId, sessionId, name, cwd, agent, model, rank }, ...]
  }
```

Two arrays so the UI can render "entry hits" and "session-name hits" as distinct sections.

Query parsing: a tiny tokenizer turns `cwd:foo "exact phrase" tool:Bash bug` into FTS5's column-filter syntax — `{cwd}:foo "exact phrase" {tool}:Bash bug`. Recognized prefixes: `cwd:`, `tool:`, `role:`, `agent:`, `model:`, `cmd:`, `path:` (alias for `args_path`). Anything unrecognized stays as a plain term.

Sanitize: wrap user-supplied terms with FTS5's quoting rules so `"foo bar:baz"` isn't taken as a column filter; reject empty queries with 400. Cap `limit` at a reasonable max (200) server-side.

**Risk.** FTS5's query syntax errors are unhelpful and crash the prepared statement. Catch the parse error and respond with a friendly 400 plus the offending term — don't let a stray colon 500 the request like the `""` bug did. Include a `?explain=1` debug mode that returns the rewritten FTS query for development.

## 4. UI phase 1 — sidebar with snippets

**Problem.** Today the sidebar dims the session list when `q` doesn't match a header. Even after FTS is in place, hits live inside transcripts — the user needs to see *why* a session matched and click directly to that entry.

**Fix.** In `SessionList.tsx`, when `q` is non-empty:
- Fetch `/api/search?q=…` in addition to (or instead of) `/api/sessions?q=…`.
- Group hits by `sessionId`. Render each session row as today, plus one extra line below the row: `snippet` (with `<mark>` honored), and a `× N` chip if the session has more than one matching entry.
- Click target on rows with hits: `setActiveId(sessionId)` *and* `setSelectedEntryId(entryId)` so `SessionDetail` scrolls to the matched entry. `selectedEntryId` plumbing already exists (`AppShell.tsx:85`).
- Empty result state: replace the silent empty list with "No matches in entries or session names" plus the parsed FTS query echoed back, so the user can tell `cwd:wrong-path` was the issue.

Wire `⌘K` (the decorative chip at `TopBar.tsx:71`) to focus the search input — even before Phase 2 lands, this is one keydown handler and the affordance is already promised in the UI.

**Risk.** A session with 50 hits shows only its top snippet — easy to miss the *interesting* hit if it's not ranked first. Phase 2 (palette) is the answer when that becomes a real problem; for now BM25 picks reasonably and the `× N` chip signals there's more behind it.

## 5. UI phase 2 — `⌘K` palette (deferred)

**Problem.** Phase 1 collapses N hits per session into one snippet. When the user knows the specific moment they want (a particular bash command, a specific file path), they need entry-grain hits, not session-grain.

**Fix.** `⌘K` opens a floating overlay anchored to the search bar. Flat list of entry hits, keyboard navigable (`↑`/`↓`/`Enter`/`Esc`), each row showing: agent chip, session name, timestamp, snippet. Same `/api/search` payload underneath — just a different render of `hits[]` rather than the grouped sidebar render. Selecting a hit navigates to `/session/$id` and sets `selectedEntryId`.

Build only if Phase 1 turns out to be lossy in practice. The endpoint already returns entry-grain data, so adding this view later is pure frontend.

**Risk.** Palette UX is a separate skill from sidebar UX — focus management, scroll-into-view of the active item, escape behavior. Don't underestimate. Most of the cost is in the keyboard layer, not the rendering.

## 6. What this plan deliberately does not do

- **Semantic / embedding search.** `bge-small` via `@xenova/transformers` + `sqlite-vec` is a credible additive layer for "find by meaning, not literal words", but it carries a model download, a backfill cost, and quality is "good not great." Keep it as a future toggle; FTS5 covers ~90% of the value at zero new dependencies.
- **"Ask" mode** (LLM-over-retrieved-snippets). Requires either a local LLM endpoint or a user-supplied API key, which breaks the "no cloud" pitch in the README. Punt.
- **Cross-session reasoning.** Same reason — needs an LLM in the loop.
- **Image / binary content.** FTS5 is text-only by definition. Images stay invisible to search; that's fine.

## Order of attack

1. **Schema + migration** (item 1). Land the empty FTS tables with a `user_version` bump. No behavior change yet.
2. **Backfill + watcher hook** (item 2). Populate from existing parsers. This is the riskiest item because of idempotency and live-tail correctness — get it right before exposing anything.
3. **`/api/search` endpoint** (item 3) with the query parser, error handling, and `?explain=1`. Verifiable via `curl` before any UI work.
4. **Phase 1 UI** (item 4). Sidebar snippets, jump-to-entry, `⌘K` focus binding. This is the user-visible deliverable.
5. **Phase 2 palette** (item 5) — only if Phase 1 proves insufficient in real use.

Items 1–4 are the "useful search" milestone. Item 5 is polish.

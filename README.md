# Agents Aggregator

A local web app that aggregates AI coding-agent session history across multiple
agents and accounts, with live updates as the agents run.

Each agent stores its session history in its own format under your home
directory. If you run several agents — or several accounts of the same agent —
your history is scattered across `~/.claude`, `~/.claude-work`, `~/.codex`,
`~/.codex-personal`, `~/.opencode`, `~/.pi`, etc. Agents Aggregator points at
those folders, indexes them in a local SQLite database, and gives you one place
to browse, filter, search, and watch sessions unfold live.

Runs entirely on your machine. No cloud, no auth, single process.

## Supported agents

| Agent       | Folder layout                                                 |
|-------------|---------------------------------------------------------------|
| Claude Code | `~/.claude/projects/<encoded-cwd>/<uuid>.jsonl`               |
| Codex CLI   | `~/.codex/sessions/YYYY/MM/DD/rollout-<uuid>.jsonl`           |
| Pi          | `<root>/agent/sessions/<encoded-cwd>/<file>.jsonl`            |
| OpenCode    | sniffed (parser work in progress)                             |

The aggregator auto-detects which agent a folder belongs to from its layout
(see `src/server/parsers/base.ts`). You can override with `--agent` if needed.

## Requirements

- Node.js 18 or newer
- `tmux` (optional — only needed for the "send input to a running session"
  feature)

## Install and run

```bash
git clone https://github.com/<your-org>/agents-aggregator.git
cd agents-aggregator
npm install
```

Add at least one source folder:

```bash
npm run cli -- source add ~/.claude
npm run cli -- source add ~/.codex
npm run cli -- source add ~/.pi
```

Start the dev server (Hono API on `:3000`, Vite UI on `:5173`):

```bash
npm run dev
```

Open <http://localhost:5173>.

## Configuration

Sources live in `~/.config/agents-aggregator/config.json` (or
`$XDG_CONFIG_HOME/agents-aggregator/config.json`). The SQLite index lives next
to it as `index.db`. Both are created on first run.

```json
{
  "sources": [
    {
      "id": "claude",
      "label": "Claude",
      "agent": "claude",
      "root": "/home/you/.claude",
      "enabled": true
    }
  ]
}
```

You can hand-edit this file or manage it via the CLI.

## CLI

```bash
npm run cli -- source add <root> [--label <label>] [--agent <agent>] [--id <id>]
npm run cli -- source list
npm run cli -- source remove <id>
npm run cli -- source enable <id>
npm run cli -- source disable <id>
npm run cli -- scan          # re-index all enabled sources
```

`<agent>` is one of `claude`, `codex`, `opencode`, `pi`. Omit it to auto-detect
from the folder layout.

## Features

- **Unified session list** across all sources with filters for source, agent,
  and working directory.
- **Live updates** via Server-Sent Events. Open the UI on one monitor, use
  your agent on another, and watch messages stream in without refreshing.
- **Normalized rendering** of user / assistant / tool-call / tool-result /
  thinking / bash blocks regardless of which agent produced them.
- **Markdown and diff views** for assistant messages and file edits.
- **tmux passthrough**: if a session is running inside a tmux pane, you can
  type input into the UI and it gets sent to the agent's terminal via
  `tmux send-keys`.
- **Per-file tailing** with debounced `fs.watch`, byte-offset tracking, and
  truncation detection.

## Architecture

```
Source folders (~/.pi, ~/.claude, ~/.codex, …)
        │
        ▼
  Watcher (fs.watch, recursive, debounced ~100ms)
        │
  Parser per agent (claude, codex, pi, opencode)
        │
  Indexer → SQLite (better-sqlite3)
        │
  In-process pub/sub
        │
  Hono API + SSE  ──►  React + Vite UI
```

| Layer    | Choice                                                  |
|----------|---------------------------------------------------------|
| Runtime  | Node + TypeScript                                       |
| Server   | Hono with native SSE                                    |
| DB       | better-sqlite3                                          |
| Watcher  | `fs.watch({ recursive: true })`, debounced              |
| Frontend | Vite + React, `EventSource` for live updates            |
| Config   | `~/.config/agents-aggregator/config.json` (zod-validated)|
| Logging  | pino                                                    |

## Project layout

```
src/
├── shared/types.ts             # Source, Session, Entry, Block
├── server/
│   ├── index.ts                # entrypoint
│   ├── config.ts               # config.json load/save
│   ├── db.ts                   # SQLite repos
│   ├── indexer.ts              # initial scan + upsert
│   ├── watcher.ts              # fs.watch + debounce
│   ├── pubsub.ts               # in-process fanout
│   ├── tmux.ts                 # pane resolution + send-keys
│   ├── api.ts                  # Hono routes + SSE
│   ├── cli.ts                  # `aa` CLI
│   └── parsers/
│       ├── base.ts             # Parser interface + sniffer
│       ├── claude.ts
│       ├── codex.ts
│       └── pi.ts
└── ui/                         # React app
```

## API

The HTTP API is exposed on port `3000` (the Vite dev server proxies `/api`).

| Route                                              | Description                       |
|----------------------------------------------------|-----------------------------------|
| `GET  /api/sources`                                | List configured sources           |
| `GET  /api/sessions?source=&agent=&q=&project=`    | List sessions with filters        |
| `GET  /api/projects`                               | List distinct project (cwd) values|
| `GET  /api/sessions/:sourceId/:sessionId`          | Session metadata                  |
| `GET  /api/sessions/:sourceId/:sessionId/entries`  | All entries for a session         |
| `POST /api/sessions/:sourceId/:sessionId/input`    | Send `{ text }` to the tmux pane  |
| `GET  /api/events`                                 | SSE stream of activity            |

## Build

```bash
npm run build      # tsc -b && vite build
npm run preview    # serve the built UI
```

## Roadmap

See `PLAN.md` for the implementation phases (Pi → live watch → Claude →
Codex → OpenCode) and `ROADMAP.md` for the longer-term direction including a
commercial cloud layer.

## License

TBD — pick a license before publishing (MIT or Apache-2.0 recommended).

## Contributing

Issues and PRs welcome once the repo is public. The parser layer is the
easiest place to contribute: implement the `Parser` interface in
`src/server/parsers/base.ts` for a new agent and wire it into
`src/server/parsers/index.ts`.

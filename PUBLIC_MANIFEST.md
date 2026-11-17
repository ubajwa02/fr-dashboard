# Public manifest: Fundamentalist snapshot

Read-only snapshot, generated 2026-11-17 14:40 UTC. Research, not advice.

## What is in this site

| Path | Files | Size |
|---|---|---|
| `.nojekyll` | 1 | 0 KB |
| `app.css` | 1 | 128 KB |
| `app.js` | 1 | 292 KB |
| `data/` | 2 | 112 KB |
| `data/brief/` | 15 | 76 KB |
| `data/prices/` | 15 | 503 KB |
| `data/stock/` | 15 | 486 KB |
| `fonts/` | 6 | 207 KB |
| `icons/` | 4 | 9 KB |
| `index.html` | 1 | 5 KB |
| `manifest.webmanifest` | 1 | 1 KB |
| `phone.css` | 1 | 14 KB |
| `phone.js` | 1 | 19 KB |
| **Total** | **64** | **1.8 MB** |

- `index.html`, `app.js`, `app.css`: the dashboard page, in read-only mode.
- `data/*.json`: My stocks, Earnings, Market, Opportunities, Oversold, Track record and the ticker list.
- `data/stock/`, `data/brief/`: per-stock views (50 stocks): What matters, Mentor, key numbers and Stock Brief.
- `data/prices/`: the last 260 trading days of daily open/high/low/close and moving averages, for the charts. No volume.

## What is NOT in this site

- No API keys, `.env` values, notification topics, contact e-mail or HTTP User-Agent.
- No database, logs, backups or local file paths.
- Data-source health is reduced to a single status line.
- News appears only as headline-level analysis; no article text.

Every export is scanned for these items. If any is found, the export fails and nothing is written.

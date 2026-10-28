# app-estimate-history

See how a rival iOS app's monthly downloads and monthly revenue estimates moved, day by day, over up to a year. Give it an App Store id or an `apps.apple.com` link; it makes one API call per app and prints the latest range, the change over the window, the change since last month, the peak, and how many days had no estimate. Output is Markdown, CSV or JSON, and it can post a short summary to Slack or Discord.

Use it to check whether a competitor's growth is a trend or one good week, to pull a year of estimates into a spreadsheet, or to get a Monday note on the apps you watch.

Node 18+, no dependencies. There is also a [browser version](https://fdarkaou.github.io/app-estimate-history/) that charts a pasted response and never sends it anywhere.

```
## Example Calorie Tracker (0000000000)

Health & Fitness · rating 4.7 · 12.5k ratings

30 daily observations, 2026-09-28 → 2026-10-27.

- Monthly downloads: latest 66k–287k (mid 138k) on 2026-10-27; +16% vs a month earlier; +33% since 2026-09-30; peak mid 138k on 2026-10-27; 2 unknown
- Monthly revenue: latest $960k–$4.2M (mid $2M) on 2026-10-27; +11% vs a month earlier; +28% since 2026-10-04; peak mid $2M on 2026-10-27; 4 days under the floor, 2 unknown
- New ratings per day (latest): 32.7

| Day | Monthly downloads | Monthly revenue | Ratings/day |
| --- | --- | --- | ---: |
| 2026-10-27 | 66k–287k (mid 138k) | $960k–$4.2M (mid $2M) | 32.7 |
| 2026-10-26 | 65k–283k (mid 136k) | $947k–$4.1M (mid $2M) | 32.4 |
| 2026-10-25 | 64k–279k (mid 134k) | $933k–$4M (mid $1.9M) | 32.1 |
| 2026-10-24 | 63k–275k (mid 132k) | $919k–$4M (mid $1.9M) | 31.8 |
| 2026-10-23 | 62k–270k (mid 130k) | $905k–$3.9M (mid $1.9M) | 31.5 |
| 2026-10-22 | 63k–275k (mid 132k) | $919k–$4M (mid $1.9M) | 31.2 |
| ... | | | |
```

(Example data from `examples/history.json`, not a real app.)

## Where the data comes from

The data comes from [PeekPanda](https://peekpanda.com), an iOS competitor catalogue that keeps dated evidence for each app. The tool calls [`GET /v1/competitors/ios/{storeId}/estimates/history`](https://peekpanda.com/docs/get-competitor-estimate-history), which returns up to 366 dated observations for one app (60 by default; this tool asks for 90). Over MCP the same read is the `get_app` tool with action `estimates`. It only reads stored data and never calls the App Store.

Downloads and revenue are PeekPanda estimates: worldwide monthly App Store ranges (low, mid, high) in USD, refreshed nightly, or "under 5k" below the floor. A day before an app was first scored has no estimate. They are not numbers reported by Apple or the developer.

You need a PeekPanda account and an API key. Each app is one call against your plan's daily API and MCP allowance.

## Use it

```bash
git clone https://github.com/fdarkaou/app-estimate-history && cd app-estimate-history
export PEEKPANDA_TOKEN=...   # API key from Account → API keys. Keep it out of source control.

node cli.js 1234567890                                         # one app, last 90 observations
node cli.js https://apps.apple.com/us/app/some-app/id1234567890 --limit 366
node cli.js 1234567890 1234567891                              # compare two apps
node cli.js 1234567890 --format csv > estimates.csv
node cli.js 1234567890 --webhook "$SLACK_WEBHOOK_URL"          # Discord webhook URLs work too
```

Try it without an account on the bundled example:

```bash
node cli.js --file examples/history.json
npm test
```

Options: `--limit 1-366`, `--format md|csv|json`, `--webhook <url>`, `--file <path>` (one saved response or an array of them), `--tenancy`, `--api`. Run `node cli.js --help` for details. On a `429 rate_limited` with a short `Retry-After` it waits and retries once; on `daily_call_limit` it stops.

## Ask an assistant instead

If your assistant is connected to the PeekPanda MCP server (`https://mcp.peekpanda.com/mcp`, OAuth sign-in or an API key), ask it to call `get_app` with:

```json
{ "request": { "action": "estimates", "params": { "platform": "ios", "storeId": "1234567890" } } }
```

Then paste the result into the browser version, or save it and run `node cli.js --file`.

## How to read it

- "since <day>" compares the newest mid estimate with the oldest day in the window that had a range. Days under the floor or with no estimate are skipped, not counted as zero.
- "vs a month earlier" compares the newest mid with the previous-month value on the same observation. It is blank when either is missing or under the floor.
- "unknown" means PeekPanda held no estimate for that day. It is unknown, not zero.
- When a day has more than one observation, the newest one is used.
- Use the ranges for direction and scale, not for exact figures.

## Weekly post in GitHub Actions

`.github/workflows/weekly-estimates.yml` is an example job that runs every Monday, makes one call per app, writes the report to the run summary, posts it to a webhook and saves CSV and JSON as an artifact. Add `PEEKPANDA_TOKEN` and `ESTIMATES_WEBHOOK_URL` as repository secrets, set the repository variable `ENABLE_ESTIMATES` to `true`, and put your own App Store ids in the file.

## License

MIT

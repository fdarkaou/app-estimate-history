#!/usr/bin/env node
// Estimate history report on the PeekPanda API. Node 18+, no dependencies.
// One call per app to GET /v1/competitors/ios/{storeId}/estimates/history.
import { readFile } from 'node:fs/promises';
import { parseStoreId, toMarkdown, toCsv, toChat, toComparison } from './history.js';

const HELP = `Usage:
  PEEKPANDA_TOKEN=... node cli.js <storeId|apps.apple.com link> [more ...] [options]
  node cli.js --file history.json [options]

Each app is one API call. With two or more, a one-line-per-app comparison is printed first.

Options:
  --limit <1-366>        how many daily observations to read (default 90; the API default is 60)
  --format md|csv|json   output format (default md)
  --webhook <url>        also POST a short summary to a Slack or Discord incoming webhook
  --tenancy <value>      x-genviral-tenancy header (default personal)
  --api <url>            API base (default https://api.peekpanda.com)
  --file <path>          read a saved estimates/history response instead of calling the API`;

function parse(argv) {
  const o = { format: 'md', tenancy: 'personal', api: 'https://api.peekpanda.com', limit: '90', ids: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') o.help = true;
    else if (a.startsWith('--')) o[a.slice(2)] = argv[++i];
    else o.ids.push(a);
  }
  return o;
}

async function fetchHistory(raw, o, retried = false) {
  const token = process.env.PEEKPANDA_TOKEN;
  if (!token) throw new Error('Set PEEKPANDA_TOKEN to a PeekPanda API key (Account → API keys). Never commit it.');
  const id = parseStoreId(raw);
  if (!id) throw new Error(`Not a numeric App Store id or apps.apple.com link: "${raw}"`);
  const limit = Number(o.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 366) throw new Error('--limit must be a whole number from 1 to 366');
  const url = new URL(`/v1/competitors/ios/${id}/estimates/history`, o.api);
  url.searchParams.set('limit', String(limit));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'x-genviral-tenancy': o.tenancy, Accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const code = body?.error?.code ?? '';
    const retry = Number(res.headers.get('retry-after'));
    if (res.status === 429 && code !== 'daily_call_limit' && !retried && retry > 0 && retry <= 60) {
      await new Promise((r) => setTimeout(r, retry * 1000));
      return fetchHistory(raw, o, true);
    }
    throw new Error(`PeekPanda API ${res.status} ${code} for app ${id}: ${body?.error?.message ?? res.statusText}`);
  }
  return res.json();
}

async function main() {
  const o = parse(process.argv.slice(2));
  if (o.help || (!o.ids.length && !o.file)) { console.log(HELP); return; }
  const resps = o.file ? [JSON.parse(await readFile(o.file, 'utf8'))].flat() : [];
  for (const raw of [...new Set(o.ids)]) resps.push(await fetchHistory(raw, o));

  if (o.format === 'json') console.log(JSON.stringify(resps.length === 1 ? resps[0] : resps, null, 2));
  else if (o.format === 'csv') console.log(resps.map((r, i) => (i ? toCsv(r).split('\n').slice(1).join('\n') : toCsv(r))).filter(Boolean).join('\n'));
  else {
    const out = resps.length > 1 ? [toComparison(resps)] : [];
    out.push(...resps.map(toMarkdown));
    console.log(out.join('\n\n') + '\n\nEstimates are PeekPanda worldwide monthly App Store ranges, not store-reported numbers. "unknown" means no estimate that day, not zero.');
  }

  if (o.webhook) {
    const text = resps.map(toChat).join('\n\n');
    const isDiscord = /discord(app)?\.com\/api\/webhooks/.test(o.webhook);
    const r = await fetch(o.webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(isDiscord ? { content: text.slice(0, 1900) } : { text }) });
    if (!r.ok) throw new Error(`Webhook returned ${r.status}`);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });

// Pure helpers for the estimate history report. Works in Node and in the browser (index.html imports it).
// Input: one GET /v1/competitors/ios/{storeId}/estimates/history response. Output: summary, Markdown, CSV, chat text.

export const METRICS = { monthlyInstalls: 'Monthly downloads', monthlyRevenue: 'Monthly revenue' };

export function compact(n) {
  if (n == null || !Number.isFinite(n)) return '';
  const a = Math.abs(n);
  if (a >= 1e9) return trim(n / 1e9) + 'B';
  if (a >= 1e6) return trim(n / 1e6) + 'M';
  if (a >= 1e3) return trim(n / 1e3) + 'k';
  return String(Math.round(n));
}
function trim(x) { return (Math.abs(x) >= 100 ? Math.round(x) : Math.round(x * 10) / 10).toString(); }

// Accepts "1234567890", "id1234567890" or an apps.apple.com/.../id<digits> app link.
export function parseStoreId(input) {
  const s = String(input ?? '').trim();
  const m = s.match(/apps\.apple\.com\/.*\/id(\d{3,20})/i) || s.match(/^(?:id)?(\d{3,20})$/i);
  return m ? m[1] : null;
}

// Estimate: { kind: 'range', range }, { kind: 'below_floor', ceiling }, or null (unknown, not zero).
export function describe(est, money = false) {
  const p = money ? '$' : '';
  if (!est) return 'unknown';
  if (est.kind === 'below_floor') return `under ${p}${compact(est.ceiling)}`;
  if (est.kind === 'range' && est.range) return `${p}${compact(est.range.low)}–${p}${compact(est.range.high)} (mid ${p}${compact(est.range.mid)})`;
  return 'unknown';
}

export function pct(x) {
  if (x == null || !Number.isFinite(x)) return '';
  const v = Math.round(x * 100);
  return (v > 0 ? '+' : '') + v + '%';
}

const mid = (e) => (e?.kind === 'range' && Number.isFinite(e.range?.mid) ? e.range.mid : null);
const ratio = (now, before) => (now != null && before != null && before !== 0 ? (now - before) / before : null);

// Observations sorted oldest first, one per day (the newest observation wins when a day repeats).
export function points(resp) {
  const byDay = new Map();
  for (const d of resp?.data ?? []) {
    if (!d?.observedAt) continue;
    const day = String(d.observedAt).slice(0, 10);
    const prev = byDay.get(day);
    if (!prev || String(d.observedAt) > String(prev.observedAt)) byDay.set(day, { ...d, day });
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

// Summary of one metric across the window.
// change: newest ranged mid vs the oldest ranged mid in the window. mom: newest vs its own previous-month field.
export function summarize(resp, key = 'monthlyInstalls') {
  const pts = points(resp);
  const ranged = pts.filter((p) => mid(p[key]) != null);
  const latest = pts.length ? pts[pts.length - 1] : null;
  const first = ranged[0] ?? null, last = ranged[ranged.length - 1] ?? null;
  let peak = null, low = null;
  for (const p of ranged) {
    if (!peak || mid(p[key]) > mid(peak[key])) peak = p;
    if (!low || mid(p[key]) < mid(low[key])) low = p;
  }
  const prevKey = 'previous' + key[0].toUpperCase() + key.slice(1);
  return {
    key,
    days: pts.length,
    rangedDays: ranged.length,
    belowFloorDays: pts.filter((p) => p[key]?.kind === 'below_floor').length,
    unknownDays: pts.filter((p) => !p[key] || (p[key].kind !== 'range' && p[key].kind !== 'below_floor')).length,
    from: pts[0]?.day ?? null,
    to: latest?.day ?? null,
    latest: latest?.[key] ?? null,
    latestDay: latest?.day ?? null,
    change: first && last && first !== last ? ratio(mid(last[key]), mid(first[key])) : null,
    changeFrom: first && last && first !== last ? first.day : null,
    mom: latest ? ratio(mid(latest[key]), mid(latest[prevKey])) : null,
    peak: peak ? { day: peak.day, mid: mid(peak[key]) } : null,
    low: low ? { day: low.day, mid: mid(low[key]) } : null,
  };
}

function appTitle(resp) {
  const a = resp?.app ?? {};
  return `${a.name ?? 'Unknown app'} (${a.storeId ?? resp?.data?.[0]?.storeId ?? '?'})`;
}

function line(s, money) {
  if (!s.days) return 'no observations';
  const parts = [`latest ${describe(s.latest, money)} on ${s.latestDay}`];
  if (s.mom != null) parts.push(`${pct(s.mom)} vs a month earlier`);
  if (s.change != null) parts.push(`${pct(s.change)} since ${s.changeFrom}`);
  if (s.peak && s.rangedDays > 1) parts.push(`peak mid ${money ? '$' : ''}${compact(s.peak.mid)} on ${s.peak.day}`);
  const gaps = [];
  if (s.belowFloorDays) gaps.push(`${s.belowFloorDays} day${s.belowFloorDays === 1 ? '' : 's'} under the floor`);
  if (s.unknownDays) gaps.push(`${s.unknownDays} unknown`);
  if (gaps.length) parts.push(gaps.join(', '));
  return parts.join('; ');
}

export function toMarkdown(resp) {
  const a = resp?.app ?? {};
  const pts = points(resp);
  const dl = summarize(resp, 'monthlyInstalls'), rev = summarize(resp, 'monthlyRevenue');
  const meta = [a.genre, a.developerName, a.rating != null ? `rating ${a.rating}` : null, a.totalRatings != null ? `${compact(a.totalRatings)} ratings` : null].filter(Boolean).join(' · ');
  const out = [`## ${appTitle(resp)}`, ''];
  if (meta) out.push(meta, '');
  out.push(`${pts.length} daily observation${pts.length === 1 ? '' : 's'}${pts.length ? `, ${dl.from} → ${dl.to}` : ''}.`, '');
  out.push(`- Monthly downloads: ${line(dl, false)}`);
  out.push(`- Monthly revenue: ${line(rev, true)}`);
  const vel = pts.length ? pts[pts.length - 1].ratingVelocityPerDay : null;
  if (Number.isFinite(vel)) out.push(`- New ratings per day (latest): ${Math.round(vel * 10) / 10}`);
  if (pts.length) {
    out.push('', '| Day | Monthly downloads | Monthly revenue | Ratings/day |', '| --- | --- | --- | ---: |');
    for (const p of [...pts].reverse()) out.push(`| ${p.day} | ${describe(p.monthlyInstalls)} | ${describe(p.monthlyRevenue, true)} | ${Number.isFinite(p.ratingVelocityPerDay) ? Math.round(p.ratingVelocityPerDay * 10) / 10 : ''} |`);
  }
  return out.join('\n');
}

// One row per app when several are compared.
export function toComparison(resps) {
  const out = ['| App | Downloads (latest) | Change in window | Revenue (latest) | Change in window | Days |', '| --- | --- | ---: | --- | ---: | ---: |'];
  for (const r of resps) {
    const dl = summarize(r, 'monthlyInstalls'), rev = summarize(r, 'monthlyRevenue');
    out.push(`| ${appTitle(r)} | ${describe(dl.latest)} | ${pct(dl.change)} | ${describe(rev.latest, true)} | ${pct(rev.change)} | ${dl.days} |`);
  }
  return out.join('\n');
}

const csvCell = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const parts = (e) => e?.kind === 'range' ? [e.kind, e.range.low, e.range.mid, e.range.high] : e?.kind === 'below_floor' ? [e.kind, '', '', e.ceiling] : ['unknown', '', '', ''];

export function toCsv(resp) {
  const head = ['store_id', 'app', 'day', 'downloads_kind', 'downloads_low', 'downloads_mid', 'downloads_high', 'revenue_kind', 'revenue_low_usd', 'revenue_mid_usd', 'revenue_high_usd', 'rating_velocity_per_day'];
  const rows = points(resp).map((p) => [resp?.app?.storeId ?? p.storeId, resp?.app?.name ?? '', p.day, ...parts(p.monthlyInstalls), ...parts(p.monthlyRevenue), p.ratingVelocityPerDay ?? '']);
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}

export function toChat(resp) {
  const dl = summarize(resp, 'monthlyInstalls'), rev = summarize(resp, 'monthlyRevenue');
  return `*${appTitle(resp)}*\nDownloads: ${line(dl, false)}\nRevenue: ${line(rev, true)}`;
}

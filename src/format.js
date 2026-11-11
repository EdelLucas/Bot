const config = require('./config');

const TZ = config.timezone;

/** Abstand der Zeitzone zu UTC in ms für einen Zeitpunkt (berücksichtigt Sommerzeit). */
function tzOffsetMs(ms) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(ms / 1000) * 1000;
}

function localParts(ms) {
  const shifted = new Date(ms + tzOffsetMs(ms));
  return { y: shifted.getUTCFullYear(), mo: shifted.getUTCMonth() + 1, d: shifted.getUTCDate() };
}

function localToUtc(y, mo, d, h, mi) {
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  let result = naive - tzOffsetMs(naive);
  const second = tzOffsetMs(result); // Korrektur an Sommerzeit-Grenzen
  if (naive - second !== result) result = naive - second;
  return result;
}

/**
 * Liest Zeitangaben wie "20.11.2026 20:00", "20.11. 20:00" oder "20:00" (heute/morgen)
 * in der konfigurierten Zeitzone. Gibt Millisekunden oder null zurück.
 */
function parseDateTime(input) {
  const m = input.trim().match(/^(?:(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})?\s+)?(\d{1,2})[:.](\d{2})(?:\s*uhr)?$/i);
  if (!m) return null;
  const [, d, mo, y, h, mi] = m;
  if (Number(h) > 23 || Number(mi) > 59) return null;
  const now = Date.now();
  const today = localParts(now);

  if (!d) {
    let ms = localToUtc(today.y, today.mo, today.d, Number(h), Number(mi));
    if (ms < now - 5 * 60_000) ms = localToUtc(today.y, today.mo, today.d + 1, Number(h), Number(mi));
    return ms;
  }
  if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) return null;
  if (y) {
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    return localToUtc(year, Number(mo), Number(d), Number(h), Number(mi));
  }
  let ms = localToUtc(today.y, Number(mo), Number(d), Number(h), Number(mi));
  if (ms < now - 24 * 3600_000) ms = localToUtc(today.y + 1, Number(mo), Number(d), Number(h), Number(mi));
  return ms;
}

function formatDate(ms = Date.now()) {
  return new Date(ms).toLocaleString('de-DE', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' });
}

/** Discord-Zeitstempel – wird jedem Nutzer in seiner eigenen Zeitzone angezeigt. */
function discordTs(ms, style = 'F') {
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

function money(n) {
  return `${Number(n || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 })} ${config.payout.currency}`;
}

function minutes(ms) {
  return Math.round(ms / 60_000);
}

/** Setzt Zeilen zu einem Text zusammen, ohne das Discord-Limit zu überschreiten. */
function clip(lines, max = 4000) {
  const out = [];
  let len = 0;
  for (let i = 0; i < lines.length; i++) {
    if (len + lines[i].length + 1 > max - 30) {
      out.push(`… und ${lines.length - i} weitere`);
      break;
    }
    out.push(lines[i]);
    len += lines[i].length + 1;
  }
  return out.join('\n');
}

module.exports = { parseDateTime, formatDate, discordTs, money, minutes, clip };

// ---- Wochentage & Uhrzeiten für regelmäßige Events ----
const DAY_KEYS = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa'];
const DAY_LABELS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** "täglich", "Mo-Fr", "Mo,Mi,Fr", "Sa So", "Wochenende", "werktags" → [Wochentag-Nummern 0=So..6=Sa] oder null. */
function parseDays(input) {
  const s = String(input ?? '').trim().toLowerCase();
  if (!s) return null;
  if (/^(täglich|taeglich|jeden tag|alle|immer|mo-so)$/.test(s)) return [0, 1, 2, 3, 4, 5, 6];
  const days = new Set();
  let rest = s;
  if (/wochenende/.test(rest)) { days.add(6); days.add(0); rest = rest.replace(/wochenende/g, ' '); }
  if (/werktags|wochentags/.test(rest)) { [1, 2, 3, 4, 5].forEach((d) => days.add(d)); rest = rest.replace(/werktags|wochentags/g, ' '); }
  const idx = (t) => DAY_KEYS.indexOf(t.slice(0, 2));
  for (const token of rest.split(/[\s,;/+&]+|und/).filter(Boolean)) {
    const range = token.split('-');
    if (range.length === 2) {
      const a = idx(range[0]);
      const b = idx(range[1]);
      if (a < 0 || b < 0) return null;
      for (let d = a; ; d = (d + 1) % 7) { days.add(d); if (d === b) break; }
    } else {
      const d = idx(token);
      if (d < 0) return null;
      days.add(d);
    }
  }
  return days.size ? [...days].sort() : null;
}

function formatDays(days) {
  if (days.length === 7) return 'täglich';
  if (days.join() === '1,2,3,4,5') return 'Mo–Fr';
  return [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(d)).map((d) => DAY_LABELS[d]).join(', ');
}

/** "20:00", "20.30", "8 Uhr" → { h, mi } oder null. */
function parseTime(input) {
  const m = String(input ?? '').trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(?:uhr)?$/i);
  if (!m || Number(m[1]) > 23 || Number(m[2] ?? 0) > 59) return null;
  return { h: Number(m[1]), mi: Number(m[2] ?? 0) };
}

/** Heutiges Datum in der Zeitzone + Zeitpunkt der angegebenen Uhrzeit heute. */
function todayAt(time, now = Date.now()) {
  const { y, mo, d } = localParts(now);
  const weekday = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return { dateKey: `${y}-${mo}-${d}`, weekday, ms: localToUtc(y, mo, d, time.h, time.mi) };
}

const pad = (n) => String(n).padStart(2, '0');
const formatTime = (t) => `${pad(t.h)}:${pad(t.mi)}`;

module.exports.parseDays = parseDays;
module.exports.formatDays = formatDays;
module.exports.parseTime = parseTime;
module.exports.formatTime = formatTime;
module.exports.todayAt = todayAt;

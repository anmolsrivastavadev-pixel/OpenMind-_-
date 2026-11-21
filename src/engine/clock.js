// Market clock: all calendar logic happens in the market's fixed time zone.
import { MARKET } from './config.js';

const fmtCache = new Map();
function partsFormatter(tz) {
  if (!fmtCache.has(tz)) {
    fmtCache.set(
      tz,
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        weekday: 'short',
      }),
    );
  }
  return fmtCache.get(tz);
}

const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Wall-clock parts of `date` in the market time zone. */
export function marketParts(date = new Date(), tz = MARKET.timeZone) {
  const p = {};
  for (const { type, value } of partsFormatter(tz).formatToParts(date)) p[type] = value;
  return {
    year: +p.year,
    month: +p.month,
    day: +p.day,
    hour: +p.hour,
    minute: +p.minute,
    second: +p.second,
    weekday: WD[p.weekday],
  };
}

/** "YYYY-MM-DD" in the market time zone. */
export function marketDate(date = new Date()) {
  const p = marketParts(date);
  return ymd(p.year, p.month, p.day);
}

export function ymd(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Market wall-clock time encoded as a UTC unix timestamp (seconds).
 * Charts render UTC, so this makes every chart show market-local time.
 */
export function wallSeconds(date = new Date()) {
  const p = marketParts(date);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) / 1000;
}

/** Add `n` calendar days to a "YYYY-MM-DD" string. */
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const isTradingDay = (dateStr) => {
  const wd = weekdayOf(dateStr);
  return wd >= 1 && wd <= 5;
};

/**
 * Real market status from the clock.
 *   open        Mon–Fri 08:00–20:00
 *   afterhours  Mon–Thu after close, Tue–Fri before open
 *   weekend     Fri 20:00 → Mon 08:00 (votes queue for Monday's gap)
 */
export function realStatus(date = new Date()) {
  const p = marketParts(date);
  const mins = p.hour * 60 + p.minute;
  const open = MARKET.openHour * 60;
  const close = MARKET.closeHour * 60;
  const wd = p.weekday;
  const weekday = wd >= 1 && wd <= 5;
  if (weekday && mins >= open && mins < close) return 'open';
  if (wd === 6 || wd === 0) return 'weekend';
  if (wd === 5 && mins >= close) return 'weekend';
  if (wd === 1 && mins < open) return 'weekend';
  return 'afterhours';
}

/** Seconds until the next open/close transition (real clock). */
export function secondsToNextTransition(date = new Date()) {
  const p = marketParts(date);
  const nowMin = p.weekday * 1440 + p.hour * 60 + p.minute;
  const nowSec = nowMin * 60 + p.second;
  const marks = [];
  for (let d = 1; d <= 5; d++) {
    marks.push(d * 1440 + MARKET.openHour * 60, d * 1440 + MARKET.closeHour * 60);
  }
  const WEEK = 7 * 1440;
  let best = Infinity;
  for (const m of marks) {
    let diff = m * 60 - nowSec;
    if (diff <= 0) diff += WEEK * 60;
    best = Math.min(best, diff);
  }
  return best;
}

export function formatCountdown(sec) {
  sec = Math.max(0, Math.floor(sec));
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return d > 0 ? `${d}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

/** Most recent N trading days up to and including `endDate`. */
export function tradingDaysBack(endDate, n) {
  const out = [];
  let d = endDate;
  while (out.length < n) {
    if (isTradingDay(d)) out.unshift(d);
    d = addDays(d, -1);
  }
  return out;
}

/** Wall-clock seconds of `dateStr` at hh:mm (market-local, UTC-encoded). */
export function wallAt(dateStr, hour, minute = 0) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d, hour, minute) / 1000;
}

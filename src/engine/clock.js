// Market clock. The exchange runs on ONE clock (cfg.tz, from market_config)
// so everyone shares the same prices; the UI shows every time in the
// viewer's own local time zone.

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

export const localTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function zonedParts(date, tz) {
  const p = {};
  for (const { type, value } of partsFormatter(tz).formatToParts(date)) p[type] = value;
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second, weekday: WD[p.weekday] };
}

export const ymd = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Exchange calendar day "YYYY-MM-DD". */
export function exchangeDate(cfg, date = new Date()) {
  const p = zonedParts(date, cfg.tz);
  return ymd(p.year, p.month, p.day);
}

/** Wall-clock time in `tz` encoded as UTC seconds (charts render UTC). */
export function wallSeconds(date, tz = localTz()) {
  const p = zonedParts(date, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) / 1000;
}

/** open | afterhours | weekend, from the exchange clock. */
export function marketStatus(cfg, date = new Date()) {
  if (cfg.force_status) return cfg.force_status;
  const p = zonedParts(date, cfg.tz);
  const mins = p.hour * 60 + p.minute;
  const open = cfg.open_hour * 60;
  const close = cfg.close_hour * 60;
  const wd = p.weekday;
  if (wd >= 1 && wd <= 5 && mins >= open && mins < close) return 'open';
  if (wd === 6 || wd === 0) return 'weekend';
  if (wd === 5 && mins >= close) return 'weekend';
  if (wd === 1 && mins < open) return 'weekend';
  return 'afterhours';
}

/** Instant (Date) of the next open or close. */
export function nextTransition(cfg, date = new Date()) {
  const p = zonedParts(date, cfg.tz);
  const nowSec = (p.weekday * 1440 + p.hour * 60 + p.minute) * 60 + p.second;
  let best = Infinity;
  for (let d = 1; d <= 5; d++) {
    for (const h of [cfg.open_hour, cfg.close_hour]) {
      let diff = (d * 1440 + h * 60) * 60 - nowSec;
      if (diff <= 0) diff += 7 * 86400;
      best = Math.min(best, diff);
    }
  }
  return new Date(date.getTime() + best * 1000);
}

export function formatCountdown(sec) {
  sec = Math.max(0, Math.floor(sec));
  const d = Math.floor(sec / 86400);
  const h = String(Math.floor((sec % 86400) / 3600)).padStart(2, '0');
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return d > 0 ? `${d}d ${h}:${m}:${s}` : `${h}:${m}:${s}`;
}

/** Exchange hours rendered in the viewer's local time, e.g. "6:30 PM – 6:30 AM". */
export function localHours(cfg, date = new Date()) {
  const offset = wallSeconds(date, cfg.tz) - date.getTime() / 1000; // exchange UTC offset (s)
  const p = zonedParts(date, cfg.tz);
  const at = (h) => new Date((Date.UTC(p.year, p.month - 1, p.day, h) / 1000 - offset) * 1000);
  const f = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${f(at(cfg.open_hour))} – ${f(at(cfg.close_hour))}`;
}

export function shortTzName(tz, date = new Date()) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
    .formatToParts(date)
    .find((x) => x.type === 'timeZoneName');
  return part?.value ?? tz;
}

/** Seconds until midnight on the exchange calendar (next vote day). */
export function secondsToExchangeMidnight(cfg, date = new Date()) {
  const p = zonedParts(date, cfg.tz);
  return 86400 - (p.hour * 3600 + p.minute * 60 + p.second);
}

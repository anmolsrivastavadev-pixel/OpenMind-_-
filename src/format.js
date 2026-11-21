const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtPrice = (x) => (x == null || Number.isNaN(x) ? '—' : nf2.format(x));
export const fmtMoney = (x) => (x < 0 ? '-$' : '$') + nf2.format(Math.abs(x));
export const fmtSigned = (x) => (x > 0 ? '+' : x < 0 ? '−' : '') + nf2.format(Math.abs(x));
export const fmtPct = (x) => (x > 0 ? '+' : x < 0 ? '−' : '') + (Math.abs(x) * 100).toFixed(2) + '%';
export function fmtVol(x) {
  const a = Math.abs(x);
  if (a >= 1e9) return (x / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (x / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return (x / 1e3).toFixed(1) + 'K';
  return String(Math.round(x));
}
export const tone = (x) => (x > 0 ? 'up' : x < 0 ? 'down' : 'text-mute');

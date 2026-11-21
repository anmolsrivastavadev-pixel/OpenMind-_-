import { useMarket, useSecond } from '../store.js';
import { formatCountdown, localHours, localTz, shortTzName } from '../engine/clock.js';

const META = {
  open: { label: 'Market open', dot: 'bg-up', text: 'text-up', next: 'closes in' },
  afterhours: { label: 'After-hours', dot: 'bg-warn', text: 'text-warn', next: 'opens in' },
  weekend: { label: 'Weekend', dot: 'bg-[#9575cd]', text: 'text-[#b39ddb]', next: 'opens in' },
};

export function useStatus() {
  const m = useMarket();
  useSecond();
  const st = m.status();
  const next = m.nextTransition();
  return { st, meta: META[st], cd: (next - Date.now()) / 1000, next };
}

export default function MarketStatus({ compact = false }) {
  const m = useMarket();
  const { st, meta, cd } = useStatus();
  return (
    <div className="flex items-center gap-2 h-7 px-2.5 rounded-full bg-panel2 whitespace-nowrap text-[12px]">
      <span className={`w-2 h-2 rounded-full ${meta.dot} ${st === 'open' ? 'pulse-dot' : ''}`} />
      <span className={`font-medium ${meta.text}`}>{meta.label}</span>
      {!compact && m.s.config.force_status && <span className="text-mute">special session</span>}
      {!compact && !m.s.config.force_status && (
        <span className="text-mute">
          {meta.next} <span className="num text-txt">{formatCountdown(cd)}</span>
        </span>
      )}
    </div>
  );
}

/** "Mon–Fri 6:30 PM – 6:30 AM (your time, IST)" */
export function useHoursLabel() {
  const m = useMarket();
  const cfg = m.s.config;
  const tz = localTz();
  return `Weekdays ${localHours(cfg)} your time (${shortTzName(tz)})`;
}

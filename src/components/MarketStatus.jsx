import { useMarket, useSecond } from '../store.js';
import { formatCountdown } from '../engine/clock.js';
import { MARKET } from '../engine/config.js';

const META = {
  open: { label: 'Market open', dot: 'bg-up', text: 'text-up', next: 'closes in' },
  afterhours: { label: 'After-hours', dot: 'bg-warn', text: 'text-warn', next: 'opens in' },
  weekend: { label: 'Weekend', dot: 'bg-[#7e57c2]', text: 'text-[#b39ddb]', next: 'opens in' },
};

export function useStatus() {
  const m = useMarket();
  useSecond();
  const st = m.status();
  return { st, meta: META[st], cd: m.countdown(), demo: m.state.clockMode !== 'live' };
}

export default function MarketStatus({ compact = false }) {
  const { st, meta, cd, demo } = useStatus();
  return (
    <div className="flex items-center gap-2 h-7 px-2.5 rounded bg-panel2 border border-line whitespace-nowrap">
      <span className={`w-2 h-2 rounded-full ${meta.dot} ${st === 'open' ? 'pulse-dot' : ''}`} />
      <span className={`font-medium ${meta.text}`}>{meta.label}</span>
      {!compact && (
        <span className="text-mute">
          {demo ? (
            <span className="text-warn">demo clock</span>
          ) : (
            <>
              {meta.next} <span className="num text-txt">{formatCountdown(cd)}</span>
            </>
          )}
        </span>
      )}
    </div>
  );
}

export function hoursLabel() {
  const f = (h) => `${((h + 11) % 12) + 1}:00 ${h < 12 ? 'AM' : 'PM'}`;
  return `${f(MARKET.openHour)} – ${f(MARKET.closeHour)} ${MARKET.tzLabel}, Mon–Fri`;
}

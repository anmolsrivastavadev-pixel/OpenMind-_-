import { Link } from 'react-router-dom';
import { useMarket } from '../store.js';
import Watchlist from '../components/Watchlist.jsx';
import MarketStatus, { hoursLabel, useStatus } from '../components/MarketStatus.jsx';
import { formatCountdown } from '../engine/clock.js';
import { gapPct, positiveShare } from '../engine/pricing.js';
import { fmtPct, fmtPrice, fmtVol, tone } from '../format.js';

export default function MarketHome() {
  const m = useMarket();
  const { st, cd, demo } = useStatus();
  const models = Object.values(m.state.models).map((x) => ({ ...x, q: m.quote('model', x.id) }));
  const sorted = [...models].sort((a, b) => b.q.pct - a.q.pct);
  const gainers = sorted.slice(0, 5);
  const losers = sorted.slice(-5).reverse();
  const open = st === 'open';
  const queued = models.reduce((s, x) => s + m.state.queue[x.id].count, 0);
  const liveVotes = models.reduce((s, x) => s + m.state.todayVotes[x.id].count, 0);

  return (
    <div className="flex-1 min-h-0 flex">
      <Watchlist className="hidden lg:flex w-[300px] shrink-0 border-r border-line" />
      <div className="flex-1 min-w-0 overflow-y-auto scroll-thin">
        <div className="max-w-6xl mx-auto p-3 sm:p-5 space-y-4">
          {/* status hero */}
          <div className="panel rounded-lg p-4 flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1"><MarketStatus /></div>
              <h2 className="text-white text-[20px] font-semibold mt-2">
                {open ? 'Votes are moving prices live' : st === 'weekend' ? 'Weekend: prices frozen, votes queue for Monday' : 'After-hours: prices locked at close'}
              </h2>
              <p className="text-mute mt-1">
                Market hours {hoursLabel()}.{' '}
                {open ? 'Every vote counts toward the next price tick.' : 'Votes cast now are applied as one capped gap (±15%) at the next open.'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 md:w-[320px]">
              <Big label={open ? 'Closes in' : 'Opens in'} value={demo ? 'demo' : formatCountdown(cd)} />
              <Big label={open ? 'Votes today' : 'Queued votes'} value={fmtVol(open ? liveVotes : queued)} />
            </div>
          </div>

          {/* company index strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
            {Object.values(m.state.companies).map((c) => {
              const q = m.quote('company', c.id);
              return (
                <Link key={c.id} to={`/c/${c.id}`} className="panel rounded p-2.5 hover:border-mute">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.color }} />
                    <span className="text-white font-semibold">{c.ticker}</span>
                  </div>
                  <div className="text-[11px] text-mute truncate">{c.name}</div>
                  <div className="num text-white mt-1">{fmtPrice(q.price)}</div>
                  <div className={`num text-[12px] ${tone(q.change)}`}>{fmtPct(q.pct)}</div>
                </Link>
              );
            })}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Movers title="Top gainers" rows={gainers} />
            <Movers title="Top losers" rows={losers} />
          </div>

          {!open && (
            <div className="panel rounded-lg">
              <div className="px-3 h-10 flex items-center justify-between border-b border-line">
                <h3 className="text-white font-semibold">{st === 'weekend' ? 'Weekend sentiment' : 'After-hours sentiment'}</h3>
                <span className="text-[11px] text-mute">projected opening gap</span>
              </div>
              <div className="divide-y divide-line/60">
                {[...models].sort((a, b) => m.state.queue[b.id].net - m.state.queue[a.id].net).map((x) => {
                  const b = m.state.queue[x.id];
                  const g = gapPct(b.net);
                  return (
                    <Link key={x.id} to={`/m/${x.id}`} className="grid grid-cols-[1fr_90px_70px] sm:grid-cols-[1fr_160px_80px_70px] items-center gap-3 px-3 h-9 hover:bg-panel2">
                      <span className="truncate text-white">{x.name} <span className="text-mute">{x.ticker}</span></span>
                      <span className="h-1.5 rounded-full bg-down/70 overflow-hidden"><span className="block h-full bg-up" style={{ width: `${positiveShare(b) * 100}%` }} /></span>
                      <span className="num text-mute text-right hidden sm:block">{fmtVol(b.count)}</span>
                      <span className={`num text-right ${tone(g)}`}>{fmtPct(g)}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
          <p className="text-[11px] text-mute">Prototype with simulated crowd votes. All money is virtual. Model names are fictional and not affiliated with the listed companies.</p>
        </div>
      </div>
    </div>
  );
}

function Big({ label, value }) {
  return (
    <div className="rounded bg-panel2 border border-line p-2.5">
      <div className="label">{label}</div>
      <div className="num text-white text-[18px] font-semibold">{value}</div>
    </div>
  );
}

function Movers({ title, rows }) {
  return (
    <div className="panel rounded-lg">
      <div className="px-3 h-10 flex items-center border-b border-line"><h3 className="text-white font-semibold">{title}</h3></div>
      {rows.map((x) => (
        <Link key={x.id} to={`/m/${x.id}`} className="grid grid-cols-[1fr_auto_72px] gap-3 items-center px-3 h-10 border-b border-line/50 last:border-0 hover:bg-panel2">
          <div className="min-w-0">
            <div className="text-white truncate">{x.name}</div>
            <div className="text-[10px] text-mute">{x.ticker}</div>
          </div>
          <span className="num">{fmtPrice(x.q.price)}</span>
          <span className={`num text-right rounded px-1.5 py-0.5 ${x.q.change >= 0 ? 'bg-up/15 up' : 'bg-down/15 down'}`}>{fmtPct(x.q.pct)}</span>
        </Link>
      ))}
    </div>
  );
}

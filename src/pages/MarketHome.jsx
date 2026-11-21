import { Link } from 'react-router-dom';
import { useMarket } from '../store.js';
import Watchlist from '../components/Watchlist.jsx';
import MarketStatus, { useHoursLabel, useStatus } from '../components/MarketStatus.jsx';
import { formatCountdown } from '../engine/clock.js';
import { gapPct, positiveShare } from '../engine/pricing.js';
import { fmtPct, fmtPrice, fmtVol, tone } from '../format.js';

export default function MarketHome() {
  const m = useMarket();
  const { st, cd, next } = useStatus();
  const hours = useHoursLabel();
  const open = m.isOpen();
  const models = Object.values(m.s.models).map((x) => ({ ...x, q: m.quote('model', x.id) }));
  const sorted = [...models].sort((a, b) => b.q.pct - a.q.pct);
  const gainers = sorted.filter((x) => x.q.pct > 0).slice(0, 5);
  const losers = sorted.filter((x) => x.q.pct < 0).reverse().slice(0, 5);
  const mostVoted = [...models].sort((a, b) => (open ? b.today_count - a.today_count : b.queue_count - a.queue_count)).slice(0, 5);
  const votes = models.reduce((s, x) => s + (open ? x.today_count : x.queue_count), 0);

  return (
    <div className="flex-1 min-h-0 flex">
      <Watchlist className="hidden lg:flex w-[300px] shrink-0 border-r border-line" />
      <div className="flex-1 min-w-0 overflow-y-auto scroll-thin">
        <div className="max-w-6xl mx-auto p-3 sm:p-5 space-y-4">
          <div className="panel rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1">
              <MarketStatus />
              <h2 className="text-white text-[20px] font-medium mt-3">
                {open ? 'Votes are moving prices live' : st === 'weekend' ? 'Weekend: prices frozen, votes queue for Monday' : 'After-hours: prices locked at close'}
              </h2>
              <p className="text-mute mt-1 text-[13px]">
                Market hours: {hours}. {open ? 'Every vote counts toward the next price tick.' : 'Votes cast now are applied as one gap (max ±15%) at the next open.'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 md:w-[320px]">
              <Big label={open ? 'Closes in' : 'Opens in'} value={m.s.config.force_status ? 'Special' : formatCountdown(cd)} sub={m.s.config.force_status ? 'admin session' : next.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })} />
              <Big label={open ? 'Votes today' : 'Queued votes'} value={fmtVol(votes)} sub="from real users" />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
            {Object.values(m.s.companies).map((c) => {
              const q = m.quote('company', c.id);
              return (
                <Link key={c.id} to={`/c/${c.id}`} className="panel rounded-lg p-3 hover:border-[#3a3a3a]">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                    <span className="text-white font-medium truncate">{c.name}</span>
                  </div>
                  <div className="num text-white mt-1.5 text-[15px]">{fmtPrice(q.price)}</div>
                  <div className={`num text-[12px] ${tone(q.change)}`}>{fmtPct(q.pct)}</div>
                </Link>
              );
            })}
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <List title="Top gainers" rows={gainers} empty="No gainers yet today" />
            <List title="Top losers" rows={losers} empty="No losers yet today" />
            <List title={open ? 'Most voted today' : 'Most voted overnight'} rows={mostVoted} votes={open ? 'today_count' : 'queue_count'} />
          </div>

          {!open && (
            <div className="panel rounded-xl">
              <div className="px-4 h-11 flex items-center justify-between border-b border-line">
                <h3 className="text-white font-medium">{st === 'weekend' ? 'Weekend sentiment' : 'After-hours sentiment'}</h3>
                <span className="text-[11px] text-mute">projected opening gap</span>
              </div>
              {[...models].sort((a, b) => b.queue_net - a.queue_net).map((x) => {
                const g = gapPct(x.queue_net, m.s.config);
                return (
                  <Link key={x.id} to={`/m/${x.id}`} className="grid grid-cols-[1fr_80px_64px] sm:grid-cols-[1fr_160px_70px_70px] items-center gap-3 px-4 h-10 border-b border-line/50 last:border-0 hover:bg-panel2">
                    <span className="truncate text-white">{x.name}</span>
                    <span className="h-1.5 rounded-full bg-down/80 overflow-hidden">
                      <span className="block h-full bg-up" style={{ width: `${(x.queue_count ? positiveShare(x.queue_pos, x.queue_neg) : 0.5) * 100}%` }} />
                    </span>
                    <span className="num text-mute text-right hidden sm:block">{fmtVol(x.queue_count)} votes</span>
                    <span className={`num text-right ${tone(g)}`}>{fmtPct(g)}</span>
                  </Link>
                );
              })}
            </div>
          )}
          <p className="text-[11px] text-mute">All money is virtual. Prices move only from user votes. Not affiliated with any listed company.</p>
        </div>
      </div>
    </div>
  );
}

function Big({ label, value, sub }) {
  return (
    <div className="rounded-lg bg-panel2 p-3">
      <div className="label">{label}</div>
      <div className="num text-white text-[18px] font-medium">{value}</div>
      <div className="text-[11px] text-mute">{sub}</div>
    </div>
  );
}

function List({ title, rows, empty = 'No votes yet', votes }) {
  return (
    <div className="panel rounded-xl">
      <div className="px-4 h-11 flex items-center border-b border-line"><h3 className="text-white font-medium">{title}</h3></div>
      {rows.length === 0 && <p className="px-4 py-4 text-mute text-[13px]">{empty}</p>}
      {rows.map((x) => (
        <Link key={x.id} to={`/m/${x.id}`} className="grid grid-cols-[1fr_auto_72px] gap-3 items-center px-4 h-11 border-b border-line/50 last:border-0 hover:bg-panel2">
          <span className="text-white truncate">{x.name}</span>
          <span className="num text-txt">{votes ? `${fmtVol(x[votes])} votes` : fmtPrice(x.q.price)}</span>
          <span className={`num text-right rounded px-1.5 py-0.5 ${x.q.change > 0 ? 'bg-up/15 up' : x.q.change < 0 ? 'bg-down/15 down' : 'text-mute'}`}>{fmtPct(x.q.pct)}</span>
        </Link>
      ))}
    </div>
  );
}

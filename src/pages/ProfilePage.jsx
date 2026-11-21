import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useMarket } from '../store.js';
import { RATINGS } from '../engine/config.js';
import { Flame } from '../App.jsx';
import { fmtMoney } from '../format.js';

export default function ProfilePage() {
  const m = useMarket();
  const nav = useNavigate();
  const u = m.currentUser();
  if (!u) return <Navigate to="/login" replace />;
  const s = m.userStats(u.id);
  const ageDays = Math.floor((Date.now() - u.createdAt) / 86_400_000);
  const max = Math.max(1, ...Object.values(s.byRating));

  return (
    <div className="flex-1 overflow-y-auto scroll-thin">
      <div className="max-w-3xl mx-auto p-3 sm:p-5 space-y-4">
        <div className="panel rounded-lg p-4 flex items-center gap-4">
          <span className="w-14 h-14 rounded-full bg-accent text-white grid place-items-center text-[22px] font-bold">{u.name[0]?.toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <h1 className="text-white text-[20px] font-semibold truncate">{u.name}</h1>
            <p className="text-mute text-[12px] truncate">{u.email} · joined {new Date(u.createdAt).toLocaleDateString()} ({ageDays}d)</p>
          </div>
          <button className="btn-ghost border border-line" onClick={() => { m.logout(); nav('/'); }}>Log out</button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Tile label="Voting streak" value={<span className="flex items-center gap-1 text-warn"><Flame className="w-4 h-4" />{u.streak}d</span>} />
          <Tile label="Best streak" value={`${u.bestStreak}d`} />
          <Tile label="Total votes" value={s.total} />
          <Tile label="Vote weight" value={`${m.voteWeight(u)}×`} />
          <Tile label="Models rated" value={s.modelsRated} />
          <Tile label="Virtual cash" value={fmtMoney(u.cashBalance)} />
        </div>

        <div className="panel rounded-lg p-4">
          <h3 className="text-white font-semibold mb-3">Your ratings</h3>
          <div className="space-y-1.5">
            {RATINGS.map((r) => (
              <div key={r.key} className="grid grid-cols-[70px_1fr_30px] items-center gap-2">
                <span className="text-mute">{r.label}</span>
                <span className="h-2 rounded bg-panel2 overflow-hidden">
                  <span className={`block h-full ${r.weight > 0 ? 'bg-up' : r.weight < 0 ? 'bg-down' : 'bg-mute'}`} style={{ width: `${((s.byRating[r.key] ?? 0) / max) * 100}%` }} />
                </span>
                <span className="num text-right">{s.byRating[r.key] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel rounded-lg">
          <h3 className="text-white font-semibold px-4 h-10 flex items-center border-b border-line">Recent votes</h3>
          {s.recent.length === 0 && <p className="p-4 text-mute">No votes yet. <Link className="text-accent" to="/m/astra">Rate a model</Link></p>}
          {s.recent.map((v) => {
            const model = m.state.models[v.modelId];
            return (
              <Link key={v.id} to={`/m/${v.modelId}`} className="flex items-center gap-3 px-4 h-10 border-b border-line/50 last:border-0 hover:bg-panel2">
                <span className="text-white truncate flex-1">{model.name}</span>
                <span className={v.weight > 0 ? 'up' : v.weight < 0 ? 'down' : 'text-mute'}>{RATINGS.find((r) => r.key === v.rating).label}</span>
                <span className="text-[11px] text-mute num">{v.date}</span>
                <span className="text-[11px] text-mute w-14 text-right">{v.applied ? 'applied' : 'queued'}</span>
              </Link>
            );
          })}
        </div>

        <div className="panel rounded-lg p-4 border-dashed border-warn/50">
          <h3 className="text-warn font-semibold">Prototype tools</h3>
          <p className="text-mute text-[12px] mt-1">For reviewing the anti-bot weighting and the market cycle. Not part of the product.</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button className="btn-ghost border border-line" onClick={() => m.ageAccount(7)}>Age account +7 days</button>
            <button className="btn-ghost border border-line" onClick={() => m.ageAccount(30)}>Age account +30 days</button>
            <button className="btn-ghost border border-line" onClick={() => confirm('Regenerate all simulated prices? Accounts are kept.') && m.reset()}>Reset market data</button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2 md:hidden">
            {['live', 'open', 'afterhours', 'weekend'].map((k) => (
              <button key={k} className={`chip ${m.state.clockMode === k ? 'chip-on' : ''}`} onClick={() => m.setClockMode(k)}>
                Clock: {k}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value }) {
  return (
    <div className="panel rounded p-3">
      <div className="label">{label}</div>
      <div className="num text-white text-[18px] font-semibold mt-0.5">{value}</div>
    </div>
  );
}

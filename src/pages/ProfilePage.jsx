import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useMarket } from '../store.js';
import { RATINGS, accountAgeFactor, ratingOf } from '../engine/pricing.js';
import { Flame } from '../components/Icons.jsx';
import { fmtMoney } from '../format.js';

export default function ProfilePage() {
  const m = useMarket();
  const nav = useNavigate();
  const u = m.user();
  const [votes, setVotes] = useState([]);
  useEffect(() => {
    if (u) m.myRecentVotes().then(setVotes);
  }, [u?.id, u?.last_vote_date]);
  if (!m.s.session) return <Navigate to="/login" replace />;
  if (!u) return null;

  const ageDays = Math.floor((Date.now() - new Date(u.created_at)) / 86_400_000);
  const byRating = {};
  for (const v of votes) byRating[v.rating] = (byRating[v.rating] ?? 0) + 1;
  const max = Math.max(1, ...Object.values(byRating));

  return (
    <div className="flex-1 overflow-y-auto scroll-thin">
      <div className="max-w-3xl mx-auto p-3 sm:p-5 space-y-4">
        <div className="panel rounded-xl p-4 flex items-center gap-4">
          <span className="w-14 h-14 rounded-full bg-accent text-white grid place-items-center text-[22px] font-bold">{u.name[0]?.toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <h1 className="text-white text-[20px] font-medium truncate">{u.name}</h1>
            <p className="text-mute text-[13px] truncate">{m.s.session.user.email} · member for {ageDays} days</p>
          </div>
          <button className="btn-ghost border border-line" onClick={async () => { await m.logout(); nav('/'); }}>Log out</button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <Tile label="Voting streak" value={<span className="flex items-center gap-1 text-warn"><Flame className="w-4 h-4" />{u.streak}d</span>} />
          <Tile label="Best streak" value={`${u.best_streak}d`} />
          <Tile label="Vote weight" value={`${accountAgeFactor(ageDays)}×`} />
          <Tile label="Recent votes" value={votes.length} />
          <Tile label="Models rated" value={new Set(votes.map((v) => v.model_id)).size} />
          <Tile label="Virtual cash" value={fmtMoney(u.cash_balance)} />
        </div>

        <div className="panel rounded-xl p-4">
          <h3 className="text-white font-medium mb-3">Your ratings</h3>
          <div className="space-y-2">
            {RATINGS.map((r) => (
              <div key={r.key} className="grid grid-cols-[70px_1fr_30px] items-center gap-2">
                <span className="text-mute">{r.label}</span>
                <span className="h-2 rounded bg-panel2 overflow-hidden">
                  <span className={`block h-full ${r.value > 0 ? 'bg-up' : r.value < 0 ? 'bg-down' : 'bg-mute'}`} style={{ width: `${((byRating[r.value] ?? 0) / max) * 100}%` }} />
                </span>
                <span className="num text-right">{byRating[r.value] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel rounded-xl">
          <h3 className="text-white font-medium px-4 h-11 flex items-center border-b border-line">Recent votes</h3>
          {votes.length === 0 && <p className="p-4 text-mute">No votes yet. <Link className="text-accent" to="/">Pick a model to rate</Link></p>}
          {votes.slice(0, 20).map((v) => (
            <Link key={v.id} to={`/m/${v.model_id}`} className="flex items-center gap-3 px-4 h-11 border-b border-line/50 last:border-0 hover:bg-panel2">
              <span className="text-white truncate flex-1">{m.s.models[v.model_id]?.name ?? v.model_id}</span>
              <span className={v.rating > 0 ? 'up' : v.rating < 0 ? 'down' : 'text-mute'}>{ratingOf(v.rating).label}</span>
              <span className="text-[11px] text-mute num">{v.date}</span>
              <span className="text-[11px] text-mute w-14 text-right">{v.applied ? 'applied' : 'queued'}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value }) {
  return (
    <div className="panel rounded-lg p-3">
      <div className="label">{label}</div>
      <div className="num text-white text-[18px] font-medium mt-0.5">{value}</div>
    </div>
  );
}

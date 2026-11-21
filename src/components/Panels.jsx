import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMarket, useSecond } from '../store.js';
import { RATINGS, TAGS } from '../engine/config.js';
import { gapPct, positiveShare } from '../engine/pricing.js';
import { formatCountdown, marketParts } from '../engine/clock.js';
import { fmtMoney, fmtPct, fmtPrice, fmtSigned, fmtVol, tone } from '../format.js';
import { LockIcon } from './PriceChart.jsx';

export function Section({ title, right, children, className = '' }) {
  return (
    <section className={`border-b border-line ${className}`}>
      <div className="flex items-center justify-between px-3 h-10">
        <h3 className="font-semibold text-white">{title}</h3>
        {right}
      </div>
      <div className="px-3 pb-3">{children}</div>
    </section>
  );
}

/* ---------------- sentiment meter ---------------- */
export function SentimentMeter({ bucket, mode }) {
  const share = positiveShare(bucket);
  const gap = gapPct(bucket.net);
  const title =
    mode === 'weekend' ? 'Weekend sentiment' : mode === 'afterhours' ? 'After-hours sentiment' : "Today's sentiment";
  const sub =
    mode === 'open'
      ? 'Votes applied live to the price today'
      : mode === 'weekend'
        ? 'Queued since Friday close, applied at Monday 8:00 AM'
        : 'Queued since close, applied at the 8:00 AM open';
  return (
    <Section
      title={title}
      right={mode !== 'open' && <span className="text-[11px] text-mute flex items-center gap-1"><LockIcon /> queued</span>}
    >
      <p className="text-[11px] text-mute mb-2">{sub}</p>
      <div className="flex justify-between text-[11px] mb-1">
        <span className="down num">{Math.round((1 - share) * 100)}% negative</span>
        <span className="up num">{Math.round(share * 100)}% positive</span>
      </div>
      <div className="h-2 rounded-full bg-down/70 overflow-hidden">
        <div className="h-full bg-up transition-all duration-700" style={{ width: `${share * 100}%` }} />
      </div>
      <dl className="grid grid-cols-3 gap-2 mt-3 text-center">
        <Stat label="Votes" value={fmtVol(bucket.count)} />
        <Stat label="Net score" value={(bucket.net > 0 ? '+' : '') + fmtVol(bucket.net)} cls={tone(bucket.net)} />
        {mode === 'open' ? (
          <Stat label="Neutral" value={fmtVol(bucket.neutral)} />
        ) : (
          <Stat label="Proj. gap" value={fmtPct(gap)} cls={tone(gap)} />
        )}
      </dl>
    </Section>
  );
}

function Stat({ label, value, cls = 'text-txt' }) {
  return (
    <div className="rounded bg-panel2 py-1.5">
      <dt className="text-[10px] text-mute uppercase tracking-wider">{label}</dt>
      <dd className={`num text-[13px] font-semibold ${cls}`}>{value}</dd>
    </div>
  );
}

/* ---------------- vote panel ---------------- */
const RATING_STYLE = {
  great: 'border-up text-up bg-up/10 hover:bg-up/25',
  good: 'border-up/50 text-up hover:bg-up/15',
  okay: 'border-line text-txt hover:bg-hover',
  bad: 'border-down/50 text-down hover:bg-down/15',
  terrible: 'border-down text-down bg-down/10 hover:bg-down/25',
};
const RATING_ON = {
  great: 'bg-up text-white border-up',
  good: 'bg-up/70 text-white border-up',
  okay: 'bg-mute text-white border-mute',
  bad: 'bg-down/70 text-white border-down',
  terrible: 'bg-down text-white border-down',
};

function untilMidnight() {
  const p = marketParts();
  return 86400 - (p.hour * 3600 + p.minute * 60 + p.second);
}

export function VotePanel({ modelId, notify }) {
  const m = useMarket();
  useSecond();
  const user = m.currentUser();
  const model = m.state.models[modelId];
  const mine = m.myVote(modelId);
  const [rating, setRating] = useState(null);
  const [tags, setTags] = useState([]);
  const [err, setErr] = useState('');
  const open = m.state.phase === 'open';

  const submit = () => {
    setErr('');
    try {
      const v = m.vote(modelId, rating, tags);
      notify?.(v.queued ? `Vote queued for the next open · ${model.ticker}` : `Vote counted live · ${model.ticker}`);
      setRating(null);
      setTags([]);
    } catch (e) {
      setErr(e.message);
    }
  };

  if (!user) {
    return (
      <Section title="Rate this model">
        <p className="text-mute mb-3">Log in to vote. One vote per model per day; your vote moves the price.</p>
        <Link to="/login" className="btn-primary w-full">Log in to vote</Link>
      </Section>
    );
  }

  if (mine) {
    const r = RATINGS.find((x) => x.key === mine.rating);
    return (
      <Section title="Your vote today" right={<span className="text-[11px] text-mute">1 / day</span>}>
        <div className={`rounded border px-3 py-2.5 ${RATING_ON[mine.rating]}`}>
          <div className="font-semibold">{r.label} <span className="num opacity-80">({r.weight > 0 ? '+' : ''}{r.weight})</span></div>
          {mine.tags.length > 0 && <div className="text-[11px] opacity-90 mt-0.5">{mine.tags.join(' · ')}</div>}
        </div>
        <p className="text-[11px] text-mute mt-2">
          {mine.applied ? 'Applied to the price.' : 'Queued: applies as part of the opening gap.'} Weight{' '}
          <span className="num text-txt">{mine.factor}×</span>
        </p>
        <p className="text-[11px] text-mute mt-1">
          Next vote in <span className="num text-txt">{formatCountdown(untilMidnight())}</span> (midnight ET)
        </p>
      </Section>
    );
  }

  const factor = m.voteWeight(user);
  return (
    <Section
      title={`Rate ${model.name}`}
      right={<span className="text-[11px] text-mute">{open ? 'moves price live' : 'queues for open'}</span>}
    >
      <div className="grid grid-cols-5 gap-1">
        {RATINGS.map((r) => (
          <button
            key={r.key}
            onClick={() => setRating(r.key)}
            className={`h-12 rounded border flex flex-col items-center justify-center text-[11px] font-semibold transition-colors ${
              rating === r.key ? RATING_ON[r.key] : RATING_STYLE[r.key]
            }`}
          >
            <span>{r.label}</span>
            <span className="num opacity-80">{r.weight > 0 ? '+' : ''}{r.weight}</span>
          </button>
        ))}
      </div>
      <div className="label mt-3 mb-1.5">Tags (optional)</div>
      <div className="flex flex-wrap gap-1.5">
        {TAGS.map((t) => {
          const on = tags.includes(t);
          return (
            <button
              key={t}
              onClick={() => setTags(on ? tags.filter((x) => x !== t) : tags.length < 5 ? [...tags, t] : tags)}
              className={`chip ${on ? 'chip-on' : ''}`}
            >
              {t}
            </button>
          );
        })}
      </div>
      {err && <p className="text-down text-[12px] mt-2">{err}</p>}
      <button disabled={!rating} onClick={submit} className="btn-primary w-full mt-3 h-9">
        {rating ? `Submit ${RATINGS.find((r) => r.key === rating).label}` : 'Pick a rating'}
      </button>
      <p className="text-[11px] text-mute mt-2">
        Your vote weight: <span className="num text-txt">{factor}×</span>
        {factor < 1 && ' (new accounts count less while they age)'}
      </p>
    </Section>
  );
}

/* ---------------- trade box (virtual money) ---------------- */
export function TradeBox({ type, id, notify }) {
  const m = useMarket();
  const user = m.currentUser();
  const [side, setSide] = useState('buy');
  const [qty, setQty] = useState('1');
  const [err, setErr] = useState('');
  const price = m.assetPrice(type, id);
  const h = m.holding(type, id);
  const open = m.state.phase === 'open';
  const n = Math.max(0, Math.floor(Number(qty) || 0));
  const total = n * price;

  const go = () => {
    setErr('');
    try {
      m.trade(side, type, id, n);
      notify?.(`${side === 'buy' ? 'Bought' : 'Sold'} ${n} @ ${fmtPrice(price)}`);
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <Section title="Trade" right={<span className="text-[11px] text-mute">virtual money</span>}>
      <div className="grid grid-cols-2 rounded bg-panel2 p-0.5 mb-3">
        {['buy', 'sell'].map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={`h-8 rounded font-semibold capitalize ${side === s ? (s === 'buy' ? 'bg-up text-white' : 'bg-down text-white') : 'text-mute'}`}
          >
            {s}
          </button>
        ))}
      </div>
      <label className="label">Shares</label>
      <div className="flex gap-1 mt-1">
        <input className="input num" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} />
        {user && side === 'buy' && (
          <button className="btn-ghost border border-line" onClick={() => setQty(String(Math.floor(user.cashBalance / price)))}>Max</button>
        )}
        {user && side === 'sell' && h && (
          <button className="btn-ghost border border-line" onClick={() => setQty(String(h.shares))}>All</button>
        )}
      </div>
      <dl className="mt-3 space-y-1 text-[12px]">
        <Line k="Price" v={fmtPrice(price)} />
        <Line k="Est. total" v={fmtMoney(total)} />
        {user && <Line k="Cash" v={fmtMoney(user.cashBalance)} />}
        {h && (
          <>
            <Line k="Position" v={`${h.shares} @ ${fmtPrice(h.avgBuyPrice)}`} />
            <Line k="P/L" v={fmtSigned((price - h.avgBuyPrice) * h.shares)} cls={tone(price - h.avgBuyPrice)} />
          </>
        )}
      </dl>
      {err && <p className="text-down text-[12px] mt-2">{err}</p>}
      {!user ? (
        <Link to="/login" className="btn-primary w-full mt-3">Log in to trade</Link>
      ) : (
        <button
          disabled={!open || !n}
          onClick={go}
          className={`btn w-full mt-3 h-9 text-white ${side === 'buy' ? 'bg-up hover:bg-up/85' : 'bg-down hover:bg-down/85'}`}
        >
          {open ? `${side === 'buy' ? 'Buy' : 'Sell'} ${n || ''}` : <><LockIcon /> Market closed</>}
        </button>
      )}
      {!open && <p className="text-[11px] text-mute mt-2">Trading reopens at 8:00 AM ET. Overnight gaps hit positions at the open.</p>}
    </Section>
  );
}

function Line({ k, v, cls = 'text-txt' }) {
  return (
    <div className="flex justify-between">
      <dt className="text-mute">{k}</dt>
      <dd className={`num ${cls}`}>{v}</dd>
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMarket, useSecond } from '../store.js';
import { RATINGS, TAGS, accountAgeFactor, gapPct, positiveShare, ratingOf } from '../engine/pricing.js';
import { formatCountdown, secondsToExchangeMidnight } from '../engine/clock.js';
import { fmtMoney, fmtPct, fmtPrice, fmtSigned, fmtVol, tone } from '../format.js';
import { LockIcon } from './PriceChart.jsx';

export function Section({ title, right, children }) {
  return (
    <section className="border-b border-line">
      <div className="flex items-center justify-between px-4 h-11">
        <h3 className="font-medium text-white text-[14px]">{title}</h3>
        {right}
      </div>
      <div className="px-4 pb-4">{children}</div>
    </section>
  );
}

/* ---------------- sentiment meter ---------------- */
/** b = { count, net, pos, neg } */
export function SentimentMeter({ b, mode }) {
  const m = useMarket();
  const share = positiveShare(b.pos, b.neg);
  const gap = gapPct(b.net, m.s.config);
  const title = mode === 'weekend' ? 'Weekend sentiment' : mode === 'afterhours' ? 'After-hours sentiment' : "Today's sentiment";
  const sub =
    mode === 'open'
      ? 'Votes applied to the price today'
      : mode === 'weekend'
        ? 'Queued since Friday close, applied as one gap at Monday open'
        : 'Queued since close, applied as one gap at the next open';
  return (
    <Section title={title} right={mode !== 'open' && <span className="text-[11px] text-mute flex items-center gap-1"><LockIcon /> queued</span>}>
      <p className="text-[12px] text-mute mb-3">{sub}</p>
      {b.count === 0 ? (
        <p className="text-[12px] text-mute">No votes yet.</p>
      ) : (
        <>
          <div className="flex justify-between text-[12px] mb-1.5">
            <span className="down num">{Math.round((1 - share) * 100)}% negative</span>
            <span className="up num">{Math.round(share * 100)}% positive</span>
          </div>
          <div className="h-1.5 rounded-full bg-down overflow-hidden">
            <div className="h-full bg-up transition-all duration-700" style={{ width: `${share * 100}%` }} />
          </div>
        </>
      )}
      <dl className="grid grid-cols-3 gap-2 mt-3 text-center">
        <Stat label="Votes" value={fmtVol(b.count)} />
        <Stat label="Net score" value={(b.net > 0 ? '+' : '') + fmtVol(b.net)} cls={tone(b.net)} />
        {mode === 'open' ? <Stat label="Positive" value={fmtVol(b.pos)} /> : <Stat label="Proj. gap" value={fmtPct(gap)} cls={tone(gap)} />}
      </dl>
    </Section>
  );
}

function Stat({ label, value, cls = 'text-txt' }) {
  return (
    <div className="rounded-md bg-panel2 py-2">
      <dt className="text-[10px] text-mute uppercase tracking-wider">{label}</dt>
      <dd className={`num text-[14px] font-medium ${cls}`}>{value}</dd>
    </div>
  );
}

/* ---------------- vote panel ---------------- */
const RATING_STYLE = {
  great: 'border-up/70 text-up hover:bg-up/15',
  good: 'border-up/35 text-up hover:bg-up/10',
  okay: 'border-line text-txt hover:bg-hover',
  bad: 'border-down/35 text-down hover:bg-down/10',
  terrible: 'border-down/70 text-down hover:bg-down/15',
};
const RATING_ON = {
  great: 'bg-up text-white border-up',
  good: 'bg-up/60 text-white border-up/60',
  okay: 'bg-[#555] text-white border-[#555]',
  bad: 'bg-down/60 text-white border-down/60',
  terrible: 'bg-down text-white border-down',
};

export function VotePanel({ modelId, notify }) {
  const m = useMarket();
  useSecond();
  const user = m.user();
  const model = m.s.models[modelId];
  const mine = m.s.myVotes[modelId];
  const [rating, setRating] = useState(null);
  const [tags, setTags] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const open = m.isOpen();

  const submit = async () => {
    setErr('');
    setBusy(true);
    try {
      await m.vote(modelId, rating, tags);
      notify?.(open ? `Vote counted · ${model.name} moves on the next tick` : `Vote queued for the next open · ${model.name}`);
      setRating(null);
      setTags([]);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <Section title={`Rate ${model.name}`}>
        <p className="text-mute mb-3 text-[13px]">Log in to vote. One vote per model per day, and your vote moves the price.</p>
        <Link to="/login" className="btn-primary w-full h-10">Log in to vote</Link>
      </Section>
    );
  }

  if (mine) {
    const r = ratingOf(mine.rating);
    return (
      <Section title="Your vote today" right={<span className="text-[11px] text-mute">1 per day</span>}>
        <div className={`rounded-md border px-3 py-2.5 ${RATING_ON[r.key]}`}>
          <div className="font-medium">{r.label} <span className="num opacity-80">({r.value > 0 ? '+' : ''}{r.value})</span></div>
          {mine.tags.length > 0 && <div className="text-[12px] opacity-90 mt-0.5">{mine.tags.join(' · ')}</div>}
        </div>
        <p className="text-[12px] text-mute mt-2">
          {mine.applied ? 'Applied to the price.' : open ? 'Applies on the next tick.' : 'Queued: applies in the opening gap.'} Weight{' '}
          <span className="num text-txt">{Number(mine.weight)}×</span>
        </p>
        <p className="text-[12px] text-mute mt-1">
          Next vote in <span className="num text-txt">{formatCountdown(secondsToExchangeMidnight(m.s.config))}</span>
        </p>
      </Section>
    );
  }

  const factor = accountAgeFactor((Date.now() - new Date(user.created_at)) / 86_400_000);
  return (
    <Section title={`Rate ${model.name}`} right={<span className="text-[11px] text-mute">{open ? 'moves price live' : 'queues for open'}</span>}>
      <div className="grid grid-cols-5 gap-1.5">
        {RATINGS.map((r) => (
          <button
            key={r.key}
            onClick={() => setRating(r.value)}
            className={`h-12 rounded-md border flex flex-col items-center justify-center text-[11px] font-medium transition-colors ${
              rating === r.value ? RATING_ON[r.key] : RATING_STYLE[r.key]
            }`}
          >
            <span>{r.label}</span>
            <span className="num opacity-80">{r.value > 0 ? '+' : ''}{r.value}</span>
          </button>
        ))}
      </div>
      <div className="label mt-4 mb-2">Tags (optional, up to 5)</div>
      <div className="flex flex-wrap gap-1.5">
        {TAGS.map((t) => {
          const on = tags.includes(t);
          return (
            <button key={t} onClick={() => setTags(on ? tags.filter((x) => x !== t) : tags.length < 5 ? [...tags, t] : tags)} className={`chip ${on ? 'chip-on' : ''}`}>
              {t}
            </button>
          );
        })}
      </div>
      {err && <p className="text-down text-[12px] mt-2">{err}</p>}
      <button disabled={rating === null || busy} onClick={submit} className="btn-primary w-full mt-4 h-10">
        {rating === null ? 'Pick a rating' : `Submit ${ratingOf(rating).label}`}
      </button>
      <p className="text-[12px] text-mute mt-2">
        Your vote weight <span className="num text-txt">{factor}×</span>
        {factor < 1 && ' (new accounts count less for their first 30 days)'}
      </p>
    </Section>
  );
}

/* ---------------- trade box (virtual money) ---------------- */
export function TradeBox({ type, id, notify }) {
  const m = useMarket();
  const user = m.user();
  const [side, setSide] = useState('buy');
  const [qty, setQty] = useState('1');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const price = m.quote(type, id).price;
  const h = m.holding(type, id);
  const open = m.isOpen();
  const n = Math.max(0, Math.floor(Number(qty) || 0));

  const go = async () => {
    setErr('');
    setBusy(true);
    try {
      await m.trade(side, type, id, n);
      notify?.(`${side === 'buy' ? 'Bought' : 'Sold'} ${n} at ~${fmtPrice(price)}`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Trade" right={<span className="text-[11px] text-mute">virtual money</span>}>
      <div className="grid grid-cols-2 rounded-md bg-panel2 p-0.5 mb-3">
        {['buy', 'sell'].map((s) => (
          <button key={s} onClick={() => setSide(s)} className={`h-8 rounded font-medium capitalize ${side === s ? (s === 'buy' ? 'bg-up text-white' : 'bg-down text-white') : 'text-mute'}`}>
            {s}
          </button>
        ))}
      </div>
      <label className="label">Shares</label>
      <div className="flex gap-1.5 mt-1">
        <input className="input num" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} />
        {user && side === 'buy' && <button className="btn-ghost border border-line" onClick={() => setQty(String(Math.floor(user.cash_balance / price)))}>Max</button>}
        {user && side === 'sell' && h && <button className="btn-ghost border border-line" onClick={() => setQty(String(h.shares))}>All</button>}
      </div>
      <dl className="mt-3 space-y-1.5 text-[13px]">
        <Line k="Price" v={fmtPrice(price)} />
        <Line k="Est. total" v={fmtMoney(n * price)} />
        {user && <Line k="Cash" v={fmtMoney(user.cash_balance)} />}
        {h && (
          <>
            <Line k="Position" v={`${h.shares} @ ${fmtPrice(h.avg_buy_price)}`} />
            <Line k="P/L" v={fmtSigned((price - h.avg_buy_price) * h.shares)} cls={tone(price - h.avg_buy_price)} />
          </>
        )}
      </dl>
      {err && <p className="text-down text-[12px] mt-2">{err}</p>}
      {!user ? (
        <Link to="/login" className="btn-primary w-full mt-3 h-10">Log in to trade</Link>
      ) : (
        <button disabled={!open || !n || busy} onClick={go} className={`btn w-full mt-3 h-10 text-white ${side === 'buy' ? 'bg-up hover:bg-up/85' : 'bg-down hover:bg-down/85'}`}>
          {open ? `${side === 'buy' ? 'Buy' : 'Sell'} ${n || ''}` : <><LockIcon /> Market closed</>}
        </button>
      )}
      {!open && <p className="text-[12px] text-mute mt-2">Trading reopens at the open. Overnight gaps hit positions at the open.</p>}
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

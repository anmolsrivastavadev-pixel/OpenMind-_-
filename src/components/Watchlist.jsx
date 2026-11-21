import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMarket } from '../store.js';
import { fmtPrice, fmtPct, tone } from '../format.js';

function Row({ to, active, ticker, name, quote, indent, color }) {
  const prev = useRef(quote.price);
  const [flash, setFlash] = useState('');
  useEffect(() => {
    if (quote.price !== prev.current) {
      setFlash(quote.price > prev.current ? 'flash-up' : 'flash-down');
      prev.current = quote.price;
      const t = setTimeout(() => setFlash(''), 900);
      return () => clearTimeout(t);
    }
  }, [quote.price]);
  return (
    <Link
      to={to}
      className={`grid grid-cols-[1fr_auto_auto] items-center gap-2 h-9 pr-3 border-l-2 ${
        active ? 'bg-hover border-accent' : 'border-transparent hover:bg-panel2'
      } ${indent ? 'pl-6' : 'pl-2.5'} ${flash}`}
    >
      <div className="min-w-0 flex items-center gap-2">
        {!indent && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />}
        <div className="min-w-0">
          <div className={`truncate leading-tight ${indent ? 'text-txt' : 'text-white font-semibold'}`}>{indent ? name : ticker}</div>
          <div className="truncate text-[10px] text-mute leading-tight">{indent ? ticker : name}</div>
        </div>
      </div>
      <span className="num text-right text-txt">{fmtPrice(quote.price)}</span>
      <span className={`num text-right w-[62px] ${tone(quote.change)}`}>{fmtPct(quote.pct)}</span>
    </Link>
  );
}

export default function Watchlist({ className = '' }) {
  const m = useMarket();
  const { modelId, companyId } = useParams();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const match = (...s) => !needle || s.some((x) => x.toLowerCase().includes(needle));

  return (
    <aside className={`flex flex-col min-h-0 bg-panel ${className}`}>
      <div className="flex items-center justify-between px-3 h-10 border-b border-line shrink-0">
        <span className="font-semibold text-white">Watchlist</span>
        <span className="text-[11px] text-mute">{Object.keys(m.state.models).length} models</span>
      </div>
      <div className="p-2 border-b border-line shrink-0">
        <input className="input h-8" placeholder="Search symbol or model" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 h-7 items-center text-[10px] uppercase tracking-wider text-mute border-b border-line shrink-0">
        <span>Symbol</span>
        <span className="text-right">Last</span>
        <span className="text-right w-[62px]">Chg%</span>
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin">
        {Object.values(m.state.companies).map((c) => {
          const models = c.modelIds.map((id) => m.state.models[id]).filter((x) => match(x.name, x.ticker, c.name, c.ticker));
          if (!models.length && !match(c.name, c.ticker)) return null;
          return (
            <div key={c.id} className="border-b border-line/60">
              <Row to={`/c/${c.id}`} active={companyId === c.id} ticker={c.ticker} name={c.name} color={c.color} quote={m.quote('company', c.id)} />
              {models.map((x) => (
                <Row key={x.id} indent to={`/m/${x.id}`} active={modelId === x.id} ticker={x.ticker} name={x.name} quote={m.quote('model', x.id)} />
              ))}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

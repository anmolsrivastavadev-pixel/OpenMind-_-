import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMarket } from '../store.js';
import Watchlist from '../components/Watchlist.jsx';
import PriceChart, { LockIcon } from '../components/PriceChart.jsx';
import { SentimentMeter, TradeBox, VotePanel } from '../components/Panels.jsx';
import { fmtPct, fmtPrice, fmtSigned, tone } from '../format.js';

export function SymbolHeader({ title, subtitle, color, quote, extra, badge }) {
  const m = useMarket();
  const closed = m.state.phase !== 'open';
  return (
    <div className="px-3 py-2 border-b border-line shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold text-white shrink-0" style={{ background: color }}>
          {(badge ?? title)[0]}
        </span>
        <h1 className="text-white text-[17px] font-semibold truncate">{title}</h1>
        <span className="text-mute text-[12px] truncate">{subtitle}</span>
      </div>
      <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1 mt-1">
        <span className={`num text-[26px] font-semibold ${closed ? 'text-white' : tone(quote.change)}`}>{fmtPrice(quote.price)}</span>
        <span className={`num text-[14px] ${tone(quote.change)}`}>
          {fmtSigned(quote.change)} ({fmtPct(quote.pct)})
        </span>
        {closed ? (
          <span className="text-[11px] text-mute flex items-center gap-1"><LockIcon /> At close · {m.state.sessionDate}</span>
        ) : (
          <span className="text-[11px] text-up">● Live</span>
        )}
        {extra}
      </div>
    </div>
  );
}

export default function ModelPage({ notify }) {
  const { modelId } = useParams();
  const m = useMarket();
  const [tf, setTf] = useState('1D');
  const model = m.state.models[modelId];
  if (!model) return <div className="p-8 text-mute">Unknown model. <Link to="/" className="text-accent">Back</Link></div>;
  const company = m.state.companies[model.companyId];
  const q = m.quote('model', modelId);
  const st = m.status();
  const sent = m.sentiment(modelId);
  const showGap = m.state.phase === 'open' && Math.abs(model.lastGap) > 0.0001;

  return (
    <div className="flex-1 min-h-0 flex">
      <Watchlist className="hidden lg:flex w-[280px] shrink-0 border-r border-line" />
      <div className="flex-1 min-w-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
        {/* center: chart */}
        <section className="flex flex-col min-w-0 lg:flex-1 lg:min-h-0 border-b lg:border-b-0 lg:border-r border-line">
          <SymbolHeader
            title={model.name}
            subtitle={<><Link to={`/c/${company.id}`} className="hover:text-txt">{company.name}</Link> · {model.ticker} · AI Market</>}
            color={company.color}
            badge={company.name}
            quote={q}
            extra={
              showGap && (
                <span className={`text-[11px] num px-1.5 rounded ${model.lastGap > 0 ? 'bg-up/15 up' : 'bg-down/15 down'}`}>
                  Gap {model.lastGap > 0 ? 'up' : 'down'} {fmtPct(model.lastGap)} at open
                </span>
              )
            }
          />
          <div className="h-[58vh] min-h-[320px] lg:h-auto lg:flex-1">
            <PriceChart type="model" id={modelId} tf={tf} onTf={setTf} />
          </div>
        </section>
        {/* right: vote / trade / sentiment */}
        <aside className="lg:w-[330px] shrink-0 bg-panel lg:overflow-y-auto scroll-thin">
          <VotePanel modelId={modelId} notify={notify} />
          <SentimentMeter bucket={st === 'open' ? sent.today : sent.queue} mode={st} />
          <TradeBox type="model" id={modelId} notify={notify} />
          <p className="px-3 py-3 text-[11px] text-mute">Simulated prototype data. Virtual money only. Model names are fictional.</p>
        </aside>
      </div>
    </div>
  );
}

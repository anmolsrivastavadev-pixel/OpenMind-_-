import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMarket } from '../store.js';
import Watchlist from '../components/Watchlist.jsx';
import PriceChart, { LockIcon } from '../components/PriceChart.jsx';
import { SentimentMeter, TradeBox, VotePanel } from '../components/Panels.jsx';
import MarketStatus from '../components/MarketStatus.jsx';
import { fmtPct, fmtPrice, fmtSigned, tone } from '../format.js';

/** Compact header like the TradingView app: name, then price + change in one colored line. */
export function SymbolHeader({ title, subtitle, color, badge, quote, extra }) {
  const m = useMarket();
  const closed = !m.isOpen();
  return (
    <div className="px-4 pt-3 pb-2 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-7 h-7 rounded-full grid place-items-center text-[12px] font-bold text-white shrink-0" style={{ background: color }}>
          {(badge ?? title)[0]}
        </span>
        <h1 className="text-white text-[20px] font-medium truncate">{title}</h1>
        <span className="hidden sm:inline text-mute text-[12px] truncate">{subtitle}</span>
        <div className="ml-auto lg:hidden"><MarketStatus compact /></div>
      </div>
      <div className={`flex items-baseline flex-wrap gap-x-2 gap-y-1 mt-1 num ${tone(quote.change)}`}>
        <span className="text-[18px] lg:text-[26px] font-medium">{fmtPrice(quote.price)}</span>
        <span className="text-[15px] lg:text-[16px]">
          {fmtSigned(quote.change)} ({fmtPct(quote.pct)})
        </span>
        {closed ? (
          <span className="text-[11px] text-mute flex items-center gap-1 font-sans"><LockIcon /> at close</span>
        ) : (
          <span className="text-[11px] text-up font-sans">● live</span>
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
  const model = m.s.models[modelId];
  if (!model) return <div className="p-8 text-mute">Unknown model. <Link to="/" className="text-accent">Back</Link></div>;
  const company = m.s.companies[model.company_id];
  const q = m.quote('model', modelId);
  const st = m.status();
  const open = m.isOpen();
  const b = open
    ? { count: model.today_count, net: model.today_net, pos: model.today_pos, neg: model.today_neg }
    : { count: model.queue_count, net: model.queue_net, pos: model.queue_pos, neg: model.queue_neg };
  const showGap = open && Math.abs(model.last_gap) > 0.00001;

  return (
    <div className="flex-1 min-h-0 flex">
      <Watchlist className="hidden lg:flex w-[290px] shrink-0 border-r border-line" />
      <div className="flex-1 min-w-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
        <section className="flex flex-col min-w-0 lg:flex-1 lg:min-h-0 border-b lg:border-b-0 lg:border-r border-line">
          <SymbolHeader
            title={model.name}
            subtitle={<><Link to={`/c/${company.id}`} className="hover:text-txt">{company.name}</Link> · {model.ticker}</>}
            color={company.color}
            badge={company.name}
            quote={q}
            extra={showGap && (
              <span className={`text-[11px] px-1.5 rounded font-sans ${model.last_gap > 0 ? 'bg-up/15 up' : 'bg-down/15 down'}`}>
                gap {fmtPct(model.last_gap)} at open
              </span>
            )}
          />
          <div className="h-[62vh] min-h-[340px] lg:h-auto lg:flex-1">
            <PriceChart type="model" id={modelId} tf={tf} onTf={setTf} />
          </div>
        </section>
        <aside className="lg:w-[340px] shrink-0 bg-panel lg:overflow-y-auto scroll-thin">
          <VotePanel modelId={modelId} notify={notify} />
          <SentimentMeter b={b} mode={st === 'open' && !open ? 'afterhours' : open ? 'open' : st} />
          <TradeBox type="model" id={modelId} notify={notify} />
          <p className="px-4 py-3 text-[11px] text-mute">Prices move only from real votes. Virtual money only; not affiliated with {company.name}.</p>
        </aside>
      </div>
    </div>
  );
}

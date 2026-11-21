import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMarket } from '../store.js';
import Watchlist from '../components/Watchlist.jsx';
import PriceChart from '../components/PriceChart.jsx';
import { Section, SentimentMeter, TradeBox } from '../components/Panels.jsx';
import { SymbolHeader } from './ModelPage.jsx';
import { fmtPct, fmtPrice, fmtVol, tone } from '../format.js';

export default function CompanyPage({ notify }) {
  const { companyId } = useParams();
  const m = useMarket();
  const [tf, setTf] = useState('1D');
  const c = m.s.companies[companyId];
  if (!c) return <div className="p-8 text-mute">Unknown company. <Link to="/" className="text-accent">Back</Link></div>;
  const q = m.quote('company', companyId);
  const models = c.modelIds.map((id) => m.s.models[id]);
  const open = m.isOpen();
  const sum = (k) => models.reduce((a, x) => a + x[k], 0);
  const b = open
    ? { count: sum('today_count'), net: sum('today_net'), pos: sum('today_pos'), neg: sum('today_neg') }
    : { count: sum('queue_count'), net: sum('queue_net'), pos: sum('queue_pos'), neg: sum('queue_neg') };

  return (
    <div className="flex-1 min-h-0 flex">
      <Watchlist className="hidden lg:flex w-[290px] shrink-0 border-r border-line" />
      <div className="flex-1 min-w-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
        <section className="flex flex-col min-w-0 lg:flex-1 lg:min-h-0 lg:border-r border-line">
          <SymbolHeader title={c.name} subtitle={`${c.ticker} · index of ${models.length} models`} color={c.color} quote={q} />
          <div className="h-[50vh] min-h-[300px] lg:h-auto lg:flex-1">
            <PriceChart type="company" id={companyId} tf={tf} onTf={setTf} />
          </div>
          <div className="border-t border-line shrink-0 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-mute text-[10px] uppercase tracking-wider">
                <tr className="h-8 border-b border-line">
                  <th className="text-left pl-4 font-normal">Model</th>
                  <th className="text-right font-normal">Last</th>
                  <th className="text-right font-normal">Chg%</th>
                  <th className="text-right font-normal">Votes today</th>
                  <th className="text-right pr-4 font-normal">Share of index</th>
                </tr>
              </thead>
              <tbody>
                {models.map((x) => {
                  const mq = m.quote('model', x.id);
                  return (
                    <tr key={x.id} className="h-10 border-b border-line/60 hover:bg-panel2">
                      <td className="pl-4"><Link to={`/m/${x.id}`} className="text-white hover:text-accent">{x.name}</Link></td>
                      <td className="text-right num">{fmtPrice(mq.price)}</td>
                      <td className={`text-right num ${tone(mq.change)}`}>{fmtPct(mq.pct)}</td>
                      <td className="text-right num">{fmtVol(x.today_count)}</td>
                      <td className="text-right pr-4 num text-mute">{Math.round((x.index_weight * x.current_price * 100) / (q.price || 1))}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <aside className="lg:w-[340px] shrink-0 bg-panel lg:overflow-y-auto scroll-thin">
          <Section title="How this index works">
            <p className="text-mute text-[13px]">
              {c.name} = sum of each model's price × its index weight. Vote on the models to move it.
            </p>
          </Section>
          <SentimentMeter b={b} mode={open ? 'open' : m.status() === 'open' ? 'afterhours' : m.status()} />
          <TradeBox type="company" id={companyId} notify={notify} />
        </aside>
      </div>
    </div>
  );
}

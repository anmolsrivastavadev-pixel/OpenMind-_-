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
  const [tf, setTf] = useState('1M');
  const c = m.state.companies[companyId];
  if (!c) return <div className="p-8 text-mute">Unknown company. <Link to="/" className="text-accent">Back</Link></div>;
  const q = m.quote('company', companyId);
  const models = m.companyModels(companyId);
  const st = m.status();
  const total = q.price || 1;
  const bucket = st === 'open'
    ? models.reduce((b, x) => {
        const t = m.state.todayVotes[x.id];
        return { net: b.net + t.net, count: b.count + t.count, pos: b.pos + t.pos, neg: b.neg + t.neg, neutral: b.neutral + t.neutral };
      }, { net: 0, count: 0, pos: 0, neg: 0, neutral: 0 })
    : m.companySentiment(companyId).queue;

  return (
    <div className="flex-1 min-h-0 flex">
      <Watchlist className="hidden lg:flex w-[280px] shrink-0 border-r border-line" />
      <div className="flex-1 min-w-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
        <section className="flex flex-col min-w-0 lg:flex-1 lg:min-h-0 lg:border-r border-line">
          <SymbolHeader title={c.name} subtitle={`${c.ticker} · weighted index of ${models.length} model${models.length > 1 ? 's' : ''}`} color={c.color} quote={q} />
          <div className="h-[48vh] min-h-[300px] lg:h-auto lg:flex-1">
            <PriceChart type="company" id={companyId} tf={tf} onTf={setTf} />
          </div>
          <div className="border-t border-line shrink-0 overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="text-mute text-[10px] uppercase tracking-wider">
                <tr className="h-8 border-b border-line">
                  <th className="text-left pl-3 font-normal">Model</th>
                  <th className="text-right font-normal">Last</th>
                  <th className="text-right font-normal">Chg%</th>
                  <th className="text-right font-normal">Votes today</th>
                  <th className="text-right pr-3 font-normal">Index weight</th>
                </tr>
              </thead>
              <tbody>
                {models.map((x) => {
                  const mq = m.quote('model', x.id);
                  return (
                    <tr key={x.id} className="h-9 border-b border-line/60 hover:bg-panel2">
                      <td className="pl-3"><Link to={`/m/${x.id}`} className="text-white hover:text-accent">{x.name}</Link> <span className="text-mute">{x.ticker}</span></td>
                      <td className="text-right num">{fmtPrice(mq.price)}</td>
                      <td className={`text-right num ${tone(mq.change)}`}>{fmtPct(mq.pct)}</td>
                      <td className="text-right num">{fmtVol(m.state.todayVotes[x.id].count)}</td>
                      <td className="text-right pr-3 num text-mute">{x.indexWeight}× · {Math.round((x.indexWeight * x.price * 100) / total)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <aside className="lg:w-[330px] shrink-0 bg-panel lg:overflow-y-auto scroll-thin">
          <Section title="How this index works">
            <p className="text-mute text-[12px]">
              {c.name} = Σ (model price × index weight). Vote on its models to move it; companies themselves are not voted on directly.
            </p>
          </Section>
          <SentimentMeter bucket={bucket} mode={st} />
          <TradeBox type="company" id={companyId} notify={notify} />
        </aside>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts';
import { useCandles, useMarket } from '../store.js';
import { fmtPrice, fmtVol, tone } from '../format.js';

const UP = '#089981';
const DOWN = '#f23645';
export const TIMEFRAMES = ['1D', '1W', '1M', '3M'];

/** TradingView-style candles + volume (volume = votes). type: 'model' | 'company'. */
export default function PriceChart({ type, id, tf, onTf, showVolLabel = true }) {
  const m = useMarket();
  const box = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef({});
  const keyRef = useRef('');
  const [hover, setHover] = useState(null);
  const res = useCandles(type, id, tf);
  const data = res?.bars ?? [];
  const last = data[data.length - 1];
  const closed = !m.isOpen();

  useEffect(() => {
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { color: '#0b0b0b' }, textColor: '#a3a3a3', fontSize: 11, fontFamily: 'Roboto, -apple-system, sans-serif' },
      grid: { vertLines: { color: '#262626', style: LineStyle.Dotted }, horzLines: { color: '#262626', style: LineStyle.Dotted } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#6b6b6b', labelBackgroundColor: '#2a2a2a' },
        horzLine: { color: '#6b6b6b', labelBackgroundColor: '#2a2a2a' },
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.28 } },
      timeScale: { borderVisible: false, rightOffset: 8, barSpacing: 8, timeVisible: true, secondsVisible: false },
    });
    const candles = chart.addCandlestickSeries({
      upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN, wickUpColor: UP, wickDownColor: DOWN,
      priceLineStyle: LineStyle.Dotted,
    });
    const volume = chart.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
    chart.subscribeCrosshairMove((p) => {
      const c = p.seriesData?.get(candles);
      const v = p.seriesData?.get(volume);
      setHover(c ? { ...c, volume: v?.value ?? 0 } : null);
    });
    chartRef.current = chart;
    seriesRef.current = { candles, volume };
    return () => {
      chart.remove();
      keyRef.current = '';
    };
  }, []);

  useEffect(() => {
    const { candles, volume } = seriesRef.current;
    if (!candles || !res) return;
    const vol = (b) => ({ time: b.time, value: b.volume, color: b.close >= b.open ? 'rgba(8,153,129,.5)' : 'rgba(242,54,69,.5)' });
    const prevClose = data[data.length - 2]?.close ?? last?.open;
    candles.applyOptions({ priceLineColor: closed ? '#8b8b8b' : last && last.close >= prevClose ? UP : DOWN });
    candles.setData(data);
    volume.setData(data.map(vol));
    if (keyRef.current !== res.key) {
      const ts = chartRef.current.timeScale();
      ts.applyOptions({ timeVisible: tf === '1D' || tf === '1W' });
      // keep TradingView-like candle widths even when only a few candles exist
      ts.applyOptions({ barSpacing: 8 });
      ts.setVisibleLogicalRange({ from: data.length - 120, to: data.length + 8 });
      keyRef.current = res.key;
    }
  }, [res, closed]);

  const shown = hover ?? last;
  const i = shown ? data.findIndex((d) => d.time === shown.time) : -1;
  const chg = shown ? shown.close - (data[i - 1]?.close ?? shown.open) : 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="relative flex-1 min-h-0">
        <div className="absolute left-3 top-2 z-10 pointer-events-none space-y-1">
          {shown && (
            <div className="flex flex-wrap gap-x-2 text-[11px] num">
              <span className="text-mute">O</span><span className={tone(chg)}>{fmtPrice(shown.open)}</span>
              <span className="text-mute">H</span><span className={tone(chg)}>{fmtPrice(shown.high)}</span>
              <span className="text-mute">L</span><span className={tone(chg)}>{fmtPrice(shown.low)}</span>
              <span className="text-mute">C</span><span className={tone(chg)}>{fmtPrice(shown.close)}</span>
            </div>
          )}
          {showVolLabel && (
            <div className="text-[12px] text-txt">
              Vol {shown && <span className="num text-mute">{fmtVol(shown.volume)} votes</span>}
            </div>
          )}
          {closed && (
            <div className="text-[11px] text-mute flex items-center gap-1"><LockIcon /> price locked at close</div>
          )}
        </div>
        {res && data.length === 0 && (
          <div className="absolute inset-0 z-10 grid place-items-center text-center text-mute pointer-events-none px-6">
            <div>
              <div className="text-txt font-medium">No trading yet</div>
              <div className="text-[12px] mt-1">Candles appear as soon as people vote. Be the first.</div>
            </div>
          </div>
        )}
        <div ref={box} className="absolute inset-0" />
      </div>
      <div className="flex items-center gap-1 px-2 h-10 border-t border-line shrink-0">
        {TIMEFRAMES.map((t) => (
          <button
            key={t}
            onClick={() => onTf(t)}
            className={`h-7 px-3 rounded text-[13px] font-medium ${t === tf ? 'text-white bg-hover' : 'text-mute hover:text-txt'}`}
          >
            {t}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-mute">
          {tf === '1D' ? '5m candles' : tf === '1W' ? '30m candles' : 'daily candles'}
        </span>
      </div>
    </div>
  );
}

export function LockIcon({ className = 'w-3 h-3' }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden>
      <path d="M5 7V5a3 3 0 1 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7H5Zm1.5 0h3V5a1.5 1.5 0 1 0-3 0v2Z" />
    </svg>
  );
}

import { useEffect, useRef, useState } from 'react';
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts';
import { useMarket } from '../store.js';
import { fmtPrice, fmtVol, tone } from '../format.js';

const UP = '#089981';
const DOWN = '#f23645';
export const TIMEFRAMES = ['1D', '1W', '1M', '3M'];

/**
 * TradingView-style candlestick chart with volume, crosshair and an OHLC
 * legend. `type` is 'model' | 'company'.
 */
export default function PriceChart({ type, id, tf, onTf }) {
  const m = useMarket();
  const box = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef({});
  const keyRef = useRef('');
  const [hover, setHover] = useState(null);

  const data = m.candles(type, id, tf);
  const last = data[data.length - 1];
  const closed = m.state.phase !== 'open';

  // create once
  useEffect(() => {
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { color: '#0b0e14' }, textColor: '#b2b5be', fontSize: 11, fontFamily: 'ui-monospace, Menlo, monospace' },
      grid: { vertLines: { color: '#1a1e29', style: LineStyle.Dotted }, horzLines: { color: '#1a1e29', style: LineStyle.Dotted } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#758696', labelBackgroundColor: '#2a2e39' },
        horzLine: { color: '#758696', labelBackgroundColor: '#2a2e39' },
      },
      rightPriceScale: { borderColor: '#2a2e39', scaleMargins: { top: 0.08, bottom: 0.26 } },
      timeScale: { borderColor: '#2a2e39', rightOffset: 6, barSpacing: 7, timeVisible: true, secondsVisible: false },
      handleScale: { axisPressedMouseMove: true },
    });
    const candles = chart.addCandlestickSeries({
      upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN, wickUpColor: UP, wickDownColor: DOWN,
      priceLineStyle: LineStyle.Dotted,
    });
    const volume = chart.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    chart.subscribeCrosshairMove((p) => {
      const c = p.seriesData?.get(candles);
      const v = p.seriesData?.get(volume);
      setHover(c ? { ...c, volume: v?.value ?? 0 } : null);
    });
    chartRef.current = chart;
    seriesRef.current = { candles, volume };
    return () => {
      chart.remove();
      chartRef.current = null;
      keyRef.current = '';
    };
  }, []);

  // data: full reset on symbol/timeframe change, cheap update on live ticks
  useEffect(() => {
    const { candles, volume } = seriesRef.current;
    if (!candles || !data.length) return;
    const vol = (b) => ({ time: b.time, value: b.volume, color: b.close >= b.open ? 'rgba(8,153,129,.45)' : 'rgba(242,54,69,.45)' });
    const key = `${type}:${id}:${tf}:${data.length > 1 ? data[0].time : ''}`;
    const lineColor = last.close >= (data[data.length - 2]?.close ?? last.open) ? UP : DOWN;
    candles.applyOptions({ priceLineColor: closed ? '#787b86' : lineColor });
    if (key !== keyRef.current || data.length < 2) {
      candles.setData(data);
      volume.setData(data.map(vol));
      const ts = chartRef.current.timeScale();
      ts.applyOptions({ timeVisible: tf === '1D' || tf === '1W' });
      if (tf === '1D') ts.setVisibleLogicalRange({ from: data.length - 160, to: data.length + 6 });
      else ts.fitContent();
      keyRef.current = key;
    } else {
      // last bar or a new bar
      candles.update(last);
      volume.update(vol(last));
    }
  });

  const shown = hover ?? last;
  const prevShown = shown && data[data.findIndex((d) => d.time === shown.time) - 1];
  const chg = shown && prevShown ? shown.close - prevShown.close : 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-1 px-2 h-9 border-b border-line shrink-0">
        {TIMEFRAMES.map((t) => (
          <button
            key={t}
            onClick={() => onTf(t)}
            className={`h-7 px-2.5 rounded text-[13px] font-medium ${t === tf ? 'text-white bg-hover' : 'text-mute hover:text-txt hover:bg-hover'}`}
          >
            {t}
          </button>
        ))}
        <span className="ml-2 text-[11px] text-mute hidden sm:inline">
          {tf === '1D' ? '5-min candles' : tf === '1W' ? '30-min candles' : 'daily candles'} · volume = votes
        </span>
      </div>
      <div className="relative flex-1 min-h-0">
        {shown && (
          <div className="absolute left-2 top-1.5 z-10 flex flex-wrap gap-x-2 text-[11px] num pointer-events-none">
            <span className="text-mute">O</span><span className={tone(chg)}>{fmtPrice(shown.open)}</span>
            <span className="text-mute">H</span><span className={tone(chg)}>{fmtPrice(shown.high)}</span>
            <span className="text-mute">L</span><span className={tone(chg)}>{fmtPrice(shown.low)}</span>
            <span className="text-mute">C</span><span className={tone(chg)}>{fmtPrice(shown.close)}</span>
            <span className="text-mute">Vol</span><span className="text-txt">{fmtVol(shown.volume)}</span>
          </div>
        )}
        {closed && (
          <div className="absolute left-2 top-6 z-10 text-[11px] text-mute flex items-center gap-1 pointer-events-none">
            <LockIcon /> price locked at close
          </div>
        )}
        <div ref={box} className="absolute inset-0" />
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

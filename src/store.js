// Client for the real market: Supabase (Postgres + Auth + Realtime).
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createClient } from '@supabase/supabase-js';
import { exchangeDate, marketStatus, nextTransition, wallSeconds } from './engine/clock.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = Boolean(url && anon);
export const supabase = configured ? createClient(url, anon) : null;

// ---------------------------------------------------------------- state
const s = {
  ready: false,
  error: null,
  config: null,
  state: null,
  companies: {},
  models: {},
  session: null,
  profile: null,
  myVotes: {}, // model_id -> vote (today)
  holdings: [],
};
let version = 0;
const listeners = new Set();
const barListeners = new Set();
const emit = () => {
  version++;
  listeners.forEach((f) => f());
};

const num = (m) => ({
  ...m,
  current_price: Number(m.current_price),
  prev_close: Number(m.prev_close),
  index_weight: Number(m.index_weight),
  last_gap: Number(m.last_gap),
  today_net: Number(m.today_net),
  queue_net: Number(m.queue_net),
});

async function loadMarket() {
  const [cfg, st, comps, models] = await Promise.all([
    supabase.from('market_config').select('*').single(),
    supabase.from('market_state').select('*').single(),
    supabase.from('companies').select('*').order('sort'),
    supabase.from('models').select('*').eq('status', 'active').order('sort'),
  ]);
  const err = cfg.error || st.error || comps.error || models.error;
  if (err) throw err;
  s.config = cfg.data;
  s.state = st.data;
  s.companies = {};
  for (const c of comps.data) s.companies[c.id] = { ...c, modelIds: [] };
  s.models = {};
  for (const m of models.data) {
    s.models[m.id] = num(m);
    s.companies[m.company_id]?.modelIds.push(m.id);
  }
}

async function loadUser() {
  const uid = s.session?.user?.id;
  if (!uid) {
    s.profile = null;
    s.myVotes = {};
    s.holdings = [];
    return;
  }
  const today = exchangeDate(s.config);
  const [p, v, h] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', uid).single(),
    supabase.from('votes').select('*').eq('date', today),
    supabase.from('holdings').select('*'),
  ]);
  s.profile = p.data ? { ...p.data, cash_balance: Number(p.data.cash_balance) } : null;
  s.myVotes = Object.fromEntries((v.data ?? []).map((x) => [x.model_id, x]));
  s.holdings = (h.data ?? []).map((x) => ({ ...x, avg_buy_price: Number(x.avg_buy_price) }));
}

let started = false;
export async function start() {
  if (started || !configured) return;
  started = true;
  try {
    await loadMarket();
    const { data } = await supabase.auth.getSession();
    s.session = data.session;
    await loadUser();
    s.ready = true;
  } catch (e) {
    s.error = e.message ?? String(e);
  }
  emit();

  supabase.auth.onAuthStateChange((_evt, session) => {
    s.session = session;
    loadUser().then(emit);
  });

  supabase
    .channel('market')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'models' }, ({ new: m }) => {
      s.models[m.id] = num(m);
      emit();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'market_state' }, ({ new: st }) => {
      const reopened = s.state?.phase !== st.phase;
      s.state = st;
      if (reopened) loadUser(); // queued votes became applied
      emit();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bars' }, ({ new: b }) => {
      barListeners.forEach((f) => f(b));
    })
    .subscribe();

  // Safety net if the socket drops: refresh prices every 30s.
  setInterval(() => loadMarket().then(emit).catch(() => {}), 30_000);
}

// ---------------------------------------------------------------- hooks
export function useMarket() {
  useSyncExternalStore(subscribe, () => version);
  return market;
}
function subscribe(f) {
  listeners.add(f);
  return () => listeners.delete(f);
}

let sec = 0;
const secListeners = new Set();
setInterval(() => {
  sec++;
  secListeners.forEach((f) => f());
}, 1000);
export function useSecond() {
  return useSyncExternalStore((f) => (secListeners.add(f), () => secListeners.delete(f)), () => sec);
}

// ---------------------------------------------------------------- API
async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

export const market = {
  get s() {
    return s;
  },
  status: () => (s.config ? marketStatus(s.config) : 'afterhours'),
  isOpen: () => s.state?.phase === 'open',
  nextTransition: () => nextTransition(s.config),
  user: () => s.profile,

  quote(type, id) {
    let price, prev;
    if (type === 'company') {
      const ms = s.companies[id].modelIds.map((x) => s.models[x]);
      price = ms.reduce((a, m) => a + m.index_weight * m.current_price, 0);
      prev = ms.reduce((a, m) => a + m.index_weight * m.prev_close, 0);
    } else {
      price = s.models[id].current_price;
      prev = s.models[id].prev_close;
    }
    const change = price - prev;
    return { price, prev, change, pct: prev ? change / prev : 0 };
  },
  holding: (type, id) => s.holdings.find((h) => h.asset_type === type && h.asset_id === id) ?? null,

  async signup({ name, email, password, captchaToken }) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name }, captchaToken, emailRedirectTo: window.location.origin },
    });
    if (error) throw new Error(error.message);
  },
  async login({ email, password }) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  },
  async logout() {
    await supabase.auth.signOut();
  },

  async vote(modelId, rating, tags) {
    const v = await rpc('cast_vote', { p_model: modelId, p_rating: rating, p_tags: tags });
    s.myVotes[modelId] = v;
    await loadUser();
    emit();
    return v;
  },
  async trade(side, type, id, shares) {
    await rpc('place_trade', { p_type: type, p_asset: id, p_side: side, p_shares: shares });
    await loadUser();
    emit();
  },
  async myRecentVotes() {
    const { data } = await supabase.from('votes').select('*').order('created_at', { ascending: false }).limit(50);
    return data ?? [];
  },
};

// ---------------------------------------------------------------- candles
const toBar = (b, tz) => ({
  time: wallSeconds(new Date(b.ts), tz),
  open: Number(b.open),
  high: Number(b.high),
  low: Number(b.low),
  close: Number(b.close),
  volume: b.volume,
});

function regroup(bars, seconds) {
  const out = [];
  for (const b of bars) {
    const t = Math.floor(b.time / seconds) * seconds;
    const last = out[out.length - 1];
    if (last && last.time === t) {
      last.high = Math.max(last.high, b.high);
      last.low = Math.min(last.low, b.low);
      last.close = b.close;
      last.volume += b.volume;
    } else out.push({ ...b, time: t });
  }
  return out;
}

/** Index candles: forward-fill each model's last close across the union of times. */
function combine(seriesById, weights) {
  const ids = Object.keys(seriesById);
  const times = [...new Set(ids.flatMap((id) => seriesById[id].map((b) => b.time)))].sort((a, b) => (a < b ? -1 : 1));
  const idx = Object.fromEntries(ids.map((id) => [id, 0]));
  const last = Object.fromEntries(ids.map((id) => [id, seriesById[id][0]?.open ?? s.models[id].current_price]));
  return times.map((t) => {
    const c = { time: t, open: 0, high: 0, low: 0, close: 0, volume: 0 };
    for (const id of ids) {
      const w = weights[id];
      const arr = seriesById[id];
      const b = arr[idx[id]]?.time === t ? arr[idx[id]++] : null;
      if (b) {
        c.open += w * b.open; c.high += w * b.high; c.low += w * b.low; c.close += w * b.close; c.volume += b.volume;
        last[id] = b.close;
      } else {
        const p = last[id];
        c.open += w * p; c.high += w * p; c.low += w * p; c.close += w * p;
      }
    }
    return c;
  });
}

async function fetchCandles(type, id, tf) {
  const ids = type === 'company' ? s.companies[id].modelIds : [id];
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const per = {};
  if (tf === '1D' || tf === '1W') {
    const since = new Date(Date.now() - (tf === '1D' ? 3 : 8) * 86400_000).toISOString();
    const { data } = await supabase.from('bars').select('*').in('model_id', ids).gte('ts', since).order('ts').limit(10000);
    for (const x of ids) per[x] = [];
    for (const b of data ?? []) per[b.model_id].push(toBar(b, tz));
    if (tf === '1W') for (const x of ids) per[x] = regroup(per[x], 1800);
  } else {
    const days = tf === '1M' ? 31 : 93;
    const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
    const { data } = await supabase.from('candles').select('*').in('model_id', ids).gte('date', since).order('date');
    for (const x of ids) per[x] = [];
    for (const c of data ?? [])
      per[c.model_id].push({ time: c.date, open: +c.open, high: +c.high, low: +c.low, close: +c.close, volume: c.volume });
    // today's live candle
    if (s.state.phase === 'open') {
      const { data: bars } = await supabase.from('bars').select('*').in('model_id', ids).gte('ts', s.state.opened_at).order('ts');
      for (const x of ids) {
        const bs = (bars ?? []).filter((b) => b.model_id === x);
        if (!bs.length) continue;
        per[x].push({
          time: s.state.session_date,
          open: +bs[0].open,
          high: Math.max(...bs.map((b) => +b.high)),
          low: Math.min(...bs.map((b) => +b.low)),
          close: +bs[bs.length - 1].close,
          volume: bs.reduce((a, b) => a + b.volume, 0),
        });
      }
    }
  }
  if (type === 'company') {
    const w = Object.fromEntries(ids.map((x) => [x, s.models[x].index_weight]));
    return combine(per, w);
  }
  return per[id];
}

/** Live candles for a chart; refetches when a relevant bar changes. */
export function useCandles(type, id, tf) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    let timer = null;
    const load = () => fetchCandles(type, id, tf).then((d) => alive && setData({ key: `${type}:${id}:${tf}`, bars: d }));
    load();
    const ids = type === 'company' ? s.companies[id].modelIds : [id];
    const onBar = (b) => {
      if (!ids.includes(b.model_id)) return;
      clearTimeout(timer);
      timer = setTimeout(load, 400);
    };
    barListeners.add(onBar);
    return () => {
      alive = false;
      clearTimeout(timer);
      barListeners.delete(onBar);
    };
  }, [type, id, tf, s.state?.phase]);
  return data;
}

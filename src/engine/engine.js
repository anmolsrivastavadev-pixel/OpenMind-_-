// The simulated market backend.
//
// In production this is the scheduled backend job + WebSocket server
// (see supabase/schema.sql and README). For the Phase-1 prototype it runs in
// the browser so the UI can be reviewed without any infrastructure:
//   - tick()        = the "every few seconds" price job, pushes live updates
//   - doClose()     = 8 PM job: lock close, write daily candle, start queue
//   - doOpen()      = 8 AM job: apply queue as one capped gap, open new candle
//   - subscribe()   = the WebSocket channel the UI listens to
import { MARKET, RATING_WEIGHT, RATE_LIMIT, STARTING_CASH, accountAgeFactor } from './config.js';
import { marketDate, realStatus, wallSeconds, addDays, secondsToNextTransition } from './clock.js';
import { tickPct, gapPct, round2, companyIndex, emptyBucket, addToBucket } from './pricing.js';
import { buildSeedState, aggregate, gauss, poisson, sampleRating } from './seed.js';

const STORAGE_KEY = 'aimarket:v1';
const DAY_MS = 86_400_000;

export function createEngine({ storage = globalThis.localStorage, now = () => new Date(), rand = Math.random } = {}) {
  let state = load() ?? buildSeedState(now());
  // Live (not yet applied) votes collected between ticks.
  let pending = Object.fromEntries(Object.keys(state.models).map((id) => [id, emptyBucket()]));
  const listeners = new Set();
  const recentVoteTimes = [];
  let version = 0;
  let timer = null;
  let lastSave = 0;

  // ---------- persistence ----------
  function load() {
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      return s.version === 1 ? s : null;
    } catch {
      return null;
    }
  }
  function save(force = false) {
    const t = Date.now();
    if (!force && t - lastSave < 10_000) return;
    lastSave = t;
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full or unavailable: the prototype keeps running in memory */
    }
  }

  function emit() {
    version++;
    for (const fn of listeners) fn(version);
  }

  // ---------- status ----------
  function status() {
    return state.clockMode === 'live' ? realStatus(now()) : state.clockMode;
  }

  function syncPhase() {
    const st = status();
    if (state.phase === 'open' && st !== 'open') doClose();
    else if (state.phase === 'closed' && st === 'open') doOpen();
    else if (state.phase === 'open' && state.sessionDate !== marketDate(now())) {
      // App slept through a whole close/open cycle while "open".
      doClose();
      doOpen();
    }
  }

  // ---------- 8 PM: lock the close ----------
  function doClose() {
    for (const id of Object.keys(state.models)) {
      flushPending(id);
      const bars = state.intraday[id].filter((b) => barDate(b.time) === state.sessionDate);
      if (bars.length) upsertDaily(id, aggregate(state.sessionDate, bars));
      state.queue[id] = emptyBucket();
    }
    state.phase = 'closed';
    state.closedAt = now().getTime();
    save(true);
  }

  // ---------- 8 AM: apply the queue as one capped gap ----------
  function doOpen() {
    const today = marketDate(now());
    for (const [id, m] of Object.entries(state.models)) {
      // re-opening the same date (demo clock) resumes that day's candle
      state.daily[id] = state.daily[id].filter((d) => d.time !== today);
      const last = state.daily[id][state.daily[id].length - 1];
      const g = gapPct(state.queue[id].net);
      m.prevClose = last ? last.close : m.price;
      m.price = round2(m.price * (1 + g));
      m.lastGap = g;
      m.lastGapVotes = state.queue[id].count;
      state.queue[id] = emptyBucket();
      state.todayVotes[id] = emptyBucket();
      m.bias = m.nightBias * 0.6 + gauss(rand) * 0.03; // the night mood carries into the day
    }
    for (const v of state.votes) if (!v.applied) v.applied = true;
    state.phase = 'open';
    state.sessionDate = today;
    state.openedAt = now().getTime();
    pruneIntraday();
    save(true);
  }

  function upsertDaily(id, candle) {
    const arr = state.daily[id];
    const i = arr.findIndex((d) => d.time === candle.time);
    if (i >= 0) arr[i] = candle;
    else arr.push(candle);
    arr.sort((a, b) => (a.time < b.time ? -1 : 1));
  }

  function pruneIntraday() {
    // keep the last 6 session dates of 5-minute bars
    for (const id of Object.keys(state.intraday)) {
      const dates = [...new Set(state.intraday[id].map((b) => barDate(b.time)))];
      const keep = new Set(dates.slice(-6));
      state.intraday[id] = state.intraday[id].filter((b) => keep.has(barDate(b.time)));
    }
  }

  // ---------- live tick ----------
  function simulateCrowd() {
    const open = state.phase === 'open';
    for (const [id, m] of Object.entries(state.models)) {
      // moods drift (mean-reverting) with rare shocks, like news
      m.bias += -0.01 * m.bias + gauss(rand) * 0.005;
      m.nightBias += -0.002 * m.nightBias + gauss(rand) * 0.004;
      if (rand() < 0.0008) m.bias += gauss(rand) * 0.15;
      const lambda = open ? m.pop : m.pop * 0.15;
      const n = poisson(rand, lambda);
      const target = open ? pending[id] : state.queue[id];
      const mood = open ? m.bias : m.nightBias;
      for (let i = 0; i < n; i++) addToBucket(target, sampleRating(rand, mood), 1);
    }
  }

  function flushPending(id) {
    const p = pending[id];
    if (!p.count) return;
    const m = state.models[id];
    const pct = tickPct(p.net);
    m.price = Math.max(0.01, round2(m.price * (1 + pct)));
    const t = Math.floor(wallSeconds(now()) / (MARKET.barMinutes * 60)) * MARKET.barMinutes * 60;
    const bars = state.intraday[id];
    const last = bars[bars.length - 1];
    if (!last || last.time < t) {
      const open = last && barDate(last.time) === barDate(t) ? last.close : m.price / (1 + pct);
      bars.push({ time: t, open: round2(open), high: round2(Math.max(open, m.price)), low: round2(Math.min(open, m.price)), close: m.price, volume: p.count });
    } else {
      last.close = m.price;
      last.high = Math.max(last.high, m.price);
      last.low = Math.min(last.low, m.price);
      last.volume += p.count;
    }
    const tv = state.todayVotes[id];
    tv.net += p.net;
    tv.count += p.count;
    tv.pos += p.pos;
    tv.neg += p.neg;
    tv.neutral += p.neutral;
    pending[id] = emptyBucket();
  }

  function tick() {
    syncPhase();
    simulateCrowd();
    if (state.phase === 'open') {
      for (const id of Object.keys(state.models)) flushPending(id);
      for (const v of state.votes) if (!v.applied && v.date === state.sessionDate) v.applied = true;
    }
    save();
    emit();
  }

  // ---------- auth (simulated) ----------
  async function hash(s) {
    const data = new TextEncoder().encode(s);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function signup({ name, email, password, honeypot, challengeOk }) {
    if (honeypot) throw new Error('Signup blocked.');
    if (!challengeOk) throw new Error('Please solve the bot check.');
    email = email.trim().toLowerCase();
    if (!name.trim() || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a name and a valid email.');
    if (password.length < 6) throw new Error('Password must be at least 6 characters.');
    if (Object.values(state.users).some((u) => u.email === email)) throw new Error('That email already has an account.');
    const id = 'u_' + Math.random().toString(36).slice(2, 10);
    state.users[id] = {
      id,
      name: name.trim(),
      email,
      passHash: await hash(password),
      cashBalance: STARTING_CASH,
      streak: 0,
      bestStreak: 0,
      lastVoteDate: null,
      createdAt: now().getTime(),
    };
    state.sessionUserId = id;
    save(true);
    emit();
    return state.users[id];
  }

  async function login({ email, password }) {
    email = email.trim().toLowerCase();
    const u = Object.values(state.users).find((x) => x.email === email);
    if (!u || u.passHash !== (await hash(password))) throw new Error('Wrong email or password.');
    state.sessionUserId = u.id;
    save(true);
    emit();
    return u;
  }

  function logout() {
    state.sessionUserId = null;
    save(true);
    emit();
  }

  const currentUser = () => (state.sessionUserId ? state.users[state.sessionUserId] : null);

  function voteWeight(user) {
    const ageDays = (now().getTime() - user.createdAt) / DAY_MS;
    return accountAgeFactor(ageDays);
  }

  // ---------- voting ----------
  function myVote(modelId, date = marketDate(now())) {
    const u = currentUser();
    if (!u) return null;
    return state.votes.find((v) => v.userId === u.id && v.modelId === modelId && v.date === date) ?? null;
  }

  function vote(modelId, ratingKey, tags = []) {
    const u = currentUser();
    if (!u) throw new Error('Log in to vote.');
    if (!state.models[modelId]) throw new Error('Unknown model.');
    if (!(ratingKey in RATING_WEIGHT)) throw new Error('Unknown rating.');
    const date = marketDate(now());
    if (myVote(modelId, date)) throw new Error('You already voted on this model today.');
    const t = Date.now();
    while (recentVoteTimes.length && t - recentVoteTimes[0] > RATE_LIMIT.windowMs) recentVoteTimes.shift();
    if (recentVoteTimes.length >= RATE_LIMIT.votes) throw new Error('Slow down: too many votes in the last minute.');
    recentVoteTimes.push(t);

    const factor = voteWeight(u);
    const w = RATING_WEIGHT[ratingKey];
    const open = state.phase === 'open';
    addToBucket(open ? pending[modelId] : state.queue[modelId], w, factor);
    const v = {
      id: 'v_' + Math.random().toString(36).slice(2, 10),
      userId: u.id,
      modelId,
      date,
      rating: ratingKey,
      weight: w,
      factor,
      tags: tags.slice(0, 5),
      applied: false,
      queued: !open,
      time: now().getTime(),
    };
    state.votes.push(v);

    // daily streak (market-local calendar days)
    if (u.lastVoteDate !== date) {
      u.streak = u.lastVoteDate === addDays(date, -1) ? u.streak + 1 : 1;
      u.bestStreak = Math.max(u.bestStreak, u.streak);
      u.lastVoteDate = date;
    }
    save(true);
    emit();
    return v;
  }

  // ---------- investing (virtual) ----------
  function assetPrice(type, id) {
    return type === 'company' ? companyPrice(id) : state.models[id]?.price;
  }

  function trade(side, type, id, shares) {
    const u = currentUser();
    if (!u) throw new Error('Log in to trade.');
    if (state.phase !== 'open') throw new Error('Market is closed. Trading opens at 8:00 AM.');
    shares = Math.floor(Number(shares));
    if (!(shares > 0)) throw new Error('Enter a whole number of shares.');
    const price = assetPrice(type, id);
    if (!price) throw new Error('Unknown asset.');
    let h = state.holdings.find((x) => x.userId === u.id && x.assetType === type && x.assetId === id);
    const cost = round2(price * shares);
    if (side === 'buy') {
      if (cost > u.cashBalance) throw new Error('Not enough virtual cash.');
      if (!h) {
        h = { userId: u.id, assetType: type, assetId: id, shares: 0, avgBuyPrice: 0 };
        state.holdings.push(h);
      }
      h.avgBuyPrice = round2((h.avgBuyPrice * h.shares + cost) / (h.shares + shares));
      h.shares += shares;
      u.cashBalance = round2(u.cashBalance - cost);
    } else {
      if (!h || h.shares < shares) throw new Error('You do not own that many shares.');
      h.shares -= shares;
      u.cashBalance = round2(u.cashBalance + cost);
      if (h.shares === 0) state.holdings = state.holdings.filter((x) => x !== h);
    }
    state.trades.push({ id: 't_' + Math.random().toString(36).slice(2, 10), userId: u.id, assetType: type, assetId: id, side, shares, price, time: now().getTime() });
    save(true);
    emit();
  }

  function holding(type, id) {
    const u = currentUser();
    return u ? state.holdings.find((x) => x.userId === u.id && x.assetType === type && x.assetId === id) ?? null : null;
  }

  // ---------- derived views ----------
  function companyModels(cid) {
    return state.companies[cid].modelIds.map((id) => state.models[id]);
  }
  function companyPrice(cid) {
    return companyIndex(companyModels(cid));
  }
  function companyPrevClose(cid) {
    return round2(companyModels(cid).reduce((s, m) => s + m.indexWeight * m.prevClose, 0));
  }

  function quote(type, id) {
    const price = type === 'company' ? companyPrice(id) : state.models[id].price;
    const prev = type === 'company' ? companyPrevClose(id) : state.models[id].prevClose;
    const change = round2(price - prev);
    return { price, prev, change, pct: prev ? change / prev : 0 };
  }

  /** Candles for a model or company at a chart timeframe. */
  function candles(type, id, tf) {
    const ids = type === 'company' ? state.companies[id].modelIds : [id];
    const weights = type === 'company' ? ids.map((x) => state.models[x].indexWeight) : [1];
    let series;
    if (tf === '1D' || tf === '1W') {
      const bucket = tf === '1D' ? MARKET.barMinutes * 60 : 30 * 60;
      series = ids.map((x) => regroup(state.intraday[x], bucket));
    } else {
      series = ids.map((x) => {
        const d = [...state.daily[x]];
        if (state.phase === 'open') {
          const live = state.intraday[x].filter((b) => barDate(b.time) === state.sessionDate);
          if (live.length) d.push(aggregate(state.sessionDate, live));
        }
        return d.slice(tf === '1M' ? -22 : -66);
      });
    }
    return type === 'company' ? combine(series, weights) : series[0];
  }

  function sentiment(modelId) {
    return { today: state.todayVotes[modelId], queue: state.queue[modelId] };
  }
  function companySentiment(cid) {
    const q = emptyBucket();
    for (const id of state.companies[cid].modelIds) {
      const b = state.queue[id];
      q.net += b.net; q.count += b.count; q.pos += b.pos; q.neg += b.neg; q.neutral += b.neutral;
    }
    return { queue: q };
  }

  function userStats(userId) {
    const votes = state.votes.filter((v) => v.userId === userId);
    const byRating = {};
    for (const v of votes) byRating[v.rating] = (byRating[v.rating] ?? 0) + 1;
    const models = new Set(votes.map((v) => v.modelId));
    return { total: votes.length, byRating, modelsRated: models.size, recent: votes.slice(-15).reverse() };
  }

  // ---------- demo controls (prototype only) ----------
  function setClockMode(mode) {
    state.clockMode = mode;
    syncPhase();
    save(true);
    emit();
  }
  function ageAccount(days) {
    const u = currentUser();
    if (!u) return;
    u.createdAt -= days * DAY_MS;
    save(true);
    emit();
  }
  function reset() {
    const users = state.users;
    const sid = state.sessionUserId;
    state = buildSeedState(now(), Math.floor(Math.random() * 1e9));
    state.users = users;
    state.sessionUserId = sid;
    for (const u of Object.values(users)) {
      u.cashBalance = STARTING_CASH;
      u.streak = 0;
      u.lastVoteDate = null;
    }
    pending = Object.fromEntries(Object.keys(state.models).map((id) => [id, emptyBucket()]));
    save(true);
    emit();
  }

  function start() {
    if (timer) return;
    syncPhase();
    timer = setInterval(tick, MARKET.tickMs);
    emit();
  }
  function stop() {
    clearInterval(timer);
    timer = null;
    save(true);
  }

  return {
    get state() { return state; },
    get version() { return version; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    start, stop, tick, doOpen, doClose,
    status,
    countdown: () => (state.clockMode === 'live' ? secondsToNextTransition(now()) : null),
    signup, login, logout, currentUser, voteWeight,
    vote, myVote,
    trade, holding, assetPrice,
    quote, candles, sentiment, companySentiment, companyPrice, companyModels, userStats,
    setClockMode, ageAccount, reset,
  };
}

// ---------- helpers ----------
export function barDate(wallSec) {
  return new Date(wallSec * 1000).toISOString().slice(0, 10);
}

function regroup(bars, seconds) {
  if (seconds === MARKET.barMinutes * 60) return bars;
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

/** Weighted index candles from per-model series that share timestamps. */
function combine(seriesList, weights) {
  const map = new Map();
  seriesList.forEach((series, i) => {
    const w = weights[i];
    for (const b of series) {
      const cur = map.get(b.time) ?? { time: b.time, open: 0, high: 0, low: 0, close: 0, volume: 0, n: 0 };
      cur.open += w * b.open;
      cur.high += w * b.high;
      cur.low += w * b.low;
      cur.close += w * b.close;
      cur.volume += b.volume;
      cur.n++;
      map.set(b.time, cur);
    }
  });
  return [...map.values()]
    .filter((c) => c.n === seriesList.length)
    .sort((a, b) => (a.time < b.time ? -1 : 1))
    .map(({ n, ...c }) => ({ ...c, open: round2(c.open), high: round2(c.high), low: round2(c.low), close: round2(c.close) }));
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { engine, useMarket } from './store.js';
import MarketStatus from './components/MarketStatus.jsx';
import Watchlist from './components/Watchlist.jsx';
import MarketHome from './pages/MarketHome.jsx';
import ModelPage from './pages/ModelPage.jsx';
import CompanyPage from './pages/CompanyPage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import { marketDate } from './engine/clock.js';
import { fmtPct } from './format.js';

export default function App() {
  const [toasts, setToasts] = useState([]);
  const notify = useCallback((text, kind = 'info') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  useOpenCloseAlerts(notify);

  return (
    <div className="h-full flex flex-col">
      <TopBar />
      <ReturnPrompt />
      <main className="flex-1 min-h-0 flex">
        <Routes>
          <Route path="/" element={<MarketHome />} />
          <Route path="/watchlist" element={<Watchlist className="flex-1" />} />
          <Route path="/m/:modelId" element={<ModelPage notify={notify} />} />
          <Route path="/c/:companyId" element={<CompanyPage notify={notify} />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<div className="p-8 text-mute">Not found. <Link className="text-accent" to="/">Back to market</Link></div>} />
        </Routes>
      </main>
      <MobileNav />
      <div className="fixed z-50 bottom-20 lg:bottom-4 right-4 left-4 sm:left-auto flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="panel rounded px-3 py-2 shadow-xl text-white max-w-sm pointer-events-auto border-l-2 border-l-accent">
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

/** "Market open" alert when the session opens (and the close lock). */
function useOpenCloseAlerts(notify) {
  const m = useMarket();
  const prev = useRef(m.state.phase);
  useEffect(() => {
    const ph = m.state.phase;
    if (prev.current !== ph) {
      if (ph === 'open') {
        const movers = Object.values(m.state.models).sort((a, b) => Math.abs(b.lastGap) - Math.abs(a.lastGap));
        const g = movers[0];
        notify(`Market open: overnight votes applied. Biggest gap ${g.ticker} ${fmtPct(g.lastGap)}`);
      } else {
        notify('Market closed: prices locked. Votes now queue for the next open.');
      }
      prev.current = ph;
    }
  });
}

function TopBar() {
  const m = useMarket();
  const user = m.currentUser();
  const nav = useNavigate();
  return (
    <header className="h-12 shrink-0 flex items-center gap-3 px-3 bg-panel border-b border-line">
      <Link to="/" className="flex items-center gap-2 shrink-0">
        <svg viewBox="0 0 32 32" className="w-7 h-7"><rect width="32" height="32" rx="6" fill="#1e222d" /><path d="M7 22l6-7 4 4 8-10" stroke="#089981" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span className="font-bold text-white text-[15px] tracking-tight">AI Market</span>
      </Link>
      <nav className="hidden lg:flex items-center gap-1 ml-2">
        <TopLink to="/">Market</TopLink>
        <span className="btn text-mute cursor-default" title="Phase 3">Portfolio</span>
        <span className="btn text-mute cursor-default" title="Phase 3">Leaderboard</span>
      </nav>
      <div className="flex-1" />
      <div className="hidden sm:block"><MarketStatus /></div>
      <div className="sm:hidden"><MarketStatus compact /></div>
      <ClockSelect />
      {user ? (
        <button onClick={() => nav('/profile')} className="flex items-center gap-2 h-8 pl-1 pr-2 rounded hover:bg-hover">
          <span className="w-6 h-6 rounded-full bg-accent text-white grid place-items-center text-[11px] font-bold">{user.name[0]?.toUpperCase()}</span>
          <span className="hidden md:flex items-center gap-1 text-warn num" title="Daily voting streak"><Flame />{user.streak}</span>
        </button>
      ) : (
        <Link to="/login" className="btn-primary h-8">Log in</Link>
      )}
    </header>
  );
}

function TopLink({ to, children }) {
  return (
    <NavLink to={to} end className={({ isActive }) => `btn ${isActive ? 'text-white bg-hover' : 'text-mute hover:text-txt hover:bg-hover'}`}>
      {children}
    </NavLink>
  );
}

/** Prototype-only control so reviewers can see every market state. */
function ClockSelect() {
  const m = useMarket();
  return (
    <select
      title="Demo clock (prototype only)"
      value={m.state.clockMode}
      onChange={(e) => m.setClockMode(e.target.value)}
      className="hidden md:block h-7 rounded bg-panel2 border border-dashed border-warn/60 text-warn text-[12px] px-1.5 outline-none"
    >
      <option value="live">Clock: live</option>
      <option value="open">Demo: force open</option>
      <option value="afterhours">Demo: after-hours</option>
      <option value="weekend">Demo: weekend</option>
    </select>
  );
}

/** Streak / come-back prompt. */
function ReturnPrompt() {
  const m = useMarket();
  const loc = useLocation();
  const user = m.currentUser();
  const [hidden, setHidden] = useState(false);
  if (hidden || !user || loc.pathname === '/login') return null;
  const today = marketDate();
  if (user.lastVoteDate === today) return null;
  const text = user.streak > 0
    ? `Vote today to keep your ${user.streak}-day streak alive.`
    : 'Cast your first vote today to start a streak.';
  return (
    <div className="shrink-0 flex items-center gap-2 px-3 h-8 bg-warn/10 border-b border-warn/30 text-[12px] text-warn">
      <Flame /> <span className="truncate">{text}</span>
      <button className="ml-auto text-mute hover:text-txt" onClick={() => setHidden(true)} aria-label="Dismiss">✕</button>
    </div>
  );
}

export function Flame({ className = 'w-3.5 h-3.5' }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden>
      <path d="M8.5 1s.6 2.3-.9 4.1C6.3 6.6 5 7.6 5 9.7A3.4 3.4 0 0 0 8.4 13c1.9 0 3.6-1.4 3.6-3.6 0-2.4-1.6-3.3-1.6-3.3s.1 1.5-.9 2.1C9.8 6.2 10.6 3.3 8.5 1Z" />
      <path d="M4 10c0 3 2 5 4.4 5S13 13.4 13 10.5" opacity=".35" />
    </svg>
  );
}

function MobileNav() {
  const m = useMarket();
  const lastModel = useRef('astra');
  const loc = useLocation();
  const match = loc.pathname.match(/^\/m\/(.+)/);
  if (match) lastModel.current = match[1];
  const item = (to, label, icon, end) => (
    <NavLink to={to} end={end} className={({ isActive }) => `flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] ${isActive ? 'text-white' : 'text-mute'}`}>
      {icon}
      {label}
    </NavLink>
  );
  return (
    <nav className="lg:hidden shrink-0 h-14 flex bg-panel border-t border-line pb-safe">
      {item('/watchlist', 'Watchlist', <IconList />)}
      {item(`/m/${lastModel.current}`, 'Chart', <IconChart />)}
      {item('/', 'Market', <IconCompass />, true)}
      {item(m.currentUser() ? '/profile' : '/login', m.currentUser() ? 'Profile' : 'Log in', <IconUser />)}
    </nav>
  );
}

const I = (d) => () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const IconList = I(<><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></>);
const IconChart = I(<><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M7 14l3-3 3 3 4-5" /></>);
const IconCompass = I(<><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" /></>);
const IconUser = I(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><circle cx="17" cy="7" r="2.5" /><path d="M17.5 13c2.3.3 3.7 1.9 4 4.5" /></>);

// expose for debugging in the console during review
if (typeof window !== 'undefined') window.aiMarket = engine;

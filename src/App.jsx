import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { configured, useMarket } from './store.js';
import MarketStatus from './components/MarketStatus.jsx';
import Watchlist from './components/Watchlist.jsx';
import MarketHome from './pages/MarketHome.jsx';
import ModelPage from './pages/ModelPage.jsx';
import CompanyPage from './pages/CompanyPage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import { Flame, IconChart, IconCompass, IconList, IconMenu, Logo } from './components/Icons.jsx';
import { exchangeDate } from './engine/clock.js';
import { fmtPct } from './format.js';

export default function App() {
  const m = useMarket();
  const [toasts, setToasts] = useState([]);
  const notify = useCallback((text) => {
    const id = Math.random();
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  if (!configured) return <Setup />;
  if (m.s.error) return <Centered title="Can't reach the market" body={m.s.error} />;
  if (!m.s.ready) return <Centered title="Loading market…" />;

  return (
    <div className="h-full flex flex-col">
      <OpenCloseAlerts notify={notify} />
      <TopBar />
      <StreakPrompt />
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
          <div key={t.id} className="rounded-lg bg-[#262626] px-3.5 py-2.5 shadow-2xl text-white max-w-sm">{t.text}</div>
        ))}
      </div>
    </div>
  );
}

function Centered({ title, body }) {
  return (
    <div className="h-full grid place-items-center p-6 text-center">
      <div>
        <div className="flex justify-center mb-3"><Logo /></div>
        <div className="text-white text-[16px]">{title}</div>
        {body && <div className="text-mute mt-1 text-[13px]">{body}</div>}
      </div>
    </div>
  );
}

function Setup() {
  return (
    <div className="h-full grid place-items-center p-6">
      <div className="panel rounded-xl p-6 max-w-md">
        <div className="flex items-center gap-2 mb-3"><Logo /><span className="text-white font-medium text-[16px]">AI Market setup</span></div>
        <p className="text-mute text-[13px]">
          Set <code className="text-txt">VITE_SUPABASE_URL</code> and <code className="text-txt">VITE_SUPABASE_ANON_KEY</code> (see README), then reload.
        </p>
      </div>
    </div>
  );
}

/** "Market open" / "Market closed" alerts when the session flips. */
function OpenCloseAlerts({ notify }) {
  const m = useMarket();
  const prev = useRef(m.s.state.phase);
  useEffect(() => {
    const ph = m.s.state.phase;
    if (prev.current === ph) return;
    prev.current = ph;
    if (ph === 'open') {
      const g = Object.values(m.s.models).sort((a, b) => Math.abs(b.last_gap) - Math.abs(a.last_gap))[0];
      notify(g && g.last_gap ? `Market open. Overnight votes applied: ${g.name} ${fmtPct(g.last_gap)}` : 'Market open. Go vote!');
    } else notify('Market closed. Prices locked; votes now queue for the next open.');
  });
  return null;
}

function TopBar() {
  const m = useMarket();
  const user = m.user();
  return (
    <header className="h-12 shrink-0 flex items-center gap-3 px-3 bg-bg border-b border-line">
      <Link to="/" className="flex items-center gap-2 shrink-0">
        <Logo />
        <span className="font-bold text-white text-[16px] tracking-tight">AI Market</span>
      </Link>
      <nav className="hidden lg:flex items-center gap-1 ml-3">
        <NavLink to="/" end className={({ isActive }) => `btn ${isActive ? 'text-white bg-hover' : 'text-mute hover:text-txt'}`}>Market</NavLink>
        <span className="btn text-[#555] cursor-default" title="Coming in Phase 3">Portfolio</span>
        <span className="btn text-[#555] cursor-default" title="Coming in Phase 3">Leaderboard</span>
      </nav>
      <div className="flex-1" />
      <div className="hidden sm:block"><MarketStatus /></div>
      {user ? (
        <Link to="/profile" className="hidden lg:flex items-center gap-2 h-8 pl-1 pr-2 rounded-full hover:bg-hover">
          <span className="w-7 h-7 rounded-full bg-accent text-white grid place-items-center text-[12px] font-bold">{user.name[0]?.toUpperCase()}</span>
          <span className="flex items-center gap-1 text-warn num" title="Daily voting streak"><Flame />{user.streak}</span>
        </Link>
      ) : (
        <Link to="/login" className="btn-primary h-8">Log in</Link>
      )}
    </header>
  );
}

function StreakPrompt() {
  const m = useMarket();
  const loc = useLocation();
  const user = m.user();
  const [hidden, setHidden] = useState(false);
  if (hidden || !user || loc.pathname === '/login') return null;
  if (user.last_vote_date === exchangeDate(m.s.config)) return null;
  return (
    <div className="shrink-0 flex items-center gap-2 px-3 h-8 bg-warn/10 text-[12px] text-warn">
      <Flame />
      <span className="truncate">{user.streak > 0 ? `Vote today to keep your ${user.streak}-day streak.` : 'Vote today to start a streak.'}</span>
      <button className="ml-auto text-mute hover:text-txt px-1" onClick={() => setHidden(true)} aria-label="Dismiss">✕</button>
    </div>
  );
}

function MobileNav() {
  const m = useMarket();
  const loc = useLocation();
  const lastModel = useRef(Object.keys(m.s.models)[0]);
  const match = loc.pathname.match(/^\/m\/(.+)/);
  if (match) lastModel.current = match[1];
  const item = (to, label, Icon, end) => (
    <NavLink to={to} end={end} className={({ isActive }) => `flex-1 flex flex-col items-center justify-center gap-1 text-[11px] ${isActive ? 'text-white' : 'text-mute'}`}>
      <Icon />
      {label}
    </NavLink>
  );
  return (
    <nav className="lg:hidden shrink-0 h-16 flex bg-bg border-t border-line pb-safe">
      {item('/watchlist', 'Watchlist', IconList)}
      {item(`/m/${lastModel.current}`, 'Chart', IconChart)}
      {item('/', 'Explore', IconCompass, true)}
      {item(m.user() ? '/profile' : '/login', m.user() ? 'Menu' : 'Log in', IconMenu)}
    </nav>
  );
}

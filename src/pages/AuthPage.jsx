import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, useMarket } from '../store.js';

const TURNSTILE = import.meta.env.VITE_TURNSTILE_SITE_KEY;

/** Cloudflare Turnstile bot check (enable "CAPTCHA protection" in Supabase Auth to enforce it). */
function Turnstile({ onToken }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!TURNSTILE) return;
    const render = () => window.turnstile?.render(ref.current, { sitekey: TURNSTILE, theme: 'dark', callback: onToken });
    if (window.turnstile) render();
    else {
      const sc = document.createElement('script');
      sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      sc.async = true;
      sc.onload = render;
      document.head.appendChild(sc);
    }
  }, []);
  return TURNSTILE ? <div ref={ref} /> : null;
}

export default function AuthPage() {
  const m = useMarket();
  const nav = useNavigate();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', website: '' });
  const [token, setToken] = useState(null);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    if (m.user()) nav('/', { replace: true });
  });

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setInfo('');
    if (form.website) return; // honeypot: silently ignore bots
    if (TURNSTILE && mode === 'signup' && !token) return setErr('Please complete the bot check.');
    setBusy(true);
    try {
      if (mode === 'signup') {
        if (!form.name.trim()) throw new Error('Enter your name.');
        await m.signup({ name: form.name.trim(), email: form.email.trim(), password: form.password, captchaToken: token });
        const { data } = await supabase.auth.getSession();
        if (!data.session) setInfo('Check your email to confirm your account, then log in.');
      } else {
        await m.login({ email: form.email.trim(), password: form.password });
      }
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto grid place-items-center p-4">
      <form onSubmit={submit} className="panel rounded-xl w-full max-w-sm p-6 space-y-3">
        <h1 className="text-white text-[22px] font-medium">{mode === 'signup' ? 'Create your account' : 'Log in'}</h1>
        <p className="text-mute text-[13px]">
          {mode === 'signup' ? 'Get $10,000 in virtual cash. Vote daily and build a streak.' : 'Log in to vote and trade.'}
        </p>
        {mode === 'signup' && (
          <div>
            <label className="label">Name</label>
            <input className="input mt-1" value={form.name} onChange={set('name')} autoComplete="name" />
          </div>
        )}
        <div>
          <label className="label">Email</label>
          <input className="input mt-1" type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input mt-1" type="password" minLength={6} value={form.password} onChange={set('password')} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required />
        </div>
        <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} className="hidden" aria-hidden name="website" />
        {mode === 'signup' && <Turnstile onToken={setToken} />}
        {err && <p className="text-down text-[13px]">{err}</p>}
        {info && <p className="text-up text-[13px]">{info}</p>}
        <button disabled={busy} className="btn-primary w-full h-10">{mode === 'signup' ? 'Sign up' : 'Log in'}</button>
        <p className="text-[13px] text-mute text-center">
          {mode === 'signup' ? 'Already have an account? ' : 'New here? '}
          <button type="button" className="text-accent" onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setErr(''); setInfo(''); }}>
            {mode === 'signup' ? 'Log in' : 'Create an account'}
          </button>
        </p>
      </form>
    </div>
  );
}

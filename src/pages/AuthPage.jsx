import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMarket } from '../store.js';

export default function AuthPage() {
  const m = useMarket();
  const nav = useNavigate();
  const [mode, setMode] = useState(Object.keys(m.state.users).length ? 'login' : 'signup');
  const [form, setForm] = useState({ name: '', email: '', password: '', website: '', answer: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const challenge = useMemo(() => {
    const a = 2 + Math.floor(Math.random() * 8);
    const b = 2 + Math.floor(Math.random() * 8);
    return { a, b };
  }, [mode]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (mode === 'signup') {
        await m.signup({
          name: form.name,
          email: form.email,
          password: form.password,
          honeypot: form.website,
          challengeOk: Number(form.answer) === challenge.a + challenge.b,
        });
      } else {
        await m.login({ email: form.email, password: form.password });
      }
      window.history.state?.idx > 0 ? nav(-1) : nav('/');
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto grid place-items-center p-4">
      <form onSubmit={submit} className="panel rounded-lg w-full max-w-sm p-5 space-y-3">
        <h1 className="text-white text-[20px] font-semibold">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h1>
        <p className="text-mute text-[12px]">
          {mode === 'signup' ? 'Start with $10,000 in virtual cash. Vote daily, build a streak.' : 'Log in to vote and trade.'}
        </p>
        {mode === 'signup' && (
          <div>
            <label className="label">Name</label>
            <input className="input mt-1" value={form.name} onChange={set('name')} autoComplete="name" />
          </div>
        )}
        <div>
          <label className="label">Email</label>
          <input className="input mt-1" type="email" value={form.email} onChange={set('email')} autoComplete="email" />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input mt-1" type="password" value={form.password} onChange={set('password')} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
        </div>
        {mode === 'signup' && (
          <>
            {/* honeypot: hidden from people, bots tend to fill it */}
            <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} className="hidden" aria-hidden name="website" />
            <div>
              <label className="label">Bot check: what is {challenge.a} + {challenge.b}?</label>
              <input className="input mt-1 num" inputMode="numeric" value={form.answer} onChange={set('answer')} />
            </div>
          </>
        )}
        {err && <p className="text-down text-[12px]">{err}</p>}
        <button disabled={busy} className="btn-primary w-full h-10">{mode === 'signup' ? 'Sign up' : 'Log in'}</button>
        <p className="text-[12px] text-mute text-center">
          {mode === 'signup' ? 'Already have an account? ' : 'New here? '}
          <button type="button" className="text-accent" onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setErr(''); }}>
            {mode === 'signup' ? 'Log in' : 'Create an account'}
          </button>
        </p>
        <p className="text-[11px] text-mute text-center">Prototype: accounts are stored only in this browser.</p>
      </form>
    </div>
  );
}

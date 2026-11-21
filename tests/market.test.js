// Integration tests against a running local Supabase (`npx supabase start`).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

// Defaults are the public, well-known keys of the LOCAL Supabase dev stack.
const API = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const DB = process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const db = new pg.Client({ connectionString: DB });
const q = async (sql, args) => (await db.query(sql, args)).rows;
const run = Date.now().toString(36);

async function user(name) {
  const c = createClient(API, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signUp({ email: `${name}-${run}@test.dev`, password: 'secret123', options: { data: { name } } });
  if (error) throw error;
  return c;
}
const price = async (id) => Number((await q('select current_price from models where id=$1', [id]))[0].current_price);
const force = async (s) => {
  await q('update market_config set force_status=$1', [s]);
  return (await q('select public.market_tick() t'))[0].t;
};

before(async () => {
  await db.connect();
  await q("select cron.unschedule('market-tick')").catch(() => {});
});
after(async () => {
  await q('update market_config set force_status=null');
  await q("select cron.schedule('market-tick', '5 seconds', 'select public.market_tick()')");
  await db.end();
});

test('closed market: votes queue, price frozen, gap applied at open', async () => {
  await force('afterhours');
  const a = await user('ann');
  const b = await user('bob');
  const p0 = await price('gpt-5-2');
  const g0 = await price('gemini-3-pro');

  const { error: e1 } = await a.rpc('cast_vote', { p_model: 'gpt-5-2', p_rating: 2, p_tags: ['fast'] });
  assert.equal(e1, null);
  const { error: dup } = await a.rpc('cast_vote', { p_model: 'gpt-5-2', p_rating: -2 });
  assert.match(dup.message, /already voted/);
  await b.rpc('cast_vote', { p_model: 'gpt-5-2', p_rating: 1 });
  await b.rpc('cast_vote', { p_model: 'gemini-3-pro', p_rating: -2 });

  for (let i = 0; i < 3; i++) await q('select public.market_tick()');
  assert.equal(await price('gpt-5-2'), p0, 'frozen after close');
  const [m] = await q("select queue_count, queue_net from models where id='gpt-5-2'");
  assert.ok(m.queue_count >= 2);
  assert.equal(Number(m.queue_net), 0.75, 'new accounts weigh 0.25x: (2+1)*0.25');

  const { error: te } = await a.rpc('place_trade', { p_type: 'model', p_asset: 'gpt-5-2', p_side: 'buy', p_shares: 1 });
  assert.match(te.message, /closed/);

  const [{ g }] = await q('select public.move_pct($1, 0.025, 0.15) g', [m.queue_net]);
  assert.equal(await force('open'), 'open');
  const p1 = await price('gpt-5-2');
  assert.ok(Math.abs(p1 - Math.round(p0 * (1 + Number(g)) * 100) / 100) < 0.011, `gap ${p0} -> ${p1}`);
  assert.ok(p1 > p0);
  assert.ok((await price('gemini-3-pro')) < g0);
  const [{ n }] = await q('select count(*)::int n from votes where not applied');
  assert.equal(n, 0);
});

test('gap is capped at 15%', async () => {
  const [{ g }] = await q('select public.move_pct(1e12, 0.025, 0.15) g');
  assert.equal(Number(g), 0.15);
});

test('open market: votes move price live, bars build, trading works', async () => {
  await force('open');
  const c = await user('cat');
  const p0 = await price('claude-opus-5-5');
  await c.rpc('cast_vote', { p_model: 'claude-opus-5-5', p_rating: 2 });
  await q('select public.market_tick()');
  const p1 = await price('claude-opus-5-5');
  assert.ok(p1 > p0, `${p0} -> ${p1}`);
  const bars = await q("select * from bars where model_id='claude-opus-5-5' order by ts desc limit 1");
  assert.equal(Number(bars[0].close), p1);

  const { error } = await c.rpc('place_trade', { p_type: 'model', p_asset: 'claude-opus-5-5', p_side: 'buy', p_shares: 3 });
  assert.equal(error, null);
  const { data: prof } = await c.from('profiles').select('cash_balance').single();
  assert.ok(Math.abs(Number(prof.cash_balance) - (10000 - 3 * p1)) < 0.02);
  const { error: oversell } = await c.rpc('place_trade', { p_type: 'model', p_asset: 'claude-opus-5-5', p_side: 'sell', p_shares: 4 });
  assert.match(oversell.message, /own/);
  const { error: broke } = await c.rpc('place_trade', { p_type: 'company', p_asset: 'openai', p_side: 'buy', p_shares: 1 });
  assert.match(broke.message, /cash/, 'OpenAI index (~$14,000) costs more than the cash left');
});

test('privacy: users see only their own votes; prices cannot be edited directly', async () => {
  const d = await user('dan');
  await d.rpc('cast_vote', { p_model: 'grok-4-1', p_rating: 0 });
  const { data } = await d.from('votes').select('user_id');
  assert.equal(new Set(data.map((x) => x.user_id)).size, 1);
  await d.from('models').update({ current_price: 999 }).eq('id', 'grok-4-1');
  assert.notEqual(await price('grok-4-1'), 999);
  const anon = createClient(API, ANON, { auth: { persistSession: false } });
  const { data: none } = await anon.from('votes').select('*');
  assert.equal(none.length, 0);
  const { error: noTick } = await anon.rpc('market_tick');
  assert.ok(noTick, 'clients cannot run the price engine');
});

test('close writes daily candles', async () => {
  await force('open');
  await force('afterhours');
  const [{ phase, session_date }] = await q('select phase, session_date::text from market_state');
  assert.equal(phase, 'closed');
  const rows = await q('select count(*)::int n from candles where date=$1', [session_date]);
  assert.equal(rows[0].n, 16);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../src/engine/engine.js';
import { realStatus, secondsToNextTransition, marketDate } from '../src/engine/clock.js';
import { gapPct, tickPct } from '../src/engine/pricing.js';
import { accountAgeFactor } from '../src/engine/config.js';

// 2026-11-18 is a Wednesday. ET is UTC-5 in November.
const at = (iso) => new Date(iso);

test('market status follows 8AM–8PM ET, weekends closed', () => {
  assert.equal(realStatus(at('2026-11-18T14:00:00Z')), 'open'); // Wed 9:00 ET
  assert.equal(realStatus(at('2026-11-18T12:59:00Z')), 'afterhours'); // Wed 7:59 ET
  assert.equal(realStatus(at('2026-11-19T01:00:00Z')), 'afterhours'); // Wed 20:00 ET
  assert.equal(realStatus(at('2026-11-21T01:30:00Z')), 'weekend'); // Fri 20:30 ET
  assert.equal(realStatus(at('2026-11-21T18:00:00Z')), 'weekend'); // Sat
  assert.equal(realStatus(at('2026-11-23T12:00:00Z')), 'weekend'); // Mon 7:00 ET
  assert.equal(realStatus(at('2026-11-23T13:00:00Z')), 'open'); // Mon 8:00 ET
});

test('countdown points at the next transition', () => {
  assert.equal(secondsToNextTransition(at('2026-11-18T14:00:00Z')), 11 * 3600); // 9AM -> 8PM
  assert.equal(secondsToNextTransition(at('2026-11-21T13:00:00Z')), 2 * 86400); // Sat 8AM -> Mon 8AM
});

test('price impact scales with volume and the gap is capped', () => {
  assert.ok(Math.abs(tickPct(5000)) > Math.abs(tickPct(25)));
  assert.ok(tickPct(-100) < 0);
  assert.ok(gapPct(1e9) <= 0.15 && gapPct(-1e9) >= -0.15);
  assert.equal(accountAgeFactor(0.5), 0.25);
  assert.equal(accountAgeFactor(45), 1);
});

test('one vote per user per model per day; after-hours votes queue and gap at open', async () => {
  let clock = at('2026-11-18T14:00:00Z'); // Wed open
  const e = createEngine({ storage: null, now: () => clock });
  assert.equal(e.state.phase, 'open');
  await e.signup({ name: 'Ann', email: 'a@x.io', password: 'secret1', challengeOk: true });
  e.vote('astra', 'great', ['fast']);
  assert.throws(() => e.vote('astra', 'bad'), /already voted/);
  e.tick();
  assert.ok(e.state.votes[0].applied);

  clock = at('2026-11-19T02:00:00Z'); // Wed 21:00 ET
  e.tick();
  assert.equal(e.state.phase, 'closed');
  const frozen = e.state.models.sol.price;
  e.vote('sol', 'terrible');
  for (let i = 0; i < 50; i++) e.tick();
  assert.equal(e.state.models.sol.price, frozen, 'price frozen after close');
  assert.ok(e.state.queue.sol.count > 1);
  assert.throws(() => e.trade('buy', 'model', 'sol', 1), /closed/);

  // inject a strong positive queue so the gap is visible
  e.state.queue.sol.net = 1e7;
  clock = at('2026-11-19T13:00:00Z'); // Thu 8:00 ET
  e.tick();
  assert.equal(e.state.phase, 'open');
  assert.equal(e.state.sessionDate, '2026-11-19');
  const g = e.state.models.sol.price / frozen - 1;
  assert.ok(g > 0.14 && g <= 0.151 + 0.02, `gap ${g}`);
  assert.equal(e.state.daily.sol.at(-1).time, '2026-11-18');
});

test('buy/sell with virtual cash while open', async () => {
  const clock = at('2026-11-18T15:00:00Z');
  const e = createEngine({ storage: null, now: () => clock });
  await e.signup({ name: 'Bo', email: 'b@x.io', password: 'secret1', challengeOk: true });
  const p = e.state.models.lyra.price;
  e.trade('buy', 'model', 'lyra', 3);
  assert.equal(e.holding('model', 'lyra').shares, 3);
  assert.ok(Math.abs(e.currentUser().cashBalance - (10000 - 3 * p)) < 0.02);
  assert.throws(() => e.trade('sell', 'model', 'lyra', 5), /own/);
  e.trade('sell', 'model', 'lyra', 3);
  assert.equal(e.holding('model', 'lyra'), null);
  const idx = e.companyPrice('openai');
  assert.ok(idx > 10000 && idx < 18000, `index ${idx}`);
});

test('seeding on a weekend starts closed with a weekend queue', () => {
  const clock = at('2026-11-21T18:00:00Z');
  const e = createEngine({ storage: null, now: () => clock });
  assert.equal(e.state.phase, 'closed');
  assert.equal(e.state.sessionDate, '2026-11-20');
  assert.equal(marketDate(clock), '2026-11-21');
  assert.ok(e.state.queue.astra.count > 1000);
  assert.equal(e.candles('model', 'astra', '3M').length, 66);
  assert.ok(e.candles('company', 'openai', '1D').length > 100);
});

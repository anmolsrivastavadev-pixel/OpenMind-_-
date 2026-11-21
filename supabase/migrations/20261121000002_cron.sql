-- Run the price engine every 5 seconds (pg_cron 1.5+ supports second intervals).
create extension if not exists pg_cron;
select cron.schedule('market-tick', '5 seconds', $$select public.market_tick()$$);

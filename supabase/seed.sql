-- Real companies and their current model lineups.
-- Every model lists at $100.00: from here on only real votes move the price.
-- Company index = sum(model price x index_weight); weights set each company's starting index.
-- To list a new release later, insert into public.models (it starts at ipo_price).

insert into public.companies (id, name, ticker, color, sort) values
  ('openai',    'OpenAI',          'OPENAI', '#10a37f', 1),
  ('anthropic', 'Anthropic',       'ANTHRO', '#d97757', 2),
  ('google',    'Google DeepMind', 'GOOGL',  '#4285f4', 3),
  ('meta',      'Meta',            'META',   '#0866ff', 4),
  ('xai',       'xAI',             'XAI',    '#9ca3af', 5),
  ('deepseek',  'DeepSeek',        'DSEEK',  '#4d6bfe', 6),
  ('mistral',   'Mistral AI',      'MISTRL', '#fa520f', 7);

-- index_weight = company base index * share / 100
insert into public.models (id, company_id, name, ticker, index_weight, sort) values
  ('gpt-5-2',          'openai',    'GPT-5.2',            'GPT52',  84,  1),
  ('gpt-5-mini',       'openai',    'GPT-5 mini',         'GPT5M',  35,  2),
  ('gpt-oss-120b',     'openai',    'gpt-oss-120b',       'GPTOSS', 21,  3),
  ('claude-opus-5-5',  'anthropic', 'Claude Opus 5.5',    'OPUS',   60,  1),
  ('claude-sonnet-5-5','anthropic', 'Claude Sonnet 5.5',  'SONNET', 42,  2),
  ('claude-haiku-5-5', 'anthropic', 'Claude Haiku 5.5',   'HAIKU',  18,  3),
  ('gemini-3-pro',     'google',    'Gemini 3 Pro',       'GEM3P',  78,  1),
  ('gemini-3-flash',   'google',    'Gemini 3 Flash',     'GEM3F',  52,  2),
  ('llama-4-maverick', 'meta',      'Llama 4 Maverick',   'LLAMAM', 42,  1),
  ('llama-4-scout',    'meta',      'Llama 4 Scout',      'LLAMAS', 28,  2),
  ('grok-4-1',         'xai',       'Grok 4.1',           'GROK41', 49,  1),
  ('grok-code-fast',   'xai',       'Grok Code Fast 1',   'GROKCF', 21,  2),
  ('deepseek-v3-2',    'deepseek',  'DeepSeek V3.2',      'DSV32',  27,  1),
  ('deepseek-r1',      'deepseek',  'DeepSeek R1',        'DSR1',   18,  2),
  ('mistral-large-3',  'mistral',   'Mistral Large 3',    'MSLRG3', 24,  1),
  ('mistral-medium-3', 'mistral',   'Mistral Medium 3.1', 'MSMED',  16,  2);

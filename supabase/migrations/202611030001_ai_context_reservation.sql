-- Owner-approved 3 November 2026: conservative full-context reservations.
-- EUR0.50 question/review ceilings; EUR1 personal/global monthly caps unchanged.
-- Existing payload/output/history/row/tool/turn/privacy controls are unchanged.
-- This changes admission bounds only; never enables policy/funding/dispatch.
begin;

alter table moflight_ai.rounds drop constraint rounds_bound_micro_eur_check;
alter table moflight_ai.rounds add constraint rounds_bound_micro_eur_check check(bound_micro_eur between 0 and 500000);

create or replace function moflight_ai.valid_policy(p jsonb) returns boolean language plpgsql immutable set search_path=pg_catalog,moflight_ai,pg_temp as $$
declare k text; keys text[]; expected text[] := array['version','id','enabled','model','reasoning','zdrOnly','store','automaticRetries','routes','features','tools','systemPrompt',
 'personalCapMicroEur','globalCapMicroEur','questionCapMicroEur','reviewCapMicroEur','inputTokens','outputTokens','questionTurns','reviewTurns','questionTools','reviewTools','rowsPerRead'];
begin
  if jsonb_typeof(p)<>'object' then return false; end if;
  select array_agg(x order by x) into keys from jsonb_object_keys(p) x;
  if keys is distinct from (select array_agg(x order by x) from unnest(expected) x) then return false; end if;
  if p->'version'<>'1'::jsonb or jsonb_typeof(p->'id')<>'string' or p->>'id' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$'
    or jsonb_typeof(p->'enabled')<>'boolean' or p->'model'<>'"openai/gpt-6-luna"'::jsonb or p->'reasoning'<>'"max"'::jsonb
    or p->'zdrOnly'<>'true'::jsonb or p->'store'<>'false'::jsonb or p->'automaticRetries'<>'0'::jsonb or p->'routes'<>'["azure"]'::jsonb
    or jsonb_typeof(p->'systemPrompt')<>'string' or not(p->>'systemPrompt' ~ '[^[:space:]]') or octet_length(p->>'systemPrompt')>16000 then return false; end if;
  if jsonb_typeof(p->'features')<>'array' or jsonb_typeof(p->'tools')<>'array' or not (p->'features' <@ '["question","review","progress","term"]'::jsonb)
    or not(p->'tools' <@ '["describeDataset","resolveEntities","queryFlights","aggregateFlights","getFlightEvidence"]'::jsonb) then return false; end if;
  if jsonb_array_length(p->'features')<>(select count(distinct x) from jsonb_array_elements(p->'features') x)
    or jsonb_array_length(p->'tools')<>(select count(distinct x) from jsonb_array_elements(p->'tools') x) then return false; end if;
  foreach k in array array['personalCapMicroEur','globalCapMicroEur'] loop if not integer_in(p->k,0,1000000) then return false; end if; end loop;
  if not integer_in(p->'questionCapMicroEur',0,least(500000,(p->>'personalCapMicroEur')::bigint,(p->>'globalCapMicroEur')::bigint))
    or not integer_in(p->'reviewCapMicroEur',0,least(500000,(p->>'personalCapMicroEur')::bigint,(p->>'globalCapMicroEur')::bigint)) then return false; end if;
  return integer_in(p->'inputTokens',1,1050000) and integer_in(p->'outputTokens',1,16384) and integer_in(p->'questionTurns',1,6)
    and integer_in(p->'reviewTurns',1,16) and integer_in(p->'questionTools',1,12) and integer_in(p->'reviewTools',1,48) and integer_in(p->'rowsPerRead',1,200);
exception when others then return false;
end $$;

create or replace function moflight_ai.bound_for(p jsonb, r moflight_ai.prices) returns bigint language plpgsql stable set search_path=pg_catalog,moflight_ai,pg_temp as $$
declare amount numeric;
begin
  if r.id is null or not r.approved or not r.fees_covered or clock_timestamp()<r.valid_from or clock_timestamp()>=r.valid_until
    or r.input_nano_usd is null or r.cache_read_nano_usd is null or r.cache_write_nano_usd is null or r.output_nano_usd is null
    or r.request_nano_usd is null or r.gross_micro_eur_per_usd is null or r.margin_bps is null then raise exception 'Safe AI pricing unavailable'; end if;
  amount:=ceil(((p->>'inputTokens')::numeric*(r.input_nano_usd::numeric+r.cache_read_nano_usd+r.cache_write_nano_usd)
    +(p->>'outputTokens')::numeric*r.output_nano_usd+r.request_nano_usd)*r.gross_micro_eur_per_usd*(10000+r.margin_bps)/10000000000000);
  if amount>500000 then raise exception 'AI call exceeds safe bound'; end if;
  return amount::bigint;
end $$;

commit;

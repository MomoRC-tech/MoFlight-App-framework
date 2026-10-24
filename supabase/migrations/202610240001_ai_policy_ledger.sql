-- AI05/AI06. Apply only to an explicitly authorized backend. Defaults deny dispatch.
begin;
create schema moflight_ai;
revoke all on schema moflight_ai from public, anon, authenticated, service_role;

create table moflight_ai.policies (
  id text primary key, body jsonb not null, created_at timestamptz not null default clock_timestamp()
);
create table moflight_ai.prices (
  id text primary key check (id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$'),
  valid_from timestamptz not null, valid_until timestamptz not null check(valid_until > valid_from),
  input_nano_usd bigint check(input_nano_usd between 0 and 1000000000),
  cache_read_nano_usd bigint check(cache_read_nano_usd between 0 and 1000000000),
  cache_write_nano_usd bigint check(cache_write_nano_usd between 0 and 1000000000),
  output_nano_usd bigint check(output_nano_usd between 0 and 1000000000),
  request_nano_usd bigint check(request_nano_usd between 0 and 1000000000000),
  gross_micro_eur_per_usd bigint check(gross_micro_eur_per_usd between 1 and 1000000000),
  margin_bps integer check(margin_bps between 0 and 10000),
  fees_covered boolean not null default false, approved boolean not null default false,
  -- One frozen model/effort/route; changing these requires a reviewed schema/client update.
  model text not null default 'openai/gpt-6-luna' check(model='openai/gpt-6-luna'),
  reasoning text not null default 'max' check(reasoning='max'),
  route text not null default 'azure' check(route='azure'), zdr boolean not null default true check(zdr),
  evidence_ref text not null check(length(evidence_ref) between 1 and 200),
  created_at timestamptz not null default clock_timestamp()
);
create table moflight_ai.control (
  singleton boolean primary key default true check(singleton), epoch bigint not null default 0 check(epoch>=0),
  policy_id text references moflight_ai.policies, price_id text references moflight_ai.prices,
  kill boolean not null default true, operational_ready boolean not null default false,
  funding_approved boolean not null default false, halted boolean not null default false
);
insert into moflight_ai.control(singleton) values(true);
create table moflight_ai.audit (
  seq bigint generated always as identity primary key, at timestamptz not null default clock_timestamp(),
  actor text not null default session_user, action text not null, epoch bigint not null,
  object_id text, reason text not null check(reason ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$')
);
create table moflight_ai.accounts (
  account_ref text primary key check(account_ref ~ '^[0-9]{1,20}$'),
  billing_tag text not null unique default ('mf_' || translate(rtrim(encode(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()),'base64'),'='),'+/','-_'))
    check(billing_tag ~ '^mf_[A-Za-z0-9_-]{43}$'),
  enabled boolean not null default false, funded boolean not null default false
);
create table moflight_ai.attempts (
  id text primary key check(id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$'),
  account_ref text not null references moflight_ai.accounts, run_id text not null,
  conversation_id text not null, message_id text not null,
  feature text not null check(feature in ('question','review','progress','term')),
  policy_id text not null references moflight_ai.policies, period date not null,
  active boolean not null default true, terminal_requested boolean not null default false,
  created_at timestamptz not null default clock_timestamp(), closed_at timestamptz
);
create unique index one_active_ai_attempt_per_account on moflight_ai.attempts(account_ref) where active;
create table moflight_ai.rounds (
  attempt_id text not null references moflight_ai.attempts on delete cascade, round integer not null check(round between 0 and 15),
  digest text not null check(digest ~ '^[0-9a-f]{64}$'), price_id text not null references moflight_ai.prices,
  state text not null default 'intent' check(state in ('intent','unknown','settled')),
  bound_micro_eur bigint not null check(bound_micro_eur between 0 and 100000),
  actual_micro_eur bigint check(actual_micro_eur between 0 and 9007199254740991),
  actual_nano_usd bigint check(actual_nano_usd between 0 and 9007199254740991),
  usage_receipt text unique, created_at timestamptz not null default clock_timestamp(), settled_at timestamptz,
  primary key(attempt_id,round),
  check((state='settled') = (actual_micro_eur is not null and actual_nano_usd is not null and usage_receipt is not null and settled_at is not null))
);
create table moflight_ai.period_totals (
  scope text not null, period date not null, settled bigint not null default 0 check(settled>=0),
  reserved bigint not null default 0 check(reserved>=0), unknown bigint not null default 0 check(unknown>=0),
  primary key(scope,period), check(extract(day from period)=1)
);
-- Unlinked anti-replay hashes survive settled metadata cleanup; no account/cost/payload linkage.
create table moflight_ai.replay_tombstones(kind text not null check(kind in ('attempt','usage')), digest text not null, primary key(kind,digest));

create function moflight_ai.immutable_row() returns trigger language plpgsql set search_path=pg_catalog as $$
begin raise exception 'Immutable AI record'; end $$;
create trigger immutable_policy before update or delete on moflight_ai.policies for each row execute function moflight_ai.immutable_row();
create trigger immutable_price before update or delete on moflight_ai.prices for each row execute function moflight_ai.immutable_row();
create trigger immutable_audit before update or delete on moflight_ai.audit for each row execute function moflight_ai.immutable_row();

create function moflight_ai.integer_in(v jsonb, lo bigint, hi bigint) returns boolean language sql immutable set search_path=pg_catalog as $$
  select coalesce(jsonb_typeof(v)='number' and (v#>>'{}')::numeric=trunc((v#>>'{}')::numeric) and (v#>>'{}')::numeric between lo and hi,false)
$$;
create function moflight_ai.valid_policy(p jsonb) returns boolean language plpgsql immutable set search_path=pg_catalog,moflight_ai,pg_temp as $$
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
  if not integer_in(p->'questionCapMicroEur',0,least(50000,(p->>'personalCapMicroEur')::bigint,(p->>'globalCapMicroEur')::bigint))
    or not integer_in(p->'reviewCapMicroEur',0,least(100000,(p->>'personalCapMicroEur')::bigint,(p->>'globalCapMicroEur')::bigint)) then return false; end if;
  return integer_in(p->'inputTokens',1,32000) and integer_in(p->'outputTokens',1,16384) and integer_in(p->'questionTurns',1,6)
    and integer_in(p->'reviewTurns',1,16) and integer_in(p->'questionTools',1,12) and integer_in(p->'reviewTools',1,48) and integer_in(p->'rowsPerRead',1,200);
exception when others then return false;
end $$;
alter table moflight_ai.policies add constraint valid_ai_policy check(moflight_ai.valid_policy(body) and id=body->>'id');

create function moflight_ai.berlin_period(at_time timestamptz) returns date language sql stable set search_path=pg_catalog as $$
 select date_trunc('month', at_time at time zone 'Europe/Berlin')::date
$$;
create function moflight_ai.bound_for(p jsonb, r moflight_ai.prices) returns bigint language plpgsql stable set search_path=pg_catalog,moflight_ai,pg_temp as $$
declare amount numeric;
begin
  if r.id is null or not r.approved or not r.fees_covered or clock_timestamp()<r.valid_from or clock_timestamp()>=r.valid_until
    or r.input_nano_usd is null or r.cache_read_nano_usd is null or r.cache_write_nano_usd is null or r.output_nano_usd is null
    or r.request_nano_usd is null or r.gross_micro_eur_per_usd is null or r.margin_bps is null then raise exception 'Safe AI pricing unavailable'; end if;
  amount:=ceil(((p->>'inputTokens')::numeric*(r.input_nano_usd::numeric+r.cache_read_nano_usd+r.cache_write_nano_usd)
    +(p->>'outputTokens')::numeric*r.output_nano_usd+r.request_nano_usd)*r.gross_micro_eur_per_usd*(10000+r.margin_bps)/10000000000000);
  if amount>100000 then raise exception 'AI call exceeds safe bound'; end if;
  return amount::bigint;
end $$;

-- Dashboard/operator only: no grants to the relay or mobile roles.
create function public.moflight_ai_publish_policy(p jsonb, expected_epoch bigint, reason text) returns bigint language plpgsql security definer set search_path=pg_catalog,moflight_ai,pg_temp as $$
declare c control; begin
 select * into strict c from control where singleton for update;
 if c.epoch is distinct from expected_epoch or not valid_policy(p) then raise exception 'AI publication rejected'; end if;
 insert into policies(id,body) values(p->>'id',p);
 update control set policy_id=p->>'id',epoch=epoch+1 where singleton;
 insert into audit(action,epoch,object_id,reason) values('publish',c.epoch+1,p->>'id',reason);
 return c.epoch+1;
end $$;
create function public.moflight_ai_activate_policy(policy_id text, expected_epoch bigint, reason text) returns bigint language plpgsql security definer set search_path=pg_catalog,moflight_ai,pg_temp as $$
declare c control; begin
 select * into strict c from control where singleton for update;
 if c.epoch is distinct from expected_epoch or not exists(select 1 from policies p where p.id=policy_id) then raise exception 'AI activation rejected'; end if;
 update control set policy_id=moflight_ai_activate_policy.policy_id,epoch=epoch+1 where singleton;
 insert into audit(action,epoch,object_id,reason) values('activate',c.epoch+1,policy_id,reason); return c.epoch+1;
end $$;
create function public.moflight_ai_controls(expected_epoch bigint, kill boolean, operational_ready boolean, funding_approved boolean, price_id text, reason text)
returns bigint language plpgsql security definer set search_path=pg_catalog,moflight_ai,pg_temp as $$
declare c control; begin
 select * into strict c from control where singleton for update;
 if c.epoch is distinct from expected_epoch or kill is null or operational_ready is null or funding_approved is null then raise exception 'AI controls rejected'; end if;
 update control set kill=moflight_ai_controls.kill, operational_ready=moflight_ai_controls.operational_ready,
   funding_approved=moflight_ai_controls.funding_approved,price_id=moflight_ai_controls.price_id,epoch=epoch+1 where singleton;
 insert into audit(action,epoch,object_id,reason) values('controls',c.epoch+1,price_id,reason); return c.epoch+1;
end $$;
create function public.moflight_ai_account(account_ref text, enabled boolean, funded boolean, reason text) returns void language plpgsql security definer set search_path=pg_catalog,moflight_ai,pg_temp as $$
declare c control; begin
 select * into strict c from control where singleton for update;
 if enabled is null or funded is null then raise exception 'AI account controls rejected'; end if;
 insert into accounts(account_ref,enabled,funded) values(account_ref,enabled,funded)
   on conflict on constraint accounts_pkey do update set enabled=excluded.enabled,funded=excluded.funded;
 update control set epoch=epoch+1 where singleton;
 insert into audit(action,epoch,object_id,reason) values('account',c.epoch+1,null,reason);
end $$;

-- Internal scalar projection; no global/private-owner counters in mobile DTOs.
create function moflight_ai.available(scope_id text, target_period date, cap bigint) returns bigint language sql stable set search_path=pg_catalog,moflight_ai,pg_temp as $$
 select greatest(0,cap-coalesce((select settled from period_totals where scope=scope_id and period=target_period),0)
  -coalesce((select sum(reserved+unknown) from period_totals where scope=scope_id),0))::bigint
$$;
create function public.moflight_ai_usage(account_id text) returns jsonb language plpgsql security definer set search_path=pg_catalog,moflight_ai,pg_temp as $$
declare a accounts; p jsonb; month date; s bigint; r bigint; u bigint; cap bigint; begin
 select * into strict a from accounts where account_ref=account_id;
 select body into strict p from policies where id=(select policy_id from control where singleton);
 month:=berlin_period(clock_timestamp()); cap:=(p->>'personalCapMicroEur')::bigint;
 select coalesce(sum(settled) filter(where period=month),0),coalesce(sum(reserved),0),coalesce(sum(unknown),0) into s,r,u from period_totals where scope=a.billing_tag;
 return jsonb_build_object('period',to_char(month,'YYYY-MM'),'timezone','Europe/Berlin','capMicroEur',cap,'settledMicroEur',s,'reservedMicroEur',r,'unknownMicroEur',u,
  'remainingMicroEur',greatest(0,cap-s-r-u));
end $$;
create function public.moflight_ai_snapshot(account_id text) returns jsonb language plpgsql security definer set search_path=pg_catalog,moflight_ai,pg_temp as $$
declare a accounts; c control; p jsonb; begin
 select * into strict a from accounts where account_ref=account_id;
 select * into strict c from control where singleton;
 select body into strict p from policies where id=c.policy_id;
 return jsonb_build_object('policy',p,'billingTag',a.billing_tag,'enabled',a.enabled and a.funded and not c.kill and c.operational_ready and c.funding_approved and not c.halted,
   'epoch',c.epoch);
end $$;

create function public.moflight_ai_reserve(account_id text, attempt_id text, run_id text, conversation_id text, message_id text,
 feature text, round_number integer, policy_id text, request_digest text) returns jsonb language plpgsql security definer set search_path=pg_catalog,moflight_ai,pg_temp as $$
declare c control; a accounts; t attempts; prior rounds; pinned jsonb; current_policy jsonb; effective jsonb; price prices;
 month date; amount bigint; attempt_cap bigint; spent numeric; max_turns integer; key text;
begin
 select * into strict c from control where singleton for update;
 select * into strict a from accounts where account_ref=account_id;
 if attempt_id is null or attempt_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$' or run_id is null or run_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$'
   or conversation_id is null or conversation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$' or message_id is null or message_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$'
   or request_digest is null or request_digest !~ '^[0-9a-f]{64}$' or policy_id is null or policy_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$'
   or round_number is null or round_number<0 or feature is null or feature not in ('question','review','progress','term')
   then raise exception 'Invalid AI admission'; end if;
 select * into t from attempts where id=attempt_id;
 if t.id is not null then
   if t.account_ref<>account_id or t.run_id<>run_id or t.conversation_id<>conversation_id or t.message_id<>message_id or t.feature<>feature or t.policy_id<>policy_id
     then raise exception 'Foreign or changed AI attempt'; end if;
   select * into prior from rounds where rounds.attempt_id=t.id and round=round_number;
   if prior.attempt_id is not null then
     if prior.digest<>request_digest then raise exception 'Changed AI round'; end if;
     return jsonb_build_object('disposition','existing','state',prior.state,'boundMicroEur',prior.bound_micro_eur,'policyId',t.policy_id,'period',to_char(t.period,'YYYY-MM'));
   end if;
   if not t.active or t.terminal_requested then raise exception 'AI attempt closed'; end if;
 else
   if round_number<>0 or exists(select 1 from replay_tombstones where kind='attempt' and digest=encode(sha256(convert_to(attempt_id,'UTF8')),'hex')) then raise exception 'AI attempt replay rejected'; end if;
   if exists(select 1 from attempts where account_ref=account_id and active) then raise exception 'AI attempt already active'; end if;
   if policy_id is distinct from c.policy_id then raise exception 'Current AI policy changed'; end if;
 end if;
 if c.kill or not c.operational_ready or not c.funding_approved or c.halted or not a.enabled or not a.funded then raise exception 'AI dispatch disabled'; end if;
 select body into strict pinned from policies where id=policy_id;
 select body into strict current_policy from policies where id=c.policy_id;
 if not (pinned->>'enabled')::boolean or not (current_policy->>'enabled')::boolean or not(pinned->'features' ? feature) or not(current_policy->'features' ? feature)
   or not((pinned->'tools') <@ (current_policy->'tools')) then raise exception 'AI permission revoked'; end if;
 effective:=pinned;
 foreach key in array array['inputTokens','outputTokens','personalCapMicroEur','globalCapMicroEur','questionCapMicroEur','reviewCapMicroEur','questionTurns','reviewTurns','questionTools','reviewTools','rowsPerRead'] loop
   effective:=jsonb_set(effective,array[key],to_jsonb(least((pinned->>key)::bigint,(current_policy->>key)::bigint)));
 end loop;
 max_turns:=(effective->>case when feature='review' then 'reviewTurns' else 'questionTurns' end)::integer;
 if round_number>=max_turns or round_number<>(select count(*) from rounds where rounds.attempt_id=moflight_ai_reserve.attempt_id)
   or exists(select 1 from rounds where rounds.attempt_id=moflight_ai_reserve.attempt_id and state<>'settled') then raise exception 'AI round not ready'; end if;
 select * into price from prices where id=c.price_id;
 amount:=bound_for(effective,price);
 month:=coalesce(t.period,berlin_period(clock_timestamp()));
 attempt_cap:=(effective->>case when feature='review' then 'reviewCapMicroEur' else 'questionCapMicroEur' end)::bigint;
 select coalesce(sum(coalesce(actual_micro_eur,bound_micro_eur)),0) into spent from rounds where rounds.attempt_id=moflight_ai_reserve.attempt_id;
 if spent+amount>attempt_cap or amount>available('*',month,(effective->>'globalCapMicroEur')::bigint)
   or amount>available(a.billing_tag,month,(effective->>'personalCapMicroEur')::bigint) then raise exception 'AI budget exhausted'; end if;
 if t.id is null then
   insert into attempts(id,account_ref,run_id,conversation_id,message_id,feature,policy_id,period)
     values(attempt_id,account_id,run_id,conversation_id,message_id,feature,policy_id,month);
 end if;
 insert into rounds(attempt_id,round,digest,price_id,bound_micro_eur) values(attempt_id,round_number,request_digest,price.id,amount);
 insert into period_totals(scope,period,reserved) values('*',month,amount),(a.billing_tag,month,amount)
  on conflict(scope,period) do update set reserved=period_totals.reserved+excluded.reserved;
 return jsonb_build_object('disposition','new','state','intent','boundMicroEur',amount,'policyId',policy_id,'period',to_char(month,'YYYY-MM'),'policy',effective,'priceId',price.id);
end $$;

create function public.moflight_ai_unknown(account_id text, attempt_id text, run_id text, round_number integer) returns void language plpgsql security definer set search_path=pg_catalog,moflight_ai,pg_temp as $$
declare c control; t attempts; a accounts; r rounds; begin
 select * into strict c from control where singleton for update;
 select * into strict t from attempts where id=attempt_id and account_ref=account_id and attempts.run_id=moflight_ai_unknown.run_id;
 select * into strict a from accounts where account_ref=account_id;
 select * into strict r from rounds where rounds.attempt_id=t.id and round=round_number;
 if r.state='unknown' then return; end if;
 if r.state<>'intent' then raise exception 'Settled AI round cannot become unknown'; end if;
 update rounds set state='unknown' where rounds.attempt_id=t.id and round=round_number;
 update period_totals set reserved=reserved-r.bound_micro_eur,unknown=unknown+r.bound_micro_eur where scope in ('*',a.billing_tag) and period=t.period;
end $$;
create function public.moflight_ai_settle(account_id text, attempt_id text, run_id text, round_number integer, nano_usd bigint, usage_receipt text) returns jsonb language plpgsql security definer set search_path=pg_catalog,moflight_ai,pg_temp as $$
declare c control; t attempts; a accounts; r rounds; price prices; actual bigint; begin
 select * into strict c from control where singleton for update;
 select * into strict t from attempts where id=attempt_id and account_ref=account_id and attempts.run_id=moflight_ai_settle.run_id;
 select * into strict a from accounts where account_ref=account_id;
 select * into strict r from rounds where rounds.attempt_id=t.id and round=round_number;
 if nano_usd is null or nano_usd<0 or nano_usd>9007199254740991 or usage_receipt is null or usage_receipt !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$' then raise exception 'Invalid AI settlement'; end if;
 if r.state='settled' then
   if r.actual_nano_usd<>nano_usd or r.usage_receipt<>usage_receipt then raise exception 'Changed AI settlement'; end if;
   return jsonb_build_object('actualMicroEur',r.actual_micro_eur,'halted',c.halted);
 end if;
 if exists(select 1 from replay_tombstones where kind='usage' and digest=encode(sha256(convert_to(usage_receipt,'UTF8')),'hex')) then raise exception 'AI usage receipt reused'; end if;
 select * into strict price from prices where id=r.price_id;
 actual:=ceil(nano_usd::numeric*price.gross_micro_eur_per_usd/1000000000)::bigint;
 update rounds set state='settled',actual_nano_usd=nano_usd,actual_micro_eur=actual,usage_receipt=moflight_ai_settle.usage_receipt,settled_at=clock_timestamp()
   where rounds.attempt_id=t.id and round=round_number;
 update period_totals set settled=settled+actual,
   reserved=reserved-case when r.state='intent' then r.bound_micro_eur else 0 end,
   unknown=unknown-case when r.state='unknown' then r.bound_micro_eur else 0 end where scope in ('*',a.billing_tag) and period=t.period;
 if actual>r.bound_micro_eur then
   update control set halted=true,epoch=epoch+1 where singleton;
   insert into audit(action,epoch,object_id,reason) values('accounting-halt',c.epoch+1,null,'bound-exceeded');
 end if;
 if t.terminal_requested and not exists(select 1 from rounds where rounds.attempt_id=t.id and state<>'settled') then
   update attempts set active=false,closed_at=clock_timestamp() where id=t.id;
 end if;
 return jsonb_build_object('actualMicroEur',actual,'halted',c.halted or actual>r.bound_micro_eur);
end $$;
create function public.moflight_ai_finish(account_id text, attempt_id text, run_id text) returns boolean language plpgsql security definer set search_path=pg_catalog,moflight_ai,pg_temp as $$
declare c control; t attempts; outstanding boolean; begin
 select * into strict c from control where singleton for update;
 select * into strict t from attempts where id=attempt_id and account_ref=account_id and attempts.run_id=moflight_ai_finish.run_id;
 outstanding:=exists(select 1 from rounds where rounds.attempt_id=t.id and state<>'settled');
 update attempts set terminal_requested=true,active=outstanding,closed_at=case when outstanding then null else coalesce(closed_at,clock_timestamp()) end where id=t.id;
 return not outstanding;
end $$;
create function public.moflight_ai_cleanup() returns bigint language plpgsql security definer set search_path=pg_catalog,moflight_ai,pg_temp as $$
declare c control; count_removed bigint; eligible text[]; cutoff timestamptz; begin
 select * into strict c from control where singleton for update;
 cutoff:=clock_timestamp()-interval '90 days';
 select array_agg(t.id) into eligible from attempts t where not t.active and t.terminal_requested
   and not exists(select 1 from rounds r where r.attempt_id=t.id and (r.state<>'settled' or r.settled_at>=cutoff));
 insert into replay_tombstones(kind,digest)
   select 'attempt',encode(sha256(convert_to(id,'UTF8')),'hex') from attempts where id=any(eligible) on conflict do nothing;
 insert into replay_tombstones(kind,digest)
   select 'usage',encode(sha256(convert_to(r.usage_receipt,'UTF8')),'hex') from rounds r join attempts t on t.id=r.attempt_id
   where t.id=any(eligible) on conflict do nothing;
 delete from attempts where id=any(eligible); get diagnostics count_removed=row_count;
 delete from period_totals pt where pt.period<berlin_period(clock_timestamp()-interval '90 days') and not exists(select 1 from attempts t where t.period=pt.period);
 return count_removed;
end $$;

-- Defence in depth: private schema, no direct table grants, RLS with no client policies.
alter table moflight_ai.policies enable row level security;
alter table moflight_ai.prices enable row level security;
alter table moflight_ai.control enable row level security;
alter table moflight_ai.audit enable row level security;
alter table moflight_ai.accounts enable row level security;
alter table moflight_ai.attempts enable row level security;
alter table moflight_ai.rounds enable row level security;
alter table moflight_ai.period_totals enable row level security;
alter table moflight_ai.replay_tombstones enable row level security;
revoke all on all tables in schema moflight_ai from public, anon, authenticated, service_role;
revoke all on all sequences in schema moflight_ai from public, anon, authenticated, service_role;
revoke all on all functions in schema moflight_ai from public, anon, authenticated, service_role;
revoke all on function public.moflight_ai_publish_policy(jsonb,bigint,text), public.moflight_ai_activate_policy(text,bigint,text),
 public.moflight_ai_controls(bigint,boolean,boolean,boolean,text,text),public.moflight_ai_account(text,boolean,boolean,text),public.moflight_ai_cleanup() from public, anon, authenticated, service_role;
revoke all on function public.moflight_ai_snapshot(text),public.moflight_ai_usage(text),
 public.moflight_ai_reserve(text,text,text,text,text,text,integer,text,text),public.moflight_ai_unknown(text,text,text,integer),
 public.moflight_ai_settle(text,text,text,integer,bigint,text),public.moflight_ai_finish(text,text,text) from public, anon, authenticated;
grant execute on function public.moflight_ai_snapshot(text),public.moflight_ai_usage(text),
 public.moflight_ai_reserve(text,text,text,text,text,text,integer,text,text),public.moflight_ai_unknown(text,text,text,integer),
 public.moflight_ai_settle(text,text,text,integer,bigint,text),public.moflight_ai_finish(text,text,text) to service_role;
commit;

-- Non-content response binding, protected reconciliation/status and bounded HTTP admission.
begin;
alter table moflight_ai.rounds add column response_id text unique check(response_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$');
create table moflight_ai.request_windows(scope text not null,window_start timestamptz not null,hits integer not null check(hits between 1 and 120),primary key(scope,window_start));
alter table moflight_ai.request_windows enable row level security;
revoke all on moflight_ai.request_windows from public,anon,authenticated,service_role;
create function public.moflight_ai_request_admit(account_id text) returns boolean language plpgsql security definer set search_path=pg_catalog,moflight_ai,pg_temp as $$
declare c control; a accounts; window_at timestamptz; begin
 select * into strict c from control where singleton for update;
 select * into a from accounts where account_ref=account_id;
 if a.account_ref is null or not a.enabled or c.kill or not c.operational_ready or not c.funding_approved or c.halted then return false; end if;
 window_at:=date_trunc('minute',clock_timestamp());
 delete from request_windows where window_start<window_at-interval '2 minutes';
 if coalesce((select hits from request_windows where scope='*' and window_start=window_at),0)>=120
   or coalesce((select hits from request_windows where scope=a.billing_tag and window_start=window_at),0)>=30 then return false; end if;
 insert into request_windows(scope,window_start,hits) values('*',window_at,1),(a.billing_tag,window_at,1)
   on conflict(scope,window_start) do update set hits=request_windows.hits+1;
 return true;
end $$;
create function public.moflight_ai_record_response(account_id text,attempt_id text,run_id text,round_number integer,response_id text) returns void language plpgsql security definer set search_path=pg_catalog,moflight_ai,pg_temp as $$
declare c control; t attempts; r rounds; begin
 select * into strict c from control where singleton for update;
 select * into strict t from attempts where id=attempt_id and account_ref=account_id and attempts.run_id=moflight_ai_record_response.run_id;
 select * into strict r from rounds where rounds.attempt_id=t.id and round=round_number;
 if response_id is null or response_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$' then raise exception 'Invalid AI response identity'; end if;
 if r.response_id is not null then
   if r.response_id<>response_id then raise exception 'Changed AI response identity'; end if; return;
 end if;
 update rounds set response_id=moflight_ai_record_response.response_id where rounds.attempt_id=t.id and round=round_number;
end $$;
create function public.moflight_ai_status(account_id text,attempt_id text,run_id text) returns jsonb language plpgsql security definer set search_path=pg_catalog,moflight_ai,pg_temp as $$
declare t attempts; begin
 select * into strict t from attempts where id=attempt_id and account_ref=account_id and attempts.run_id=moflight_ai_status.run_id;
 return jsonb_build_object('attemptId',t.id,'runId',t.run_id,'active',t.active,'rounds',
   (select coalesce(jsonb_agg(jsonb_build_object('round',r.round,'state',r.state,'responseId',r.response_id,'actualMicroEur',r.actual_micro_eur) order by r.round),'[]'::jsonb) from rounds r where r.attempt_id=t.id));
end $$;
revoke all on function public.moflight_ai_request_admit(text),public.moflight_ai_record_response(text,text,text,integer,text),public.moflight_ai_status(text,text,text) from public,anon,authenticated;
grant execute on function public.moflight_ai_request_admit(text),public.moflight_ai_record_response(text,text,text,integer,text),public.moflight_ai_status(text,text,text) to service_role;
commit;

-- Dashboard automatic-RLS helper is an event trigger, not an application RPC.
-- Retain the helper/trigger and its owner; remove unnecessary runtime execution.
begin;
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    if (select prorettype from pg_proc where oid='public.rls_auto_enable()'::regprocedure) <> 'event_trigger'::regtype then
      raise exception 'Unexpected automatic-RLS helper signature';
    end if;
    revoke all on function public.rls_auto_enable() from public, anon, authenticated, service_role;
  end if;
end $$;
commit;

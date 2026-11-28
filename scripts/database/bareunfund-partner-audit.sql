create table public.bareunfund_partner_events (
 id bigint generated always as identity primary key,
 case_id uuid references public.bareunfund_partner_cases(id) on delete cascade,
 partner_id uuid references public.bareunfund_partners(user_id) on delete cascade,
 actor uuid not null references auth.users,
 event text not null, detail text not null,
 occurred_at timestamptz not null default now(),
 check((case_id is null)<>(partner_id is null))
);
create index bf_partner_events_case on public.bareunfund_partner_events(case_id);
alter table public.bareunfund_partner_events enable row level security;
revoke all on public.bareunfund_partner_events from public,anon,authenticated;
grant select,insert on public.bareunfund_partner_events to authenticated;
grant all on public.bareunfund_partner_events to service_role;
grant usage on sequence public.bareunfund_partner_events_id_seq to authenticated,service_role;
create policy bf_partner_events_view on public.bareunfund_partner_events for select to authenticated using(exists(select 1 from public.bareunfund_operators o where o.user_id=(select auth.uid())) or exists(select 1 from public.bareunfund_partner_cases c where c.id=case_id and (c.customer=(select auth.uid()) or c.partner=(select auth.uid()))) or partner_id=(select auth.uid()));
create policy bf_partner_events_append on public.bareunfund_partner_events for insert to authenticated with check(pg_trigger_depth()>0 and actor=(select auth.uid()));
create function public.bareunfund_case_audit() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='UPDATE' and new.state is not distinct from old.state and new.reason is not distinct from old.reason then return new; end if;
 insert into public.bareunfund_partner_events(case_id,actor,event,detail)
 values(new.id,auth.uid(),new.state,new.reason);
 return new;
end $$;
create function public.bareunfund_partner_audit() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.verified is distinct from old.verified then
  insert into public.bareunfund_partner_events(partner_id,actor,event,detail) values(new.user_id,auth.uid(),case when new.verified then '검증 승인' else '배정 중지' end,'운영자 확인');
 end if;return new;
end $$;
revoke all on function public.bareunfund_case_audit(),public.bareunfund_partner_audit() from public,anon,authenticated;
create trigger bf_case_audit after insert or update on public.bareunfund_partner_cases for each row execute function public.bareunfund_case_audit();
create trigger bf_partner_audit after update on public.bareunfund_partners for each row execute function public.bareunfund_partner_audit();

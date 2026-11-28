-- Additive migration. Existing application tables and policies are preserved.
create table public.bareunfund_operators (
 user_id uuid primary key references auth.users on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.bareunfund_operators enable row level security;
revoke all on public.bareunfund_operators from public,anon,authenticated;
grant select on public.bareunfund_operators to authenticated;
create policy bf_operator_self on public.bareunfund_operators for select to authenticated using(user_id=(select auth.uid()));

create table public.bareunfund_notices (
 id uuid primary key default gen_random_uuid(),
 source_key text not null unique check(length(source_key) between 1 and 200),
 title text not null check(length(title) between 1 and 300),
 institution text not null check(length(institution) between 1 and 150),
 source_url text not null check(source_url ~ '^https://[^[:space:]]+$'),
 summary text not null default '' check(length(summary)<=10000),
 regions text[] not null default '{}', sectors text[] not null default '{}',
 starts_on date, ends_on date,
 status text not null default 'pending' check(status in ('pending','verified','closed','rejected')),
 revision integer not null default 1 check(revision>0),
 review_note text not null default '' check(length(review_note)<=4000),
 verified_at timestamptz, verified_by uuid references auth.users,
 collected_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(ends_on is null or starts_on is null or ends_on>=starts_on),
 check(status<>'verified' or (verified_at is not null and verified_by is not null and length(trim(review_note))>0))
);
create index bf_notices_status_end on public.bareunfund_notices(status,ends_on);
alter table public.bareunfund_notices enable row level security;
revoke all on public.bareunfund_notices from public,anon,authenticated;
grant select on public.bareunfund_notices to anon,authenticated;
grant insert(source_key,title,institution,source_url,summary,regions,sectors,starts_on,ends_on),
 update(title,institution,source_url,summary,regions,sectors,starts_on,ends_on,status,review_note)
 on public.bareunfund_notices to authenticated;
create policy bf_notices_public on public.bareunfund_notices for select to anon,authenticated using(status='verified' and (starts_on is null or starts_on <= (now() at time zone 'Asia/Seoul')::date) and (ends_on is null or ends_on >= (now() at time zone 'Asia/Seoul')::date));
create policy bf_notices_operator_read on public.bareunfund_notices for select to authenticated using(exists(select 1 from public.bareunfund_operators o where o.user_id=(select auth.uid())));
create policy bf_notices_operator_insert on public.bareunfund_notices for insert to authenticated with check(status='pending' and exists(select 1 from public.bareunfund_operators o where o.user_id=(select auth.uid())));
create policy bf_notices_operator_update on public.bareunfund_notices for update to authenticated using(exists(select 1 from public.bareunfund_operators o where o.user_id=(select auth.uid()))) with check(exists(select 1 from public.bareunfund_operators o where o.user_id=(select auth.uid())));

create table public.bareunfund_notice_history (
 id bigint generated always as identity primary key,
 notice_id uuid not null references public.bareunfund_notices,
 revision integer not null, state text not null, reason text not null,
 actor uuid, occurred_at timestamptz not null default now(),
 snapshot jsonb not null
);
alter table public.bareunfund_notice_history enable row level security;
revoke all on public.bareunfund_notice_history from public,anon,authenticated;
grant select,insert on public.bareunfund_notice_history to authenticated,service_role;
grant usage on sequence public.bareunfund_notice_history_id_seq to authenticated,service_role;
create policy bf_notice_history_read on public.bareunfund_notice_history for select to authenticated using(exists(select 1 from public.bareunfund_operators o where o.user_id=(select auth.uid())));
-- Only a trigger may append an audit row; direct client inserts are rejected.
create policy bf_notice_history_append on public.bareunfund_notice_history for insert to authenticated with check(pg_trigger_depth()>0 and exists(select 1 from public.bareunfund_operators o where o.user_id=(select auth.uid())));
create function public.bareunfund_notice_before() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='UPDATE' then
  new.revision=old.revision+1;
  if row(new.title,new.institution,new.source_url,new.summary,new.regions,new.sectors,new.starts_on,new.ends_on)
    is distinct from row(old.title,old.institution,old.source_url,old.summary,old.regions,old.sectors,old.starts_on,old.ends_on) then
   new.status='pending'; new.verified_at=null; new.verified_by=null;
   new.review_note='내용 변경으로 재검증 필요';
  elsif new.status='verified' and old.status<>'verified' then
   if auth.uid() is null then raise exception 'Human reviewer required'; end if;
   new.verified_at=now(); new.verified_by=auth.uid();
  end if;
 end if;
 new.updated_at=now(); return new;
end $$;
create function public.bareunfund_notice_after() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.bareunfund_notice_history(notice_id,revision,state,reason,actor,snapshot)
 values(new.id,new.revision,new.status,new.review_note,auth.uid(),to_jsonb(new));
 return new;
end $$;
revoke all on function public.bareunfund_notice_before(),public.bareunfund_notice_after() from public,anon,authenticated;
create trigger bf_notice_version before insert or update on public.bareunfund_notices for each row execute function public.bareunfund_notice_before();
create trigger bf_notice_audit after insert or update on public.bareunfund_notices for each row execute function public.bareunfund_notice_after();

create table public.bareunfund_followups (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users on delete cascade,
 report_id uuid references public.bareunfund_reports(id) on delete cascade,
 title text not null check(length(title) between 1 and 150),
 due_on date not null,
 state text not null default 'pending' check(state in ('pending','done')),
 note text not null default '' check(length(note)<=2000),
 created_at timestamptz not null default now()
);
create index bf_followups_owner_due on public.bareunfund_followups(user_id,due_on);
alter table public.bareunfund_followups enable row level security;
revoke all on public.bareunfund_followups from public,anon,authenticated;
grant select,insert,update(state,note,due_on,title),delete on public.bareunfund_followups to authenticated;
create policy bf_followup_select on public.bareunfund_followups for select to authenticated using(user_id=(select auth.uid()));
create policy bf_followup_insert on public.bareunfund_followups for insert to authenticated with check(user_id=(select auth.uid()) and (report_id is null or exists(select 1 from public.bareunfund_reports r where r.id=report_id and r.user_id=(select auth.uid()))));
create policy bf_followup_update on public.bareunfund_followups for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy bf_followup_delete on public.bareunfund_followups for delete to authenticated using(user_id=(select auth.uid()));

create table public.bareunfund_notice_preferences (
 user_id uuid primary key references auth.users on delete cascade,
 region text not null default '' check(length(region)<=80),
 sector text not null default '' check(length(sector)<=80),
 updated_at timestamptz not null default now()
);
alter table public.bareunfund_notice_preferences enable row level security;
revoke all on public.bareunfund_notice_preferences from public,anon,authenticated;
grant select,insert,update(region,sector,updated_at),delete on public.bareunfund_notice_preferences to authenticated;
create policy bf_preferences_select on public.bareunfund_notice_preferences for select to authenticated using(user_id=(select auth.uid()));
create policy bf_preferences_insert on public.bareunfund_notice_preferences for insert to authenticated with check(user_id=(select auth.uid()));
create policy bf_preferences_update on public.bareunfund_notice_preferences for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy bf_preferences_delete on public.bareunfund_notice_preferences for delete to authenticated using(user_id=(select auth.uid()));

grant all on public.bareunfund_operators,public.bareunfund_notices,public.bareunfund_notice_history,public.bareunfund_followups,public.bareunfund_notice_preferences to service_role;

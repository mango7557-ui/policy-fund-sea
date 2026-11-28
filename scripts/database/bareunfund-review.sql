create table public.bareunfund_report_reviews (
 id uuid primary key default gen_random_uuid(),
 customer uuid not null references auth.users on delete cascade,
 report_id uuid not null unique references public.bareunfund_reports(id) on delete cascade,
 state text not null default 'requested' check(state in ('requested','reviewing','needs_data','completed')),
 request_note text not null default '' check(length(request_note)<=2000),
 reviewer uuid references auth.users,
 review_note text not null default '' check(length(review_note)<=5000),
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 check(state<>'completed' or (reviewer is not null and reviewed_at is not null and length(trim(review_note))>0))
);
create index bf_review_customer on public.bareunfund_report_reviews(customer);
create index bf_review_state on public.bareunfund_report_reviews(state);
alter table public.bareunfund_report_reviews enable row level security;
revoke all on public.bareunfund_report_reviews from public,anon,authenticated;
grant select,insert(customer,report_id,request_note),update(state,review_note) on public.bareunfund_report_reviews to authenticated;
grant all on public.bareunfund_report_reviews to service_role;
create policy bf_review_view on public.bareunfund_report_reviews for select to authenticated using(customer=(select auth.uid()) or exists(select 1 from public.bareunfund_operators where user_id=(select auth.uid())));
create policy bf_review_request on public.bareunfund_report_reviews for insert to authenticated with check(customer=(select auth.uid()) and state='requested' and reviewer is null and exists(select 1 from public.bareunfund_reports r where r.id=report_id and r.user_id=(select auth.uid())));
create policy bf_review_operator_update on public.bareunfund_report_reviews for update to authenticated using(exists(select 1 from public.bareunfund_operators where user_id=(select auth.uid()))) with check(exists(select 1 from public.bareunfund_operators where user_id=(select auth.uid())));
create function public.bareunfund_review_before() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.state='completed' then raise exception 'Completed review is immutable'; end if;
 if new.state='completed' then
  new.reviewer=auth.uid(); new.reviewed_at=now();
 else new.reviewer=null; new.reviewed_at=null;
 end if;
 return new;
end $$;
revoke all on function public.bareunfund_review_before() from public,anon,authenticated;
create trigger bf_review_sign before update on public.bareunfund_report_reviews for each row execute function public.bareunfund_review_before();
-- Reviewers see a report only when its owner has explicitly requested review.
create policy bf_reports_consented_review on public.bareunfund_reports for select to authenticated using(exists(select 1 from public.bareunfund_operators where user_id=(select auth.uid())) and exists(select 1 from public.bareunfund_report_reviews v where v.report_id=public.bareunfund_reports.id));
-- An operator may validate an applicant, but customers cannot self-approve.
grant update(verified) on public.bareunfund_partners to authenticated;
create policy bf_partner_operator_view on public.bareunfund_partners for select to authenticated using(exists(select 1 from public.bareunfund_operators where user_id=(select auth.uid())));
create policy bf_partner_operator_verify on public.bareunfund_partners for update to authenticated using(exists(select 1 from public.bareunfund_operators where user_id=(select auth.uid()))) with check(exists(select 1 from public.bareunfund_operators where user_id=(select auth.uid())));

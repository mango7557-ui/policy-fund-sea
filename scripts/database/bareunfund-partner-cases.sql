create table public.bareunfund_partners (
 user_id uuid primary key references auth.users on delete cascade,
 name text not null check(length(name) between 1 and 80),
 specialty text not null check(length(specialty) between 1 and 180),
 region text not null check(length(region) between 1 and 80),
 fee text not null check(length(fee) between 1 and 150),
 pledged_at timestamptz not null default now(),
 verified boolean not null default false
);
create table public.bareunfund_partner_cases (
 id uuid primary key default gen_random_uuid(),
 customer uuid not null references auth.users on delete cascade,
 partner uuid not null references public.bareunfund_partners(user_id),
 report_id uuid not null references public.bareunfund_reports(id) on delete cascade,
 diagnosis_status text not null, fee text not null,
 scope text not null default '진단 상태 및 상담 진행 결과',
 consented_at timestamptz not null default now(),
 state text not null default '배정' check(state in ('배정','상담 중','자료 준비','신청','승인','부결','보완','종료')),
 reason text not null default '미기록' check(reason in ('미기록','지원요건','자료 부족','상환능력','예산·접수','기타')),
 unique(report_id,partner)
);
create index bareunfund_cases_customer on public.bareunfund_partner_cases(customer);
create index bareunfund_cases_partner on public.bareunfund_partner_cases(partner);
alter table public.bareunfund_partners enable row level security;
alter table public.bareunfund_partner_cases enable row level security;
revoke all on public.bareunfund_partners,public.bareunfund_partner_cases from public,anon,authenticated;
grant select, insert(user_id,name,specialty,region,fee) on public.bareunfund_partners to authenticated;
create policy bf_partner_view on public.bareunfund_partners for select to authenticated using(verified or user_id=(select auth.uid()));
create policy bf_partner_apply on public.bareunfund_partners for insert to authenticated with check(user_id=(select auth.uid()) and not verified);
grant select,insert(customer,partner,report_id,diagnosis_status,fee),update(state,reason),delete on public.bareunfund_partner_cases to authenticated;
create policy bf_case_view on public.bareunfund_partner_cases for select to authenticated using(customer=(select auth.uid()) or (partner=(select auth.uid()) and exists(select 1 from public.bareunfund_partners p where p.user_id=partner and p.verified)));
create policy bf_case_create on public.bareunfund_partner_cases for insert to authenticated with check(customer=(select auth.uid()) and partner<>customer and exists(select 1 from public.bareunfund_reports r where r.id=report_id and r.user_id=customer and r.report #>> '{diagnosis,complete}'='true' and length(diagnosis_status) between 1 and 100 and diagnosis_status=r.report #>> '{diagnosis,status}') and exists(select 1 from public.bareunfund_partners p where p.user_id=partner and p.verified and p.fee=bareunfund_partner_cases.fee));
create policy bf_case_progress on public.bareunfund_partner_cases for update to authenticated using(partner=(select auth.uid()) and exists(select 1 from public.bareunfund_partners p where p.user_id=partner and p.verified)) with check(partner=(select auth.uid()));
create policy bf_case_withdraw on public.bareunfund_partner_cases for delete to authenticated using(customer=(select auth.uid()));
create view public.bareunfund_outcome_review as select state,reason,count(*) as total from public.bareunfund_partner_cases where state in ('승인','부결','보완') group by state,reason having count(*)>=5;
revoke all on public.bareunfund_outcome_review from public,anon,authenticated;
grant select on public.bareunfund_outcome_review to service_role;

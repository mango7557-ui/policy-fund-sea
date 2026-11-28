-- Avoid recursive cross-table RLS. Review a consent-time snapshot instead of
-- granting operators access to the member's report collection.
drop policy bf_reports_consented_review on public.bareunfund_reports;
alter table public.bareunfund_report_reviews add column report_snapshot jsonb;
create function public.bareunfund_review_snapshot() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 select r.report into new.report_snapshot from public.bareunfund_reports r
 where r.id=new.report_id and r.user_id=auth.uid();
 if new.report_snapshot is null then raise exception 'Owned report required'; end if;
 return new;
end $$;
revoke all on function public.bareunfund_review_snapshot() from public,anon,authenticated;
create trigger bf_review_snapshot before insert on public.bareunfund_report_reviews for each row execute function public.bareunfund_review_snapshot();

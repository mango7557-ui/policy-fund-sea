alter table public.bareunfund_notices add column source_fingerprint text check(source_fingerprint ~ '^[a-f0-9]{64}$');

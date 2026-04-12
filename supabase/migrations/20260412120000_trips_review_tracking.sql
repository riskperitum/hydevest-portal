-- Trip review tracking: flag post-review edits and store last reviewer
alter table public.trips add column if not exists needs_review boolean not null default false;
alter table public.trips add column if not exists last_reviewed_at timestamptz;
alter table public.trips add column if not exists last_reviewed_by uuid references public.profiles(id);

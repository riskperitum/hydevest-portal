alter table public.presales
  add column if not exists last_approved_at timestamptz,
  add column if not exists last_approved_by uuid references public.profiles(id);

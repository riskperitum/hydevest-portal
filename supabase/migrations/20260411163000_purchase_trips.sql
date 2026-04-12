create table public.purchase_trips (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  location text,
  supplier text,
  expected_end date,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger purchase_trips_updated_at
  before update on public.purchase_trips
  for each row execute function public.handle_updated_at();

alter table public.purchase_trips enable row level security;

create policy "purchase_trips_select_auth" on public.purchase_trips
  for select to authenticated using (true);

create policy "purchase_trips_insert_own" on public.purchase_trips
  for insert to authenticated with check (created_by = auth.uid());

create policy "purchase_trips_update_own_or_super" on public.purchase_trips
  for update to authenticated using (created_by = auth.uid() or public.is_super_admin());

create policy "purchase_trips_delete_own_or_super" on public.purchase_trips
  for delete to authenticated using (created_by = auth.uid() or public.is_super_admin());

create index idx_purchase_trips_created_by on public.purchase_trips(created_by);
create index idx_purchase_trips_status on public.purchase_trips(status);

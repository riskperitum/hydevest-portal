-- ============================================================
-- Hydevest Portal — Purchase Module
-- Migration: 003_purchase_trips
-- ============================================================

create sequence public.trip_seq start 1;
create sequence public.container_seq start 1;
create sequence public.trip_expense_seq start 1;

-- ─────────────────────────────────────────
-- TRIPS
-- ─────────────────────────────────────────
create table public.trips (
  id                uuid primary key default gen_random_uuid(),
  trip_id           text unique not null,
  title             text not null,
  description       text,
  source_location   text,
  supplier_id       uuid references public.suppliers(id),
  clearing_agent_id uuid references public.clearing_agents(id),
  start_date        date,
  end_date          date,
  status            text not null default 'not_started',
  approval_status   text not null default 'not_approved',
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create or replace function public.generate_trip_id()
returns trigger as $$
begin
  new.trip_id := 'TRIP-' || lpad(nextval('public.trip_seq')::text, 4, '0');
  return new;
end;
$$ language plpgsql;

create trigger trips_gen_id before insert on public.trips
  for each row execute function public.generate_trip_id();

create trigger trips_updated_at before update on public.trips
  for each row execute function public.handle_updated_at();

-- ─────────────────────────────────────────
-- TRIP EXPENSES
-- ─────────────────────────────────────────
create table public.trip_expenses (
  id            uuid primary key default gen_random_uuid(),
  expense_id    text unique not null,
  trip_id       uuid not null references public.trips(id) on delete cascade,
  category      text not null default 'general',
  amount        numeric(15,2) not null,
  currency      text not null default 'NGN',
  exchange_rate numeric(10,4) not null default 1,
  amount_ngn    numeric(15,2) not null,
  description   text,
  expense_date  date not null default current_date,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create or replace function public.generate_trip_expense_id()
returns trigger as $$
begin
  new.expense_id := 'EXP-' || lpad(nextval('public.trip_expense_seq')::text, 4, '0');
  return new;
end;
$$ language plpgsql;

create trigger trip_expenses_gen_id before insert on public.trip_expenses
  for each row execute function public.generate_trip_expense_id();

create trigger trip_expenses_updated_at before update on public.trip_expenses
  for each row execute function public.handle_updated_at();

-- ─────────────────────────────────────────
-- CONTAINERS
-- ─────────────────────────────────────────
create table public.containers (
  id                uuid primary key default gen_random_uuid(),
  container_id      text unique not null,
  trip_id           uuid not null references public.trips(id) on delete cascade,
  container_number  text,
  description       text,
  weight_kg         numeric(10,2),
  quantity          integer,
  unit_price        numeric(15,2),
  currency          text not null default 'USD',
  exchange_rate     numeric(10,4) not null default 1,
  total_cost_ngn    numeric(15,2),
  status            text not null default 'ordered',
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create or replace function public.generate_container_id()
returns trigger as $$
begin
  new.container_id := 'CON-' || lpad(nextval('public.container_seq')::text, 4, '0');
  return new;
end;
$$ language plpgsql;

create trigger containers_gen_id before insert on public.containers
  for each row execute function public.generate_container_id();

create trigger containers_updated_at before update on public.containers
  for each row execute function public.handle_updated_at();

-- ─────────────────────────────────────────
-- TRIP DOCUMENTS
-- ─────────────────────────────────────────
create table public.trip_documents (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid references public.trips(id) on delete cascade,
  container_id  uuid references public.containers(id) on delete cascade,
  name          text not null,
  file_url      text not null,
  file_type     text,
  file_size     integer,
  category      text default 'general',
  uploaded_by   uuid references public.profiles(id),
  created_at    timestamptz not null default now()
);

-- ─────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────
alter table public.trips           enable row level security;
alter table public.trip_expenses   enable row level security;
alter table public.containers      enable row level security;
alter table public.trip_documents  enable row level security;

create policy "trips_select" on public.trips
  for select using (auth.uid() is not null);
create policy "trips_insert" on public.trips
  for insert with check (auth.uid() is not null);
create policy "trips_update" on public.trips
  for update using (auth.uid() is not null);
create policy "trips_delete" on public.trips
  for delete using (public.is_super_admin());

create policy "trip_expenses_select" on public.trip_expenses
  for select using (auth.uid() is not null);
create policy "trip_expenses_insert" on public.trip_expenses
  for insert with check (auth.uid() is not null);
create policy "trip_expenses_update" on public.trip_expenses
  for update using (auth.uid() is not null);
create policy "trip_expenses_delete" on public.trip_expenses
  for delete using (auth.uid() is not null);

create policy "containers_select" on public.containers
  for select using (auth.uid() is not null);
create policy "containers_insert" on public.containers
  for insert with check (auth.uid() is not null);
create policy "containers_update" on public.containers
  for update using (auth.uid() is not null);
create policy "containers_delete" on public.containers
  for delete using (auth.uid() is not null);

create policy "trip_documents_select" on public.trip_documents
  for select using (auth.uid() is not null);
create policy "trip_documents_insert" on public.trip_documents
  for insert with check (auth.uid() is not null);
create policy "trip_documents_delete" on public.trip_documents
  for delete using (auth.uid() is not null);

-- ─────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────
create index idx_trips_status on public.trips(status);
create index idx_trips_supplier on public.trips(supplier_id);
create index idx_trip_expenses_trip on public.trip_expenses(trip_id);
create index idx_containers_trip on public.containers(trip_id);
create index idx_trip_documents_trip on public.trip_documents(trip_id);

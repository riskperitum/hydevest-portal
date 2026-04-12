create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text,
  email         text unique not null,
  phone         text,
  avatar_url    text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.roles (
  id            uuid primary key default gen_random_uuid(),
  name          text unique not null,
  description   text,
  is_system     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.role_permissions (
  id            uuid primary key default gen_random_uuid(),
  role_id       uuid not null references public.roles(id) on delete cascade,
  permission    text not null,
  created_at    timestamptz not null default now(),
  unique (role_id, permission)
);

create table public.user_roles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  role_id       uuid not null references public.roles(id) on delete cascade,
  granted_by    uuid references public.profiles(id),
  granted_at    timestamptz not null default now(),
  unique (user_id, role_id)
);

create table public.field_definitions (
  id            uuid primary key default gen_random_uuid(),
  module        text not null,
  resource      text not null,
  field_key     text not null,
  label         text not null,
  field_type    text not null,
  options       jsonb,
  is_required   boolean default false,
  is_visible    boolean default true,
  sort_order    integer default 0,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (module, resource, field_key)
);

create table public.field_values (
  id            uuid primary key default gen_random_uuid(),
  field_id      uuid not null references public.field_definitions(id) on delete cascade,
  record_id     uuid not null,
  value         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (field_id, record_id)
);

create table public.module_configs (
  id            uuid primary key default gen_random_uuid(),
  module        text unique not null,
  config        jsonb not null default '{}',
  updated_by    uuid references public.profiles(id),
  updated_at    timestamptz not null default now()
);

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

create trigger roles_updated_at
  before update on public.roles
  for each row execute function public.handle_updated_at();

create trigger field_definitions_updated_at
  before update on public.field_definitions
  for each row execute function public.handle_updated_at();

create trigger field_values_updated_at
  before update on public.field_values
  for each row execute function public.handle_updated_at();

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles         enable row level security;
alter table public.roles             enable row level security;
alter table public.role_permissions  enable row level security;
alter table public.user_roles        enable row level security;
alter table public.field_definitions enable row level security;
alter table public.field_values      enable row level security;
alter table public.module_configs    enable row level security;

create or replace function public.has_permission(p text)
returns boolean as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.role_permissions rp on rp.role_id = r.id
    where ur.user_id = auth.uid()
      and rp.permission = p
  )
  or exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.name = 'super_admin'
  );
$$ language sql security definer stable;

create or replace function public.is_super_admin()
returns boolean as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.name = 'super_admin'
  );
$$ language sql security definer stable;

create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid() or public.has_permission('admin:user:view'));

create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

create policy "profiles_admin_all" on public.profiles
  for all using (public.has_permission('admin:user:edit'));

create policy "roles_select" on public.roles
  for select using (public.has_permission('admin:role:view') or public.is_super_admin());

create policy "roles_manage" on public.roles
  for all using (public.is_super_admin() or public.has_permission('admin:role:create'));

create policy "role_permissions_select" on public.role_permissions
  for select using (public.has_permission('admin:role:view') or public.is_super_admin());

create policy "role_permissions_manage" on public.role_permissions
  for all using (public.is_super_admin() or public.has_permission('admin:role:edit'));

create policy "user_roles_select" on public.user_roles
  for select using (
    user_id = auth.uid()
    or public.has_permission('admin:user:view')
  );

create policy "user_roles_manage" on public.user_roles
  for all using (public.has_permission('admin:role:assign') or public.is_super_admin());

create policy "field_definitions_select" on public.field_definitions
  for select using (auth.uid() is not null);

create policy "field_definitions_manage" on public.field_definitions
  for all using (public.has_permission('admin:field:create') or public.is_super_admin());

create policy "field_values_select" on public.field_values
  for select using (auth.uid() is not null);

create policy "field_values_manage" on public.field_values
  for all using (auth.uid() is not null);

create policy "module_configs_select" on public.module_configs
  for select using (public.has_permission('admin:config:view') or public.is_super_admin());

create policy "module_configs_manage" on public.module_configs
  for all using (public.has_permission('admin:config:edit') or public.is_super_admin());

create index idx_user_roles_user_id on public.user_roles(user_id);
create index idx_user_roles_role_id on public.user_roles(role_id);
create index idx_role_permissions_role_id on public.role_permissions(role_id);
create index idx_field_definitions_module_resource on public.field_definitions(module, resource);
create index idx_field_values_record_id on public.field_values(record_id);
create index idx_field_values_field_id on public.field_values(field_id);

create or replace function public.assign_super_admin(target_user_id uuid)
returns void as $$
declare
  super_admin_role_id uuid;
begin
  select id into super_admin_role_id from public.roles where name = 'super_admin';
  if super_admin_role_id is null then
    raise exception 'super_admin role not found. Run seed first.';
  end if;
  insert into public.user_roles (user_id, role_id)
  values (target_user_id, super_admin_role_id)
  on conflict (user_id, role_id) do nothing;
end;
$$ language plpgsql security definer;
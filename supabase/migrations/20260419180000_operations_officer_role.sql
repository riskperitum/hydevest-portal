-- Operations Officer role — presales, sales, recoveries, expenses (manual), inventory,
-- requestbox, legal; reports limited to container sales

insert into public.roles (name, description)
values ('operations_officer', 'Operations Officer — manages presales, sales, recoveries, expenses, inventory, legal and requestbox')
on conflict (name) do update set description = excluded.description;

do $$
declare
  ops_role_id uuid;
begin
  select id into ops_role_id from public.roles where name = 'operations_officer';

  -- Scoped to this role only (avoid: where role_id = role_id, which deletes all rows)
  delete from public.role_permissions where role_id = ops_role_id;

  insert into public.role_permissions (role_id, permission_key)
  select ops_role_id, key from public.permissions
  where key in (

    -- Presales — everything
    'presales.*',
    'presales.view',
    'presales.create',
    'presales.edit',
    'presales.delete',
    'presales.approve',
    'presales.review',
    'presales.view_expected_revenue',
    'presales.view_price_per_piece',
    'presales.override_edit',

    -- Sales orders — everything
    'sales_orders.*',
    'sales_orders.view',
    'sales_orders.create',
    'sales_orders.edit',
    'sales_orders.delete',
    'sales_orders.approve',
    'sales_orders.view_customer_payable',
    'sales_orders.view_financials',
    'sales_orders.write_off',
    'sales_orders.approve_write_off',

    -- Recoveries — everything
    'recoveries.*',
    'recoveries.view',
    'recoveries.create',
    'recoveries.edit',
    'recoveries.delete',
    'recoveries.approve',

    -- Expensify — everything EXCEPT trip and payroll (manual expenses only)
    'expenses.view',
    'expenses.create',
    'expenses.edit',
    'expenses.delete',
    'expenses.approve',

    -- Inventory — everything
    'inventory.*',
    'inventory.view',

    -- Requestbox — everything
    'requestbox.*',
    'requestbox.view',
    'requestbox.reply',
    'requestbox.assign',

    -- Legal — everything
    'legal.*',
    'legal.view',
    'legal.create_cases',
    'legal.edit_cases',
    'legal.delete_cases',
    'legal.manage_tasks',
    'legal.manage_comments',
    'legal.manage_payments',
    'legal.manage_documents',
    'legal.view_expenses',

    -- Reports — container sales only
    'reports.view',
    'reports.container_sales',
    'reports.export'

  )
  on conflict do nothing;

end$$;

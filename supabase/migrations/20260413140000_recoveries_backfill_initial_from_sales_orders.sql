-- Backfill recoveries for existing sales orders that had a payment at point of sale.
--
-- Original intent (if you add sales_orders.initial_payment and store POS there):
--   amount_paid in the INSERT → so.initial_payment
--   WHERE so.initial_payment > 0
--
-- This repo’s sales_orders flow uses amount_paid at record time, so we backfill from that.

INSERT INTO public.recoveries (
  sales_order_id,
  customer_id,
  payment_type,
  amount_paid,
  payment_date,
  payment_method,
  approval_status,
  created_by
)
SELECT
  so.id,
  so.customer_id,
  'initial',
  so.amount_paid,
  (so.created_at AT TIME ZONE 'UTC')::date,
  so.payment_method,
  'approved',
  so.created_by
FROM public.sales_orders so
WHERE so.amount_paid > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.recoveries r
    WHERE r.sales_order_id = so.id
      AND r.payment_type = 'initial'
  );

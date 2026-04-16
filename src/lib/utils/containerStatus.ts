export type ContainerComputedStatus =
  | 'not_started'
  | 'in_transit'
  | 'completed'
  | 'presale_created'
  | 'in_sales'
  | 'fully_recovered'

export interface ContainerStatusInput {
  trip_status: string
  presale_count: number
  sales_order_count: number
  fully_paid_count: number
  total_orders_count: number
}

export function computeContainerStatus(input: ContainerStatusInput): ContainerComputedStatus {
  const { trip_status, presale_count, sales_order_count, fully_paid_count, total_orders_count } = input

  // Recovery module — fully recovered (all orders paid)
  if (total_orders_count > 0 && fully_paid_count >= total_orders_count) {
    return 'fully_recovered'
  }

  // Sales module — in sales (has sales order, not fully paid)
  if (sales_order_count > 0) {
    return 'in_sales'
  }

  // Sales module — presale exists but no sales order yet
  if (presale_count > 0) {
    return 'presale_created'
  }

  // Trip module owns remaining statuses
  if (trip_status === 'completed') return 'completed'
  if (trip_status === 'in_progress') return 'in_transit'
  return 'not_started'
}

export const CONTAINER_STATUS_CONFIG: Record<ContainerComputedStatus, {
  label: string
  color: string
  dot: string
}> = {
  not_started:     { label: 'Not started',     color: 'bg-gray-100 text-gray-500',    dot: 'bg-gray-400'   },
  in_transit:      { label: 'In transit',      color: 'bg-blue-50 text-blue-700',     dot: 'bg-blue-500'   },
  completed:       { label: 'Completed',       color: 'bg-teal-50 text-teal-700',     dot: 'bg-teal-500'   },
  presale_created: { label: 'Presale created', color: 'bg-purple-50 text-purple-700', dot: 'bg-purple-500' },
  in_sales:        { label: 'In sales',        color: 'bg-amber-50 text-amber-700',   dot: 'bg-amber-500'  },
  fully_recovered: { label: 'Fully recovered', color: 'bg-green-50 text-green-700',   dot: 'bg-green-500'  },
}

export function getContainerStatusBadge(status: ContainerComputedStatus) {
  return CONTAINER_STATUS_CONFIG[status] ?? CONTAINER_STATUS_CONFIG.not_started
}

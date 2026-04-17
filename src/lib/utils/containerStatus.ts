export type ContainerComputedStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'presale_unsold'
  | 'sale_in_progress'
  | 'sale_fully_sold'
  | 'recovery_partial'
  | 'recovery_full'

export interface ContainerStatusInput {
  trip_status: string
  presale_count: number
  sale_type: string | null
  presale_pallets: number
  pallet_dist_count: number
  sales_order_count: number
  fully_paid_count: number
  settled_count: number
  total_outstanding: number
  total_written_off: number
}

export function computeContainerStatus(input: ContainerStatusInput): ContainerComputedStatus {
  const {
    trip_status,
    presale_count,
    sale_type,
    presale_pallets,
    pallet_dist_count,
    sales_order_count,
    fully_paid_count,
    settled_count,
    total_outstanding,
    total_written_off,
  } = input

  const totalOrders = sales_order_count

  // ── RECOVERY STAGE ───────────────────────────────────────────
  // Only enters recovery when sales orders exist
  if (totalOrders > 0) {
    // All orders settled (paid or written off)
    if (settled_count >= totalOrders) {
      return 'recovery_full'
    }
    // Some outstanding balance remaining
    if (total_outstanding > 0) {
      return 'recovery_partial'
    }
  }

  // ── SALE STAGE ───────────────────────────────────────────────
  if (presale_count > 0 && totalOrders > 0) {
    if (sale_type === 'box') {
      // Box sale: any sales order = fully sold
      return 'sale_fully_sold'
    }
    if (sale_type === 'split') {
      // Split sale: compare sales orders to pallet distributions
      const totalPallets = pallet_dist_count > 0 ? pallet_dist_count : presale_pallets
      if (totalOrders >= totalPallets && totalPallets > 0) {
        return 'sale_fully_sold'
      }
      return 'sale_in_progress'
    }
    // Fallback if sale_type unknown
    return 'sale_fully_sold'
  }

  // ── PRESALE STAGE ────────────────────────────────────────────
  if (presale_count > 0 && totalOrders === 0) {
    return 'presale_unsold'
  }

  // ── TRIP STAGE ───────────────────────────────────────────────
  if (trip_status === 'completed')   return 'completed'
  if (trip_status === 'in_progress') return 'in_progress'
  return 'not_started'
}

export const CONTAINER_STATUS_CONFIG: Record<ContainerComputedStatus, {
  label: string
  color: string
  dot: string
  stage: string
}> = {
  not_started:       { label: 'Not started',          color: 'bg-gray-100 text-gray-500',    dot: 'bg-gray-400',    stage: 'Trip'     },
  in_progress:       { label: 'In progress',          color: 'bg-blue-50 text-blue-700',     dot: 'bg-blue-500',    stage: 'Trip'     },
  completed:         { label: 'Completed',            color: 'bg-teal-50 text-teal-700',     dot: 'bg-teal-500',    stage: 'Trip'     },
  presale_unsold:    { label: 'Presale — Unsold',     color: 'bg-purple-50 text-purple-700', dot: 'bg-purple-500',  stage: 'Presale'  },
  sale_in_progress:  { label: 'Sale — In progress',  color: 'bg-amber-50 text-amber-700',   dot: 'bg-amber-500',   stage: 'Sale'     },
  sale_fully_sold:   { label: 'Sale — Fully sold',   color: 'bg-orange-50 text-orange-700', dot: 'bg-orange-500',  stage: 'Sale'     },
  recovery_partial:  { label: 'Recovery — Partial',  color: 'bg-red-50 text-red-600',       dot: 'bg-red-500',     stage: 'Recovery' },
  recovery_full:     { label: 'Recovery — Fully paid',color: 'bg-green-50 text-green-700',  dot: 'bg-green-500',   stage: 'Recovery' },
}

export function getContainerStatusBadge(status: ContainerComputedStatus) {
  return CONTAINER_STATUS_CONFIG[status] ?? CONTAINER_STATUS_CONFIG.not_started
}

// Trip-only status — used inside trip container subtab
export const TRIP_STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  not_started:  { label: 'Not started',  color: 'bg-gray-100 text-gray-500',  dot: 'bg-gray-400'  },
  in_progress:  { label: 'In progress',  color: 'bg-blue-50 text-blue-700',   dot: 'bg-blue-500'  },
  completed:    { label: 'Completed',    color: 'bg-teal-50 text-teal-700',   dot: 'bg-teal-500'  },
}

export function getTripStatusBadge(tripStatus: string) {
  return TRIP_STATUS_CONFIG[tripStatus] ?? TRIP_STATUS_CONFIG.not_started
}

/** Per-container metrics (trip_status supplied at call site). */
export type ContainerStatusMetrics = Omit<ContainerStatusInput, 'trip_status'>

export function emptyContainerStatusMetrics(): ContainerStatusMetrics {
  return {
    presale_count: 0,
    sale_type: null,
    presale_pallets: 0,
    pallet_dist_count: 0,
    sales_order_count: 0,
    fully_paid_count: 0,
    settled_count: 0,
    total_outstanding: 0,
    total_written_off: 0,
  }
}

/** Map DB presale sale_type values to computeContainerStatus `box` / `split`. */
export function normalizeSaleTypeForStatus(raw: string | null | undefined): string | null {
  if (!raw) return null
  if (raw === 'box_sale' || raw === 'box') return 'box'
  if (raw === 'split_sale' || raw === 'split') return 'split'
  return null
}

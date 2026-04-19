'use client'

import { useRouter } from 'next/navigation'
import { usePermissions, can } from '@/lib/permissions/hooks'
import {
  Package, Users, TrendingDown, TrendingUp,
  AlertTriangle, BarChart3, DollarSign,
} from 'lucide-react'

const REPORTS = [
  {
    href:        '/portal/reports/container-sales',
    label:       'Container sales',
    description: 'Sales performance and revenue breakdown by container',
    icon:        Package,
    bg:          'bg-blue-50',
    iconColor:   'text-blue-600',
    border:      'hover:border-blue-200',
    permKey:     'reports.view',
  },
  {
    href:        '/portal/reports/customer-debt',
    label:       'Customer debt',
    description: 'Outstanding balances and overdue payments by customer',
    icon:        TrendingDown,
    bg:          'bg-red-50',
    iconColor:   'text-red-600',
    border:      'hover:border-red-200',
    permKey:     'reports.view',
  },
  {
    href:        '/portal/reports/supplier-payables',
    label:       'Supplier payables',
    description: 'Amounts owed to suppliers across all trips',
    icon:        DollarSign,
    bg:          'bg-amber-50',
    iconColor:   'text-amber-600',
    border:      'hover:border-amber-200',
    permKey:     'reports.supplier_payables',
  },
  {
    href:        '/portal/reports/supplier-receivables',
    label:       'Supplier receivables',
    description: 'Amounts owed back by suppliers for short shipments',
    icon:        TrendingUp,
    bg:          'bg-green-50',
    iconColor:   'text-green-600',
    border:      'hover:border-green-200',
    permKey:     'reports.supplier_receivables',
  },
  {
    href:        '/portal/reports/container-profit',
    label:       'Container profit',
    description: 'Profit and margin analysis per container',
    icon:        BarChart3,
    bg:          'bg-purple-50',
    iconColor:   'text-purple-600',
    border:      'hover:border-purple-200',
    permKey:     'reports.container_profit',
  },
  {
    href:        '/portal/reports/bad-debts',
    label:       'Bad debts',
    description: 'Outstanding balances written off as uncollectable',
    icon:        AlertTriangle,
    bg:          'bg-orange-50',
    iconColor:   'text-orange-600',
    border:      'hover:border-orange-200',
    permKey:     'reports.bad_debts',
  },
  {
    href:        '/portal/accounts/customers',
    label:       'Customer profiles',
    description: 'Full 360° view of each customer — orders, payments, bad debts and legal cases',
    icon:        Users,
    bg:          'bg-teal-50',
    iconColor:   'text-teal-600',
    border:      'hover:border-teal-200',
    permKey:     'reports.customer_profiles',
  },
]

export default function ReportsPage() {
  const router = useRouter()
  const { permissions, isSuperAdmin } = usePermissions()

  function canSeeReport(permKey: string): boolean {
    return isSuperAdmin || can(permissions, isSuperAdmin, 'reports.*') || can(permissions, isSuperAdmin, permKey)
  }

  return (
    <div className="space-y-6 max-w-6xl">

      <div>
        <h1 className="text-xl font-semibold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-400 mt-0.5">Select a report to view detailed analytics</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {REPORTS.filter(report => canSeeReport(report.permKey)).map(report => {
          const Icon = report.icon
          return (
            <button key={report.href}
              onClick={() => router.push(report.href)}
              className={`group text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-md ${report.border} transition-all duration-200`}>
              <div className="flex items-start gap-4">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${report.bg}`}>
                  <Icon size={20} className={report.iconColor} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 group-hover:text-brand-700 transition-colors">
                    {report.label}
                  </p>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                    {report.description}
                  </p>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

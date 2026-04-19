'use client'

import { useRouter } from 'next/navigation'
import {
  Package, Users, TrendingDown, TrendingUp,
  AlertTriangle, BarChart3, DollarSign, Scale
} from 'lucide-react'

const REPORTS = [
  {
    href:        '/portal/reports/container-sales',
    label:       'Container sales',
    description: 'Sales performance and revenue breakdown by container',
    icon:        Package,
    color:       'bg-brand-50 text-brand-600',
  },
  {
    href:        '/portal/reports/customer-debt',
    label:       'Customer debt',
    description: 'Outstanding balances and overdue payments by customer',
    icon:        TrendingDown,
    color:       'bg-red-50 text-red-600',
  },
  {
    href:        '/portal/reports/supplier-payables',
    label:       'Supplier payables',
    description: 'Amounts owed to suppliers across all trips',
    icon:        DollarSign,
    color:       'bg-amber-50 text-amber-700',
  },
  {
    href:        '/portal/reports/supplier-receivables',
    label:       'Supplier receivables',
    description: 'Amounts owed back by suppliers for short shipments',
    icon:        TrendingUp,
    color:       'bg-green-50 text-green-600',
  },
  {
    href:        '/portal/reports/container-profit',
    label:       'Container profit',
    description: 'Profit and margin analysis per container',
    icon:        BarChart3,
    color:       'bg-blue-50 text-blue-600',
  },
  {
    href:        '/portal/reports/bad-debts',
    label:       'Bad debts',
    description: 'Outstanding balances written off as uncollectable',
    icon:        AlertTriangle,
    color:       'bg-red-50 text-red-600',
  },
  {
    href:        '/portal/accounts/customers',
    label:       'Customer profiles',
    description: 'Full 360° view of each customer — orders, payments, bad debts and legal cases',
    icon:        Users,
    color:       'bg-brand-50 text-brand-600',
  },
]

export default function ReportsPage() {
  const router = useRouter()

  return (
    <div className="space-y-6 max-w-6xl">

      <div>
        <h1 className="text-xl font-semibold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-400 mt-0.5">Select a report to view detailed analytics</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {REPORTS.map(report => {
          const Icon = report.icon
          return (
            <button key={report.href}
              onClick={() => router.push(report.href)}
              className="group text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-md hover:border-brand-100 transition-all duration-200">
              <div className="flex items-start gap-4">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${report.color}`}>
                  <Icon size={20} />
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

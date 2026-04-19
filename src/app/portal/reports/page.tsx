'use client'

import Link from 'next/link'
import {
  BarChart2, Users, Truck, TrendingUp, ArrowRightLeft, ChevronRight, AlertTriangle
} from 'lucide-react'

const REPORTS = [
  {
    href: '/portal/reports/container-sales',
    icon: <BarChart2 size={24} className="text-brand-600" />,
    title: 'Container Sales Report',
    description: 'Track expected revenue, sales to date, recoveries and receivables per container',
    color: 'bg-brand-50 border-brand-100',
    iconBg: 'bg-brand-100',
    tag: 'Sales',
    tagColor: 'bg-brand-50 text-brand-700',
  },
  {
    href: '/portal/reports/customer-debt',
    icon: <Users size={24} className="text-red-500" />,
    title: 'Customer Debt Report',
    description: 'View outstanding balances owed by customers across all sales',
    color: 'bg-red-50 border-red-100',
    iconBg: 'bg-red-100',
    tag: 'Finance',
    tagColor: 'bg-red-50 text-red-600',
  },
  {
    href: '/portal/reports/bad-debts',
    icon: <AlertTriangle size={24} className="text-red-600" />,
    title: 'Bad debts',
    description: 'Outstanding balances written off as uncollectable bad debt',
    color: 'bg-red-50 text-red-600',
    iconBg: 'bg-red-100',
    tag: 'Finance',
    tagColor: 'bg-red-50 text-red-600',
  },
  {
    href: '/portal/reports/supplier-payables',
    icon: <Truck size={24} className="text-amber-600" />,
    title: 'Supplier Payables Report',
    description: 'Track amounts owed to suppliers for containers purchased',
    color: 'bg-amber-50 border-amber-100',
    iconBg: 'bg-amber-100',
    tag: 'Purchase',
    tagColor: 'bg-amber-50 text-amber-700',
  },
  {
    href: '/portal/reports/container-profit',
    icon: <TrendingUp size={24} className="text-green-600" />,
    title: 'Container Sales Profit Report',
    description: 'Compare sales revenue against landing cost to show profit per container',
    color: 'bg-green-50 border-green-100',
    iconBg: 'bg-green-100',
    tag: 'Profit',
    tagColor: 'bg-green-50 text-green-700',
  },
  {
    href: '/portal/reports/supplier-receivables',
    icon: <ArrowRightLeft size={24} className="text-purple-600" />,
    title: 'Supplier Receivables',
    description: 'Track amounts receivable from suppliers and partner settlements',
    color: 'bg-purple-50 border-purple-100',
    iconBg: 'bg-purple-100',
    tag: 'Purchase',
    tagColor: 'bg-purple-50 text-purple-700',
  },
  {
    href: '/portal/accounts/customers',
    icon: <Users size={24} className="text-brand-600" />,
    title: 'Customer profiles',
    description: 'Full 360° view of each customer — orders, payments, bad debts and legal cases',
    color: 'bg-brand-50 border-brand-100 text-brand-600',
    iconBg: 'bg-brand-100',
    tag: 'Accounts',
    tagColor: 'bg-brand-50 text-brand-700',
  },
]

export default function ReportsPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-400 mt-0.5">Business intelligence and financial reports</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {REPORTS.map(r => (
          <Link key={r.href} href={r.href}
            className={`group p-5 rounded-xl border shadow-sm hover:shadow-md transition-all ${r.color}`}>
            <div className="flex items-start justify-between gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${r.iconBg}`}>
                {r.icon}
              </div>
              <ChevronRight size={18} className="text-gray-300 group-hover:text-gray-500 transition-colors mt-1 shrink-0" />
            </div>
            <div className="mt-3">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-sm font-semibold text-gray-900 group-hover:text-brand-700 transition-colors">{r.title}</h2>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.tagColor}`}>{r.tag}</span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">{r.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

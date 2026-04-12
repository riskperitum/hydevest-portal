'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, ShoppingCart, TrendingUp, Package, Receipt, DollarSign, Users, BarChart2, Inbox, Settings, ChevronDown, ChevronRight, ChevronLeft, ClipboardList } from 'lucide-react'
import { BrandLogo } from '@/components/brand/BrandLogo'

interface NavChild { label: string; href: string }
interface NavItem { label: string; href?: string; icon: React.ReactNode; children?: NavChild[] }

const NAV: NavItem[] = [
  { label: 'Overview', href: '/portal/overview', icon: <LayoutDashboard size={18} /> },
  { label: 'Tasks', href: '/portal/tasks', icon: <ClipboardList size={18} /> },
  { label: 'Purchase', icon: <ShoppingCart size={18} />, children: [
    { label: 'Trips', href: '/portal/purchase/trips' },
    { label: 'Containers', href: '/portal/purchase/containers' },
  ]},
  { label: 'Sales', icon: <TrendingUp size={18} />, children: [
    { label: 'Pre-sale', href: '/portal/sales/presale' },
    { label: 'Orders', href: '/portal/sales/orders' },
    { label: 'Buyers', href: '/portal/sales/buyers' },
  ]},
  { label: 'Inventory', href: '/portal/inventory', icon: <Package size={18} /> },
  { label: 'Expensify', href: '/portal/expensify', icon: <Receipt size={18} /> },
  { label: 'Finance', href: '/portal/finance', icon: <DollarSign size={18} /> },
  { label: 'Partnership', href: '/portal/partnership', icon: <Users size={18} /> },
  { label: 'Reports', href: '/portal/reports', icon: <BarChart2 size={18} /> },
  { label: 'Requestbox', href: '/portal/requestbox', icon: <Inbox size={18} /> },
  { label: 'Accounts', href: '/portal/accounts', icon: <Users size={18} /> },
]

export default function Sidebar({ isSuperAdmin }: { roles: string[]; isSuperAdmin: boolean }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [openGroups, setOpenGroups] = useState<string[]>(['Purchase', 'Sales'])

  const toggle = (label: string) =>
    setOpenGroups(p => p.includes(label) ? p.filter(l => l !== label) : [...p, label])

  const active = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const groupActive = (item: NavItem) => item.children?.some(c => active(c.href)) ?? false

  const cls = (...c: (string | boolean | undefined)[]) => c.filter(Boolean).join(' ')

  return (
    <aside className={cls('flex flex-col h-full bg-white border-r border-gray-100 transition-all duration-200 shrink-0', collapsed ? 'w-16' : 'w-60')}>
      <div className="flex items-center min-h-[4rem] h-16 px-3 border-b border-gray-100 shrink-0 gap-1">
        <Link
          href="/portal/overview"
          className={cls(
            'flex items-center min-w-0 flex-1 overflow-hidden',
            collapsed && 'justify-center px-0',
          )}
        >
          <BrandLogo
            priority
            className={cls(
              'object-contain shrink-0',
              collapsed ? 'h-7 w-auto max-w-[3.75rem]' : 'h-10 w-auto max-w-[12.5rem]',
            )}
          />
        </Link>
        <button onClick={() => setCollapsed(v => !v)} className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 shrink-0">
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {NAV.map(item => (
          <div key={item.label}>
            {item.href && !item.children ? (
              <Link href={item.href} title={collapsed ? item.label : undefined}
                className={cls('flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-all',
                  active(item.href) ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900')}>
                <span className="shrink-0">{item.icon}</span>
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            ) : (
              <div>
                <button onClick={() => toggle(item.label)} title={collapsed ? item.label : undefined}
                  className={cls('w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-all',
                    groupActive(item) ? 'text-brand-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900')}>
                  <span className="shrink-0">{item.icon}</span>
                  {!collapsed && <>
                    <span className="flex-1 text-left truncate">{item.label}</span>
                    {openGroups.includes(item.label) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </>}
                </button>
                {!collapsed && openGroups.includes(item.label) && (
                  <div className="ml-7 mt-0.5 space-y-0.5">
                    {item.children?.map(child => (
                      <Link key={child.href} href={child.href}
                        className={cls('block px-3 py-1.5 rounded-lg text-sm transition-all',
                          active(child.href) ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800')}>
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </nav>

      {isSuperAdmin && (
        <div className="px-2 pb-3 border-t border-gray-100 pt-2">
          <Link href="/portal/admin" title={collapsed ? 'Admin' : undefined}
            className={cls('flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-all',
              active('/portal/admin') ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900')}>
            <Settings size={18} className="shrink-0" />
            {!collapsed && <span>Admin</span>}
          </Link>
        </div>
      )}
    </aside>
  )
}
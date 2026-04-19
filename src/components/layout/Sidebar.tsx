'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { usePermissions, can } from '@/lib/permissions/hooks'
import {
  LayoutDashboard, MessageSquare, ClipboardList, ShoppingCart, TrendingUp,
  Package, Receipt, Wallet, BarChart3, Inbox, Users,
  Settings, ChevronDown, ChevronRight, Menu, X, RefreshCcw, DollarSign, Scale
} from 'lucide-react'

interface NavItem {
  label: string
  href?: string
  icon: any
  children?: { label: string; href: string; icon?: any; exactMatch?: boolean; permKey?: string }[]
  adminOnly?: boolean
  partnerOnly?: boolean
  permKey?: string        // required permission key to show this item
  superAdminOnly?: boolean
}

const NAV: NavItem[] = [
  {
    label: 'Overview',
    href: '/portal/overview',
    icon: LayoutDashboard,
    // Everyone can see overview
  },
  {
    label: 'Tasks',
    href: '/portal/tasks',
    icon: ClipboardList,
    permKey: 'tasks.view',
  },
  {
    label: 'Purchase',
    icon: ShoppingCart,
    children: [
      { label: 'Trips',      href: '/portal/purchase/trips',      permKey: 'trips.view'      },
      { label: 'Containers', href: '/portal/purchase/containers',  permKey: 'containers.view' },
    ]
  },
  {
    label: 'Sales',
    icon: TrendingUp,
    children: [
      { label: 'Pre-sales',    href: '/portal/sales/presales', permKey: 'presales.view'      },
      { label: 'Sales orders', href: '/portal/sales/orders',   permKey: 'sales_orders.view'  },
    ]
  },
  {
    label: 'Recoveries',
    href: '/portal/recoveries',
    icon: RefreshCcw,
    permKey: 'recoveries.view',
  },
  {
    label: 'Expensify',
    href: '/portal/expensify',
    icon: Receipt,
    permKey: 'expenses.view',
  },
  {
    label: 'Inventory',
    href: '/portal/inventory',
    icon: Package,
    permKey: 'inventory.view',
  },
  {
    label: 'Partnership',
    href: '/portal/partnership',
    icon: Users,
    permKey: 'partnership.view',
  },
  {
    label: 'Request Box',
    href: '/portal/requestbox',
    icon: Inbox,
    permKey: 'requestbox.view',
  },
  {
    label: 'Finance',
    href: '/portal/finance',
    icon: BarChart3,
    permKey: 'finance.view',
  },
  {
    label: 'Payroll',
    href: '/portal/payroll',
    icon: DollarSign,
    permKey: 'payroll.view',
  },
  {
    label: 'Legal',
    href: '/portal/legal',
    icon: Scale,
    permKey: 'legal.view',
  },
  {
    label: 'Reports',
    href: '/portal/reports',
    icon: BarChart3,
    permKey: 'reports.view',
  },
  {
    label: 'System Accounts',
    href: '/portal/accounts',
    icon: Users,
    permKey: 'accounts.view_customers',
  },
  {
    label: 'Admin',
    href: '/portal/admin',
    icon: Settings,
    adminOnly: true,
  },
]

const PARTNER_NAV: NavItem[] = [
  { href: '/portal/partner-dashboard', label: 'My Dashboard', icon: LayoutDashboard },
  { href: '/portal/partner-requestbox', label: 'Messages', icon: MessageSquare },
]

export default function Sidebar({ isPartner }: { isPartner: boolean }) {
  const pathname = usePathname()
  const [openGroups, setOpenGroups] = useState<string[]>(['Purchase', 'Sales'])
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const { isSuperAdmin, permissions, loading } = usePermissions()

  useEffect(() => { setMobileOpen(false) }, [pathname])

  useEffect(() => {
    NAV.forEach(item => {
      if (item.children?.some(c => pathname.startsWith(c.href))) {
        setOpenGroups(prev => prev.includes(item.label) ? prev : [...prev, item.label])
      }
    })
  }, [pathname])

  function toggleGroup(label: string) {
    setOpenGroups(prev =>
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
    )
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  function isChildActive(href: string, exactMatch?: boolean) {
    if (exactMatch) return pathname === href || pathname === `${href}/`
    return isActive(href)
  }

  // Check if user can see a nav item
  function canSee(item: NavItem): boolean {
    if (isSuperAdmin) return true
    if (item.superAdminOnly) return false
    if (item.adminOnly) return isSuperAdmin || can(permissions, isSuperAdmin, 'admin.*')
    if (item.permKey) return can(permissions, isSuperAdmin, item.permKey)
    return true // no permKey = visible to all
  }

  function canSeeChild(child: { permKey?: string }): boolean {
    if (isSuperAdmin) return true
    if (child.permKey) return can(permissions, isSuperAdmin, child.permKey)
    return true
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 shrink-0">
        <Link href={isPartner ? '/portal/partner-dashboard' : '/portal/overview'} className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">H</span>
          </div>
          {!collapsed && <span className="font-bold text-gray-900 text-base">Hydevest</span>}
        </Link>
        <button
          onClick={() => setCollapsed(v => !v)}
          className="hidden lg:flex p-1 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} className="rotate-90" />}
        </button>
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {loading ? (
          <div className="space-y-2 px-3 py-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (isPartner ? PARTNER_NAV : NAV.filter(canSee)).map(item => {
          if (item.children) {
            // Filter children by permission
            const visibleChildren = item.children.filter(canSeeChild)
            if (visibleChildren.length === 0) return null

            const isOpen = openGroups.includes(item.label)
            const hasActive = visibleChildren.some(c => isChildActive(c.href, c.exactMatch))
            const Icon = item.icon
            return (
              <div key={item.label}>
                <button
                  onClick={() => toggleGroup(item.label)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                    ${hasActive ? 'text-brand-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>
                  <span className={hasActive ? 'text-brand-600' : 'text-gray-400'}><Icon size={18} /></span>
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      <ChevronDown size={14} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </>
                  )}
                </button>
                {isOpen && !collapsed && (
                  <div className="ml-9 mt-0.5 space-y-0.5">
                    {visibleChildren.map(child => {
                      const ChildIcon = child.icon
                      const active = isChildActive(child.href, child.exactMatch)
                      return (
                        <Link key={child.href} href={child.href}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors
                            ${active
                              ? 'bg-brand-50 text-brand-700 font-medium'
                              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}>
                          {ChildIcon && (
                            <span className={active ? 'text-brand-600' : 'text-gray-400'}>
                              <ChildIcon size={16} />
                            </span>
                          )}
                          {child.label}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }

          const Icon = item.icon
          return (
            <Link key={item.href} href={item.href!}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${isActive(item.href!)
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>
              <span className={isActive(item.href!) ? 'text-brand-600' : 'text-gray-400'}><Icon size={18} /></span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>
    </div>
  )

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3.5 left-4 z-40 p-2 rounded-lg bg-white border border-gray-200 shadow-sm text-gray-600 hover:bg-gray-50 transition-colors">
        <Menu size={18} />
      </button>

      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={`lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-100 shadow-xl transform transition-transform duration-200
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <SidebarContent />
      </aside>

      <aside className={`hidden lg:flex flex-col bg-white border-r border-gray-100 h-screen sticky top-0 transition-all duration-200
        ${collapsed ? 'w-16' : 'w-56'}`}>
        <SidebarContent />
      </aside>
    </>
  )
}

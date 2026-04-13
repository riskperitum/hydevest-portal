'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, ClipboardList, ShoppingCart, TrendingUp,
  Package, Receipt, Wallet, BarChart2, Inbox, Users,
  Settings, ChevronDown, ChevronRight, Menu, X, Building2
} from 'lucide-react'
import Image from 'next/image'

interface NavItem {
  label: string
  href?: string
  icon: React.ReactNode
  children?: { label: string; href: string }[]
}

const NAV: NavItem[] = [
  { label: 'Overview',    href: '/portal/overview',  icon: <LayoutDashboard size={18} /> },
  { label: 'Tasks',       href: '/portal/tasks',      icon: <ClipboardList size={18} /> },
  {
    label: 'Purchase', icon: <ShoppingCart size={18} />,
    children: [
      { label: 'Trips',      href: '/portal/purchase/trips' },
      { label: 'Containers', href: '/portal/purchase/containers' },
    ]
  },
  {
    label: 'Sales', icon: <TrendingUp size={18} />,
    children: [
      { label: 'Pre-sale', href: '/portal/sales/presale' },
      { label: 'Orders',   href: '/portal/sales/orders' },
      { label: 'Buyers',   href: '/portal/sales/buyers' },
    ]
  },
  { label: 'Inventory',   href: '/portal/inventory',  icon: <Package size={18} /> },
  { label: 'Expensify',   href: '/portal/expensify',  icon: <Receipt size={18} /> },
  { label: 'Finance',     href: '/portal/finance',    icon: <Wallet size={18} /> },
  { label: 'Partnership', href: '/portal/partnership', icon: <Building2 size={18} /> },
  { label: 'Reports',     href: '/portal/reports',    icon: <BarChart2 size={18} /> },
  { label: 'Requestbox',  href: '/portal/requestbox', icon: <Inbox size={18} /> },
  { label: 'Accounts',    href: '/portal/accounts',   icon: <Users size={18} /> },
  { label: 'Admin',       href: '/portal/admin',      icon: <Settings size={18} /> },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [openGroups, setOpenGroups] = useState<string[]>(['Purchase', 'Sales'])
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  // Close mobile sidebar on route change
  useEffect(() => { setMobileOpen(false) }, [pathname])

  // Auto-expand group if current path is inside it
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

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 shrink-0">
        <Link href="/portal/overview" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">H</span>
          </div>
          {!collapsed && <span className="font-bold text-gray-900 text-base">Hydevest</span>}
        </Link>
        {/* Desktop collapse toggle */}
        <button
          onClick={() => setCollapsed(v => !v)}
          className="hidden lg:flex p-1 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} className="rotate-90" />}
        </button>
        {/* Mobile close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {NAV.map(item => {
          if (item.children) {
            const isOpen = openGroups.includes(item.label)
            const hasActive = item.children.some(c => isActive(c.href))
            return (
              <div key={item.label}>
                <button
                  onClick={() => toggleGroup(item.label)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                    ${hasActive ? 'text-brand-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>
                  <span className={hasActive ? 'text-brand-600' : 'text-gray-400'}>{item.icon}</span>
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      <ChevronDown size={14} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </>
                  )}
                </button>
                {isOpen && !collapsed && (
                  <div className="ml-9 mt-0.5 space-y-0.5">
                    {item.children.map(child => (
                      <Link key={child.href} href={child.href}
                        className={`block px-3 py-1.5 rounded-lg text-sm transition-colors
                          ${isActive(child.href)
                            ? 'bg-brand-50 text-brand-700 font-medium'
                            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}>
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          }
          return (
            <Link key={item.href} href={item.href!}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${isActive(item.href!)
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>
              <span className={isActive(item.href!) ? 'text-brand-600' : 'text-gray-400'}>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>
    </div>
  )

  return (
    <>
      {/* Mobile hamburger button — shown in header area */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3.5 left-4 z-40 p-2 rounded-lg bg-white border border-gray-200 shadow-sm text-gray-600 hover:bg-gray-50 transition-colors">
        <Menu size={18} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside className={`lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-100 shadow-xl transform transition-transform duration-200
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <SidebarContent />
      </aside>

      {/* Desktop sidebar */}
      <aside className={`hidden lg:flex flex-col bg-white border-r border-gray-100 h-screen sticky top-0 transition-all duration-200
        ${collapsed ? 'w-16' : 'w-56'}`}>
        <SidebarContent />
      </aside>
    </>
  )
}
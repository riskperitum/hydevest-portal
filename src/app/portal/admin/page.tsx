'use client'

import Link from 'next/link'
import { Shield, Users, Key } from 'lucide-react'

const SECTIONS = [
  {
    href: '/portal/admin/roles',
    icon: <Shield size={24} className="text-brand-600" />,
    title: 'Roles & Groups',
    description: 'Create and manage roles, assign permissions to roles',
    color: 'bg-brand-50 border-brand-100',
  },
  {
    href: '/portal/admin/users',
    icon: <Users size={24} className="text-green-600" />,
    title: 'User Management',
    description: 'Assign roles to users, grant or deny direct permissions',
    color: 'bg-green-50 border-green-100',
  },
  {
    href: '/portal/admin/permissions',
    icon: <Key size={24} className="text-amber-600" />,
    title: 'Permissions Registry',
    description: 'View all system permissions and their descriptions',
    color: 'bg-amber-50 border-amber-100',
  },
]

export default function AdminPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Admin</h1>
        <p className="text-sm text-gray-400 mt-0.5">Manage roles, permissions and user access</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {SECTIONS.map(s => (
          <Link key={s.href} href={s.href}
            className={`p-5 rounded-xl border shadow-sm hover:shadow-md transition-all ${s.color} group`}>
            <div className="mb-3">{s.icon}</div>
            <h2 className="text-sm font-semibold text-gray-900 group-hover:text-brand-700 transition-colors">{s.title}</h2>
            <p className="text-xs text-gray-500 mt-1">{s.description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

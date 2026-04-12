'use client'

import { useState } from 'react'
import { Users, ShoppingBag, Truck, Handshake, Building2, Ship } from 'lucide-react'
import EmployeesTab from './tabs/EmployeesTab'
import CustomersTab from './tabs/CustomersTab'
import SuppliersTab from './tabs/SuppliersTab'
import PartnersTab from './tabs/PartnersTab'
import BdcAgentsTab from './tabs/BdcAgentsTab'
import ClearingAgentsTab from './tabs/ClearingAgentsTab'

const TABS = [
  { key: 'employees',       label: 'Employees',      icon: <Users size={16} /> },
  { key: 'customers',       label: 'Customers',       icon: <ShoppingBag size={16} /> },
  { key: 'suppliers',       label: 'Suppliers',       icon: <Truck size={16} /> },
  { key: 'partners',        label: 'Partners',        icon: <Handshake size={16} /> },
  { key: 'bdc-agents',      label: 'BDC Agents',      icon: <Building2 size={16} /> },
  { key: 'clearing-agents', label: 'Clearing Agents', icon: <Ship size={16} /> },
]

export default function AccountsPage() {
  const [activeTab, setActiveTab] = useState('employees')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Accounts</h1>
        <p className="text-sm text-gray-400 mt-0.5">Manage all entities across the system</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex overflow-x-auto border-b border-gray-100">
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-all border-b-2 -mb-px
                ${activeTab === tab.key ? 'border-brand-600 text-brand-600 bg-brand-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
        <div className="p-5">
          {activeTab === 'employees'       && <EmployeesTab />}
          {activeTab === 'customers'       && <CustomersTab />}
          {activeTab === 'suppliers'       && <SuppliersTab />}
          {activeTab === 'partners'        && <PartnersTab />}
          {activeTab === 'bdc-agents'      && <BdcAgentsTab />}
          {activeTab === 'clearing-agents' && <ClearingAgentsTab />}
        </div>
      </div>
    </div>
  )
}

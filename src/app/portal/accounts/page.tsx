'use client'

import { useState } from 'react'
import { Users, ShoppingBag, Truck, Handshake, Building2, Ship, Landmark } from 'lucide-react'
import EmployeesTab from './tabs/EmployeesTab'
import CustomersTab from './tabs/CustomersTab'
import SuppliersTab from './tabs/SuppliersTab'
import PartnersTab from './tabs/PartnersTab'
import BdcAgentsTab from './tabs/BdcAgentsTab'
import ClearingAgentsTab from './tabs/ClearingAgentsTab'
import EntityTab from './tabs/EntityTab'

const TABS = [
  { key: 'employees',       label: 'Employees',       icon: <Users size={16} /> },
  { key: 'customers',       label: 'Customers',       icon: <ShoppingBag size={16} /> },
  { key: 'suppliers',       label: 'Suppliers',       icon: <Truck size={16} /> },
  { key: 'partners',        label: 'Partners',        icon: <Handshake size={16} /> },
  { key: 'bdc_agents',      label: 'BDC Agents',      icon: <Building2 size={16} /> },
  { key: 'clearing_agents', label: 'Clearing Agents', icon: <Ship size={16} /> },
  { key: 'entities',        label: 'Entities',        icon: <Landmark size={16} /> },
]

export default function AccountsPage() {
  const [activeTab, setActiveTab] = useState(TABS[0].key)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Accounts</h1>
          <p className="text-sm text-gray-400 mt-0.5">Manage all entities across the system</p>
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {TABS.map(tab => (
          <button key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors whitespace-nowrap
              ${activeTab === tab.key
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300 hover:text-brand-600'}`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        {activeTab === 'employees'       && <EmployeesTab />}
        {activeTab === 'customers'       && <CustomersTab />}
        {activeTab === 'suppliers'       && <SuppliersTab />}
        {activeTab === 'partners'        && <PartnersTab />}
        {activeTab === 'bdc_agents'      && <BdcAgentsTab />}
        {activeTab === 'clearing_agents' && <ClearingAgentsTab />}
        {activeTab === 'entities'        && <EntityTab />}
      </div>
    </div>
  )
}

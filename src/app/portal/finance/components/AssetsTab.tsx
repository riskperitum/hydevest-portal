'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, Loader2, FileText, Pencil,
  TrendingDown, CheckCircle2, AlertCircle
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import AmountInput from '@/components/ui/AmountInput'

interface Asset {
  id: string
  asset_id: string
  name: string
  category: string
  asset_type: string
  purchase_date: string
  purchase_cost_ngn: number
  residual_value_ngn: number
  useful_life_years: number
  depreciation_method: string
  is_disposed: boolean
  disposal_date: string | null
  disposal_amount_ngn: number | null
  notes: string | null
  accumulated_depreciation: number
  net_book_value: number
  monthly_depreciation: number
  age_months: number
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
const fmtFull = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const CATEGORIES = [
  'vehicle', 'office_equipment', 'furniture', 'computer',
  'intangible', 'land_building', 'other'
]

const CATEGORY_LABELS: Record<string, string> = {
  vehicle:          'Vehicle',
  office_equipment: 'Office equipment',
  furniture:        'Furniture & fittings',
  computer:         'Computer & IT',
  intangible:       'Intangible asset',
  land_building:    'Land & building',
  other:            'Other',
}

const CATEGORY_LIFE: Record<string, number> = {
  vehicle:          4,
  office_equipment: 5,
  furniture:        10,
  computer:         3,
  intangible:       5,
  land_building:    50,
  other:            5,
}

export default function AssetsTab({ selectedPeriod }: { selectedPeriod: string }) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<'all' | 'tangible' | 'intangible'>('all')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editRow, setEditRow] = useState<Asset | null>(null)
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null)
  const [runningDepreciation, setRunningDepreciation] = useState(false)
  const [depResult, setDepResult] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '',
    category: 'office_equipment',
    asset_type: 'tangible',
    purchase_date: new Date().toISOString().split('T')[0],
    purchase_cost_ngn: '',
    residual_value_ngn: '0',
    useful_life_years: '5',
    depreciation_method: 'straight_line',
    notes: '',
  })

  const load = useCallback(async () => {
    const supabase = createClient()

    const { data: assetData } = await supabase
      .from('finance_assets')
      .select('*')
      .order('purchase_date', { ascending: false })

    // Get accumulated depreciation per asset
    const { data: depData } = await supabase
      .from('finance_asset_depreciation')
      .select('asset_id, depreciation_ngn, accumulated_ngn, net_book_value_ngn')
      .order('created_at', { ascending: false })

    // Latest depreciation per asset
    const latestDep: Record<string, any> = {}
    for (const d of (depData ?? [])) {
      if (!latestDep[d.asset_id]) latestDep[d.asset_id] = d
    }

    const now = new Date()
    setAssets((assetData ?? []).map(a => {
      const purchaseDate = new Date(a.purchase_date)
      const ageMonths = Math.max(0,
        (now.getFullYear() - purchaseDate.getFullYear()) * 12 +
        (now.getMonth() - purchaseDate.getMonth())
      )
      const cost = Number(a.purchase_cost_ngn)
      const residual = Number(a.residual_value_ngn)
      const lifeMonths = Number(a.useful_life_years) * 12
      const monthlyDep = lifeMonths > 0 ? (cost - residual) / lifeMonths : 0

      const dep = latestDep[a.id]
      const accumulatedDep = dep ? Number(dep.accumulated_ngn) : 0
      const nbv = dep ? Number(dep.net_book_value_ngn) : cost - accumulatedDep

      return {
        ...a,
        purchase_cost_ngn: cost,
        residual_value_ngn: residual,
        useful_life_years: Number(a.useful_life_years),
        disposal_amount_ngn: a.disposal_amount_ngn ? Number(a.disposal_amount_ngn) : null,
        accumulated_depreciation: accumulatedDep,
        net_book_value: nbv,
        monthly_depreciation: monthlyDep,
        age_months: ageMonths,
      }
    }))

    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user ? { id: user.id } : null))
  }, [load])

  function openAdd() {
    setEditRow(null)
    setForm({
      name: '', category: 'office_equipment', asset_type: 'tangible',
      purchase_date: new Date().toISOString().split('T')[0],
      purchase_cost_ngn: '', residual_value_ngn: '0',
      useful_life_years: '5', depreciation_method: 'straight_line', notes: '',
    })
    setOpen(true)
  }

  function openEdit(row: Asset) {
    setEditRow(row)
    setForm({
      name: row.name, category: row.category, asset_type: row.asset_type,
      purchase_date: row.purchase_date,
      purchase_cost_ngn: row.purchase_cost_ngn.toString(),
      residual_value_ngn: row.residual_value_ngn.toString(),
      useful_life_years: row.useful_life_years.toString(),
      depreciation_method: row.depreciation_method, notes: row.notes ?? '',
    })
    setOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()

    const seq = Date.now().toString().slice(-4)
    const payload = {
      name: form.name, category: form.category, asset_type: form.asset_type,
      purchase_date: form.purchase_date,
      purchase_cost_ngn: parseFloat(form.purchase_cost_ngn),
      residual_value_ngn: parseFloat(form.residual_value_ngn) || 0,
      useful_life_years: parseFloat(form.useful_life_years),
      depreciation_method: form.depreciation_method,
      notes: form.notes || null,
      created_by: currentUser?.id,
    }

    if (editRow) {
      await supabase.from('finance_assets').update(payload).eq('id', editRow.id)
    } else {
      await supabase.from('finance_assets').insert({
        ...payload,
        asset_id: `AST-${seq}`,
      })
    }
    setSaving(false)
    setOpen(false)
    load()
  }

  async function runDepreciation() {
    if (!selectedPeriod) {
      setDepResult('Please select a period first.')
      return
    }
    setRunningDepreciation(true)
    setDepResult(null)
    const supabase = createClient()

    const { data: period } = await supabase
      .from('finance_periods')
      .select('*')
      .eq('id', selectedPeriod)
      .single()

    if (!period) {
      setDepResult('Period not found.')
      setRunningDepreciation(false)
      return
    }

    const activeAssets = assets.filter(a => !a.is_disposed && a.net_book_value > a.residual_value_ngn)
    let count = 0

    for (const asset of activeAssets) {
      // Check if depreciation already run for this period
      const { data: existing } = await supabase
        .from('finance_asset_depreciation')
        .select('id')
        .eq('asset_id', asset.id)
        .eq('period_id', selectedPeriod)
        .single()

      if (existing) continue

      const depAmount = Math.min(asset.monthly_depreciation, asset.net_book_value - asset.residual_value_ngn)
      if (depAmount <= 0) continue

      const newAccumulated = asset.accumulated_depreciation + depAmount
      const newNBV = asset.purchase_cost_ngn - newAccumulated

      await supabase.from('finance_asset_depreciation').insert({
        asset_id:           asset.id,
        period_id:          selectedPeriod,
        depreciation_ngn:   depAmount,
        accumulated_ngn:    newAccumulated,
        net_book_value_ngn: Math.max(newNBV, asset.residual_value_ngn),
      })
      count++
    }

    setDepResult(`Depreciation run complete — ${count} asset${count !== 1 ? 's' : ''} depreciated for ${period.name}.`)
    setRunningDepreciation(false)
    load()
  }

  const filtered = assets.filter(a =>
    typeFilter === 'all' || a.asset_type === typeFilter
  )

  const totalCost     = filtered.reduce((s, a) => s + a.purchase_cost_ngn, 0)
  const totalAccDep   = filtered.reduce((s, a) => s + a.accumulated_depreciation, 0)
  const totalNBV      = filtered.reduce((s, a) => s + a.net_book_value, 0)
  const totalMonthlyDep = filtered.filter(a => !a.is_disposed).reduce((s, a) => s + a.monthly_depreciation, 0)

  return (
    <div className="p-5 space-y-5">

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Fixed assets register</h2>
          <p className="text-xs text-gray-400 mt-0.5">{filtered.filter(a => !a.is_disposed).length} active assets</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={runDepreciation} disabled={runningDepreciation}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border border-amber-200 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 disabled:opacity-50">
            {runningDepreciation ? <Loader2 size={14} className="animate-spin" /> : <TrendingDown size={14} />}
            Run depreciation
          </button>
          <button onClick={openAdd}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700">
            <Plus size={14} /> Add asset
          </button>
        </div>
      </div>

      {/* Depreciation result */}
      {depResult && (
        <div className={`flex items-center gap-3 p-3 rounded-xl border ${depResult.includes('complete') ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
          {depResult.includes('complete')
            ? <CheckCircle2 size={15} className="text-green-600 shrink-0" />
            : <AlertCircle size={15} className="text-amber-600 shrink-0" />}
          <p className="text-sm font-medium text-gray-700">{depResult}</p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total cost',               value: fmt(totalCost),         color: 'text-gray-900',   bg: 'bg-white' },
          { label: 'Accumulated depreciation', value: fmt(totalAccDep),       color: 'text-red-600',    bg: 'bg-red-50' },
          { label: 'Net book value',           value: fmt(totalNBV),          color: 'text-brand-700',  bg: 'bg-brand-50' },
          { label: 'Monthly depreciation',     value: fmt(totalMonthlyDep),   color: 'text-amber-700',  bg: 'bg-amber-50' },
        ].map(m => (
          <div key={m.label} className={`${m.bg} rounded-xl border border-white shadow-sm p-4`}>
            <p className="text-xs text-gray-400 mb-1">{m.label}</p>
            <p className={`text-base font-bold truncate ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Type filter */}
      <div className="flex items-center gap-2">
        {[
          { key: 'all',       label: 'All assets' },
          { key: 'tangible',  label: 'Tangible' },
          { key: 'intangible',label: 'Intangible' },
        ].map(f => (
          <button key={f.key} onClick={() => setTypeFilter(f.key as typeof typeFilter)}
            className={`px-3 py-1 text-xs rounded-full font-medium transition-colors
              ${typeFilter === f.key ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Assets table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-4 border-b animate-pulse flex gap-4">
              <div className="h-4 bg-gray-100 rounded w-1/4" />
              <div className="h-4 bg-gray-100 rounded w-1/2" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <FileText size={24} className="text-gray-200" />
            <p className="text-sm text-gray-400">No assets recorded yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Asset ID','Name','Category','Type','Purchase date','Cost','Acc. depreciation','Net book value','Monthly dep.','Status',''].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(a => {
                  const depPct = a.purchase_cost_ngn > 0
                    ? (a.accumulated_depreciation / (a.purchase_cost_ngn - a.residual_value_ngn)) * 100
                    : 0
                  return (
                    <tr key={a.id} className={`hover:bg-gray-50/50 transition-colors ${a.is_disposed ? 'opacity-50' : ''}`}>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded">{a.asset_id}</span>
                      </td>
                      <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap">{a.name}</td>
                      <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap capitalize">
                        {CATEGORY_LABELS[a.category] ?? a.category}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize
                          ${a.asset_type === 'tangible' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                          {a.asset_type}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(a.purchase_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap text-xs">{fmt(a.purchase_cost_ngn)}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div>
                          <span className="text-xs font-medium text-red-600">{fmt(a.accumulated_depreciation)}</span>
                          <div className="mt-1 h-1 w-16 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-red-400 rounded-full" style={{ width: `${Math.min(depPct, 100)}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`text-xs font-bold ${a.net_book_value <= a.residual_value_ngn ? 'text-gray-400' : 'text-brand-700'}`}>
                          {fmt(a.net_book_value)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-amber-700 font-medium whitespace-nowrap">
                        {a.is_disposed || a.net_book_value <= a.residual_value_ngn ? '—' : fmt(a.monthly_depreciation)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                          ${a.is_disposed ? 'bg-gray-100 text-gray-500' :
                            a.net_book_value <= a.residual_value_ngn ? 'bg-amber-50 text-amber-700' :
                            'bg-green-50 text-green-700'}`}>
                          {a.is_disposed ? 'Disposed' : a.net_book_value <= a.residual_value_ngn ? 'Fully depreciated' : 'Active'}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <button onClick={() => openEdit(a)}
                          className="p-1.5 rounded hover:bg-brand-50 text-gray-300 hover:text-brand-600 transition-colors">
                          <Pencil size={13} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/edit modal */}
      <Modal open={open} onClose={() => setOpen(false)}
        title={editRow ? 'Edit asset' : 'Add asset'} size="md">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Asset name <span className="text-red-400">*</span>
              </label>
              <input required value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Toyota Hilux — Lagos office"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
              <select value={form.category}
                onChange={e => {
                  const life = CATEGORY_LIFE[e.target.value] ?? 5
                  setForm(f => ({ ...f, category: e.target.value, useful_life_years: life.toString() }))
                }}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Asset type</label>
              <select value={form.asset_type}
                onChange={e => setForm(f => ({ ...f, asset_type: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="tangible">Tangible</option>
                <option value="intangible">Intangible</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Purchase date <span className="text-red-400">*</span>
              </label>
              <input type="date" required value={form.purchase_date}
                onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Purchase cost (NGN) <span className="text-red-400">*</span>
              </label>
              <AmountInput required value={form.purchase_cost_ngn}
                onChange={v => setForm(f => ({ ...f, purchase_cost_ngn: v }))}
                placeholder="0.00"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Residual value (NGN)</label>
              <AmountInput value={form.residual_value_ngn}
                onChange={v => setForm(f => ({ ...f, residual_value_ngn: v }))}
                placeholder="0.00"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Useful life (years)</label>
              <input type="number" step="0.5" min="0.5" value={form.useful_life_years}
                onChange={e => setForm(f => ({ ...f, useful_life_years: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Method</label>
              <select value={form.depreciation_method}
                onChange={e => setForm(f => ({ ...f, depreciation_method: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="straight_line">Straight-line</option>
                <option value="reducing_balance">Reducing balance</option>
              </select>
            </div>
          </div>

          {/* Preview */}
          {form.purchase_cost_ngn && (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-100 text-xs space-y-1">
              <p className="font-semibold text-amber-800">Depreciation preview:</p>
              <p className="text-amber-700">
                Monthly: {fmt((parseFloat(form.purchase_cost_ngn) - (parseFloat(form.residual_value_ngn) || 0)) / (parseFloat(form.useful_life_years) * 12))} /month
              </p>
              <p className="text-amber-700">
                Annual: {fmt((parseFloat(form.purchase_cost_ngn) - (parseFloat(form.residual_value_ngn) || 0)) / parseFloat(form.useful_life_years))} /year
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
            <textarea rows={2} value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Serial number, location, any other details..."
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setOpen(false)}
              className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : editRow ? 'Save changes' : 'Add asset'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}


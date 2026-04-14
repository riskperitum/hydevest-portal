'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, Search, Filter, Download, FileText,
  Loader2, X, Upload, Eye, Trash2, AlertTriangle,
  Receipt, TrendingDown, DollarSign, Globe
} from 'lucide-react'
import AmountInput from '@/components/ui/AmountInput'

interface ExpenseRow {
  id: string
  expense_id: string
  main_type: string
  category: string
  type: string
  description: string
  amount: number
  currency: string
  exchange_rate: number
  amount_ngn: number
  expense_date: string
  file_urls: { url: string; name: string; type: string }[]
  source: string
  trip_id: string | null
  created_by: string | null
  created_at: string
  creator?: { full_name: string | null; email: string } | null
  trip?: { trip_id: string; title: string } | null
}

const CATEGORIES = [
  'Transport', 'Accommodation', 'Meals', 'Office Supplies',
  'Utilities', 'Professional Services', 'Marketing', 'Equipment',
  'Maintenance', 'Customs & Duties', 'Port Charges', 'Logistics',
  'Communication', 'Banking & Finance', 'Miscellaneous',
]

const CURRENCIES = ['NGN', 'USD', 'GBP', 'EUR', 'CNY']

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Transport':            ['fuel', 'transport', 'vehicle', 'car', 'truck', 'logistics', 'freight', 'shipping', 'delivery', 'drive', 'uber', 'bolt', 'taxi'],
  'Accommodation':        ['hotel', 'accommodation', 'lodging', 'stay', 'apartment', 'hostel'],
  'Meals':                ['food', 'lunch', 'dinner', 'breakfast', 'meal', 'restaurant', 'snack', 'catering', 'eat'],
  'Office Supplies':      ['office', 'stationery', 'paper', 'printer', 'supplies', 'pen', 'notebook'],
  'Utilities':            ['electricity', 'water', 'internet', 'utility', 'power', 'generator', 'diesel'],
  'Professional Services':['legal', 'consultant', 'lawyer', 'accountant', 'audit', 'professional', 'service fee'],
  'Marketing':            ['marketing', 'advert', 'promotion', 'social media', 'brand', 'campaign'],
  'Equipment':            ['equipment', 'machine', 'device', 'tool', 'hardware', 'computer', 'laptop', 'phone'],
  'Maintenance':          ['repair', 'maintenance', 'fix', 'service', 'parts'],
  'Customs & Duties':     ['customs', 'duty', 'tariff', 'import', 'export', 'clearance'],
  'Port Charges':         ['port', 'terminal', 'demurrage', 'berth', 'dock', 'wharf'],
  'Logistics':            ['warehouse', 'storage', 'container', 'packing', 'loading', 'unloading'],
  'Communication':        ['phone', 'airtime', 'data', 'telecom', 'mobile', 'call', 'sms'],
  'Banking & Finance':    ['bank', 'transfer', 'fee', 'charge', 'interest', 'commission', 'forex'],
}

function detectCategory(description: string): string {
  const lower = description.toLowerCase()
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return category
  }
  return 'Miscellaneous'
}

const SOURCE_COLORS: Record<string, string> = {
  manual: 'bg-brand-50 text-brand-700',
  trip:   'bg-blue-50 text-blue-700',
}

export default function ExpensifyPage() {
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [currencyFilter, setCurrencyFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportType, setReportType] = useState<'filtered' | 'full'>('filtered')

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('NGN')
  const [exchangeRate, setExchangeRate] = useState('1')
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0])
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [uploadedFiles, setUploadedFiles] = useState<{ url: string; name: string; type: string }[]>([])
  const [uploading, setUploading] = useState(false)

  const autoCategory = description.length > 2 ? detectCategory(description) : ''
  const effectiveCategory = category || autoCategory
  const amountNgn = currency === 'NGN'
    ? parseFloat(amount) || 0
    : (parseFloat(amount) || 0) * (parseFloat(exchangeRate) || 1)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('expensify_unified')
      .select('*')
      .order('expense_date', { ascending: false })

    if (!data) { setLoading(false); return }

    // Enrich with creator profiles and trip info
    const creatorIds = [...new Set(data.filter(e => e.created_by).map(e => e.created_by))]
    const tripIds = [...new Set(data.filter(e => e.trip_id).map(e => e.trip_id))]

    const [{ data: profiles }, { data: trips }] = await Promise.all([
      creatorIds.length ? supabase.from('profiles').select('id, full_name, email').in('id', creatorIds) : { data: [] },
      tripIds.length ? supabase.from('trips').select('id, trip_id, title').in('id', tripIds) : { data: [] },
    ])

    const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))
    const tripMap = Object.fromEntries((trips ?? []).map(t => [t.id, t]))

    setExpenses(data.map(e => ({
      ...e,
      file_urls: e.file_urls ?? [],
      creator: profileMap[e.created_by] ?? null,
      trip: e.trip_id ? tripMap[e.trip_id] ?? null : null,
    })))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function resetForm() {
    setDescription('')
    setCategory('')
    setAmount('')
    setCurrency('NGN')
    setExchangeRate('1')
    setExpenseDate(new Date().toISOString().split('T')[0])
    setUploadFiles([])
    setUploadedFiles([])
  }

  async function handleUpload(files: File[]) {
    if (!files.length) return
    setUploading(true)
    const supabase = createClient()
    const uploaded: { url: string; name: string; type: string }[] = []
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const path = `expenses/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('documents').upload(path, file, { upsert: true })
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path)
        uploaded.push({ url: publicUrl, name: file.name, type: file.type })
      }
    }
    setUploadedFiles(prev => [...prev, ...uploaded])
    setUploading(false)
    setUploadFiles([])
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!effectiveCategory || !amount) return
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    await supabase.from('expenses').insert({
      category: effectiveCategory,
      description,
      amount: parseFloat(amount),
      currency,
      exchange_rate: parseFloat(exchangeRate) || 1,
      amount_ngn: amountNgn,
      expense_date: expenseDate,
      file_urls: uploadedFiles,
      created_by: user?.id,
    })

    setSaving(false)
    setModalOpen(false)
    resetForm()
    load()
  }

  async function handleDelete(id: string, source: string) {
    if (source !== 'manual') return
    if (!confirm('Delete this expense?')) return
    const supabase = createClient()
    await supabase.from('expenses').delete().eq('id', id)
    load()
  }

  const fmt = (n: number, curr = 'NGN') => {
    if (curr === 'NGN') return `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    return `${curr} ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const filtered = expenses.filter(e => {
    const matchSearch = search === '' ||
      e.description.toLowerCase().includes(search.toLowerCase()) ||
      e.expense_id.toLowerCase().includes(search.toLowerCase()) ||
      e.category.toLowerCase().includes(search.toLowerCase()) ||
      (e.trip?.trip_id ?? '').toLowerCase().includes(search.toLowerCase())
    const matchSource = sourceFilter === '' || e.source === sourceFilter
    const matchCategory = categoryFilter === '' || e.category === categoryFilter
    const matchCurrency = currencyFilter === '' || e.currency === currencyFilter
    const matchFrom = dateFrom === '' || new Date(e.expense_date) >= new Date(dateFrom)
    const matchTo = dateTo === '' || new Date(e.expense_date) <= new Date(dateTo)
    return matchSearch && matchSource && matchCategory && matchCurrency && matchFrom && matchTo
  })

  const activeFilters = [sourceFilter, categoryFilter, currencyFilter, dateFrom, dateTo].filter(Boolean).length
  const totalNgn = filtered.reduce((s, e) => s + Number(e.amount_ngn), 0)
  const totalManual = filtered.filter(e => e.source === 'manual').length
  const totalTrip = filtered.filter(e => e.source === 'trip').length
  const uniqueCategories = [...new Set(expenses.map(e => e.category))]

  function generateReport(type: 'filtered' | 'full') {
    const data = type === 'filtered' ? filtered : expenses
    const total = data.reduce((s, e) => s + Number(e.amount_ngn), 0)
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Expenses Report — Hydevest</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;color:#1a1a2e}
    .header{background:#55249E;color:white;padding:32px 40px}.header h1{font-size:24px;font-weight:700}
    .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;padding:24px 40px;background:#f8f7ff}
    .card{background:white;border-radius:8px;padding:16px;border:1px solid #ede9f7}
    .card .label{font-size:11px;color:#6b7280;text-transform:uppercase;margin-bottom:6px}
    .card .value{font-size:18px;font-weight:700;color:#55249E}
    .content{padding:24px 40px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    thead tr{background:#55249E;color:white}
    thead th{padding:10px 12px;text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;white-space:nowrap}
    tbody tr{border-bottom:1px solid #f0ebff}tbody tr:nth-child(even){background:#faf8ff}
    tbody td{padding:9px 12px;color:#374151;white-space:nowrap}
    .footer{padding:20px 40px;text-align:center;font-size:11px;color:#9ca3af;margin-top:24px}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>
    <div class="header"><h1>Expenses Report</h1>
    <p style="font-size:13px;opacity:.8;margin-top:4px">Generated ${new Date().toLocaleString()} · ${data.length} records</p></div>
    <div class="summary">
    <div class="card"><div class="label">Total expenses</div><div class="value">${data.length}</div></div>
    <div class="card"><div class="label">Total (NGN)</div><div class="value">₦${total.toLocaleString(undefined,{minimumFractionDigits:2})}</div></div>
    <div class="card"><div class="label">Manual entries</div><div class="value">${data.filter(e=>e.source==='manual').length}</div></div>
    <div class="card"><div class="label">Trip expenses</div><div class="value">${data.filter(e=>e.source==='trip').length}</div></div>
    </div>
    <div class="content"><table><thead><tr>
    <th>Expense ID</th><th>Source</th><th>Category</th><th>Description</th>
    <th>Amount</th><th>Currency</th><th>Amount (NGN)</th><th>Date</th><th>Trip</th>
    </tr></thead><tbody>
    ${data.map(e=>`<tr>
    <td><strong style="color:#55249E">${e.expense_id}</strong></td>
    <td>${e.source}</td>
    <td>${e.category}</td>
    <td>${e.description}</td>
    <td>${Number(e.amount).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
    <td>${e.currency}</td>
    <td>₦${Number(e.amount_ngn).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
    <td>${new Date(e.expense_date).toLocaleDateString()}</td>
    <td>${e.trip?.trip_id??'—'}</td>
    </tr>`).join('')}
    </tbody></table></div>
    <div class="footer">Hydevest Portal · Confidential</div></body></html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (win) win.focus()
    setReportOpen(false)
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Expensify</h1>
          <p className="text-sm text-gray-400 mt-0.5">{expenses.length} expense{expenses.length !== 1 ? 's' : ''} tracked</p>
        </div>
        <button onClick={() => { resetForm(); setModalOpen(true) }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors shrink-0">
          <Plus size={16} /> <span className="hidden sm:inline">Record expense</span>
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total expenses', value: filtered.length.toString(), icon: <Receipt size={15} className="text-brand-600" />, color: 'text-brand-700' },
          { label: 'Total (NGN)', value: `₦${totalNgn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: <TrendingDown size={15} className="text-red-500" />, color: 'text-red-600' },
          { label: 'Manual entries', value: totalManual.toString(), icon: <DollarSign size={15} className="text-green-600" />, color: 'text-green-700' },
          { label: 'Trip expenses', value: totalTrip.toString(), icon: <Globe size={15} className="text-blue-600" />, color: 'text-blue-700' },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-1">
              {m.icon}
              <p className="text-xs text-gray-400">{m.label}</p>
            </div>
            <p className={`text-lg font-semibold truncate ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Search + filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by description, category or expense ID..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowFilters(v => !v)}
              className={`inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors
                ${showFilters || activeFilters > 0 ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <Filter size={15} /> Filters
              {activeFilters > 0 && <span className="bg-brand-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">{activeFilters}</span>}
            </button>
            <button onClick={() => setReportOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors">
              <FileText size={15} /> Report
            </button>
            <button onClick={() => {
              const headers = ['Expense ID','Source','Category','Description','Amount','Currency','Amount NGN','Date','Trip']
              const rows = filtered.map(e => [e.expense_id, e.source, e.category, e.description, e.amount, e.currency, e.amount_ngn, new Date(e.expense_date).toLocaleDateString(), e.trip?.trip_id ?? ''])
              const csv = [headers,...rows].map(r=>r.join(',')).join('\n')
              const blob = new Blob([csv],{type:'text/csv'})
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a'); a.href=url; a.download='expenses.csv'; a.click()
            }} className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
              <Download size={15} /> Export
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-3 border-t border-gray-100">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Source</label>
              <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="">All sources</option>
                <option value="manual">Manual</option>
                <option value="trip">Trip expense</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Category</label>
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="">All categories</option>
                {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Currency</label>
              <select value={currencyFilter} onChange={e => setCurrencyFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                <option value="">All currencies</option>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Date from</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Date to</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            {activeFilters > 0 && (
              <div className="col-span-2 md:col-span-5 flex items-center justify-between pt-1">
                <p className="text-xs text-gray-400">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</p>
                <button onClick={() => { setSourceFilter(''); setCategoryFilter(''); setCurrencyFilter(''); setDateFrom(''); setDateTo('') }}
                  className="text-xs text-red-500 hover:text-red-700 font-medium">Clear all</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Expense ID','Source','Category','Description','Amount','Currency','Amount (NGN)','Date','Trip','Created by','Attachments',''].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 12 }).map((_, j) => (
                      <td key={j} className="px-3 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                        <Receipt size={20} className="text-gray-300" />
                      </div>
                      <p className="text-sm text-gray-400">No expenses found.</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.map(expense => (
                <tr key={expense.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors group">
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="font-mono text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-medium">{expense.expense_id}</span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SOURCE_COLORS[expense.source] ?? 'bg-gray-100 text-gray-600'}`}>
                      {expense.source === 'manual' ? 'Manual' : 'Trip'}
                    </span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full font-medium">{expense.category}</span>
                  </td>
                  <td className="px-3 py-3 text-gray-700 max-w-[180px] truncate">{expense.description}</td>
                  <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{fmt(expense.amount, expense.currency)}</td>
                  <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{expense.currency}</td>
                  <td className="px-3 py-3 font-semibold text-gray-900 whitespace-nowrap">₦{Number(expense.amount_ngn).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-3 text-gray-500 whitespace-nowrap text-xs">{new Date(expense.expense_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {expense.trip ? (
                      <span className="font-mono text-xs text-blue-600">{expense.trip.trip_id}</span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {expense.creator?.full_name ?? expense.creator?.email ?? '—'}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {expense.file_urls?.length > 0 ? (
                      <div className="flex flex-col gap-0.5">
                        {expense.file_urls.map((f, i) => (
                          <a key={i} href={f.url} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
                            <Eye size={11} /> {f.name.length > 10 ? f.name.slice(0, 10) + '…' : f.name}
                          </a>
                        ))}
                      </div>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {expense.source === 'manual' && (
                      <button onClick={() => handleDelete(expense.id, expense.source)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                        <Trash2 size={13} />
                      </button>
                    )}
                    {expense.source === 'trip' && (
                      <span className="text-xs text-gray-300 italic">view in trips</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-brand-100">
                  <td colSpan={6} className="px-3 py-3 text-xs font-bold text-gray-500 uppercase">Total</td>
                  <td className="px-3 py-3 text-sm font-bold text-red-600 whitespace-nowrap">
                    ₦{totalNgn.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td colSpan={5} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Record expense modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg my-8">

            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Record expense</h2>
                <p className="text-xs text-gray-400 mt-0.5">Manual expense entry</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate}>
              <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Description <span className="text-red-400">*</span></label>
                  <input required value={description} onChange={e => setDescription(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="e.g. Fuel for truck delivery" />
                </div>

                {/* Category — auto-detected */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-medium text-gray-700">Category <span className="text-red-400">*</span></label>
                    {autoCategory && !category && (
                      <span className="text-xs text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full font-medium">
                        Auto-detected: {autoCategory}
                      </span>
                    )}
                  </div>
                  <select value={category || autoCategory}
                    onChange={e => setCategory(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                    <option value="">Select category...</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* Amount + Currency */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount <span className="text-red-400">*</span></label>
                    <AmountInput required value={amount} onChange={setAmount}
                      placeholder="0.00"
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Currency</label>
                    <select value={currency} onChange={e => { setCurrency(e.target.value); if (e.target.value === 'NGN') setExchangeRate('1') }}
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                {/* Exchange rate — only if not NGN */}
                {currency !== 'NGN' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Exchange rate (to NGN)</label>
                      <AmountInput value={exchangeRate} onChange={setExchangeRate}
                        placeholder="0.00"
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount (NGN) — auto</label>
                      <div className="px-3 py-2.5 text-sm rounded-lg border bg-green-50 border-green-200 text-green-700 font-semibold">
                        {amountNgn > 0 ? `₦${amountNgn.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                      </div>
                    </div>
                  </div>
                )}

                {/* Expense date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Expense date</label>
                  <input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>

                {/* Attachments */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Attachments</label>
                  {uploadedFiles.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {uploadedFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-3 p-2.5 bg-green-50 rounded-lg border border-green-200">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-900 truncate">{f.name}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <a href={f.url} target="_blank" rel="noreferrer"
                              className="p-1 rounded text-gray-400 hover:text-brand-600 transition-colors">
                              <Eye size={13} />
                            </a>
                            <button type="button" onClick={() => setUploadedFiles(prev => prev.filter((_, j) => j !== i))}
                              className="p-1 rounded text-gray-400 hover:text-red-500 transition-colors">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <label className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-400 hover:border-brand-300 hover:text-brand-600 transition-colors cursor-pointer">
                      <Upload size={15} />
                      <span>{uploadFiles.length > 0 ? `${uploadFiles.length} file${uploadFiles.length > 1 ? 's' : ''} selected` : 'Click to attach receipts'}</span>
                      <input type="file" multiple className="hidden"
                        onChange={e => setUploadFiles(Array.from(e.target.files ?? []))} />
                    </label>
                    {uploadFiles.length > 0 && (
                      <button type="button" onClick={() => handleUpload(uploadFiles)} disabled={uploading}
                        className="px-4 py-3 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2 shrink-0">
                        {uploading ? <><Loader2 size={13} className="animate-spin" /> Uploading…</> : 'Upload'}
                      </button>
                    )}
                  </div>
                </div>

              </div>

              <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
                <button type="button" onClick={() => setModalOpen(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving || !amount || !effectiveCategory}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Record expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Report modal */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setReportOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Generate report</h2>
            <div className="space-y-2">
              {(['filtered','full'] as const).map(t => (
                <button key={t} onClick={() => setReportType(t)}
                  className={`w-full px-4 py-3 rounded-xl border-2 text-left transition-all ${reportType===t?'border-brand-400 bg-brand-50':'border-gray-100 hover:border-gray-200'}`}>
                  <p className={`text-sm font-semibold ${reportType===t?'text-brand-700':'text-gray-700'}`}>{t==='filtered'?'Filtered view':'Full report'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{t==='filtered'?`${filtered.length} expenses`:`${expenses.length} total`}</p>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setReportOpen(false)}
                className="flex-1 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={() => generateReport(reportType)}
                className="flex-1 px-4 py-2 text-sm font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700">Generate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

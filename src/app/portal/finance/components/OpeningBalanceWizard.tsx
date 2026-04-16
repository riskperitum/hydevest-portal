'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ChevronRight, ChevronLeft, Check, Loader2,
  Wallet, Package, Users, Building2, Scale,
  AlertCircle, CheckCircle2, Plus, X
} from 'lucide-react'
import AmountInput from '@/components/ui/AmountInput'

interface WizardStep {
  key: string
  label: string
  icon: React.ReactNode
  description: string
}

interface BankEntry {
  name: string
  bank_name: string
  account_number: string
  balance: string
}

interface ReceivableEntry {
  customer_name: string
  amount: string
  notes: string
}

interface PayableEntry {
  supplier_name: string
  amount: string
  notes: string
}

interface InventoryEntry {
  container_id: string
  description: string
  amount: string
}

interface PartnerEntry {
  partner_name: string
  partner_id: string
  amount: string
}

interface EquityEntry {
  share_capital: string
  retained_earnings: string
  other_equity: string
  other_equity_label: string
}

interface OtherAssetEntry {
  name: string
  account_code: string
  amount: string
}

interface OtherLiabilityEntry {
  name: string
  account_code: string
  amount: string
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const STEPS: WizardStep[] = [
  { key: 'intro',       label: 'Introduction',      icon: <Scale size={18} />,    description: 'What this wizard does' },
  { key: 'banks',       label: 'Bank accounts',     icon: <Building2 size={18} />, description: 'Cash and bank balances' },
  { key: 'receivables', label: 'Receivables',       icon: <Wallet size={18} />,   description: 'Money owed to you' },
  { key: 'inventory',   label: 'Inventory',         icon: <Package size={18} />,  description: 'Container stock value' },
  { key: 'payables',    label: 'Payables',          icon: <Users size={18} />,    description: 'Money you owe' },
  { key: 'partners',    label: 'Partner wallets',   icon: <Users size={18} />,    description: 'Partner obligations' },
  { key: 'equity',      label: 'Equity',            icon: <Scale size={18} />,    description: 'Share capital and retained earnings' },
  { key: 'other',       label: 'Other balances',    icon: <Plus size={18} />,     description: 'Any other assets or liabilities' },
  { key: 'review',      label: 'Review & post',     icon: <Check size={18} />,    description: 'Review and post opening journal' },
]

export default function OpeningBalanceWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0)
  const [posting, setPosting] = useState(false)
  const [posted, setPosted] = useState(false)
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null)
  const [openingPeriodId, setOpeningPeriodId] = useState<string>('')
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string; type: string; subtype: string }[]>([])

  // Form state per section
  const [banks, setBanks] = useState<BankEntry[]>([
    { name: 'Bank account 1', bank_name: '', account_number: '', balance: '' },
    { name: 'Bank account 2', bank_name: '', account_number: '', balance: '' },
  ])
  const [receivables, setReceivables] = useState<ReceivableEntry[]>([
    { customer_name: 'Mr Taoheed Lasisi', amount: '3797000.00', notes: 'Outstanding sales balance' },
    { customer_name: 'Ajibise Ismail', amount: '300000.04', notes: 'Outstanding sales balance' },
  ])
  const [inventory, setInventory] = useState<InventoryEntry[]>([
    { container_id: 'CON-0001', description: 'Container CON-0001 — estimated landing cost', amount: '64160425.40' },
    { container_id: 'CON-0002', description: 'Container CON-0002 — estimated landing cost', amount: '63581650.93' },
    { container_id: 'CON-0003', description: 'Container CON-0003 — estimated landing cost', amount: '62134714.76' },
  ])
  const [payables, setPayables] = useState<PayableEntry[]>([
    { supplier_name: 'AV — TRIP-0001 (TestKongo)', amount: '150868241.10', notes: 'Container purchase payments made' },
  ])
  const [partners, setPartners] = useState<PartnerEntry[]>([
    { partner_name: 'Ebun Adeleye', partner_id: 'PAR-0001', amount: '' },
    { partner_name: 'Tope Ajisegiri', partner_id: 'PAR-0002', amount: '' },
  ])
  const [equity, setEquity] = useState<EquityEntry>({
    share_capital: '',
    retained_earnings: '',
    other_equity: '',
    other_equity_label: 'Other equity',
  })
  const [otherAssets, setOtherAssets] = useState<OtherAssetEntry[]>([])
  const [otherLiabilities, setOtherLiabilities] = useState<OtherLiabilityEntry[]>([])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user ? { id: user.id } : null))

    supabase.from('finance_periods').select('id').eq('is_opening', true).single()
      .then(({ data }) => { if (data) setOpeningPeriodId(data.id) })

    supabase.from('finance_accounts').select('id, code, name, type, subtype')
      .eq('is_active', true).neq('subtype', 'header').order('code')
      .then(({ data }) => setAccounts(data ?? []))
  }, [])

  // ── Totals ──────────────────────────────────────────────────────
  const totalBankBalance    = banks.reduce((s, b) => s + (parseFloat(b.balance) || 0), 0)
  const totalReceivables    = receivables.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
  const totalInventory      = inventory.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
  const totalPayables       = payables.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
  const totalPartnerWallets = partners.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
  const totalOtherAssets    = otherAssets.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0)
  const totalOtherLiab      = otherLiabilities.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
  const totalShareCapital   = parseFloat(equity.share_capital) || 0
  const totalRetained       = parseFloat(equity.retained_earnings) || 0
  const totalOtherEquity    = parseFloat(equity.other_equity) || 0

  const totalAssets = totalBankBalance + totalReceivables + totalInventory + totalOtherAssets
  const totalLiab   = totalPayables + totalPartnerWallets + totalOtherLiab
  const totalEquity = totalShareCapital + totalRetained + totalOtherEquity
  const difference  = totalAssets - totalLiab - totalEquity

  function getAccountId(code: string) {
    return accounts.find(a => a.code === code)?.id ?? null
  }

  async function postOpeningBalances() {
    if (!openingPeriodId || !currentUser) return
    setPosting(true)
    const supabase = createClient()

    const journalSeq = Date.now().toString().slice(-5)
    const { data: journal } = await supabase.from('finance_journals').insert({
      journal_id:   `JNL-OB-${journalSeq}`,
      period_id:    openingPeriodId,
      journal_date: new Date().toISOString().split('T')[0],
      description:  'Opening balances — system go-live',
      type:         'opening_balance',
      status:       'posted',
      created_by:   currentUser.id,
    }).select().single()

    if (!journal) { setPosting(false); return }

    const lines: { journal_id: string; account_id: string; description: string; debit_ngn: number; credit_ngn: number }[] = []

    // ── BANK ACCOUNTS ────────────────────────────────────────────
    for (const bank of banks) {
      const amount = parseFloat(bank.balance) || 0
      if (amount <= 0) continue

      // Find or use default bank account codes
      const bankAcctId = getAccountId('1002') ?? getAccountId('1001')
      if (!bankAcctId) continue

      // Update bank account details if provided
      if (bank.bank_name) {
        await supabase.from('finance_accounts').update({
          bank_name: bank.bank_name,
          bank_account_number: bank.account_number || null,
          is_bank: true,
        }).eq('code', bank.name === 'Bank account 1' ? '1002' : '1003')
      }

      lines.push({
        journal_id: journal.id,
        account_id: bankAcctId,
        description: `Opening balance — ${bank.bank_name || bank.name}`,
        debit_ngn: amount,
        credit_ngn: 0,
      })
    }

    // ── ACCOUNTS RECEIVABLE ──────────────────────────────────────
    const recvAcctId = getAccountId('1010')
    if (recvAcctId && totalReceivables > 0) {
      lines.push({
        journal_id: journal.id,
        account_id: recvAcctId,
        description: `Opening receivables — ${receivables.filter(r => parseFloat(r.amount) > 0).map(r => r.customer_name).join(', ')}`,
        debit_ngn: totalReceivables,
        credit_ngn: 0,
      })
    }

    // ── CONTAINER INVENTORY ──────────────────────────────────────
    const invAcctId = getAccountId('1020')
    if (invAcctId && totalInventory > 0) {
      for (const inv of inventory) {
        const amount = parseFloat(inv.amount) || 0
        if (amount <= 0) continue
        lines.push({
          journal_id: journal.id,
          account_id: invAcctId,
          description: `Opening inventory — ${inv.description}`,
          debit_ngn: amount,
          credit_ngn: 0,
        })
      }
    }

    // ── OTHER ASSETS ─────────────────────────────────────────────
    for (const asset of otherAssets) {
      const amount = parseFloat(asset.amount) || 0
      if (amount <= 0 || !asset.account_code) continue
      const acctId = getAccountId(asset.account_code)
      if (!acctId) continue
      lines.push({
        journal_id: journal.id,
        account_id: acctId,
        description: `Opening balance — ${asset.name}`,
        debit_ngn: amount,
        credit_ngn: 0,
      })
    }

    // ── SUPPLIER PAYABLES ────────────────────────────────────────
    const payAcctId = getAccountId('2001')
    if (payAcctId && totalPayables > 0) {
      for (const pay of payables) {
        const amount = parseFloat(pay.amount) || 0
        if (amount <= 0) continue
        lines.push({
          journal_id: journal.id,
          account_id: payAcctId,
          description: `Opening payable — ${pay.supplier_name}`,
          debit_ngn: 0,
          credit_ngn: amount,
        })
      }
    }

    // ── PARTNER WALLETS ──────────────────────────────────────────
    const partnerAcctId = getAccountId('2002')
    if (partnerAcctId && totalPartnerWallets > 0) {
      for (const partner of partners) {
        const amount = parseFloat(partner.amount) || 0
        if (amount <= 0) continue
        lines.push({
          journal_id: journal.id,
          account_id: partnerAcctId,
          description: `Opening partner wallet — ${partner.partner_name} (${partner.partner_id})`,
          debit_ngn: 0,
          credit_ngn: amount,
        })
      }
    }

    // ── OTHER LIABILITIES ────────────────────────────────────────
    for (const liab of otherLiabilities) {
      const amount = parseFloat(liab.amount) || 0
      if (amount <= 0 || !liab.account_code) continue
      const acctId = getAccountId(liab.account_code)
      if (!acctId) continue
      lines.push({
        journal_id: journal.id,
        account_id: acctId,
        description: `Opening balance — ${liab.name}`,
        debit_ngn: 0,
        credit_ngn: amount,
      })
    }

    // ── EQUITY ───────────────────────────────────────────────────
    const shareCapAcctId    = getAccountId('3001')
    const retainedAcctId    = getAccountId('3002')

    if (shareCapAcctId && totalShareCapital > 0) {
      lines.push({
        journal_id: journal.id,
        account_id: shareCapAcctId,
        description: 'Opening balance — share capital',
        debit_ngn: 0,
        credit_ngn: totalShareCapital,
      })
    }

    if (retainedAcctId && totalRetained !== 0) {
      lines.push({
        journal_id: journal.id,
        account_id: retainedAcctId,
        description: 'Opening balance — retained earnings',
        debit_ngn: totalRetained < 0 ? Math.abs(totalRetained) : 0,
        credit_ngn: totalRetained > 0 ? totalRetained : 0,
      })
    }

    // ── BALANCING ENTRY (if difference exists) ──────────────────
    if (Math.abs(difference) > 0.01) {
      const retainedId = getAccountId('3002')
      if (retainedId) {
        lines.push({
          journal_id: journal.id,
          account_id: retainedId,
          description: 'Opening balance — balancing adjustment',
          debit_ngn: difference < 0 ? Math.abs(difference) : 0,
          credit_ngn: difference > 0 ? difference : 0,
        })
      }
    }

    // Insert all lines
    if (lines.length > 0) {
      await supabase.from('finance_journal_lines').insert(lines)
    }

    setPosting(false)
    setPosted(true)
  }

  const currentStep = STEPS[step]

  return (
    <div className="max-w-3xl mx-auto">

      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-gray-500">Step {step + 1} of {STEPS.length}</p>
          <p className="text-xs text-gray-400">{currentStep.label}</p>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-brand-600 rounded-full transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
        {/* Step indicators */}
        <div className="flex items-center justify-between mt-3">
          {STEPS.map((s, i) => (
            <button key={s.key} onClick={() => i < step && setStep(i)}
              className={`flex flex-col items-center gap-1 ${i < step ? 'cursor-pointer' : 'cursor-default'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors
                ${i < step ? 'bg-green-500 text-white' : i === step ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                {i < step ? <Check size={13} /> : <span className="text-xs font-bold">{i + 1}</span>}
              </div>
              <span className={`text-xs hidden md:block ${i === step ? 'text-brand-600 font-medium' : 'text-gray-400'}`}>
                {s.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

        {/* Step header */}
        <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center text-brand-700">
              {currentStep.icon}
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">{currentStep.label}</h2>
              <p className="text-xs text-gray-400">{currentStep.description}</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-6">

          {/* ── INTRO ──────────────────────────────────────────────── */}
          {currentStep.key === 'intro' && (
            <div className="space-y-4">
              <div className="p-4 bg-brand-50 rounded-xl border border-brand-100">
                <h3 className="text-sm font-semibold text-brand-800 mb-2">What this wizard does</h3>
                <p className="text-sm text-brand-700 leading-relaxed">
                  This wizard creates a single opening balance journal entry that establishes your starting financial position
                  in the system. It is a one-time setup that you complete when going live.
                </p>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Bank & cash balances',   desc: 'Enter the balance in each bank account on go-live date' },
                  { label: 'Accounts receivable',     desc: 'Money owed to you by customers — pre-populated from system' },
                  { label: 'Container inventory',     desc: 'Value of containers purchased but not yet fully sold — pre-populated' },
                  { label: 'Accounts payable',        desc: 'Money you owe to suppliers — pre-populated from system' },
                  { label: 'Partner wallet balances', desc: 'Cash held on behalf of partners — enter actual amounts' },
                  { label: 'Share capital & equity',  desc: 'Founding capital and any retained earnings' },
                  { label: 'Other balances',          desc: 'Any other assets or liabilities not covered above' },
                ].map(item => (
                  <div key={item.label} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                    <CheckCircle2 size={15} className="text-green-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-800">{item.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                <p className="text-xs text-amber-700 font-medium">
                  ⚠ This should only be done once on go-live. For test data, the amounts will be cleared during the production data purge.
                </p>
              </div>
            </div>
          )}

          {/* ── BANK ACCOUNTS ──────────────────────────────────────── */}
          {currentStep.key === 'banks' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Enter the balance in each bank account as of the go-live date. Add the bank name and account number for your records.</p>
              {banks.map((bank, i) => (
                <div key={i} className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{bank.name}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Bank name</label>
                      <input value={bank.bank_name}
                        onChange={e => setBanks(prev => prev.map((b, idx) => idx === i ? { ...b, bank_name: e.target.value } : b))}
                        placeholder="e.g. Guaranty Trust Bank"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Account number</label>
                      <input value={bank.account_number}
                        onChange={e => setBanks(prev => prev.map((b, idx) => idx === i ? { ...b, account_number: e.target.value } : b))}
                        placeholder="0123456789"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Opening balance (NGN)</label>
                    <AmountInput value={bank.balance}
                      onChange={v => setBanks(prev => prev.map((b, idx) => idx === i ? { ...b, balance: v } : b))}
                      placeholder="0.00"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                </div>
              ))}
              <button onClick={() => setBanks(prev => [...prev, { name: `Bank account ${prev.length + 1}`, bank_name: '', account_number: '', balance: '' }])}
                className="inline-flex items-center gap-2 text-xs font-medium text-brand-600 hover:text-brand-700">
                <Plus size={13} /> Add another bank account
              </button>
              {totalBankBalance > 0 && (
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-xl border border-green-100">
                  <span className="text-sm font-medium text-green-700">Total cash & bank</span>
                  <span className="text-base font-bold text-green-700">{fmt(totalBankBalance)}</span>
                </div>
              )}
            </div>
          )}

          {/* ── RECEIVABLES ─────────────────────────────────────────── */}
          {currentStep.key === 'receivables' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Money owed to Hydevest by customers. Pre-populated from outstanding sales orders in the system.</p>
              {receivables.map((recv, i) => (
                <div key={i} className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Customer {i + 1}</p>
                    {i >= 2 && (
                      <button onClick={() => setReceivables(prev => prev.filter((_, idx) => idx !== i))}
                        className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500">
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Customer name</label>
                      <input value={recv.customer_name}
                        onChange={e => setReceivables(prev => prev.map((r, idx) => idx === i ? { ...r, customer_name: e.target.value } : r))}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Outstanding amount (NGN)</label>
                      <AmountInput value={recv.amount}
                        onChange={v => setReceivables(prev => prev.map((r, idx) => idx === i ? { ...r, amount: v } : r))}
                        placeholder="0.00"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                    <input value={recv.notes}
                      onChange={e => setReceivables(prev => prev.map((r, idx) => idx === i ? { ...r, notes: e.target.value } : r))}
                      placeholder="Optional note"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                </div>
              ))}
              <button onClick={() => setReceivables(prev => [...prev, { customer_name: '', amount: '', notes: '' }])}
                className="inline-flex items-center gap-2 text-xs font-medium text-brand-600 hover:text-brand-700">
                <Plus size={13} /> Add another customer
              </button>
              {totalReceivables > 0 && (
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-100">
                  <span className="text-sm font-medium text-blue-700">Total accounts receivable</span>
                  <span className="text-base font-bold text-blue-700">{fmt(totalReceivables)}</span>
                </div>
              )}
            </div>
          )}

          {/* ── INVENTORY ───────────────────────────────────────────── */}
          {currentStep.key === 'inventory' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Value of containers purchased but not yet fully sold. Pre-populated from system data. Adjust if the actual cost differs from the estimated landing cost.</p>
              {inventory.map((inv, i) => (
                <div key={i} className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{inv.container_id}</p>
                    {i >= 3 && (
                      <button onClick={() => setInventory(prev => prev.filter((_, idx) => idx !== i))}
                        className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500">
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                      <input value={inv.description}
                        onChange={e => setInventory(prev => prev.map((item, idx) => idx === i ? { ...item, description: e.target.value } : item))}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Inventory value (NGN)</label>
                      <AmountInput value={inv.amount}
                        onChange={v => setInventory(prev => prev.map((item, idx) => idx === i ? { ...item, amount: v } : item))}
                        placeholder="0.00"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                  </div>
                </div>
              ))}
              <button onClick={() => setInventory(prev => [...prev, { container_id: `MANUAL-${prev.length + 1}`, description: '', amount: '' }])}
                className="inline-flex items-center gap-2 text-xs font-medium text-brand-600 hover:text-brand-700">
                <Plus size={13} /> Add another inventory item
              </button>
              {totalInventory > 0 && (
                <div className="flex items-center justify-between p-3 bg-amber-50 rounded-xl border border-amber-100">
                  <span className="text-sm font-medium text-amber-700">Total inventory value</span>
                  <span className="text-base font-bold text-amber-700">{fmt(totalInventory)}</span>
                </div>
              )}
            </div>
          )}

          {/* ── PAYABLES ────────────────────────────────────────────── */}
          {currentStep.key === 'payables' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Money owed to suppliers. Pre-populated from container payment expenses in the system.</p>
              {payables.map((pay, i) => (
                <div key={i} className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Payable {i + 1}</p>
                    {i >= 1 && (
                      <button onClick={() => setPayables(prev => prev.filter((_, idx) => idx !== i))}
                        className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500">
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Supplier / reference</label>
                      <input value={pay.supplier_name}
                        onChange={e => setPayables(prev => prev.map((p, idx) => idx === i ? { ...p, supplier_name: e.target.value } : p))}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Amount owed (NGN)</label>
                      <AmountInput value={pay.amount}
                        onChange={v => setPayables(prev => prev.map((p, idx) => idx === i ? { ...p, amount: v } : p))}
                        placeholder="0.00"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                    <input value={pay.notes}
                      onChange={e => setPayables(prev => prev.map((p, idx) => idx === i ? { ...p, notes: e.target.value } : p))}
                      placeholder="Optional note"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                </div>
              ))}
              <button onClick={() => setPayables(prev => [...prev, { supplier_name: '', amount: '', notes: '' }])}
                className="inline-flex items-center gap-2 text-xs font-medium text-brand-600 hover:text-brand-700">
                <Plus size={13} /> Add another payable
              </button>
              {totalPayables > 0 && (
                <div className="flex items-center justify-between p-3 bg-red-50 rounded-xl border border-red-100">
                  <span className="text-sm font-medium text-red-700">Total accounts payable</span>
                  <span className="text-base font-bold text-red-700">{fmt(totalPayables)}</span>
                </div>
              )}
            </div>
          )}

          {/* ── PARTNER WALLETS ─────────────────────────────────────── */}
          {currentStep.key === 'partners' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Cash held on behalf of partners. Enter the actual amount in each partner wallet as of go-live. This is a liability — money the company owes back to partners.</p>
              {partners.map((partner, i) => (
                <div key={i} className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    {partner.partner_name} — {partner.partner_id}
                  </p>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Wallet balance (NGN)</label>
                    <AmountInput value={partner.amount}
                      onChange={v => setPartners(prev => prev.map((p, idx) => idx === i ? { ...p, amount: v } : p))}
                      placeholder="0.00"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    <p className="text-xs text-gray-400 mt-1">Enter 0 if this partner has no balance at go-live.</p>
                  </div>
                </div>
              ))}
              {totalPartnerWallets > 0 && (
                <div className="flex items-center justify-between p-3 bg-purple-50 rounded-xl border border-purple-100">
                  <span className="text-sm font-medium text-purple-700">Total partner wallets payable</span>
                  <span className="text-base font-bold text-purple-700">{fmt(totalPartnerWallets)}</span>
                </div>
              )}
            </div>
          )}

          {/* ── EQUITY ──────────────────────────────────────────────── */}
          {currentStep.key === 'equity' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">The founding capital and accumulated earnings of the business.</p>
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Share capital (NGN)</label>
                  <AmountInput value={equity.share_capital}
                    onChange={v => setEquity(e => ({ ...e, share_capital: v }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  <p className="text-xs text-gray-400 mt-1">The amount invested by shareholders to start the business.</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Retained earnings (NGN)</label>
                  <AmountInput value={equity.retained_earnings}
                    onChange={v => setEquity(e => ({ ...e, retained_earnings: v }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  <p className="text-xs text-gray-400 mt-1">Profits accumulated from previous periods before this system. Enter 0 if starting fresh.</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Other equity label</label>
                      <input value={equity.other_equity_label}
                        onChange={e => setEquity(eq => ({ ...eq, other_equity_label: e.target.value }))}
                        placeholder="e.g. Directors loan account"
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount (NGN)</label>
                      <AmountInput value={equity.other_equity}
                        onChange={v => setEquity(e => ({ ...e, other_equity: v }))}
                        placeholder="0.00"
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                  </div>
                </div>
              </div>
              {totalEquity > 0 && (
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-xl border border-green-100">
                  <span className="text-sm font-medium text-green-700">Total equity</span>
                  <span className="text-base font-bold text-green-700">{fmt(totalEquity)}</span>
                </div>
              )}
            </div>
          )}

          {/* ── OTHER BALANCES ──────────────────────────────────────── */}
          {currentStep.key === 'other' && (
            <div className="space-y-5">
              <p className="text-sm text-gray-600">Any other assets or liabilities not covered in the previous steps — vehicles, equipment, loans, accruals etc.</p>

              {/* Other assets */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">Other assets</h3>
                  <button onClick={() => setOtherAssets(prev => [...prev, { name: '', account_code: '1100', amount: '' }])}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700">
                    <Plus size={12} /> Add
                  </button>
                </div>
                {otherAssets.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No other assets. Click Add to include vehicles, equipment etc.</p>
                ) : otherAssets.map((asset, i) => (
                  <div key={i} className="p-3 bg-gray-50 rounded-xl border border-gray-100 mb-2">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                        <input value={asset.name}
                          onChange={e => setOtherAssets(prev => prev.map((a, idx) => idx === i ? { ...a, name: e.target.value } : a))}
                          placeholder="e.g. Toyota Hilux"
                          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Account code</label>
                        <select value={asset.account_code}
                          onChange={e => setOtherAssets(prev => prev.map((a, idx) => idx === i ? { ...a, account_code: e.target.value } : a))}
                          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                          {accounts.filter(a => a.type === 'asset').map(a => (
                            <option key={a.id} value={a.code}>{a.code} — {a.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Amount (NGN)</label>
                        <div className="flex gap-1">
                          <AmountInput value={asset.amount}
                            onChange={v => setOtherAssets(prev => prev.map((a, idx) => idx === i ? { ...a, amount: v } : a))}
                            placeholder="0.00"
                            className="flex-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                          <button onClick={() => setOtherAssets(prev => prev.filter((_, idx) => idx !== i))}
                            className="p-1.5 text-gray-300 hover:text-red-500 rounded">
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Other liabilities */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">Other liabilities</h3>
                  <button onClick={() => setOtherLiabilities(prev => [...prev, { name: '', account_code: '2009', amount: '' }])}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700">
                    <Plus size={12} /> Add
                  </button>
                </div>
                {otherLiabilities.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No other liabilities. Click Add to include loans, accruals etc.</p>
                ) : otherLiabilities.map((liab, i) => (
                  <div key={i} className="p-3 bg-gray-50 rounded-xl border border-gray-100 mb-2">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                        <input value={liab.name}
                          onChange={e => setOtherLiabilities(prev => prev.map((l, idx) => idx === i ? { ...l, name: e.target.value } : l))}
                          placeholder="e.g. Bank loan"
                          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Account code</label>
                        <select value={liab.account_code}
                          onChange={e => setOtherLiabilities(prev => prev.map((l, idx) => idx === i ? { ...l, account_code: e.target.value } : l))}
                          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                          {accounts.filter(a => a.type === 'liability').map(a => (
                            <option key={a.id} value={a.code}>{a.code} — {a.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Amount (NGN)</label>
                        <div className="flex gap-1">
                          <AmountInput value={liab.amount}
                            onChange={v => setOtherLiabilities(prev => prev.map((l, idx) => idx === i ? { ...l, amount: v } : l))}
                            placeholder="0.00"
                            className="flex-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                          <button onClick={() => setOtherLiabilities(prev => prev.filter((_, idx) => idx !== i))}
                            className="p-1.5 text-gray-300 hover:text-red-500 rounded">
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── REVIEW ──────────────────────────────────────────────── */}
          {currentStep.key === 'review' && (
            <div className="space-y-4">
              {posted ? (
                <div className="flex flex-col items-center justify-center py-8 gap-4">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle2 size={32} className="text-green-600" />
                  </div>
                  <p className="text-lg font-bold text-gray-900">Opening balances posted!</p>
                  <p className="text-sm text-gray-500 text-center">
                    The opening balance journal entry has been created and posted to the ledger.
                    You can view it in the Journals tab.
                  </p>
                  <button onClick={onComplete}
                    className="px-6 py-2.5 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700">
                    Go to Finance Dashboard
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-600">Review your opening balances before posting. Once posted, you can reverse the journal if corrections are needed.</p>

                  {/* Summary table */}
                  <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-100">
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Item</th>
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">Debit (Asset)</th>
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">Credit (Liab/Equity)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {totalBankBalance > 0 && (
                          <tr><td className="px-4 py-2.5 text-gray-700">Cash & bank accounts</td>
                          <td className="px-4 py-2.5 text-right font-medium text-gray-800">{fmt(totalBankBalance)}</td><td className="px-4 py-2.5 text-right text-gray-400">—</td></tr>
                        )}
                        {totalReceivables > 0 && (
                          <tr><td className="px-4 py-2.5 text-gray-700">Accounts receivable</td>
                          <td className="px-4 py-2.5 text-right font-medium text-gray-800">{fmt(totalReceivables)}</td><td className="px-4 py-2.5 text-right text-gray-400">—</td></tr>
                        )}
                        {totalInventory > 0 && (
                          <tr><td className="px-4 py-2.5 text-gray-700">Container inventory</td>
                          <td className="px-4 py-2.5 text-right font-medium text-gray-800">{fmt(totalInventory)}</td><td className="px-4 py-2.5 text-right text-gray-400">—</td></tr>
                        )}
                        {totalOtherAssets > 0 && (
                          <tr><td className="px-4 py-2.5 text-gray-700">Other assets</td>
                          <td className="px-4 py-2.5 text-right font-medium text-gray-800">{fmt(totalOtherAssets)}</td><td className="px-4 py-2.5 text-right text-gray-400">—</td></tr>
                        )}
                        {totalPayables > 0 && (
                          <tr><td className="px-4 py-2.5 text-gray-700">Accounts payable</td>
                          <td className="px-4 py-2.5 text-right text-gray-400">—</td><td className="px-4 py-2.5 text-right font-medium text-gray-800">{fmt(totalPayables)}</td></tr>
                        )}
                        {totalPartnerWallets > 0 && (
                          <tr><td className="px-4 py-2.5 text-gray-700">Partner wallets payable</td>
                          <td className="px-4 py-2.5 text-right text-gray-400">—</td><td className="px-4 py-2.5 text-right font-medium text-gray-800">{fmt(totalPartnerWallets)}</td></tr>
                        )}
                        {totalOtherLiab > 0 && (
                          <tr><td className="px-4 py-2.5 text-gray-700">Other liabilities</td>
                          <td className="px-4 py-2.5 text-right text-gray-400">—</td><td className="px-4 py-2.5 text-right font-medium text-gray-800">{fmt(totalOtherLiab)}</td></tr>
                        )}
                        {totalShareCapital > 0 && (
                          <tr><td className="px-4 py-2.5 text-gray-700">Share capital</td>
                          <td className="px-4 py-2.5 text-right text-gray-400">—</td><td className="px-4 py-2.5 text-right font-medium text-gray-800">{fmt(totalShareCapital)}</td></tr>
                        )}
                        {totalRetained !== 0 && (
                          <tr><td className="px-4 py-2.5 text-gray-700">Retained earnings</td>
                          <td className="px-4 py-2.5 text-right text-gray-400">—</td><td className="px-4 py-2.5 text-right font-medium text-gray-800">{fmt(Math.abs(totalRetained))}</td></tr>
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-gray-300 bg-gray-100">
                          <td className="px-4 py-2.5 text-sm font-bold text-gray-900">TOTALS</td>
                          <td className="px-4 py-2.5 text-right text-sm font-bold text-gray-900">{fmt(totalAssets)}</td>
                          <td className="px-4 py-2.5 text-right text-sm font-bold text-gray-900">{fmt(totalLiab + totalEquity)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Balance check */}
                  <div className={`flex items-center gap-3 p-4 rounded-xl border ${Math.abs(difference) < 0.01 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                    {Math.abs(difference) < 0.01
                      ? <CheckCircle2 size={16} className="text-green-600 shrink-0" />
                      : <AlertCircle size={16} className="text-amber-600 shrink-0" />}
                    <div>
                      {Math.abs(difference) < 0.01
                        ? <p className="text-sm font-medium text-green-700">✓ Assets equal Liabilities + Equity — ready to post</p>
                        : <p className="text-sm font-medium text-amber-700">
                            Difference of {fmt(Math.abs(difference))} — a balancing entry will be posted automatically to retained earnings.
                            You can adjust this later.
                          </p>}
                    </div>
                  </div>

                  <button onClick={postOpeningBalances} disabled={posting}
                    className="w-full px-4 py-3 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    {posting
                      ? <><Loader2 size={16} className="animate-spin" /> Posting opening balances…</>
                      : <><Check size={16} /> Post opening balances</>}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        {currentStep.key !== 'review' && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 disabled:opacity-40">
              <ChevronLeft size={14} /> Back
            </button>
            <button onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700">
              Next <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

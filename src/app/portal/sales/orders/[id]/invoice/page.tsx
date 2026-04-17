'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Printer, Loader2 } from 'lucide-react'

interface InvoiceData {
  order_id: string
  created_at: string
  due_date: string
  sale_type: string
  sale_amount: number
  discount: number
  overages: number
  customer_payable: number
  amount_paid: number
  outstanding_balance: number
  payment_method: string
  payment_status: string
  written_off_amount: number
  customer: {
    name: string
    customer_id: string
    phone: string | null
    address: string | null
  } | null
  container: {
    container_id: string
    tracking_number: string | null
    hide_type: string | null
    pieces_purchased: number | null
  } | null
  presale: {
    sale_type: string
    warehouse_confirmed_pieces: number | null
    warehouse_confirmed_avg_weight: number | null
    price_per_piece: number | null
    price_per_kilo: number | null
    total_number_of_pallets: number | null
  } | null
  pallet_lines: {
    id: string
    pallets_sold: number
    pieces_per_pallet: number
    total_pieces: number
    selling_price_per_piece: number
    line_total: number
  }[]
}

const fmt = (n: number) => `₦${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function InvoicePage() {
  const params  = useParams()
  const router  = useRouter()
  const orderId = params.id as string

  const [invoice, setInvoice]   = useState<InvoiceData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [settings, setSettings] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const supabase = createClient()

    const [{ data: order }, { data: settingsData }] = await Promise.all([
      supabase.from('sales_orders').select(`
        id, order_id, sale_type, sale_amount, discount, overages,
        customer_payable, amount_paid, outstanding_balance,
        payment_method, payment_status, written_off_amount, created_at,
        customer:customers!sales_orders_customer_id_fkey(
          name, customer_id, phone, address
        ),
        container:containers!sales_orders_container_id_fkey(
          container_id, tracking_number, hide_type, pieces_purchased
        ),
        presale:presales!sales_orders_presale_id_fkey(
          sale_type, warehouse_confirmed_pieces, warehouse_confirmed_avg_weight,
          price_per_piece, price_per_kilo, total_number_of_pallets
        ),
        pallet_lines:sales_order_pallets(
          id, pallets_sold, pieces_per_pallet, total_pieces,
          selling_price_per_piece, line_total
        )
      `).eq('id', orderId).single(),
      supabase.from('finance_settings').select('key, value'),
    ])

    if (order) setInvoice(order as any)
    const sMap = Object.fromEntries((settingsData ?? []).map(s => [s.key, s.value]))
    setSettings(sMap)
    setLoading(false)
  }, [orderId])

  useEffect(() => { load() }, [load])

  function handlePrint() { window.print() }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 size={24} className="animate-spin text-brand-600" />
    </div>
  )

  if (!invoice) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <p className="text-sm text-gray-400">Invoice not found.</p>
    </div>
  )

  const invoiceNumber  = `INV-${invoice.order_id}`
  const invoiceDate    = new Date(invoice.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const dueDate        = addDays(invoice.created_at, 14)
  const companyName    = settings.company_name    ?? 'Hydevest Solutions Limited'
  const companyRC      = settings.company_rc      ?? ''
  const companyTIN     = settings.company_tin     ?? ''
  const sigName        = settings.authorized_signatory_name ?? 'Authorized Signatory'
  const sigImage       = settings.authorized_signature ?? ''
  const isSplit        = invoice.sale_type === 'split_sale'

  return (
    <div className="max-w-4xl mx-auto">

      {/* Print controls — hidden when printing */}
      <div className="flex items-center gap-3 mb-6 print:hidden">
        <button onClick={() => router.back()}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
          <ArrowLeft size={14} /> Back
        </button>
        <button onClick={handlePrint}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700">
          <Printer size={14} /> Print / Save PDF
        </button>
      </div>

      {/* ── INVOICE DOCUMENT ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden print:border-0 print:rounded-none"
        id="invoice-document">

        {/* Header bar */}
        <div style={{ background: '#55249E' }} className="px-10 py-8 text-white">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{companyName}</h1>
              {companyRC  && <p className="text-sm opacity-80 mt-1">RC: {companyRC}</p>}
              {companyTIN && <p className="text-sm opacity-80">TIN: {companyTIN}</p>}
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold tracking-tight opacity-90">INVOICE</p>
              <p className="text-lg font-semibold mt-1">{invoiceNumber}</p>
              <p className="text-sm opacity-70 mt-1">{invoiceDate}</p>
            </div>
          </div>
        </div>

        <div className="px-10 py-8 space-y-8">

          {/* Bill to + Invoice details */}
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Bill to</p>
              <p className="text-base font-bold text-gray-900">{invoice.customer?.name ?? '—'}</p>
              <p className="text-sm text-gray-500">{invoice.customer?.customer_id ?? '—'}</p>
              {invoice.customer?.phone && <p className="text-sm text-gray-500">{invoice.customer.phone}</p>}
              {invoice.customer?.address && <p className="text-sm text-gray-500">{invoice.customer.address}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Invoice details</p>
              <table className="ml-auto text-sm">
                <tbody>
                  <tr>
                    <td className="text-gray-500 pr-6 py-0.5">Invoice no.</td>
                    <td className="font-semibold text-gray-900">{invoiceNumber}</td>
                  </tr>
                  <tr>
                    <td className="text-gray-500 pr-6 py-0.5">Invoice date</td>
                    <td className="font-semibold text-gray-900">{invoiceDate}</td>
                  </tr>
                  <tr>
                    <td className="text-gray-500 pr-6 py-0.5">Due date</td>
                    <td className="font-semibold text-gray-900">{dueDate}</td>
                  </tr>
                  <tr>
                    <td className="text-gray-500 pr-6 py-0.5">Container</td>
                    <td className="font-semibold text-gray-900">{invoice.container?.container_id ?? '—'}</td>
                  </tr>
                  {invoice.container?.tracking_number && (
                    <tr>
                      <td className="text-gray-500 pr-6 py-0.5">Tracking</td>
                      <td className="font-semibold text-gray-900">{invoice.container.tracking_number}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="text-gray-500 pr-6 py-0.5">Sale type</td>
                    <td className="font-semibold text-gray-900 capitalize">{invoice.sale_type.replace('_', ' ')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Line items */}
          <div>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ background: '#55249E' }} className="text-white">
                  <th className="px-4 py-3 text-left font-semibold rounded-tl-lg">Description</th>
                  {isSplit && <>
                    <th className="px-4 py-3 text-right font-semibold">Pallets</th>
                    <th className="px-4 py-3 text-right font-semibold">Pieces/pallet</th>
                    <th className="px-4 py-3 text-right font-semibold">Total pieces</th>
                    <th className="px-4 py-3 text-right font-semibold">Price/piece</th>
                  </>}
                  {!isSplit && <>
                    <th className="px-4 py-3 text-right font-semibold">Pieces</th>
                    <th className="px-4 py-3 text-right font-semibold">Price/piece</th>
                  </>}
                  <th className="px-4 py-3 text-right font-semibold rounded-tr-lg">Amount</th>
                </tr>
              </thead>
              <tbody>
                {isSplit ? (
                  invoice.pallet_lines.map((line, i) => (
                    <tr key={line.id} className={i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                      <td className="px-4 py-3 text-gray-700">
                        {invoice.container?.hide_type ?? 'Hides'} — Pallet {i + 1}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{line.pallets_sold}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{line.pieces_per_pallet}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{line.total_pieces.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmt(line.selling_price_per_piece)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(line.line_total)}</td>
                    </tr>
                  ))
                ) : (
                  <tr className="bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">
                      {invoice.container?.hide_type ?? 'Hides'} — {invoice.container?.container_id}
                      {invoice.container?.tracking_number && ` (${invoice.container.tracking_number})`}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {invoice.presale?.warehouse_confirmed_pieces?.toLocaleString() ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {invoice.presale?.price_per_piece ? fmt(invoice.presale.price_per_piece) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(invoice.sale_amount)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <table className="text-sm w-72">
              <tbody className="divide-y divide-gray-100">
                <tr>
                  <td className="py-2 text-gray-500">Subtotal</td>
                  <td className="py-2 text-right font-medium text-gray-800">{fmt(invoice.sale_amount)}</td>
                </tr>
                {Number(invoice.discount) > 0 && (
                  <tr>
                    <td className="py-2 text-gray-500">Discount</td>
                    <td className="py-2 text-right font-medium text-red-600">({fmt(Number(invoice.discount))})</td>
                  </tr>
                )}
                {Number(invoice.overages) > 0 && (
                  <tr>
                    <td className="py-2 text-gray-500">Overages</td>
                    <td className="py-2 text-right font-medium text-gray-800">{fmt(Number(invoice.overages))}</td>
                  </tr>
                )}
                <tr className="font-bold">
                  <td className="py-3 text-gray-900 text-base">Total payable</td>
                  <td className="py-3 text-right text-base" style={{ color: '#55249E' }}>{fmt(invoice.customer_payable)}</td>
                </tr>
                <tr>
                  <td className="py-2 text-gray-500">Amount paid</td>
                  <td className="py-2 text-right font-medium text-green-700">{fmt(invoice.amount_paid)}</td>
                </tr>
                {Number(invoice.written_off_amount) > 0 && (
                  <tr>
                    <td className="py-2 text-gray-500">Written off</td>
                    <td className="py-2 text-right font-medium text-gray-500">{fmt(Number(invoice.written_off_amount))}</td>
                  </tr>
                )}
                <tr className={Number(invoice.outstanding_balance) > 0 ? 'bg-red-50' : 'bg-green-50'}>
                  <td className="py-2 px-2 font-bold text-gray-900 rounded-l">Outstanding</td>
                  <td className={`py-2 px-2 text-right font-bold rounded-r ${Number(invoice.outstanding_balance) > 0 ? 'text-red-600' : 'text-green-700'}`}>
                    {fmt(invoice.outstanding_balance)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Payment details */}
          <div className="p-5 bg-gray-50 rounded-xl border border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Payment details</p>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400">Bank name</p>
                <p className="font-semibold text-gray-800">Providus Bank</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Account name</p>
                <p className="font-semibold text-gray-800">HYDEVEST SOLUTIONS LIMITED</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Account number</p>
                <p className="font-semibold text-gray-800 text-lg tracking-widest">1308744742</p>
              </div>
            </div>
          </div>

          {/* Legal statement */}
          {Number(invoice.outstanding_balance) > 0 && (
            <div className="p-4 border-l-4 rounded-r-xl text-sm text-gray-600 italic leading-relaxed"
              style={{ borderLeftColor: '#55249E', background: '#f9f7fe' }}>
              <strong className="not-italic text-gray-800">Note:</strong> The customer agrees to settle the outstanding
              balance of <strong>{fmt(invoice.outstanding_balance)}</strong> in full by <strong>{dueDate}</strong>.
              Failure to meet this obligation may result in alternative recovery actions, including but not limited
              to property seizure.
            </div>
          )}

          {/* Signature section */}
          <div className="grid grid-cols-2 gap-16 pt-6">

            {/* Hydevest signature */}
            <div>
              <div className="border-b-2 border-gray-300 mb-3 pb-2" style={{ minHeight: 80 }}>
                {sigImage ? (
                  <img src={sigImage} alt="Authorized signature"
                    style={{ height: 70, maxWidth: 220 }}
                    className="object-contain" />
                ) : (
                  <p className="text-xs text-gray-400 italic">Signature</p>
                )}
              </div>
              <p className="text-sm font-bold text-gray-900">{sigName}</p>
              <p className="text-xs text-gray-500">Authorized Signatory</p>
              <p className="text-xs text-gray-500">{companyName}</p>
              <p className="text-xs text-gray-400 mt-1">{invoiceDate}</p>
            </div>

            {/* Customer signature */}
            <div>
              <div className="border-b-2 border-gray-300 mb-3" style={{ minHeight: 80 }}>
              </div>
              <p className="text-sm font-bold text-gray-900">{invoice.customer?.name ?? 'Customer'}</p>
              <p className="text-xs text-gray-500">Customer Signature</p>
              <p className="text-xs text-gray-500">{invoice.customer?.customer_id ?? ''}</p>
              <p className="text-xs text-gray-400 mt-1">Date: ___________________</p>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-100 pt-4 text-center">
            <p className="text-xs text-gray-400">
              {companyName} · Providus Bank · HYDEVEST SOLUTIONS LIMITED · 1308744742
            </p>
            <p className="text-xs text-gray-300 mt-1">
              This is a computer generated invoice.
            </p>
          </div>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #invoice-document, #invoice-document * { visibility: visible; }
          #invoice-document { position: absolute; left: 0; top: 0; width: 100%; }
          @page { margin: 1cm; size: A4; }
        }
      `}</style>
    </div>
  )
}


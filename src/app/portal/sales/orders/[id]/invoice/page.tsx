'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Printer, Loader2 } from 'lucide-react'

interface InvoiceData {
  order_id: string
  created_at: string
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

  const invoiceNumber = `INV-${invoice.order_id}`
  const invoiceDate   = new Date(invoice.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const dueDate       = addDays(invoice.created_at, 14)
  const companyName   = settings.company_name ?? 'Hydevest Solutions Limited'
  const companyRC     = settings.company_rc ?? ''
  const companyTIN    = settings.company_tin ?? ''
  const isSplit       = invoice.sale_type === 'split_sale'
  const hideType      = invoice.container?.hide_type ?? ''
  const description   = `${hideType ? hideType.charAt(0).toUpperCase() + hideType.slice(1) + ' ' : ''}Purchase of cow hides`

  return (
    <div className="max-w-4xl mx-auto">

      {/* Screen controls */}
      <div className="flex items-center gap-3 mb-4 print:hidden">
        <button onClick={() => router.back()}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
          <ArrowLeft size={13} /> Back
        </button>
        <button onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-semibold rounded-lg text-white"
          style={{ background: '#55249E' }}>
          <Printer size={13} /> Print / Save PDF
        </button>
      </div>

      {/* INVOICE DOCUMENT */}
      <div id="invoice-document"
        className="bg-white border border-gray-200 print:border-0"
        style={{ fontFamily: 'Arial, sans-serif', fontSize: 11, position: 'relative', overflow: 'hidden' }}>

        {/* Watermark */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 320,
          height: 320,
          backgroundImage: 'url(/logo.png)',
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
          opacity: 0.04,
          pointerEvents: 'none',
          zIndex: 0,
        }} />

        {/* All existing content needs to be wrapped in a relative div so it sits above watermark */}
        <div style={{ position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ background: '#55249E', padding: '16px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ background: 'white', borderRadius: 8, padding: '4px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src="/logo.png" alt="Hydevest logo"
                  style={{ height: 40, width: 'auto', objectFit: 'contain' }}
                  onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }} />
              </div>
              <div style={{ color: 'white', textAlign: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{companyName}</div>
                <div style={{ fontSize: 9, opacity: 0.75, marginTop: 1 }}>
                  {companyRC && `RC: ${companyRC}`}{companyRC && companyTIN ? ' · ' : ''}{companyTIN && `TIN: ${companyTIN}`}
                </div>
              </div>
            </div>
            <div style={{ color: 'white', textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2 }}>INVOICE</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{invoiceNumber}</div>
              <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>Sales Order: {invoice.order_id}</div>
              <div style={{ fontSize: 10, opacity: 0.7 }}>{invoiceDate}</div>
            </div>
          </div>
        </div>

        <div style={{ padding: '16px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Bill to + Invoice meta */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#55249E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Bill to</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>{invoice.customer?.name ?? '—'}</div>
              {invoice.customer?.phone && <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>{invoice.customer.phone}</div>}
              {invoice.customer?.address && <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>{invoice.customer.address}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#55249E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Invoice details</div>
              <table style={{ marginLeft: 'auto', fontSize: 10 }}>
                <tbody>
                  <tr><td style={{ color: '#666', paddingRight: 16, paddingBottom: 2 }}>Invoice no.</td><td style={{ fontWeight: 600, color: '#111' }}>{invoiceNumber}</td></tr>
                  <tr><td style={{ color: '#666', paddingRight: 16, paddingBottom: 2 }}>Date</td><td style={{ fontWeight: 600, color: '#111' }}>{invoiceDate}</td></tr>
                  <tr><td style={{ color: '#666', paddingRight: 16, paddingBottom: 2 }}>Due date</td><td style={{ fontWeight: 600, color: '#111' }}>{dueDate}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Line items table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr style={{ background: '#55249E', color: 'white' }}>
                <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600 }}>Description</th>
                {isSplit && <>
                  <th style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600 }}>Pallets</th>
                  <th style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600 }}>Pcs/pallet</th>
                  <th style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600 }}>Total pcs</th>
                  <th style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600 }}>Price/pc</th>
                </>}
                {!isSplit && <>
                  <th style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600 }}>Pieces</th>
                  <th style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600 }}>Price/piece</th>
                </>}
                <th style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600 }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {isSplit ? (
                invoice.pallet_lines.map((line, i) => (
                  <tr key={line.id} style={{ background: i % 2 === 0 ? '#f8f7ff' : '#fff' }}>
                    <td style={{ padding: '6px 10px', color: '#333' }}>{description} — Pallet {i + 1}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: '#333' }}>{line.pallets_sold}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: '#333' }}>{line.pieces_per_pallet}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: '#333' }}>{line.total_pieces.toLocaleString()}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: '#333' }}>{fmt(line.selling_price_per_piece)}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: '#111' }}>{fmt(line.line_total)}</td>
                  </tr>
                ))
              ) : (
                <tr style={{ background: '#f8f7ff' }}>
                  <td style={{ padding: '6px 10px', color: '#333' }}>{description}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', color: '#333' }}>
                    {invoice.presale?.warehouse_confirmed_pieces?.toLocaleString() ?? '—'}
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', color: '#333' }}>
                    {invoice.presale?.price_per_piece ? fmt(invoice.presale.price_per_piece) : '—'}
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: '#111' }}>
                    {fmt(invoice.sale_amount)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Totals + Payment side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>

            {/* Payment details */}
            <div style={{ background: '#f8f7ff', borderRadius: 8, padding: '10px 14px', border: '1px solid #e8e4f8' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#55249E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Payment details</div>
              <table style={{ fontSize: 10, width: '100%' }}>
                <tbody>
                  <tr><td style={{ color: '#666', paddingBottom: 4, paddingRight: 12 }}>Bank</td><td style={{ fontWeight: 600, color: '#111' }}>Providus Bank</td></tr>
                  <tr><td style={{ color: '#666', paddingBottom: 4, paddingRight: 12 }}>Account name</td><td style={{ fontWeight: 600, color: '#111' }}>HYDEVEST SOLUTIONS LIMITED</td></tr>
                  <tr><td style={{ color: '#666', paddingRight: 12 }}>Account number</td><td style={{ fontWeight: 700, color: '#111', fontSize: 13, letterSpacing: 1 }}>1308744742</td></tr>
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div>
              <table style={{ width: '100%', fontSize: 10 }}>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '4px 0', color: '#666' }}>Subtotal</td>
                    <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 500, color: '#111' }}>{fmt(invoice.sale_amount)}</td>
                  </tr>
                  {Number(invoice.discount) > 0 && (
                    <tr style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '4px 0', color: '#666' }}>Discount</td>
                      <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 500, color: '#dc2626' }}>({fmt(Number(invoice.discount))})</td>
                    </tr>
                  )}
                  {Number(invoice.overages) > 0 && (
                    <tr style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '4px 0', color: '#666' }}>Overages</td>
                      <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 500, color: '#111' }}>{fmt(Number(invoice.overages))}</td>
                    </tr>
                  )}
                  <tr style={{ borderBottom: '2px solid #55249E' }}>
                    <td style={{ padding: '6px 0', fontWeight: 700, color: '#111', fontSize: 12 }}>Total payable</td>
                    <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 700, color: '#55249E', fontSize: 12 }}>{fmt(invoice.customer_payable)}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '4px 0', color: '#666' }}>Amount paid</td>
                    <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 500, color: '#16a34a' }}>{fmt(invoice.amount_paid)}</td>
                  </tr>
                  {Number(invoice.written_off_amount) > 0 && (
                    <tr style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '4px 0', color: '#666' }}>Written off</td>
                      <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 500, color: '#999' }}>{fmt(Number(invoice.written_off_amount))}</td>
                    </tr>
                  )}
                  <tr style={{ background: Number(invoice.outstanding_balance) > 0 ? '#fef2f2' : '#f0fdf4', borderRadius: 4 }}>
                    <td style={{ padding: '6px 8px', fontWeight: 700, color: '#111' }}>Outstanding</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: Number(invoice.outstanding_balance) > 0 ? '#dc2626' : '#16a34a', fontSize: 12 }}>
                      {fmt(invoice.outstanding_balance)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Legal statement */}
          <div style={{ borderLeft: '4px solid #55249E', background: '#f0ecfc', padding: '10px 14px', borderRadius: '0 8px 8px 0', fontSize: 11, color: '#2d2d2d', lineHeight: 1.7, fontWeight: 500 }}>
            <strong style={{ color: '#55249E' }}>Note:</strong> The customer agrees to settle the outstanding balance in full
            by <strong>{dueDate}</strong>. Failure to meet this obligation may result in alternative recovery actions,
            including but not limited to property seizure.
          </div>

          {/* Signatures */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, marginTop: 8 }}>
            <div>
              <div style={{ borderBottom: '1.5px solid #333', minHeight: 96, marginBottom: 6, display: 'flex', alignItems: 'flex-end' }}>
                <img
                  src="/signature_black.png"
                  alt="Authorized signature"
                  style={{
                    height: 90,
                    maxWidth: 280,
                    objectFit: 'contain',
                    mixBlendMode: 'multiply',
                  }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#111' }}>Authorized Signatory</div>
              <div style={{ fontSize: 9, color: '#666' }}>{companyName}</div>
              <div style={{ fontSize: 9, color: '#666', marginTop: 2 }}>Date: {invoiceDate}</div>
            </div>
            <div style={{ paddingTop: 40 }}>
              <div style={{ borderBottom: '1.5px solid #333', minHeight: 56, marginBottom: 6 }}></div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#111' }}>{invoice.customer?.name ?? 'Customer'}</div>
              <div style={{ fontSize: 9, color: '#666' }}>Customer Signature &nbsp;&nbsp; Date: ___________</div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ borderTop: '1px solid #eee', paddingTop: 8, textAlign: 'center', fontSize: 9, color: '#aaa' }}>
            {companyName} · Providus Bank · HYDEVEST SOLUTIONS LIMITED · 1308744742 · Computer generated invoice
          </div>
        </div>
        </div>
      </div>

      <style>{`
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body * { visibility: hidden; }
          #invoice-document, #invoice-document * { visibility: visible; }
          #invoice-document { position: fixed; left: 0; top: 0; width: 100%; }
          .print\\:hidden { display: none !important; }
          @page { margin: 0.5cm; size: A4 portrait; }
        }
      `}</style>
    </div>
  )
}


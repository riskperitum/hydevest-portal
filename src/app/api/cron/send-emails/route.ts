import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/send'
import {
  taskAssignedTemplate,
  approvalRequestTemplate,
  approvalDecisionTemplate,
  requestBoxMessageTemplate,
} from '@/lib/email/templates'

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Use service role client to bypass RLS
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get up to 20 pending emails
  const { data: queued } = await supabase
    .from('email_queue')
    .select('*')
    .eq('status', 'pending')
    .lt('attempts', 3)
    .order('created_at', { ascending: true })
    .limit(20)

  if (!queued || queued.length === 0) {
    return NextResponse.json({ sent: 0, message: 'No emails to send' })
  }

  let sent   = 0
  let failed = 0

  for (const item of queued) {
    let html = ''
    try {
      switch (item.template_type) {
        case 'task_assigned':
          html = taskAssignedTemplate({ recipientName: item.recipient_name, ...item.template_data })
          break
        case 'approval_request':
          html = approvalRequestTemplate({ recipientName: item.recipient_name, ...item.template_data })
          break
        case 'approval_decision':
          html = approvalDecisionTemplate({ recipientName: item.recipient_name, ...item.template_data })
          break
        case 'requestbox_message':
          html = requestBoxMessageTemplate({ recipientName: item.recipient_name, ...item.template_data })
          break
        default:
          await supabase.from('email_queue').update({
            status: 'failed',
            error:  'Unknown template type',
            attempts: item.attempts + 1,
          }).eq('id', item.id)
          failed++
          continue
      }

      const result = await sendEmail({
        to:      item.recipient_email,
        subject: item.subject,
        html,
      })

      if (result.success) {
        await supabase.from('email_queue').update({
          status:   'sent',
          sent_at:  new Date().toISOString(),
          attempts: item.attempts + 1,
        }).eq('id', item.id)
        sent++
      } else {
        await supabase.from('email_queue').update({
          status:   item.attempts + 1 >= 3 ? 'failed' : 'pending',
          error:    result.error,
          attempts: item.attempts + 1,
        }).eq('id', item.id)
        failed++
      }
    } catch (err: any) {
      await supabase.from('email_queue').update({
        status:   item.attempts + 1 >= 3 ? 'failed' : 'pending',
        error:    err.message,
        attempts: item.attempts + 1,
      }).eq('id', item.id)
      failed++
    }
  }

  return NextResponse.json({ sent, failed, total: queued.length })
}

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send'
import {
  taskAssignedTemplate,
  approvalRequestTemplate,
  approvalDecisionTemplate,
  requestBoxMessageTemplate,
} from '@/lib/email/templates'
import { rateLimit } from '@/lib/utils/rateLimit'

export async function POST(request: Request) {
  // Rate limit
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
  const { allowed } = rateLimit(`notification-email:${ip}`, 30, 60_000)
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  // Verify user is authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { type, recipientEmail, recipientName, ...data } = body

  if (!recipientEmail) {
    return NextResponse.json({ error: 'Recipient email required' }, { status: 400 })
  }

  let subject = ''
  let html    = ''

  switch (type) {
    case 'task_assigned':
      subject = `New task assigned: ${data.taskTitle}`
      html = taskAssignedTemplate({ recipientName, ...data })
      break

    case 'approval_request':
      subject = `Approval needed: ${data.itemTitle}`
      html = approvalRequestTemplate({ recipientName, ...data })
      break

    case 'approval_decision':
      subject = `Your ${data.itemType} has been ${data.decision}`
      html = approvalDecisionTemplate({ recipientName, ...data })
      break

    case 'requestbox_message':
      subject = `New message: ${data.subject}`
      html = requestBoxMessageTemplate({ recipientName, ...data })
      break

    default:
      return NextResponse.json({ error: 'Unknown notification type' }, { status: 400 })
  }

  const result = await sendEmail({
    to:      recipientEmail,
    subject,
    html,
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ success: true, id: result.id })
}

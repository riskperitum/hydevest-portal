const BRAND_COLOR = '#55249E'
const APP_URL     = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.hydevest.com'

function baseTemplate(body: string, ctaUrl?: string, ctaLabel?: string) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f5f5f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

          <!-- Header -->
          <tr>
            <td style="background:${BRAND_COLOR};padding:24px 32px;text-align:left;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">
                Hydevest Portal
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;color:#333333;font-size:14px;line-height:1.6;">
              ${body}
              ${ctaUrl ? `
                <div style="margin:24px 0;text-align:center;">
                  <a href="${ctaUrl}"
                    style="display:inline-block;background:${BRAND_COLOR};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">
                    ${ctaLabel ?? 'View in portal'}
                  </a>
                </div>
              ` : ''}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background:#fafafa;color:#999999;font-size:12px;text-align:center;border-top:1px solid #eeeeee;">
              Hydevest Solutions Limited · This is an automated notification.
              <br>
              <a href="${APP_URL}" style="color:${BRAND_COLOR};text-decoration:none;">${APP_URL}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `
}

export function taskAssignedTemplate(args: {
  recipientName: string
  taskTitle: string
  taskDescription?: string | null
  assignedBy: string
  dueDate?: string | null
  taskUrl: string
}) {
  return baseTemplate(
    `
      <h2 style="margin:0 0 16px;font-size:18px;color:#111;">Hi ${args.recipientName},</h2>
      <p style="margin:0 0 16px;">You have been assigned a new task by <strong>${args.assignedBy}</strong>:</p>
      <div style="background:#f8f7ff;border-left:3px solid ${BRAND_COLOR};padding:12px 16px;border-radius:4px;margin:16px 0;">
        <p style="margin:0 0 4px;font-weight:600;color:#111;">${args.taskTitle}</p>
        ${args.taskDescription ? `<p style="margin:4px 0 0;color:#666;font-size:13px;">${args.taskDescription}</p>` : ''}
        ${args.dueDate ? `<p style="margin:8px 0 0;color:#666;font-size:12px;"><strong>Due:</strong> ${args.dueDate}</p>` : ''}
      </div>
      <p style="margin:16px 0;">Click below to view and action this task.</p>
    `,
    args.taskUrl,
    'Open task'
  )
}

export function approvalRequestTemplate(args: {
  recipientName: string
  itemType: string
  itemId: string
  itemTitle: string
  requestedBy: string
  notes?: string | null
  itemUrl: string
}) {
  return baseTemplate(
    `
      <h2 style="margin:0 0 16px;font-size:18px;color:#111;">Hi ${args.recipientName},</h2>
      <p style="margin:0 0 16px;"><strong>${args.requestedBy}</strong> has submitted a ${args.itemType} for your approval:</p>
      <div style="background:#fff7ed;border-left:3px solid #f59e0b;padding:12px 16px;border-radius:4px;margin:16px 0;">
        <p style="margin:0 0 4px;font-weight:600;color:#111;">${args.itemTitle}</p>
        <p style="margin:4px 0 0;color:#666;font-size:12px;font-family:monospace;">${args.itemId}</p>
        ${args.notes ? `<p style="margin:8px 0 0;color:#666;font-size:13px;">${args.notes}</p>` : ''}
      </div>
      <p style="margin:16px 0;">Please review and action this request.</p>
    `,
    args.itemUrl,
    'Review & approve'
  )
}

export function approvalDecisionTemplate(args: {
  recipientName: string
  itemType: string
  itemId: string
  itemTitle: string
  decision: 'approved' | 'rejected'
  decidedBy: string
  notes?: string | null
  itemUrl: string
}) {
  const color = args.decision === 'approved' ? '#10b981' : '#ef4444'
  const bg    = args.decision === 'approved' ? '#ecfdf5' : '#fef2f2'
  const label = args.decision === 'approved' ? 'Approved' : 'Rejected'

  return baseTemplate(
    `
      <h2 style="margin:0 0 16px;font-size:18px;color:#111;">Hi ${args.recipientName},</h2>
      <p style="margin:0 0 16px;">Your ${args.itemType} has been <strong style="color:${color}">${label.toLowerCase()}</strong> by <strong>${args.decidedBy}</strong>.</p>
      <div style="background:${bg};border-left:3px solid ${color};padding:12px 16px;border-radius:4px;margin:16px 0;">
        <p style="margin:0 0 4px;font-weight:600;color:#111;">${args.itemTitle}</p>
        <p style="margin:4px 0 0;color:#666;font-size:12px;font-family:monospace;">${args.itemId}</p>
        ${args.notes ? `<p style="margin:8px 0 0;color:#666;font-size:13px;"><strong>Notes:</strong> ${args.notes}</p>` : ''}
      </div>
    `,
    args.itemUrl,
    'View details'
  )
}

export function requestBoxMessageTemplate(args: {
  recipientName: string
  subject: string
  senderName: string
  messagePreview: string
  messageUrl: string
}) {
  return baseTemplate(
    `
      <h2 style="margin:0 0 16px;font-size:18px;color:#111;">Hi ${args.recipientName},</h2>
      <p style="margin:0 0 16px;">You have a new message from <strong>${args.senderName}</strong>:</p>
      <div style="background:#f0f9ff;border-left:3px solid #0284c7;padding:12px 16px;border-radius:4px;margin:16px 0;">
        <p style="margin:0 0 8px;font-weight:600;color:#111;">${args.subject}</p>
        <p style="margin:0;color:#666;font-size:13px;">${args.messagePreview}</p>
      </div>
    `,
    args.messageUrl,
    'View message'
  )
}

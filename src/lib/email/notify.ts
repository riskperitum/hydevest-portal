export async function notifyApprovalRequest(args: {
  recipientEmail: string
  recipientName: string
  itemType: string
  itemId: string
  itemTitle: string
  requestedBy: string
  notes?: string | null
  itemUrl: string
}) {
  const res = await fetch('/api/notifications/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      type: 'approval_request',
      recipientEmail: args.recipientEmail,
      recipientName: args.recipientName,
      itemType: args.itemType,
      itemId: args.itemId,
      itemTitle: args.itemTitle,
      requestedBy: args.requestedBy,
      notes: args.notes,
      itemUrl: args.itemUrl,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    console.warn('Approval request email notify failed:', err)
  }
}

export async function notifyTaskAssigned(args: {
  recipientEmail: string
  recipientName: string
  taskTitle: string
  taskDescription?: string | null
  assignedBy: string
  dueDate?: string | null
  taskUrl: string
}) {
  const res = await fetch('/api/notifications/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      type: 'task_assigned',
      recipientEmail: args.recipientEmail,
      recipientName: args.recipientName,
      taskTitle: args.taskTitle,
      taskDescription: args.taskDescription,
      assignedBy: args.assignedBy,
      dueDate: args.dueDate,
      taskUrl: args.taskUrl,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    console.warn('Task assigned email notify failed:', err)
  }
}

export async function notifyRequestBoxMessage(args: {
  recipientEmail: string
  recipientName: string
  subject: string
  senderName: string
  messagePreview: string
  messageUrl: string
}) {
  const res = await fetch('/api/notifications/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      type: 'requestbox_message',
      recipientEmail: args.recipientEmail,
      recipientName: args.recipientName,
      subject: args.subject,
      senderName: args.senderName,
      messagePreview: args.messagePreview,
      messageUrl: args.messageUrl,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    console.warn('Requestbox email notify failed:', err)
  }
}

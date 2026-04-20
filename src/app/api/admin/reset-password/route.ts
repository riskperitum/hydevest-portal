import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/utils/rateLimit'

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
  const { allowed } = rateLimit(`reset-password:${ip}`, 5, 60_000)
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }

  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Get requesting user role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('roles(name)')
      .eq('user_id', user.id)

    const roles = (roleData ?? []).map((r: any) => {
      const role = r.roles as { name?: string } | null
      return role?.name ?? ''
    })

    const isSuperAdmin = roles.includes('super_admin')
    const isAdmin      = roles.includes('admin')

    if (!isSuperAdmin && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { target_user_id, new_password } = await request.json()
    if (!target_user_id || !new_password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (new_password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    // Check if target user is super_admin — only super_admin can reset super_admin
    const { data: targetRoles } = await supabase
      .from('user_roles')
      .select('roles(name)')
      .eq('user_id', target_user_id)

    const targetIsSuperAdmin = (targetRoles ?? []).some((r: any) => {
      const role = r.roles as { name?: string } | null
      return role?.name === 'super_admin'
    })

    if (targetIsSuperAdmin && !isSuperAdmin) {
      return NextResponse.json({ error: 'Only a super admin can reset another super admin password' }, { status: 403 })
    }

    // Use service role to reset password
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { error } = await adminClient.auth.admin.updateUserById(target_user_id, {
      password: new_password,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ success: true })

  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 })
  }
}

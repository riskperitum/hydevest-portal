import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('roles(name)')
      .eq('user_id', user.id)
      .single()
    const roles = roleData?.roles as { name?: string } | { name?: string }[] | undefined
    const roleName = Array.isArray(roles) ? roles[0]?.name : roles?.name
    if (!['admin', 'super_admin'].includes(roleName ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { email, password, full_name, partner_id } = await req.json()
    if (!email || !password || !full_name || !partner_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    })

    if (createError) return NextResponse.json({ error: createError.message }, { status: 400 })

    const newUserId = newUser.user.id

    let { data: partnerRole } = await adminClient
      .from('roles').select('id').eq('name', 'partner').single()

    if (!partnerRole) {
      const { data: newRole } = await adminClient
        .from('roles')
        .insert({ name: 'partner', description: 'External partner with restricted portal access' })
        .select().single()
      partnerRole = newRole
    }

    if (partnerRole) {
      await adminClient.from('user_roles').insert({
        user_id: newUserId,
        role_id: partnerRole.id,
      })
    }

    await adminClient.from('partners')
      .update({ user_id: newUserId })
      .eq('id', partner_id)

    return NextResponse.json({ success: true, user_id: newUserId })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

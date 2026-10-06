import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Missing authorization' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const token = authHeader.replace('Bearer ', '')
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const allowedEmails = (Deno.env.get('ADMIN_EMAILS') ?? '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean)
    const adminClient = createClient(url, serviceKey)
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token)
    if (userError || !user || !user.email || !allowedEmails.includes(user.email.toLowerCase())) return new Response(JSON.stringify({ error: 'Admin email not allowed' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const role = (await request.json().catch(() => ({}))).role ?? 'admin'
    if (!['super_admin', 'admin', 'moderator', 'support'].includes(role)) return new Response(JSON.stringify({ error: 'Invalid role' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const { error } = await adminClient.from('admin_roles').upsert({ user_id: user.id, role, granted_by: user.id })
    if (error) throw error
    return new Response(JSON.stringify({ ok: true, user_id: user.id, role }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})

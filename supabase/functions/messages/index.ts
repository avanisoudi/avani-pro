import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return json({ error: 'Unauthorized' }, 401)
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
    const payload = await request.json()
    if (typeof payload.conversation_id !== 'string' || typeof payload.body !== 'string' || !payload.body.trim()) return json({ error: 'conversation_id and body are required' }, 400)
    const { data, error } = await supabase.from('messages').insert({ conversation_id: payload.conversation_id, sender_id: user.id, body: payload.body.trim().slice(0, 10000) }).select().single()
    if (error) return json({ error: error.message }, 400)
    return json({ data }, 201)
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500) }
})

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) }

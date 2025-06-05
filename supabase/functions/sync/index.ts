import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Get the authorization header
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    
    // Set the auth token for this request
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token)
    
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const { method } = req
    const url = new URL(req.url)
    const path = url.pathname.split('/').pop()

    switch (method) {
      case 'GET': {
        if (path === 'patches') {
          // Get user's patches
          const { data, error } = await supabaseClient
            .from('patches')
            .select('*')
            .eq('owner', userData.user.id)
            .order('updated_at', { ascending: false })

          if (error) throw error

          return new Response(
            JSON.stringify({ patches: data }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          )
        }

        if (path?.startsWith('patch-')) {
          // Get specific patch
          const patchId = path.replace('patch-', '')
          const { data, error } = await supabaseClient
            .from('patches')
            .select('*')
            .eq('id', patchId)
            .single()

          if (error) throw error

          // Check if user has access (owner or public)
          if (data.owner !== userData.user.id && !data.is_public) {
            return new Response(
              JSON.stringify({ error: 'Forbidden' }),
              { 
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              }
            )
          }

          return new Response(
            JSON.stringify({ patch: data }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          )
        }

        break
      }

      case 'POST': {
        if (path === 'patch') {
          // Create new patch
          const body = await req.json()
          const { title, description, nodes, is_public } = body

          const { data, error } = await supabaseClient
            .from('patches')
            .insert({
              owner: userData.user.id,
              title,
              description,
              nodes,
              is_public: is_public || false
            })
            .select()
            .single()

          if (error) throw error

          return new Response(
            JSON.stringify({ patch: data }),
            { 
              status: 201,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          )
        }
        break
      }

      case 'PUT': {
        if (path?.startsWith('patch-')) {
          // Update existing patch
          const patchId = path.replace('patch-', '')
          const body = await req.json()

          // Verify ownership
          const { data: existingPatch, error: fetchError } = await supabaseClient
            .from('patches')
            .select('owner')
            .eq('id', patchId)
            .single()

          if (fetchError) throw fetchError

          if (existingPatch.owner !== userData.user.id) {
            return new Response(
              JSON.stringify({ error: 'Forbidden' }),
              { 
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              }
            )
          }

          const { data, error } = await supabaseClient
            .from('patches')
            .update(body)
            .eq('id', patchId)
            .select()
            .single()

          if (error) throw error

          return new Response(
            JSON.stringify({ patch: data }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          )
        }
        break
      }

      case 'DELETE': {
        if (path?.startsWith('patch-')) {
          // Delete patch
          const patchId = path.replace('patch-', '')

          // Verify ownership
          const { data: existingPatch, error: fetchError } = await supabaseClient
            .from('patches')
            .select('owner')
            .eq('id', patchId)
            .single()

          if (fetchError) throw fetchError

          if (existingPatch.owner !== userData.user.id) {
            return new Response(
              JSON.stringify({ error: 'Forbidden' }),
              { 
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              }
            )
          }

          const { error } = await supabaseClient
            .from('patches')
            .delete()
            .eq('id', patchId)

          if (error) throw error

          return new Response(
            JSON.stringify({ success: true }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          )
        }
        break
      }
    }

    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { 
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Sync function error:', error)
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
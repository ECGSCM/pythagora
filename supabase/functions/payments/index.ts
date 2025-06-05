import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
})

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const url = new URL(req.url)
    const path = url.pathname.split('/').pop()

    switch (req.method) {
      case 'POST': {
        if (path === 'create-checkout-session') {
          // Create Stripe checkout session for premium upgrade
          const authHeader = req.headers.get('Authorization')!
          const token = authHeader.replace('Bearer ', '')
          
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

          const { price_id } = await req.json()

          const session = await stripe.checkout.sessions.create({
            customer_email: userData.user.email,
            payment_method_types: ['card'],
            line_items: [
              {
                price: price_id || 'price_1234567890', // Default premium price ID
                quantity: 1,
              },
            ],
            mode: 'subscription',
            success_url: `${req.headers.get('origin')}/account?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.headers.get('origin')}/account`,
            metadata: {
              user_id: userData.user.id,
            },
          })

          return new Response(
            JSON.stringify({ url: session.url }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          )
        }

        if (path === 'webhook') {
          // Handle Stripe webhooks
          const signature = req.headers.get('stripe-signature')
          const body = await req.text()

          let event
          try {
            event = stripe.webhooks.constructEvent(
              body,
              signature!,
              Deno.env.get('STRIPE_WEBHOOK_SECRET') || ''
            )
          } catch (err) {
            console.error('Webhook signature verification failed:', err)
            return new Response('Webhook signature verification failed', { status: 400 })
          }

          // Handle different webhook events
          switch (event.type) {
            case 'checkout.session.completed': {
              const session = event.data.object as Stripe.Checkout.Session
              const userId = session.metadata?.user_id

              if (userId) {
                // Upgrade user to premium
                const { error } = await supabaseClient
                  .from('users')
                  .update({ role: 'premium' })
                  .eq('id', userId)

                if (error) {
                  console.error('Failed to upgrade user:', error)
                }
              }
              break
            }

            case 'customer.subscription.deleted': {
              const subscription = event.data.object as Stripe.Subscription
              const customerId = subscription.customer as string

              // Find user by customer ID and downgrade to free
              const customer = await stripe.customers.retrieve(customerId)
              if (customer && !customer.deleted && customer.email) {
                const { error } = await supabaseClient
                  .from('users')
                  .update({ role: 'free' })
                  .eq('email', customer.email)

                if (error) {
                  console.error('Failed to downgrade user:', error)
                }
              }
              break
            }

            case 'invoice.payment_failed': {
              const invoice = event.data.object as Stripe.Invoice
              const customerId = invoice.customer as string

              // Handle failed payment - could send notification email
              console.log('Payment failed for customer:', customerId)
              break
            }
          }

          return new Response('Webhook handled', { status: 200 })
        }

        break
      }

      case 'GET': {
        if (path === 'subscription-status') {
          // Get user's subscription status
          const authHeader = req.headers.get('Authorization')!
          const token = authHeader.replace('Bearer ', '')
          
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

          // Get user's role from database
          const { data: user, error } = await supabaseClient
            .from('users')
            .select('role')
            .eq('id', userData.user.id)
            .single()

          if (error) throw error

          return new Response(
            JSON.stringify({ 
              role: user.role,
              is_premium: user.role === 'premium'
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          )
        }

        if (path === 'create-portal-session') {
          // Create Stripe customer portal session
          const authHeader = req.headers.get('Authorization')!
          const token = authHeader.replace('Bearer ', '')
          
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

          // Find or create Stripe customer
          const customers = await stripe.customers.list({
            email: userData.user.email,
            limit: 1
          })

          let customer
          if (customers.data.length > 0) {
            customer = customers.data[0]
          } else {
            customer = await stripe.customers.create({
              email: userData.user.email,
              metadata: {
                user_id: userData.user.id
              }
            })
          }

          const session = await stripe.billingPortal.sessions.create({
            customer: customer.id,
            return_url: `${req.headers.get('origin')}/account`,
          })

          return new Response(
            JSON.stringify({ url: session.url }),
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
    console.error('Payment function error:', error)
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
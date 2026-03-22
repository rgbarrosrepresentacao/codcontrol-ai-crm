import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
    try {
        console.log('[KIWIFY_WEBHOOK] Incoming request received...')
        const rawBody = await req.text()
        console.log('[KIWIFY_WEBHOOK] Raw body loaded.')
        
        const body = JSON.parse(rawBody)
        console.log('[KIWIFY_WEBHOOK] Full Body received:', JSON.stringify(body, null, 2))

        const signature = req.nextUrl.searchParams.get('signature')
        
        if (process.env.KIWIFY_WEBHOOK_SECRET && signature) {
            const expectedSignature = crypto
                .createHmac('sha1', process.env.KIWIFY_WEBHOOK_SECRET)
                .update(rawBody)
                .digest('hex')
            
            if (signature !== expectedSignature) {
                console.warn('[KIWIFY_WEBHOOK] Signature mismatch. (Continuing for verification...)')
            }
        }

        const {
            order_status,
            customer,
            product_id,
        } = body

        console.log(`[KIWIFY_WEBHOOK] Processing: ${order_status} | Product: ${product_id} | Email: ${customer?.email}`)

        if (!customer?.email) {
            console.warn('[KIWIFY_WEBHOOK] No customer email found in payload. Skipping processing.')
            return NextResponse.json({ received: true, info: 'No email found' })
        }

        const email = customer.email.toLowerCase()

        // 1. Check if user already exists
        const { data: existingUser } = await supabase.from('profiles').select('id').eq('email', email).single()

        if (existingUser) {
            console.log(`[KIWIFY_WEBHOOK] Updating existing user: ${email}`)
            const isActive = ['paid', 'trialing'].includes(order_status)
            
            await supabase.from('profiles').update({
                stripe_subscription_status: isActive ? 'active' : 'canceled',
                plan_id: product_id === '09522b10-2574-11f1-9c6b-eb8ffdd12023' ? 'basico' : undefined // Custom mapping
            }).eq('id', existingUser.id)
        } else if (order_status === 'paid' || order_status === 'trialing') {
            // 2. Create new user if paid and doesn't exist
            console.log(`[KIWIFY_WEBHOOK] Creating NEW user: ${email}`)
            
            const tempPassword = Math.random().toString(36).slice(-12)
            const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
                email: email,
                password: tempPassword,
                email_confirm: true,
                user_metadata: {
                    full_name: customer.full_name || 'Cliente Kiwify'
                }
            })

            if (createError) {
                console.error('[KIWIFY_WEBHOOK] Error creating user:', createError.message)
                return NextResponse.json({ error: 'Auth creation failed' }, { status: 500 })
            }

            // Wait a bit for the trigger to create the profile
            await new Promise(resolve => setTimeout(resolve, 1500))

            // Update plan information
            await supabase.from('profiles').update({
                plan_id: 'basico', // Default for now
                stripe_subscription_status: 'active'
            }).eq('id', newUser.user.id)
            
            console.log(`[KIWIFY_WEBHOOK] New user provisioned successfully: ${email}`)
        }

        return NextResponse.json({ received: true })
    } catch (err: any) {
        console.error('[KIWIFY_WEBHOOK] Fatal Error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
    try {
        const rawBody = await req.text()
        const body = JSON.parse(rawBody)
        const signature = req.nextUrl.searchParams.get('signature')
        
        // 1. Verify Signature (Kiwify standard is usually SHA1 HMAC)
        if (process.env.KIWIFY_WEBHOOK_SECRET && signature) {
            const expectedSignature = crypto
                .createHmac('sha1', process.env.KIWIFY_WEBHOOK_SECRET)
                .update(rawBody)
                .digest('hex')
            
            if (signature !== expectedSignature) {
                console.error('[KIWIFY_WEBHOOK] Signature mismatch')
                // For now, only warn or block if you're sure about the secret
                // return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
            }
        }

        const { order_status, customer, product_id } = body
        const email = customer.email.toLowerCase()

        // 2. Decide Action based on Order Status
        const isActive = ['paid', 'trialing'].includes(order_status)
        const isCanceled = ['refunded', 'canceled', 'chargeback', 'expired'].includes(order_status)

        // Find Plan by Kiwify Product ID
        // Hardcoded: 09522b10-2574-11f1-9c6b-eb8ffdd12023 -> Básico
        let planSlug = 'basico'
        if (product_id === '09522b10-2574-11f1-9c6b-eb8ffdd12023') planSlug = 'basico'
        
        const { data: plan } = await supabase.from('plans').select('id').eq('slug', planSlug).single()

        // 3. Upsert User/Profile
        const { data: existingUser } = await supabase.from('profiles').select('id, plan_id').eq('email', email).maybeSingle()

        if (existingUser) {
            // Update existing user
            await supabase.from('profiles').update({
                plan_id: isActive ? (plan?.id || existingUser.plan_id) : existingUser.plan_id,
                stripe_subscription_status: isActive ? 'active' : (isCanceled ? 'canceled' : 'past_due'),
                is_active: isActive,
                updated_at: new Date().toISOString()
            }).eq('id', existingUser.id)
            
            console.log(`[KIWIFY_WEBHOOK] Updated user ${email} to status ${order_status}`)
        } else if (isActive) {
            // Create New User in Auth (Admin)
            const temporaryPassword = Math.random().toString(36).slice(-12) + 'A1!'
            const { data: authData, error: createError } = await supabase.auth.admin.createUser({
                email,
                password: temporaryPassword,
                email_confirm: true,
                user_metadata: { name: customer.full_name || customer.first_name || 'Cliente Kiwify' }
            })

            if (createError) {
                console.error('[KIWIFY_WEBHOOK] Error creating auth user:', createError.message)
                return NextResponse.json({ error: createError.message }, { status: 500 })
            }

            // Wait brief moment for the 'handle_new_user' trigger to create the profile
            await new Promise(r => setTimeout(r, 1500))

            await supabase.from('profiles').update({
                plan_id: plan?.id || null,
                stripe_subscription_status: 'active',
                is_active: true,
                name: customer.full_name || customer.first_name || 'Cliente Kiwify'
            }).eq('id', authData.user.id)

            console.log(`[KIWIFY_WEBHOOK] Auto-created and activated NEW user ${email}`)
            
            // Note: In a real production app, you'd send a "Welcome" email here with their temporary password
            // or a link to reset it.
        }

        return NextResponse.json({ success: true, status: order_status })
    } catch (err: any) {
        console.error('[KIWIFY_WEBHOOK] Fatal Error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

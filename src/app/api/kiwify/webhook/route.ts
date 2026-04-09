export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    try {
        console.log('[KIWIFY_WEBHOOK] Incoming request received...')
        const rawBody = await req.text()
        const body = JSON.parse(rawBody)
        console.log('[KIWIFY_WEBHOOK] Full Body received:', JSON.stringify(body, null, 2))

        // ─── LOGGING (Security & Audit) ────────────────────────────────────────
        // Tentamos salvar o log mesmo se o resto falhar
        const email_raw = 
            body.Customer?.email || body.customer?.email ||
            body.email || body.Subscription?.customer?.email || ''
        const email = email_raw.toLowerCase().trim()
        const eventType = (body.webhook_event_type || body.status || 'unknown').toLowerCase()

        try {
            await supabase.from('webhook_logs').insert({
                provider: 'kiwify',
                payload: body,
                user_email: email,
                event_type: eventType,
                status: body.order_status || body.OrderStatus || body.status || 'unknown'
            })
        } catch (logErr) {
            console.error('[KIWIFY_WEBHOOK] Failed to save log:', logErr)
            // Não falhamos a requisição se apenas o log falhar, mas avisamos
        }

        // Validação de assinatura (opcional)
        const signature = req.nextUrl.searchParams.get('signature')
        if (process.env.KIWIFY_WEBHOOK_SECRET && signature) {
            const expectedSignature = crypto
                .createHmac('sha1', process.env.KIWIFY_WEBHOOK_SECRET)
                .update(rawBody)
                .digest('hex')
            if (signature !== expectedSignature) {
                console.warn('[KIWIFY_WEBHOOK] Signature mismatch. Continuing for debug...')
            }
        }

        // ─── NORMALIZAÇÃO DO PAYLOAD ───────────────────────────────────────────
        const order_status  = body.order_status  || body.OrderStatus  || body.status || ''
        const product_id    = body.product_id    || body.ProductID    || ''
        const customer = body.Customer || body.customer || {}
        const subscription = body.Subscription || body.subscription || {}

        console.log(`[KIWIFY_WEBHOOK] Normalized → Status: "${order_status}" | Product: "${product_id}" | Email: "${email}"`)

        if (!email) {
            console.warn('[KIWIFY_WEBHOOK] No customer email found. Skipping.')
            return NextResponse.json({ received: true, info: 'No email found' })
        }

        // ─── DETECÇÃO DO PLANO ─────────────────────────────────────────────────
        let planSlug = 'basico'
        const amount = 
            subscription?.charges?.completed?.[0]?.amount ||
            body.order?.amount || body.payment?.amount || 0
        const amountInReais = amount > 100 ? amount / 100 : amount

        if (amountInReais >= 400) {
            planSlug = 'pro'
        }

        const planName = (
            subscription?.plan?.name || body.Subscription?.plan?.name ||
            body.product_name || body.ProductName || ''
        ).toLowerCase()

        if (planName.includes('professional') || planName.includes('pro') || planName.includes('497')) {
            planSlug = 'pro'
        }

        // ─── LÓGICA DE STATUS ──────────────────────────────────────────────────
        const subStatus = (subscription?.status || '').toLowerCase()

        const isCanceled = 
            ['canceled', 'cancelled', 'chargeback', 'refunded', 'past_due', 'inactive'].includes(order_status.toLowerCase()) ||
            ['canceled', 'cancelled', 'past_due'].includes(subStatus) ||
            eventType.includes('canceled') || eventType.includes('refunded') || eventType.includes('chargeback')

        const isActive = 
            ['paid', 'completed', 'active', 'pago', 'aprovado', 'approved'].includes(order_status.toLowerCase()) ||
            ['active'].includes(subStatus) ||
            ['order_approved', 'payment_approved'].includes(eventType) || 
            eventType.includes('renewed')

        const isPending = 
            ['waiting_payment', 'pending'].includes(order_status.toLowerCase()) || 
            eventType.includes('created')

        if (isPending && !isActive && !isCanceled) {
            console.log(`[KIWIFY_WEBHOOK] ⏳ Pending payment ignored for: ${email}`)
            return NextResponse.json({ received: true, info: 'Pending payment - ignored' })
        }

        // ─── PROCESSAMENTO NO DB ───────────────────────────────────────────────
        const { data: existingUser } = await supabase
            .from('profiles').select('id').eq('email', email).single()

        const finalStatus = isCanceled ? 'canceled' : (isActive ? 'active' : 'inactive')
        
        // GRACE PERIOD (Carência de 48h)
        // Adicionamos 2 dias ao prazo da Kiwify para evitar bloqueios por delay de processamento
        const nextPayment = subscription?.next_payment || subscription?.customer_access?.access_until
        let trialEndsAt = null
        if (nextPayment) {
            const date = new Date(nextPayment)
            date.setHours(date.getHours() + 48) // +48h Grace Period
            trialEndsAt = date.toISOString()
        } else if (isActive) {
            const d = new Date()
            d.setDate(d.getDate() + 32) // 30 dias + 2 de carência
            trialEndsAt = d.toISOString()
        }

        if (existingUser) {
            console.log(`[KIWIFY_WEBHOOK] Updating existing user: ${email} → status: ${finalStatus}`)
            
            const { data: planData } = await supabase.from('plans').select('id').eq('slug', planSlug).single()

            const updatePayload: any = {
                stripe_subscription_status: finalStatus,
                plan_id: planData?.id || undefined,
            }
            if (trialEndsAt) updatePayload.trial_ends_at = trialEndsAt

            const { error: updateError } = await supabase.from('profiles').update(updatePayload).eq('id', existingUser.id)
            
            if (updateError) {
                console.error('[KIWIFY_WEBHOOK] Update failed:', updateError.message)
            }
        } else if (isActive) {
            console.log(`[KIWIFY_WEBHOOK] Creating NEW user: ${email} for plan: ${planSlug}`)
            
            const fullName = customer.full_name || customer.FullName || customer.name || 'Cliente'
            const tempPassword = Math.random().toString(36).slice(-12)

            const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
                email: email,
                password: tempPassword,
                email_confirm: true,
                user_metadata: { full_name: fullName }
            })

            if (createError) {
                console.error('[KIWIFY_WEBHOOK] Error creating user:', createError.message)
                return NextResponse.json({ error: 'Auth creation failed' }, { status: 500 })
            }

            const { data: planData } = await supabase.from('plans').select('id').eq('slug', planSlug).single()

            await supabase.from('profiles').upsert({
                id: newUser.user.id,
                email: email,
                plan_id: planData?.id,
                stripe_subscription_status: 'active',
                name: fullName,
                trial_ends_at: trialEndsAt || undefined
            })

            console.log(`[KIWIFY_WEBHOOK] ✅ New user provisioned: ${email}`)
        }

        return NextResponse.json({ received: true })
    } catch (err: any) {
        console.error('[KIWIFY_WEBHOOK] Fatal Error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

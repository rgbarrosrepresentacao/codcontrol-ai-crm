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

        // Validação de assinatura (opcional)
        const signature = req.nextUrl.searchParams.get('signature')
        if (process.env.KIWIFY_WEBHOOK_SECRET && signature) {
            const expectedSignature = crypto
                .createHmac('sha1', process.env.KIWIFY_WEBHOOK_SECRET)
                .update(rawBody)
                .digest('hex')
            if (signature !== expectedSignature) {
                console.warn('[KIWIFY_WEBPACK] Signature mismatch. Continuing for debug...')
            }
        }

        // ─── NORMALIZAÇÃO DO PAYLOAD ───────────────────────────────────────────
        // A Kiwify pode enviar em snake_case OU em PascalCase dependendo da versão.
        // Normalizamos aqui para garantir compatibilidade total.
        const order_status  = body.order_status  || body.OrderStatus  || body.status || ''
        const product_id    = body.product_id    || body.ProductID    || ''
        
        // Customer: pode ser body.Customer ou body.customer
        const customer = body.Customer || body.customer || {}
        
        // Email: tenta vários campos possíveis
        const email_raw = 
            customer.email       || customer.Email       ||
            body.Customer?.email || body.customer?.email ||
            body.email           || ''
        
        // Subscription: pode ser body.Subscription ou body.subscription
        const subscription = body.Subscription || body.subscription || {}

        console.log(`[KIWIFY_WEBHOOK] Normalized → Status: "${order_status}" | Product: "${product_id}" | Email: "${email_raw}"`)

        if (!email_raw) {
            console.warn('[KIWIFY_WEBHOOK] No customer email found. Skipping.')
            return NextResponse.json({ received: true, info: 'No email found' })
        }

        const email = email_raw.toLowerCase().trim()

        // ─── DETECÇÃO DO PLANO ─────────────────────────────────────────────────
        let planSlug = 'basico' // padrão seguro

        // 1. Por preço (mais confiável): verifica valor da cobrança atual
        const amount = 
            subscription?.charges?.completed?.[0]?.amount ||
            body.order?.amount || body.payment?.amount || 0
        const amountInReais = amount > 100 ? amount / 100 : amount

        console.log(`[KIWIFY_WEBHOOK] Amount detected: R$${amountInReais}`)

        if (amountInReais >= 400) {
            planSlug = 'pro' // R$ 497
        }
        // R$ 97 normal ou R$ 10 de primeira cobrança → basico (padrão)

        // 2. Por nome do plano (fallback seguro)
        const planName = (
            subscription?.plan?.name || body.Subscription?.plan?.name ||
            body.product_name || body.ProductName || ''
        ).toLowerCase()

        if (planName.includes('professional') || planName.includes('pro') || planName.includes('497')) {
            planSlug = 'pro'
        }

        console.log(`[KIWIFY_WEBHOOK] Plan resolved: "${planSlug}" | Plan name: "${planName}"`)

        // ─── PROCESSAMENTO ─────────────────────────────────────────────────────
        const { data: existingUser } = await supabase
            .from('profiles').select('id').eq('email', email).single()

        // ─── LÓGICA DE STATUS DO WEBHOOK ───────────────────────────────────────
        const eventType = (body.webhook_event_type || '').toLowerCase()
        const subStatus = (subscription?.status || '').toLowerCase()

        const isCanceled = 
            ['canceled', 'cancelled', 'chargeback', 'refunded', 'past_due', 'inactive'].includes(order_status.toLowerCase()) ||
            ['canceled', 'cancelled', 'past_due'].includes(subStatus) ||
            eventType.includes('canceled') || eventType.includes('refunded') || eventType.includes('chargeback') || eventType.includes('past_due')

        const isActive = 
            ['paid', 'completed', 'active', 'pago', 'aprovado', 'approved'].includes(order_status.toLowerCase()) ||
            ['active'].includes(subStatus) ||
            ['order_approved', 'payment_approved'].includes(eventType) || 
            eventType.includes('renewed')

        const isPending = 
            ['waiting_payment', 'pending'].includes(order_status.toLowerCase()) || 
            eventType.includes('created')

        // Se for só geração de Pix/Boleto sem pagamento, ignorar para não afetar status
        if (isPending && !isActive && !isCanceled) {
            console.log(`[KIWIFY_WEBHOOK] ⏳ Pending payment ignored for: ${email}`)
            return NextResponse.json({ received: true, info: 'Pending payment - ignored' })
        }

        if (existingUser) {
            const finalStatus = isCanceled ? 'canceled' : (isActive ? 'active' : 'inactive')
            console.log(`[KIWIFY_WEBHOOK] Updating existing user: ${email} → status: ${finalStatus} (Event: ${eventType})`)
            
            const { data: planData } = await supabase.from('plans').select('id').eq('slug', planSlug).single()

            // Define trial_ends_at based on Kiwify's next payment date + Grace Period
            const nextPayment = subscription?.next_payment || subscription?.customer_access?.access_until
            let trialEndsAt = null
            if (nextPayment) {
                trialEndsAt = new Date(nextPayment).toISOString()
            } else if (isActive) {
                // Se pagou e não for assinatura com data (venda única, etc), por segurança +30 dias:
                const d = new Date()
                d.setDate(d.getDate() + 30)
                trialEndsAt = d.toISOString()
            }

            await supabase.from('profiles').update({
                stripe_subscription_status: finalStatus,
                plan_id: planData?.id || undefined,
                trial_ends_at: trialEndsAt || undefined
            }).eq('id', existingUser.id)

            console.log(`[KIWIFY_WEBHOOK] ✅ User updated successfully: ${email}`)

        } else if (isActive) {
            // Novo cliente pagante — cria conta automaticamente
            console.log(`[KIWIFY_WEBHOOK] Creating NEW user: ${email} for plan: ${planSlug}`)
            
            const fullName = 
                customer.full_name || customer.FullName || 
                customer.name      || customer.Name     || 'Cliente'

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

            await new Promise(resolve => setTimeout(resolve, 1500))

            const { data: planData } = await supabase.from('plans').select('id').eq('slug', planSlug).single()

            const nextPayment = subscription?.next_payment || subscription?.customer_access?.access_until
            let trialEndsAt = null
            if (nextPayment) {
                trialEndsAt = new Date(nextPayment).toISOString()
            } else if (isActive) {
                const d = new Date()
                d.setDate(d.getDate() + 30)
                trialEndsAt = d.toISOString()
            }

            await supabase.from('profiles').update({
                plan_id: planData?.id,
                stripe_subscription_status: 'active',
                name: fullName,
                trial_ends_at: trialEndsAt || undefined
            }).eq('id', newUser.user.id)

            console.log(`[KIWIFY_WEBHOOK] ✅ New user provisioned: ${email} | Plan: ${planSlug}`)
        } else {
            console.log(`[KIWIFY_WEBHOOK] Ignoring event "${order_status}" for non-existing user ${email}`)
        }

        return NextResponse.json({ received: true })
    } catch (err: any) {
        console.error('[KIWIFY_WEBHOOK] Fatal Error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

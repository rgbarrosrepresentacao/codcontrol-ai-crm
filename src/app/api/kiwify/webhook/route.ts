import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import crypto from 'crypto'
import { SUBSCRIPTION_CONSTANTS } from '@/lib/constants'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    const supabase = getSupabaseAdmin()
    try {
        console.log('[KIWIFY_WEBHOOK] Incoming request received...')
        const rawBody = await req.text()
        const body = JSON.parse(rawBody)
        console.log('[KIWIFY_WEBHOOK] Full Body received:', JSON.stringify(body, null, 2))

        // ─── EXTRAÇÃO DE DADOS BÁSICOS ────────────────────────────────────────
        const email_raw = 
            body.Customer?.email || body.customer?.email ||
            body.email || body.Subscription?.customer?.email || ''
        const email = email_raw.toLowerCase().trim()
        const eventType = (body.webhook_event_type || body.status || 'unknown').toLowerCase()

        // ─── VALIDAÇÃO DE ASSINATURA (MODO ATIVO) ────────────────────────────
        const signature = req.nextUrl.searchParams.get('signature')
        let validSignature = false

        let currentLogId: string | null = null

        if (!process.env.KIWIFY_WEBHOOK_SECRET) {
            console.error('[KIWIFY_WEBHOOK] 🚫 KIWIFY_WEBHOOK_SECRET não configurado no ambiente. Bloqueando acesso por segurança.')
            return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
        }

        // Calcula a assinatura esperada (HMAC SHA1 do body bruto)
        const expectedSignature = signature
            ? crypto
                  .createHmac('sha1', process.env.KIWIFY_WEBHOOK_SECRET)
                  .update(rawBody)
                  .digest('hex')
            : null

        validSignature = !!expectedSignature && signature === expectedSignature

        // ── LOG DE AUDITORIA (sempre salvo, inclusive em caso de rejeição) ─
        try {
            const { data: logData } = await supabase.from('webhook_logs').insert({
                provider: 'kiwify',
                payload: body,
                user_email: email,
                event_type: eventType,
                status: body.order_status || body.OrderStatus || body.status || 'unknown',
                valid_signature: validSignature
            }).select('id').single()
            
            currentLogId = logData?.id || null
        } catch (logErr) {
            console.error('[KIWIFY_WEBHOOK] Failed to save log:', logErr)
        }
        // ─────────────────────────────────────────────────────────────────

        if (!signature) {
            console.error('[KIWIFY_WEBHOOK] 🚫 BLOQUEADO — Request recebido sem assinatura.')
            return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
        }

        if (!validSignature) {
            console.error('[KIWIFY_WEBHOOK] 🚫 BLOQUEADO — Assinatura inválida. Possível tentativa de fraude.')
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
        }

        console.log('[KIWIFY_WEBHOOK] ✅ Assinatura verificada e válida. Prosseguindo...')
        // ─────────────────────────────────────────────────────────────────────

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

        // ─── IDEMPOTÊNCIA (TRAVA DE DUPLICIDADE) ─────────────────────────────
        const orderId = body.order_id || body.OrderID || ''
        if (orderId) {
            const query = supabase
                .from('webhook_logs')
                .select('id')
                .eq('provider', 'kiwify')
                .eq('status', order_status)
                .filter('payload->>order_id', 'eq', orderId)

            // Se acabamos de inserir um log, ignoramos ele na busca de duplicados
            if (currentLogId) {
                query.neq('id', currentLogId)
            }

            const { data: existingLog } = await query.limit(1).maybeSingle()

            if (existingLog) {
                console.log(`[KIWIFY_WEBHOOK] ⏩ Evento já processado anteriormente (ID: ${orderId}, Status: ${order_status}). Ignorando re-processamento.`)
                return NextResponse.json({ received: true, info: 'Already processed' })
            }
        }
        // ─────────────────────────────────────────────────────────────────────

        // ─── DETECÇÃO DO PLANO ─────────────────────────────────────────────────
        let planSlug = 'basico'
        const amount = 
            subscription?.charges?.completed?.[0]?.amount ||
            body.order?.amount || body.payment?.amount || 0
        const amountInReais = amount > 100 ? amount / 100 : amount

        const planName = (
            subscription?.plan?.name || body.Subscription?.plan?.name ||
            body.product_name || body.ProductName || ''
        ).toLowerCase()

        // 1. Tenta buscar o plano pelo product_id oficial (mais robusto)
        const { data: planByProduct } = await supabase
            .from('plans')
            .select('slug')
            .eq('kiwify_product_id', product_id)
            .maybeSingle()

        if (planByProduct) {
            console.log(`[KIWIFY_WEBHOOK] 🎯 Plano detectado via ProductID: ${planByProduct.slug}`)
            planSlug = planByProduct.slug
        } else {
            // 2. Fallback por nome ou valor (legado/segurança)
            console.log(`[KIWIFY_WEBHOOK] ⚠️ ProductID não mapeado. Usando fallback por nome/valor.`)
            if (planName.includes('agência') || planName.includes('agencia') || planName.includes('agency') || amountInReais >= 800) {
                planSlug = 'agencia'
            } else if (planName.includes('pro') || planName.includes('professional') || amountInReais >= 200) {
                planSlug = 'pro'
            } else {
                planSlug = 'basico'
            }
        }

        // ─── LÓGICA DE STATUS (REFORÇADA) ──────────────────────────────────────
        const subStatus = (subscription?.status || '').toLowerCase()

        // Prioridade 1: Cancelamento/Estorno (Bloqueio)
        const isCanceled = 
            ['canceled', 'cancelled', 'chargeback', 'refunded', 'past_due', 'inactive'].includes(order_status.toLowerCase()) ||
            ['canceled', 'cancelled', 'past_due', 'inactive'].includes(subStatus) ||
            eventType.includes('canceled') || 
            eventType.includes('refunded') || 
            eventType.includes('chargeback') ||
            eventType.includes('expired')

        // Prioridade 2: Aprovação/Renovação (Acesso)
        const isActive = 
            !isCanceled && (
                ['paid', 'completed', 'active', 'pago', 'aprovado', 'approved'].includes(order_status.toLowerCase()) ||
                ['active'].includes(subStatus) ||
                ['order_approved', 'payment_approved'].includes(eventType) || 
                eventType.includes('renewed')
            )

        const isPending = 
            ['waiting_payment', 'pending'].includes(order_status.toLowerCase()) || 
            eventType.includes('created')

        if (isPending && !isActive && !isCanceled) {
            console.log(`[KIWIFY_WEBHOOK] ⏳ Pending payment ignored for: ${email}`)
            return NextResponse.json({ received: true, info: 'Pending payment - ignored' })
        }

        if (eventType === 'abandoned') {
            console.log(`[KIWIFY_WEBHOOK] ℹ️ Abandoned checkout ignored for: ${email}`)
            return NextResponse.json({ received: true, info: 'Abandoned checkout - ignored' })
        }

        // ─── PROCESSAMENTO NO DB ───────────────────────────────────────────────
        const { data: existingUser } = await supabase
            .from('profiles').select('id').eq('email', email).single()

        const finalStatus = isCanceled ? 'canceled' : (isActive ? 'active' : 'inactive')
        
        // Se for cancelado, forçamos a expiração para o passado para garantir bloqueio
        let trialEndsAt = null
        if (isCanceled) {
            trialEndsAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // Ontem
        } else {
            // GRACE PERIOD (Carência centralizada)
            const nextPayment = subscription?.next_payment || subscription?.customer_access?.access_until
            if (nextPayment) {
                const date = new Date(nextPayment)
                date.setHours(date.getHours() + SUBSCRIPTION_CONSTANTS.GRACE_PERIOD_HOURS)
                trialEndsAt = date.toISOString()
            } else if (isActive) {
                const d = new Date()
                d.setDate(d.getDate() + 30 + SUBSCRIPTION_CONSTANTS.GRACE_PERIOD_DAYS)
                trialEndsAt = d.toISOString()
            }
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

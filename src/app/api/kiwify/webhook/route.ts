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

        // Mapeamento de produtos Kiwify para Slugs do sistema
        // Ambos os planos (Standard e Pro) usam o mesmo product_id.
        // Diferenciamos pelo valor pago ou pelo nome do plano.
        const productMapping: Record<string, string> = {
            '09522b10-2574-11f1-9c6b-eb8ffdd12023': 'basico', // produto base (Standard por padrão)
        }

        let planSlug = productMapping[product_id]

        // DETECÇÃO POR PREÇO: O campo mais confiável da Kiwify
        const amount = body.order?.amount || body.payment?.amount || body.subscription?.plan?.amount || 0
        const amountInReais = amount > 100 ? amount / 100 : amount // normaliza centavos vs reais

        if (amountInReais >= 400) {
            planSlug = 'pro' // R$ 497
        } else if (amountInReais >= 50) {
            planSlug = 'basico' // R$ 97 ou R$ 10 (1ª cobrança)
        }

        // DETECÇÃO POR NOME DO PLANO (fallback secundário)
        const planName = (body.subscription?.plan?.name || body.product_name || '').toLowerCase()
        if (planName.includes('professional') || planName.includes('pro') || planName.includes('497')) {
            planSlug = 'pro'
        } else if (planName.includes('standard') || planName.includes('basico') || planName.includes('básico') || planName.includes('97')) {
            planSlug = 'basico'
        }

        // Fallback final: se nada identificar, usa básico
        if (!planSlug) planSlug = 'basico'

        console.log(`[KIWIFY_WEBHOOK] Plan detected: ${planSlug} | Amount: R$${amountInReais} | Plan name: "${planName}"`)

        if (existingUser) {
            console.log(`[KIWIFY_WEBHOOK] Updating existing user: ${email} to plan: ${planSlug}`)
            const isActive = ['paid', 'trialing'].includes(order_status)
            
            // Busca o ID do plano baseado no slug
            const { data: planData } = await supabase.from('plans').select('id').eq('slug', planSlug).single()
            
            await supabase.from('profiles').update({
                stripe_subscription_status: isActive ? 'active' : 'canceled',
                plan_id: planData?.id || undefined
            }).eq('id', existingUser.id)
        } else if (order_status === 'paid' || order_status === 'trialing') {
            console.log(`[KIWIFY_WEBHOOK] Creating NEW user: ${email} for plan: ${planSlug}`)
            
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

            await new Promise(resolve => setTimeout(resolve, 1500))

            const { data: planData } = await supabase.from('plans').select('id').eq('slug', planSlug).single()

            await supabase.from('profiles').update({
                plan_id: planData?.id,
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

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL!
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY!
const INSTANCE_NAME = 'crm_bf2a9710_rbpo'

// Rate limit simples: 60 segundos entre tentativas por número
const rateLimitMap = new Map<string, number>()

function generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString()
}

function formatWhatsApp(raw: string): string {
    // Remove tudo que não for número
    const digits = raw.replace(/\D/g, '')
    // Se não começar com 55 (Brasil), adiciona
    if (!digits.startsWith('55')) {
        return '55' + digits
    }
    return digits
}

export async function POST(req: NextRequest) {
    const supabase = getSupabaseAdmin()

    try {
        const body = await req.json()
        const { whatsapp, email, name } = body

        if (!whatsapp || !email) {
            return NextResponse.json({ error: 'WhatsApp e email são obrigatórios.' }, { status: 400 })
        }

        const formattedWA = formatWhatsApp(whatsapp)

        // ─── RATE LIMIT (60 segundos) ─────────────────────────────────────────
        const lastSent = rateLimitMap.get(formattedWA)
        const now = Date.now()
        if (lastSent && now - lastSent < 60000) {
            const remaining = Math.ceil((60000 - (now - lastSent)) / 1000)
            return NextResponse.json(
                { error: `Aguarde ${remaining} segundos para solicitar um novo código.` },
                { status: 429 }
            )
        }

        // ─── VERIFICAR SE NÚMERO JÁ USOU TRIAL ───────────────────────────────
        const { data: existingProfile } = await supabase
            .from('profiles')
            .select('id, stripe_subscription_status, whatsapp')
            .eq('whatsapp', formattedWA)
            .single()

        if (existingProfile) {
            const status = existingProfile.stripe_subscription_status
            const isTrialOrActive = ['trialing', 'active', 'paid', 'approved'].includes(status || '')
            if (isTrialOrActive) {
                return NextResponse.json(
                    { error: 'Este número de WhatsApp já está associado a uma conta.' },
                    { status: 409 }
                )
            }
        }

        // ─── GERAR CÓDIGO ─────────────────────────────────────────────────────
        const code = generateCode()
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutos

        // Invalidar códigos anteriores para esse número
        await supabase
            .from('activation_codes')
            .update({ used: true })
            .eq('whatsapp', formattedWA)
            .eq('used', false)

        // Salvar novo código
        const { error: insertError } = await supabase.from('activation_codes').insert({
            whatsapp: formattedWA,
            code,
            expires_at: expiresAt.toISOString(),
            email: email.toLowerCase().trim(),
            used: false
        })

        if (insertError) {
            console.error('[SEND_CODE] Erro ao salvar código:', insertError.message)
            return NextResponse.json({ error: 'Erro interno ao gerar código.' }, { status: 500 })
        }

        // ─── ENVIAR VIA EVOLUTION API ─────────────────────────────────────────
        const message = `🔐 *CodControl AI CRM*\n\nSeu código de ativação é: *${code}*\n\nEle expira em 10 minutos.\nNão compartilhe este código com ninguém.`

        const evoRes = await fetch(`${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': EVOLUTION_API_KEY
            },
            body: JSON.stringify({
                number: formattedWA,
                text: message
            })
        })

        if (!evoRes.ok) {
            const evoErr = await evoRes.text()
            console.error('[SEND_CODE] Evolution API falhou:', evoErr)
            // Não bloqueia o fluxo se a API falhar — código ainda está no banco
            return NextResponse.json({ error: 'Falha ao enviar WhatsApp. Verifique o número e tente novamente.' }, { status: 502 })
        }

        // Atualizar rate limit
        rateLimitMap.set(formattedWA, Date.now())

        console.log(`[SEND_CODE] ✅ Código enviado para ${formattedWA}`)
        return NextResponse.json({ success: true, message: 'Código enviado com sucesso!' })

    } catch (err: any) {
        console.error('[SEND_CODE] Erro fatal:', err)
        return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
    }
}

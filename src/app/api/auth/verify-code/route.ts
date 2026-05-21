import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL!
const INSTANCE_NAME = process.env.AUTH_INSTANCE_NAME
const INSTANCE_API_KEY = process.env.AUTH_INSTANCE_API_KEY

function formatWhatsApp(raw: string): string {
    const digits = raw.replace(/\D/g, '')
    if (!digits.startsWith('55')) {
        return '55' + digits
    }
    return digits
}

export async function POST(req: NextRequest) {
    const supabase = getSupabaseAdmin()

    try {
        const body = await req.json()
        const { whatsapp, code, email, name, password, affiliate_id } = body

        if (!whatsapp || !code || !email || !password) {
            return NextResponse.json({ error: 'Dados incompletos.' }, { status: 400 })
        }

        if (!INSTANCE_NAME || !INSTANCE_API_KEY || !EVOLUTION_API_URL) {
            console.error('[VERIFY_CODE] Configurações de AUTH_INSTANCE_NAME ou AUTH_INSTANCE_API_KEY não encontradas no .env')
            return NextResponse.json({ error: 'Serviço indisponível por falta de configuração interna.' }, { status: 503 })
        }

        const formattedWA = formatWhatsApp(whatsapp)
        const emailNorm = email.toLowerCase().trim()

        // ─── VALIDAR CÓDIGO ───────────────────────────────────────────────────
        const { data: activation, error: fetchError } = await supabase
            .from('activation_codes')
            .select('*')
            .eq('whatsapp', formattedWA)
            .eq('code', code)
            .eq('used', false)
            .gte('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(1)
            .single()

        if (fetchError || !activation) {
            return NextResponse.json(
                { error: 'Código inválido ou expirado. Solicite um novo código.' },
                { status: 400 }
            )
        }

        // ─── MARCAR CÓDIGO COMO USADO ─────────────────────────────────────────
        await supabase
            .from('activation_codes')
            .update({ used: true })
            .eq('id', activation.id)

        // ─── CRIAR USUÁRIO NO SUPABASE AUTH ───────────────────────────────────
        const { data: newUser, error: authError } = await supabase.auth.admin.createUser({
            email: emailNorm,
            password,
            email_confirm: true,
            user_metadata: { full_name: name || 'Usuário' }
        })

        if (authError) {
            // Se o email já existe, tenta atualizar o perfil
            if (authError.message.includes('already registered')) {
                return NextResponse.json(
                    { error: 'Este e-mail já está cadastrado. Acesse pelo login.' },
                    { status: 409 }
                )
            }
            console.error('[VERIFY_CODE] Erro ao criar usuário:', authError.message)
            return NextResponse.json({ error: 'Erro ao criar conta.' }, { status: 500 })
        }

        const userId = newUser.user.id

        // ─── CALCULAR TRIAL ───────────────────────────────────────────────────
        const trialEndsAt = new Date()
        trialEndsAt.setDate(trialEndsAt.getDate() + 7)

        // ─── BUSCAR PLANO BÁSICO ──────────────────────────────────────────────
        const { data: planData } = await supabase
            .from('plans')
            .select('id')
            .eq('slug', 'basico')
            .single()

        // ─── CRIAR PERFIL COM TRIAL ───────────────────────────────────────────
        const { error: profileError } = await supabase.from('profiles').upsert({
            id: userId,
            email: emailNorm,
            name: name || 'Usuário',
            whatsapp: formattedWA,
            affiliate_id: affiliate_id || null,
            stripe_subscription_status: 'trialing',
            plan_id: planData?.id || null,
            trial_ends_at: trialEndsAt.toISOString(),
            is_active: true,
        })

        if (profileError) {
            console.error('[VERIFY_CODE] Erro ao criar perfil:', profileError.message)
            return NextResponse.json({ error: 'Erro ao configurar perfil.' }, { status: 500 })
        }

        // ─── MENSAGEM DE BOAS-VINDAS ──────────────────────────────────────────
        const welcomeMsg = `✅ *CodControl AI CRM*\n\nSeu acesso de 7 dias foi ativado com sucesso!\n\nAcesse agora o seu painel e comece a usar.\nEm caso de dúvidas, nossa equipe está aqui para te ajudar. 🚀`

        await fetch(`${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': INSTANCE_API_KEY
            },
            body: JSON.stringify({
                number: formattedWA,
                text: welcomeMsg
            })
        }).catch(() => {
            // Silencia erro — mensagem de boas-vindas não é crítica
        })

        console.log(`[VERIFY_CODE] ✅ Trial ativado para: ${emailNorm} | WhatsApp: ${formattedWA}`)
        return NextResponse.json({ success: true, message: 'Conta criada e trial ativado com sucesso!' })

    } catch (err: any) {
        console.error('[VERIFY_CODE] Erro fatal:', err)
        return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
    }
}

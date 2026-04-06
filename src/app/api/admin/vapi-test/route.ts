import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
    // Usar o mesmo padrão do cron para garantir conexão
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    try {
        const body = await req.json().catch(() => ({}))
        const { phone, userId, vapiPhoneId, vapiAssistantId } = body

        if (!phone || !userId) {
            return NextResponse.json({ error: 'phone e userId são obrigatórios' }, { status: 400 })
        }

        // Busca perfil e valida que é admin
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('is_admin, vapi_api_key, vapi_enabled')
            .eq('id', userId)
            .single()

        if (profileError || !profile) {
            return NextResponse.json({ error: 'Perfil não encontrado ou erro no banco' }, { status: 404 })
        }

        if (!profile.is_admin) {
            return NextResponse.json({ error: 'Acesso restrito a administradores' }, { status: 403 })
        }

        if (!profile.vapi_api_key) {
            return NextResponse.json({ error: 'Chave Vapi não encontrada. Salve a chave primeiro.' }, { status: 400 })
        }

        // Formata número para E.164
        const rawNumber = phone.replace(/\D/g, '')
        const e164 = rawNumber.startsWith('55') ? `+${rawNumber}` : `+55${rawNumber}`

        const vapiBody: any = {
            customer: { number: e164 },
            phoneNumberId: vapiPhoneId || process.env.VAPI_PHONE_NUMBER_ID || undefined,
        }

        // Se o usuário passou um Assistant ID, usa ele. Caso contrário, usa o padrão.
        if (vapiAssistantId) {
            vapiBody.assistantId = vapiAssistantId
        } else {
            vapiBody.assistant = {
                model: {
                    provider: 'openai',
                    model: 'gpt-4o-mini',
                    messages: [{
                        role: 'system',
                        content: `Você é a Camila, vendedora IA do CodControl. Esta é uma ligação de TESTE do sistema. 
                        Cumprimente o usuário, apresente-se como a assistente virtual e pergunte se o sistema de voz está soando natural.
                        Seja simpática e breve — é só um teste técnico!`
                    }]
                },
                voice: { provider: '11labs', voiceId: 'paula' },
                serverUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://codcontrolpro.bond'}/api/vapi/webhook`,
                firstMessage: `Olá! Aqui é a Camila, assistente virtual do CodControl. Estou ligando para um teste do sistema de ligações automáticas. Está me ouvindo bem?`,
                maxDurationSeconds: 60,
            }
        }

        const vapiRes = await fetch('https://api.vapi.ai/call/phone', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${profile.vapi_api_key}`
            },
            body: JSON.stringify(vapiBody)
        })

        const resText = await vapiRes.text()
        let vapiData: any = {}
        try {
            vapiData = JSON.parse(resText)
        } catch (e) {
            console.error('[VAPI_TEST] Erro ao parsear resposta da Vapi:', resText)
        }

        if (!vapiRes.ok) {
            return NextResponse.json({ 
                error: vapiData?.message || `Erro na Vapi (Status ${vapiRes.status})`,
                details: vapiData
            }, { status: vapiRes.status })
        }

        return NextResponse.json({ 
            success: true, 
            callId: vapiData.id, 
            message: `Ligação iniciada para ${e164}` 
        })

    } catch (err: any) {
        console.error('[VAPI_TEST] Exceção:', err)
        return NextResponse.json({ error: 'Erro interno no servidor: ' + err.message }, { status: 500 })
    }
}


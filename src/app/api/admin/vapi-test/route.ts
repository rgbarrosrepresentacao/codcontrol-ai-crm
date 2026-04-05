import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
    )

    try {
        const { phone, userId } = await req.json()

        if (!phone || !userId) {
            return NextResponse.json({ error: 'phone e userId são obrigatórios' }, { status: 400 })
        }

        // Busca perfil e valida que é admin
        const { data: profile } = await supabase
            .from('profiles')
            .select('is_admin, vapi_api_key, vapi_enabled')
            .eq('id', userId)
            .single()

        if (!profile?.is_admin) {
            return NextResponse.json({ error: 'Acesso restrito a administradores' }, { status: 403 })
        }

        if (!profile?.vapi_api_key) {
            return NextResponse.json({ error: 'Salve sua Vapi API Key nas configurações primeiro' }, { status: 400 })
        }

        // Formata número para E.164
        const rawNumber = phone.replace(/\D/g, '')
        const e164 = rawNumber.startsWith('55') ? `+${rawNumber}` : `+55${rawNumber}`

        const vapiBody = {
            customer: { number: e164 },
            phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID || undefined,
            assistant: {
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

        if (!vapiRes.ok) {
            const errText = await vapiRes.text()
            console.error('[VAPI_TEST] Erro:', errText)
            return NextResponse.json({ error: `Vapi retornou erro: ${errText}` }, { status: 500 })
        }

        const vapiData = await vapiRes.json()
        return NextResponse.json({ success: true, callId: vapiData.id, message: `Ligação iniciada para ${e164}` })

    } catch (err: any) {
        console.error('[VAPI_TEST] Exceção:', err.message)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

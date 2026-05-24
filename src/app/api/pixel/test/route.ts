export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { decrypt } from '@/lib/crypto'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createSupabaseServerClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
        }

        // Load settings for this user
        const { data: settings, error: settingsError } = await supabase
            .from('facebook_tracking_settings')
            .select('*')
            .eq('user_id', user.id)
            .single()

        if (settingsError || !settings) {
            return NextResponse.json({ error: 'Configurações do Pixel não encontradas. Configure o Pixel ID e o Access Token antes de testar.' }, { status: 400 })
        }

        let capiToken = ''
        try {
            capiToken = decrypt(settings.capi_token_encrypted)
        } catch (err) {
            return NextResponse.json({ error: 'Erro ao descriptografar o Access Token. Salve novamente o token e tente de novo.' }, { status: 400 })
        }

        if (!capiToken) {
            return NextResponse.json({ error: 'Access Token CAPI inválido ou não configurado.' }, { status: 400 })
        }

        const testEventId = `test_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

        const payload: any = {
            data: [{
                event_name: 'Purchase',
                event_time: Math.floor(Date.now() / 1000),
                event_id: testEventId,
                action_source: 'chat',
                user_data: {
                    em: ['309a0aad27b98bc8c6c87f3e23f4b9f4dd3adfc60f5a5e7ef7700823a5f960d3'], // hashed 'test@example.com'
                    ph: ['1ef06bb70e6b14e0c18e69b0db4ede25c7e44f8e4e8e3a1c3d16f3a0d3d81b10'],  // hashed placeholder
                },
                custom_data: {
                    currency: 'BRL',
                    value: 100.00
                }
            }],
            ...(settings.test_event_code ? { test_event_code: settings.test_event_code } : {})
        }

        const url = `https://graph.facebook.com/v19.0/${settings.pixel_id}/events?access_token=${capiToken}`

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })

        const responseBody = await response.json()

        if (!response.ok) {
            return NextResponse.json({
                success: false,
                error: responseBody.error?.message || 'Erro ao comunicar com a API do Facebook.',
                details: responseBody
            }, { status: 400 })
        }

        return NextResponse.json({
            success: true,
            message: `Evento de teste enviado com sucesso! Eventos recebidos: ${responseBody.events_received ?? 0}`,
            eventId: testEventId,
            response: responseBody
        })
    } catch (error: any) {
        console.error('[pixel-test] Error:', error)
        return NextResponse.json({ error: error.message || 'Erro inesperado ao testar evento' }, { status: 500 })
    }
}

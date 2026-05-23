export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { encrypt, decrypt } from '@/lib/crypto'

function maskToken(token: string): string {
    if (!token) return ''
    if (token.length <= 12) return '••••••••••••'
    return `${token.slice(0, 8)}••••••••••••••••${token.slice(-4)}`
}

export async function GET(req: NextRequest) {
    try {
        const supabase = await createSupabaseServerClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
        }

        const { data, error } = await supabase
            .from('facebook_tracking_settings')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle()

        if (error) throw error

        if (data) {
            let decryptedToken = ''
            try {
                decryptedToken = decrypt(data.capi_token_encrypted)
            } catch (err) {
                // If decryption fails, just ignore
            }

            return NextResponse.json({
                success: true,
                settings: {
                    id: data.id,
                    pixelId: data.pixel_id,
                    capiToken: decryptedToken ? maskToken(decryptedToken) : '',
                    testEventCode: data.test_event_code,
                    isActive: data.is_active,
                    createdAt: data.created_at
                }
            })
        }

        return NextResponse.json({
            success: true,
            settings: null
        })
    } catch (error: any) {
        console.error('[pixel-settings-get] Error:', error)
        return NextResponse.json({ error: error.message || 'Erro ao carregar configurações' }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createSupabaseServerClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
        }

        const { pixelId, capiToken, testEventCode, isActive } = await req.json()

        if (!pixelId) {
            return NextResponse.json({ error: 'Pixel ID é obrigatório' }, { status: 400 })
        }

        if (!capiToken) {
            return NextResponse.json({ error: 'Access Token CAPI é obrigatório' }, { status: 400 })
        }

        // Check if there is an existing record
        const { data: existing, error: fetchError } = await supabase
            .from('facebook_tracking_settings')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle()

        if (fetchError) throw fetchError

        let finalEncryptedToken = ''

        // If CAPI token contains mask character, use existing encrypted token
        if (capiToken.includes('••••') || capiToken.includes('****')) {
            if (!existing) {
                return NextResponse.json({ error: 'Token inválido' }, { status: 400 })
            }
            finalEncryptedToken = existing.capi_token_encrypted
        } else {
            // Otherwise, encrypt the new token
            finalEncryptedToken = encrypt(capiToken)
        }

        const upsertData = {
            user_id: user.id,
            pixel_id: pixelId,
            capi_token_encrypted: finalEncryptedToken,
            test_event_code: testEventCode || null,
            is_active: isActive !== false,
            updated_at: new Date().toISOString()
        }

        let dbError
        if (existing) {
            const { error } = await supabase
                .from('facebook_tracking_settings')
                .update(upsertData)
                .eq('id', existing.id)
            dbError = error
        } else {
            const { error } = await supabase
                .from('facebook_tracking_settings')
                .insert({
                    ...upsertData,
                    created_at: new Date().toISOString()
                })
            dbError = error
        }

        if (dbError) throw dbError

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('[pixel-settings-post] Error:', error)
        return NextResponse.json({ error: error.message || 'Erro ao salvar configurações' }, { status: 500 })
    }
}

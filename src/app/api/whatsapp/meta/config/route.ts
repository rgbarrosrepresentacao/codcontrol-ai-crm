/**
 * API: Salvar configurações da Meta API Oficial (Admin Only)
 * POST /api/whatsapp/meta/config
 */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { encrypt, decrypt } from '@/lib/crypto'
import { MetaProvider } from '@/services/whatsapp/MetaProvider'

export async function POST(request: NextRequest) {
    const supabase = await createSupabaseServerClient()

    // 1. Verificação de Admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single()

    if (!profile?.is_admin) {
        return NextResponse.json({ error: 'Acesso negado. Apenas administradores.' }, { status: 403 })
    }

    // 2. Leitura do corpo
    const body = await request.json()
    const { waba_id, phone_number_id, business_id, verify_token, access_token } = body

    if (!waba_id || !phone_number_id || !verify_token || !access_token) {
        return NextResponse.json({ error: 'Campos obrigatórios: waba_id, phone_number_id, verify_token, access_token' }, { status: 400 })
    }

    // 3. Criptografa o token antes de salvar
    let encryptedToken: string
    try {
        encryptedToken = encrypt(access_token)
    } catch (err) {
        return NextResponse.json({ error: 'Erro ao criptografar token. Verifique ENCRYPTION_KEY no .env' }, { status: 500 })
    }

    // 4. Salva ou atualiza a instância Meta do admin
    const metaConfig = { waba_id, phone_number_id, business_id: business_id || null, verify_token }

    const { data: existing } = await supabase
        .from('whatsapp_instances')
        .select('id')
        .eq('provider_type', 'META')
        .eq('user_id', user.id)
        .single()

    if (existing) {
        await supabase
            .from('whatsapp_instances')
            .update({
                meta_config: metaConfig,
                meta_access_token_encrypted: encryptedToken,
                meta_status: 'disconnected',
                meta_last_error: null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id)
    } else {
        await supabase
            .from('whatsapp_instances')
            .insert({
                user_id: user.id,
                provider_type: 'META',
                meta_config: metaConfig,
                meta_access_token_encrypted: encryptedToken,
                meta_status: 'disconnected',
                name: 'WhatsApp API Oficial',
            })
    }

    return NextResponse.json({ success: true, message: 'Configuração salva com sucesso!' })
}

// GET: Retorna config atual (descriptografando o token para conferência do admin)
export async function GET() {
    const supabase = await createSupabaseServerClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single()

    if (!profile?.is_admin) {
        return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const { data: instance } = await supabase
        .from('whatsapp_instances')
        .select('id, meta_config, meta_status, meta_last_error, meta_last_webhook_at, updated_at, meta_access_token_encrypted')
        .eq('provider_type', 'META')
        .eq('user_id', user.id)
        .single()

    if (!instance) {
        return NextResponse.json({ configured: false })
    }

    // Tenta descriptografar o token para exibir na UI
    let accessToken = null
    if (instance.meta_access_token_encrypted) {
        try {
            accessToken = decrypt(instance.meta_access_token_encrypted)
        } catch (err) {
            console.error('[CONFIG_GET] Erro ao descriptografar token:', err)
        }
    }

    return NextResponse.json({
        configured: true,
        meta_config:          instance.meta_config,
        meta_status:          instance.meta_status,
        meta_last_error:      instance.meta_last_error,
        meta_last_webhook_at: instance.meta_last_webhook_at,
        updated_at:           instance.updated_at,
        access_token:         accessToken,
        has_token:            !!accessToken,
    })
}

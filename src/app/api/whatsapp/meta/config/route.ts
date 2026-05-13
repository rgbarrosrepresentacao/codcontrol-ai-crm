/**
 * API: Salvar configurações da Meta API Oficial (Plano Pro, Agência e Admin)
 * POST /api/whatsapp/meta/config
 */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { encrypt, decrypt } from '@/lib/crypto'
import { MetaProvider } from '@/services/whatsapp/MetaProvider'
import { canUseMetaAPI } from '@/lib/plan-features'

export async function POST(request: NextRequest) {
    const supabase = await createSupabaseServerClient()

    // 1. Verificação de Plano (Pro, Agência ou Admin)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin, plans(slug)')
        .eq('id', user.id)
        .single()

    const planSlug = (profile as any)?.plans?.slug || 'basico'
    if (!canUseMetaAPI({ is_admin: profile?.is_admin ?? false, plan_slug: planSlug })) {
        return NextResponse.json({ error: 'Recurso disponível apenas nos planos Pro e Agência.' }, { status: 403 })
    }

    // 2. Leitura do corpo
    const body = await request.json()
    const { waba_id, phone_number_id, business_id, verify_token, access_token, app_secret } = body

    if (!waba_id || !phone_number_id || !verify_token || !access_token || !app_secret) {
        return NextResponse.json({ error: 'Campos obrigatórios: waba_id, phone_number_id, verify_token, access_token, app_secret' }, { status: 400 })
    }

    // 3. Criptografa dados sensíveis antes de salvar
    let encryptedToken: string
    let encryptedSecret: string
    try {
        encryptedToken = encrypt(access_token)
        encryptedSecret = encrypt(app_secret)
    } catch (err) {
        return NextResponse.json({ error: 'Erro ao criptografar dados. Verifique ENCRYPTION_KEY no .env' }, { status: 500 })
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
        const { error: updateError } = await supabase
            .from('whatsapp_instances')
            .update({
                meta_config: metaConfig,
                meta_access_token_encrypted: encryptedToken,
                meta_app_secret_encrypted: encryptedSecret,
                meta_status: 'disconnected',
                meta_last_error: null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id)
        
        if (updateError) {
            console.error('[CONFIG_POST] Erro ao atualizar:', updateError)
            return NextResponse.json({ error: `Erro ao atualizar banco: ${updateError.message}` }, { status: 500 })
        }
    } else {
        const { error: insertError } = await supabase
            .from('whatsapp_instances')
            .insert({
                user_id: user.id,
                provider_type: 'META',
                instance_name: `meta_${user.id.substring(0, 8)}`,
                display_name: 'WhatsApp API Oficial',
                meta_config: metaConfig,
                meta_access_token_encrypted: encryptedToken,
                meta_app_secret_encrypted: encryptedSecret,
                meta_status: 'disconnected',
            })
        
        if (insertError) {
            console.error('[CONFIG_POST] Erro ao inserir:', insertError)
            return NextResponse.json({ error: `Erro ao inserir no banco: ${insertError.message}` }, { status: 500 })
        }
    }

    return NextResponse.json({ success: true, message: 'Configuração salva com sucesso!' })
}

// GET: Retorna config atual (descriptografando o token para conferência)
export async function GET() {
    const supabase = await createSupabaseServerClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin, plans(slug)')
        .eq('id', user.id)
        .single()

    const planSlug = (profile as any)?.plans?.slug || 'basico'
    if (!canUseMetaAPI({ is_admin: profile?.is_admin ?? false, plan_slug: planSlug })) {
        return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const { data: instance } = await supabase
        .from('whatsapp_instances')
        .select('id, meta_config, meta_status, meta_last_error, meta_last_webhook_at, updated_at, meta_access_token_encrypted, meta_app_secret_encrypted')
        .eq('provider_type', 'META')
        .eq('user_id', user.id)
        .single()

    if (!instance) {
        return NextResponse.json({ configured: false })
    }

    // Tenta descriptografar dados sensíveis para exibir na UI
    let accessToken = null
    let appSecret = null
    try {
        if (instance.meta_access_token_encrypted) {
            accessToken = decrypt(instance.meta_access_token_encrypted)
        }
        if (instance.meta_app_secret_encrypted) {
            appSecret = decrypt(instance.meta_app_secret_encrypted)
        }
    } catch (err) {
        console.error('[CONFIG_GET] Erro ao descriptografar dados:', err)
    }

    return NextResponse.json({
        configured: true,
        meta_config:          instance.meta_config,
        meta_status:          instance.meta_status,
        meta_last_error:      instance.meta_last_error,
        meta_last_webhook_at: instance.meta_last_webhook_at,
        updated_at:           instance.updated_at,
        access_token:         accessToken,
        app_secret:           appSecret,
        has_token:            !!accessToken,
    })
}

export const dynamic = 'force-dynamic'
/**
 * API: Testar credenciais da Meta API (Plano Pro, Agência e Admin)
 * POST /api/whatsapp/meta/test
 */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
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

    // 2. Busca instância Meta do admin
    const { data: instance } = await supabase
        .from('whatsapp_instances')
        .select('id, meta_config, meta_access_token_encrypted')
        .eq('provider_type', 'META')
        .eq('user_id', user.id)
        .single()

    if (!instance || !instance.meta_access_token_encrypted) {
        return NextResponse.json({ error: 'Nenhuma configuração Meta encontrada. Salve primeiro.' }, { status: 404 })
    }

    // 3. Testa credenciais via MetaProvider
    try {
        const provider = new MetaProvider(
            instance.meta_config as any,
            instance.meta_access_token_encrypted
        )

        const result = await provider.validateCredentials()

        // 4. Atualiza status no banco
        await supabase
            .from('whatsapp_instances')
            .update({
                meta_status:    result.valid ? 'verified' : 'error',
                meta_last_error: result.error || null,
                updated_at:     new Date().toISOString(),
            })
            .eq('id', instance.id)

        if (result.valid) {
            return NextResponse.json({
                success: true,
                message: `✅ Conexão validada! Número: ${result.phone}`,
                phone:   result.phone,
            })
        } else {
            return NextResponse.json({
                success: false,
                error:   result.error || 'Credenciais inválidas',
            }, { status: 400 })
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro interno'
        return NextResponse.json({ success: false, error: msg }, { status: 500 })
    }
}

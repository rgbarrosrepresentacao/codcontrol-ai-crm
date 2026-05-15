import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/crypto'

export const dynamic = 'force-dynamic'

async function getAuthUser(req: NextRequest) {
    const cookieStore = await cookies()
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Cookie: cookieStore.toString() } } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

/** GET /api/meta/templates — Lista templates do banco local */
export async function GET(req: NextRequest) {
    const supabase = getSupabaseAdmin()
    try {
        const user = await getAuthUser(req)
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: profile } = await supabase
            .from('profiles')
            .select('is_admin, plans(slug)')
            .eq('id', user.id)
            .single()

        const profileData = profile as any
        const isAllowed = profileData?.is_admin || ['pro', 'agencia'].includes(profileData?.plans?.slug || '')
        if (!isAllowed) return NextResponse.json({ error: 'Plan upgrade required' }, { status: 403 })

        const { data: templates, error } = await supabase
            .from('whatsapp_templates')
            .select('*')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false })

        if (error) throw error
        return NextResponse.json({ templates: templates || [] })

    } catch (err: any) {
        console.error('[META_TEMPLATES] GET Error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

/** POST /api/meta/templates — Sincroniza templates da API da Meta */
export async function POST(req: NextRequest) {
    const supabase = getSupabaseAdmin()
    try {
        const user = await getAuthUser(req)
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: profile } = await supabase
            .from('profiles')
            .select('is_admin, plans(slug)')
            .eq('id', user.id)
            .single()

        const profileData = profile as any
        const isAllowed = profileData?.is_admin || ['pro', 'agencia'].includes(profileData?.plans?.slug || '')
        if (!isAllowed) return NextResponse.json({ error: 'Plan upgrade required' }, { status: 403 })

        // 1. Buscar a instância Meta configurada
        const { data: instance } = await supabase
            .from('whatsapp_instances')
            .select('meta_config, meta_access_token_encrypted')
            .eq('provider_type', 'META')
            .eq('user_id', user.id)
            .single()

        if (!instance) {
            return NextResponse.json({
                error: 'Meta API não configurada. Acesse WhatsApp API Oficial para configurar.'
            }, { status: 400 })
        }

        const metaConfig = instance.meta_config as any
        const wabaId = metaConfig?.waba_id
        let accessToken = null

        try {
            if (instance.meta_access_token_encrypted) {
                accessToken = decrypt(instance.meta_access_token_encrypted)
            }
        } catch (decryptErr) {
            console.error('[META_TEMPLATES] Decrypt error:', decryptErr)
        }

        if (!accessToken || !wabaId) {
            return NextResponse.json({
                error: 'Configuração da Meta incompleta ou token inválido.'
            }, { status: 400 })
        }

        // 2. Buscar templates da API oficial da Meta
        const metaRes = await fetch(
            `https://graph.facebook.com/v19.0/${wabaId}/message_templates?limit=100&access_token=${accessToken}`,
            { next: { revalidate: 0 } }
        )

        if (!metaRes.ok) {
            const errBody = await metaRes.text()
            console.error('[META_TEMPLATES] Meta API error:', errBody)
            return NextResponse.json({
                error: 'Erro ao buscar templates da Meta. Verifique se o WABA ID e o Token estão corretos.'
            }, { status: 502 })
        }

        const metaData = await metaRes.json()
        const metaTemplates = metaData.data || []

        // 3. Upsert templates no banco local
        const upsertPayload = metaTemplates.map((t: any) => ({
            user_id: user.id,
            meta_template_id: t.id,
            name: t.name,
            category: t.category?.toLowerCase() || 'utility',
            status: t.status || 'PENDING',
            language: t.language || 'pt_BR',
            components: t.components || [],
            rejection_reason: t.quality_score?.reasons?.[0] || null,
            updated_at: new Date().toISOString()
        }))

        if (upsertPayload.length > 0) {
            const { error: upsertError } = await supabase
                .from('whatsapp_templates')
                .upsert(upsertPayload, {
                    onConflict: 'user_id,name,language'
                })

            if (upsertError) {
                console.error('[META_TEMPLATES] Upsert error:', upsertError)
            }
        }

        // 4. Buscar templates atualizados do banco para retornar
        const { data: saved } = await supabase
            .from('whatsapp_templates')
            .select('*')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false })

        return NextResponse.json({
            synced: metaTemplates.length,
            templates: saved || metaTemplates
        })

    } catch (err: any) {
        console.error('[META_TEMPLATES] POST Error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

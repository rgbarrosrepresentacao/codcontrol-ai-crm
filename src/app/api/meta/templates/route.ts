import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

async function getAuthUser(req: NextRequest) {
    const cookieStore = cookies()
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
            .select('is_admin, plan_slug')
            .eq('id', user.id)
            .single()

        const isAllowed = profile?.is_admin || ['pro', 'agencia'].includes(profile?.plan_slug || '')
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
            .select('is_admin, plan_slug, meta_access_token, meta_waba_id')
            .eq('id', user.id)
            .single()

        const isAllowed = profile?.is_admin || ['pro', 'agencia'].includes(profile?.plan_slug || '')
        if (!isAllowed) return NextResponse.json({ error: 'Plan upgrade required' }, { status: 403 })

        const accessToken = profile?.meta_access_token
        const wabaId = profile?.meta_waba_id

        if (!accessToken || !wabaId) {
            return NextResponse.json({
                error: 'Meta API não configurada. Acesse WhatsApp API Oficial para configurar.'
            }, { status: 400 })
        }

        // Buscar templates da API oficial da Meta
        const metaRes = await fetch(
            `https://graph.facebook.com/v19.0/${wabaId}/message_templates?limit=100&access_token=${accessToken}`,
            { next: { revalidate: 0 } }
        )

        if (!metaRes.ok) {
            const errBody = await metaRes.text()
            console.error('[META_TEMPLATES] Meta API error:', errBody)
            return NextResponse.json({
                error: 'Erro ao buscar templates da Meta. Verifique o token de acesso.'
            }, { status: 502 })
        }

        const metaData = await metaRes.json()
        const metaTemplates = metaData.data || []

        // Upsert templates no banco local
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
                // Não falha, retorna o que veio da Meta mesmo sem salvar
            }
        }

        // Buscar templates atualizados do banco
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

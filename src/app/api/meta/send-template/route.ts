import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { MetaProvider } from '@/services/whatsapp/MetaProvider'

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

const CATEGORY_COSTS: Record<string, number> = {
    'marketing': 0.27,
    'utility': 0.09,
    'authentication': 0.09
}

export async function POST(req: NextRequest) {
    const supabase = getSupabaseAdmin()
    try {
        const user = await getAuthUser(req)
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        // 1. Verificação de Plano
        const { data: profile } = await supabase
            .from('profiles')
            .select('id, is_admin, plans(slug)')
            .eq('id', user.id)
            .single()

        const profileData = profile as any
        const isAllowed = profileData?.is_admin || ['pro', 'agencia'].includes(profileData?.plans?.slug || '')
        if (!isAllowed) return NextResponse.json({ error: 'Plan upgrade required' }, { status: 403 })

        // 2. Dados do Body
        const { conversationId, phone, templateName, variables } = await req.json()
        if (!phone || !templateName) {
            return NextResponse.json({ error: 'Telefone e nome do template são obrigatórios' }, { status: 400 })
        }

        // 3. Buscar o template no banco para validar variáveis
        const { data: template } = await supabase
            .from('whatsapp_templates')
            .select('*')
            .eq('user_id', user.id)
            .eq('name', templateName)
            .single()

        if (!template) {
            return NextResponse.json({ error: 'Template não encontrado no banco local' }, { status: 404 })
        }

        // ── VALIDAÇÃO RÍGIDA DE VARIÁVEIS (Fase 3) ──
        const bodyComponent = template.components?.find((c: any) => c.type === 'BODY')
        const bodyText = bodyComponent?.text || ''
        const matches = bodyText.match(/\{\{(\d+)\}\}/g) || []
        const requiredCount = matches.length

        // Sanitização e validação dos valores recebidos
        const sanitizedVariables = (variables || []).map((v: string) => {
            const val = String(v || '').trim()
            return val.slice(0, 1024) // Limite de segurança da Meta para parâmetros de texto
        })

        if (sanitizedVariables.length < requiredCount) {
            return NextResponse.json({ 
                error: `Preencha todas as variáveis obrigatórias antes de enviar o template. (Esperado: ${requiredCount}, Recebido: ${sanitizedVariables.length})` 
            }, { status: 400 })
        }

        // Bloquear campos vazios se houver variáveis exigidas
        if (requiredCount > 0 && sanitizedVariables.some((v: string) => !v)) {
            return NextResponse.json({ 
                error: 'Não é permitido enviar variáveis com valores vazios.' 
            }, { status: 400 })
        }

        // 4. Montar Componentes para a Meta
        const components: any[] = []
        if (requiredCount > 0) {
            components.push({
                type: 'body',
                parameters: sanitizedVariables.map((v: string) => ({
                    type: 'text',
                    text: v
                }))
            })
        }

        // 5. Buscar a instância Meta configurada
        const { data: instance } = await supabase
            .from('whatsapp_instances')
            .select('*')
            .eq('provider_type', 'META')
            .eq('user_id', user.id)
            .single()

        if (!instance || !instance.meta_access_token_encrypted) {
            return NextResponse.json({ error: 'Meta API não configurada corretamente' }, { status: 400 })
        }

        // 6. Disparar via MetaProvider
        const provider = new MetaProvider(instance.meta_config as any, instance.meta_access_token_encrypted)
        const result = await provider.sendTemplate(
            phone, 
            templateName, 
            template.language || 'pt_BR',
            components
        )

        // 7. Salvar Log
        const cost = CATEGORY_COSTS[template.category?.toLowerCase()] || 0.09
        
        await supabase.from('meta_message_logs').insert({
            user_id: user.id,
            conversation_id: conversationId || null,
            template_name: templateName,
            category: template.category || 'utility',
            recipient_phone: phone,
            message_id: result.message_id || null,
            status: result.success ? 'sent' : 'failed',
            error_code: result.error ? 'META_ERROR' : null,
            error_message: result.error || null,
            cost_estimated: result.success ? cost : 0
        })

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 502 })
        }

        return NextResponse.json({ success: true, messageId: result.message_id })

    } catch (err: any) {
        console.error('[SEND_TEMPLATE] Error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { MetaProvider } from '@/services/whatsapp/MetaProvider'

export const dynamic = 'force-dynamic'

async function getAuthUser() {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

export async function POST(req: NextRequest) {
    const supabase = getSupabaseAdmin()
    try {
        const user = await getAuthUser()
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

        const body = await req.json()
        const { name, category, header, bodyText, footer, buttons, samples } = body
        
        // 2. Validação Rígida de Nome
        const nameRegex = /^[a-z0-9_]+$/
        if (!name || !nameRegex.test(name)) {
            return NextResponse.json({ 
                error: 'Nome inválido. Use apenas letras minúsculas, números e underscores (ex: recuperacao_pedido).' 
            }, { status: 400 })
        }

        // 3. Validação de Body
        if (!bodyText || bodyText.trim().length === 0) {
            return NextResponse.json({ error: 'O texto do corpo (BODY) é obrigatório.' }, { status: 400 })
        }

        // 4. Validação de Variáveis e Amostras (SAMPLES)
        const variableMatches = bodyText.match(/\{\{(\d+)\}\}/g) || []
        const uniqueVars = Array.from(new Set(variableMatches)).length
        
        if (uniqueVars > 0) {
            if (!samples || !Array.isArray(samples) || samples.length !== uniqueVars) {
                return NextResponse.json({ 
                    error: `Este template possui ${uniqueVars} variáveis, mas apenas ${samples?.length || 0} amostras foram enviadas.` 
                }, { status: 400 })
            }

            // Validar se todas as amostras estão preenchidas
            if (samples.some(s => !s || s.trim().length === 0)) {
                return NextResponse.json({ error: 'Todas as amostras das variáveis devem ser preenchidas.' }, { status: 400 })
            }
        }

        // 5. Montar Componentes para a Meta
        const components: any[] = []
        
        if (header && header.trim()) {
            components.push({ type: 'HEADER', format: 'TEXT', text: header.trim() })
        }

        // BODY
        const bodyComponent: any = {
            type: 'BODY',
            text: bodyText.trim()
        }

        // Injetar Samples se houver variáveis
        if (uniqueVars > 0 && samples) {
            bodyComponent.example = {
                body_text: [samples] // Meta exige Array de Arrays
            }
        }
        
        components.push(bodyComponent)

        if (footer && footer.trim()) {
            components.push({ type: 'FOOTER', text: footer.trim() })
        }

        if (buttons && buttons.length > 0) {
            const filteredButtons = buttons.filter((b: string) => b && b.trim())
            if (filteredButtons.length > 0) {
                // Validar comprimento dos botões (máx 25 chars)
                if (filteredButtons.some((b: string) => b.length > 25)) {
                    return NextResponse.json({ error: 'O texto de cada botão deve ter no máximo 25 caracteres.' }, { status: 400 })
                }

                components.push({
                    type: 'BUTTONS',
                    buttons: filteredButtons.slice(0, 3).map((b: string) => ({
                        type: 'QUICK_REPLY',
                        text: b.trim()
                    }))
                })
            }
        }

        // 6. Buscar Instância
        const { data: instance } = await supabase
            .from('whatsapp_instances')
            .select('*')
            .eq('provider_type', 'META')
            .eq('user_id', user.id)
            .single()

        if (!instance || !instance.meta_access_token_encrypted) {
            return NextResponse.json({ error: 'Meta API não configurada corretamente' }, { status: 400 })
        }

        // 7. Criar na Meta
        const provider = new MetaProvider(instance.meta_config as any, instance.meta_access_token_encrypted)
        const result = await provider.createTemplate(name, category, 'pt_BR', components)

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 502 })
        }

        // 8. Salvar Localmente como PENDING
        // Formato para salvar localmente (compatível com a listagem atual)
        const localComponents = components.map(c => {
            if (c.type === 'BUTTONS') {
                return {
                    type: 'BUTTONS',
                    buttons: c.buttons
                }
            }
            return c
        })

        await supabase.from('whatsapp_templates').insert({
            user_id: user.id,
            name,
            category: category.toLowerCase(),
            language: 'pt_BR',
            status: 'PENDING',
            components: localComponents,
            reason: null
        })

        return NextResponse.json({ success: true })

    } catch (err: any) {
        console.error('[CREATE_TEMPLATE] Error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

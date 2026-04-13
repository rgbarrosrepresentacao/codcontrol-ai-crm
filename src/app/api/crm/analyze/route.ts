import { createSupabaseServerClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { OpenAI } from 'openai'

export async function POST(req: Request) {
    try {
        const supabase = await createSupabaseServerClient()
        const body = await req.json().catch(() => ({}))
        const { contactId } = body

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return new NextResponse('Unauthorized', { status: 401 })

        const { data: profile } = await supabase.from('profiles').select('openai_api_key').eq('id', user.id).single()
        if (!profile?.openai_api_key) return new NextResponse('Missing OpenAI Key', { status: 400 })

        const openai = new OpenAI({ apiKey: profile.openai_api_key })

        // FLUXO 1: Análise de um contato específico
        if (contactId) {
            const { data: messages } = await supabase
                .from('messages')
                .select('from_me, content, created_at')
                .eq('contact_id', contactId)
                .order('created_at', { ascending: false })
                .limit(20)

            if (!messages || messages.length === 0) {
                return NextResponse.json({ success: false, message: 'Nenhuma mensagem encontrada.' })
            }

            const chatMessages = messages.reverse().map(m => ({
                role: (m.from_me ? 'assistant' : 'user') as 'assistant' | 'user',
                content: m.content || ''
            }))

            const conversationText = chatMessages.map(m => `${m.role === 'user' ? 'Cliente' : 'IA'}: ${m.content}`).join('\n')
            
            const completion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: `Você é um analista de CRM especialista em vendas. Com base nas mensagens, classifique o lead em uma destas tags:
                        - NOVO_LEAD: Primeiro contato.
                        - EM_ATENDIMENTO: Conversa em andamento.
                        - QUALIFICADO: O lead tem perfil ideal.
                        - INTERESSADO: Demonstrou forte desejo de compra.
                        - PROPOSTA_ENVIADA: Link ou preço enviado.
                        - AGUARDANDO_RESPOSTA: IA/Vendedor perguntou e cliente sumiu.
                        - FECHADO: Compra confirmada.
                        - PERDIDO: Recusou ou sumiu há muito tempo.
    
                        Retorne um JSON:
                        {
                            "tag": "TAG_AQUI",
                            "temperature": 1 a 100,
                            "last_action": "Resumo da última interação"
                        }`
                    },
                    { role: 'user', content: `Conversa:\n${conversationText}` }
                ],
                response_format: { type: 'json_object' },
                temperature: 0.1
            })

            const result = JSON.parse(completion.choices[0].message.content || '{}')
            await supabase.from('contacts').update({
                ai_tag: result.tag,
                lead_temperature: result.temperature || 0,
                ai_last_action: result.last_action,
                last_stage_change_at: new Date().toISOString()
            }).eq('id', contactId)

            return NextResponse.json({ success: true, data: result })
        } 
        
        // FLUXO 2: Análise em lote (Batch)
        const { data: contacts } = await supabase
            .from('contacts')
            .select('id')
            .eq('user_id', user.id)
            .order('last_message_at', { ascending: false })
            .limit(10)

        if (!contacts || contacts.length === 0) {
            return NextResponse.json({ success: true, processed: 0 })
        }

        let processed = 0
        for (const c of contacts) {
            const { data: msgs } = await supabase
                .from('messages')
                .select('from_me, content')
                .eq('contact_id', c.id)
                .order('created_at', { ascending: false })
                .limit(10)

            if (!msgs || msgs.length === 0) continue

            const conversationText = msgs.reverse().map(m => `${m.from_me ? 'IA' : 'Cliente'}: ${m.content}`).join('\n')
            
            try {
                const completion = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: `Analise a conversa e retorne JSON: {"tag": "TAG", "temperature": 1-100, "last_action": "resumo"}`
                        },
                        { role: 'user', content: conversationText }
                    ],
                    response_format: { type: 'json_object' }
                })

                const result = JSON.parse(completion.choices[0].message.content || '{}')
                await supabase.from('contacts').update({
                    ai_tag: result.tag,
                    lead_temperature: result.temperature || 0,
                    ai_last_action: result.last_action,
                    last_stage_change_at: new Date().toISOString()
                }).eq('id', c.id)
                processed++
            } catch (err) {
                console.error(`Erro ao analisar contato ${c.id}:`, err)
            }
        }

        return NextResponse.json({ success: true, processed })
    } catch (error: any) {
        return new NextResponse(error.message, { status: 500 })
    }
}

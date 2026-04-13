import { createSupabaseServerClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { OpenAI } from 'openai'

export async function POST(req: Request) {
    try {
        const supabase = await createSupabaseServerClient()
        const { contactId } = await req.json()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return new NextResponse('Unauthorized', { status: 401 })

        const { data: profile } = await supabase.from('profiles').select('openai_api_key').eq('id', user.id).single()
        if (!profile?.openai_api_key) return new NextResponse('Missing OpenAI Key', { status: 400 })

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
        const openai = new OpenAI({ apiKey: profile.openai_api_key })
        
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    content: `Você é um analista de CRM especialista em vendas. Com base nas mensagens, classifique o lead em uma destas tags:
                    - NOVO_LEAD: Primeiro contato, ainda não houve interação real.
                    - EM_ATENDIMENTO: Conversa em andamento, IA ou Humano respondendo dúvidas.
                    - QUALIFICADO: O lead demonstrou ter o perfil ideal ou respondeu perguntas de filtro.
                    - INTERESSADO: Demonstrou forte desejo de compra ou pediu detalhes de preço.
                    - PROPOSTA_ENVIADA: Um link de checkout, preço final ou proposta foi enviado.
                    - AGUARDANDO_RESPOSTA: O vendedor/IA fez uma pergunta e o cliente sumiu.
                    - FECHADO: Compra confirmada ou link de pagamento acessado com sucesso.
                    - PERDIDO: Cliente disse que não quer, xingou ou não responde há muito tempo.

                    Retorne um JSON:
                    {
                        "tag": "UMA_DAS_TAGS_ACIMA",
                        "temperature": 1 a 100 (probabilidade de fechar),
                        "last_action": "Resumo curtíssimo da última interação (ex: 'Pediu preço', 'Sumiu após link')"
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
    } catch (error: any) {
        return new NextResponse(error.message, { status: 500 })
    }
}

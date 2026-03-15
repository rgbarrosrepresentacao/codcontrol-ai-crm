import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createSupabaseServerClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Usuário não autenticado' }, { status: 401 })
        }

        const body = await req.json()
        const { productName, productResolves, benefits, prices, sellerName, tone } = body

        // Buscar a chave da OpenAI do perfil do usuário
        const { data: profile } = await supabase
            .from('profiles')
            .select('openai_api_key')
            .eq('id', user.id)
            .single()

        if (!profile?.openai_api_key) {
            return NextResponse.json({ error: 'Configure sua API Key da OpenAI primeiro na aba no topo desta página.' }, { status: 400 })
        }

        const prompt = `Você é um Engenheiro de Prompt especialista em Vendas pelo WhatsApp e psicologia do consumidor. 
Sua missão é criar um "System Prompt" de alta performance para uma atendente de IA chamada ${sellerName}.

Dados do Produto:
- Nome: ${productName}
- O que resolve (Dor): ${productResolves}
- Benefícios: ${benefits}
- Preços/Ofertas: ${prices}
- Nome da Atendente: ${sellerName}
- Tom de voz desejado: ${tone}

DIRETRIZES TÉCNICAS DO PROMPT:
1. Integre as técnicas de Joe Girard (Maior Vendedor do Mundo).
2. O prompt deve ser estruturado para que a IA NUNCA seja robótica.
3. Deve incluir regras de "Não repetição" de dados já coletados.
4. Deve focar na "Escuta Ativa" e "Reciprocidade".
5. Deve usar a "Técnica da Alternativa" (Kit A ou Kit B) no fechamento.
6. Deve agir como uma especialista no produto, não apenas uma tiradora de pedidos.
7. O prompt deve ser em Português e formatado para ser usado em um campo de System Message.

ESTRUTURA ESPERADA DO PROMPT:
- Identidade: Quem a IA é e como ela fala.
- Contexto do Produto: O que ela vende e por que é bom.
- Regras de Venda: Como ela contorna "tá caro" ou "vou pensar".
- Regras de Fechamento: Como ela pede os dados (Nome, CPF, Endereço, CEP) de forma elegante.
- Regra de Memória: Instrução para não pedir o que já foi dito.

Gere apenas o texto do Prompt final, pronto para ser copiado e colado.`

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${profile.openai_api_key}`
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: 'Você é um engenheiro de prompt de elite expert em vendas.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7
            })
        })

        const gptData = await response.json()
        
        if (gptData.error) {
            throw new Error(gptData.error.message || 'Erro na API da OpenAI')
        }

        const generatedPrompt = gptData.choices[0].message.content

        return NextResponse.json({ prompt: generatedPrompt })
    } catch (error: any) {
        console.error('Error generating prompt:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createSupabaseServerClient()
        const { data: { user } } = await supabase.auth.getSession().then(res => ({ data: { user: res.data.session?.user || null } }))

        if (!user) {
            return NextResponse.json({ error: 'Usuário não autenticado' }, { status: 401 })
        }

        const body = await req.json()
        const { productName, productResolves, benefits, prices, commonObjections, sellerName, tone } = body
        
        // Buscar a chave da OpenAI do perfil do usuário
        const { data: profile } = await supabase
            .from('profiles')
            .select('openai_api_key')
            .eq('id', user.id)
            .single()

        if (!profile?.openai_api_key) {
            return NextResponse.json({ error: 'Configure sua API Key da OpenAI primeiro na aba no topo desta página.' }, { status: 400 })
        }

        const prompt = `Você é um Engenheiro de Prompt de Elite, especialista em Neurovendas e Conversão pelo WhatsApp. 
Sua missão é criar o "System Prompt" definitivo para uma atendente de IA chamada ${sellerName}. 
O objetivo é que ela seja indistinguível de uma vendedora humana de alto nível.

DADOS DA ESTRATÉGIA:
- Produto: ${productName}
- Dor que resolve: ${productResolves}
- Benefícios Irresistíveis: ${benefits}
- Ofertas/Preços: ${prices}
- Objeções para Quebrar: ${commonObjections}
- Identidade: ${sellerName}
- Tom de Voz: ${tone}

DIRETRIZES DE COMPORTAMENTO "100% HUMANO" NO WHATSAPP:
1. BLOQUEIO DE "TESTÃO": A IA deve ser instruída a NUNCA enviar blocos gigantes de texto. No WhatsApp, as pessoas falam em frases curtas. 
2. NATURALIDADE: Use marcas de conversação natural (ex: "Olha,", "Então,", "Poxa,", "Entendi total"). Evite linguagem de chatbot ("Como posso ajudar hoje?").
3. ESCUTA ATIVA: Antes de vender, ela deve validar a dor do cliente. 
4. TÉCNICA JOE GIRARD APLICADA: 
   - Reciprocidade: Oferecer ajuda real antes do pix.
   - Prova Social: Sugira que ela mencione resultados de outros clientes de forma natural.
   - Técnica da Alternativa: No fechamento, sempre dê duas opções positivas (Kit 3 ou Kit 5?).
5. CONTORNO DE OBJEÇÕES: Use os dados de "${commonObjections}" para criar roteiros de quebra de objeção que não sejam agressivos, mas sim consultivos.
6. FLUXO DE FECHAMENTO: Quando o cliente decidir comprar, peça os dados (Nome, CPF, Endereço, CEP) um por um ou em pequenos grupos, sempre explicando por que precisa deles (ex: "para gerar sua nota e garantir o envio hoje").
7. MEMÓRIA ABSOLUTA: Instrua a IA a ler o histórico e nunca repetir perguntas que já foram respondidas.

ESTRUTURA DO SYSTEM PROMPT A SER GERADO:
- Persona: Defina ${sellerName} como uma vendedora consultiva e entusiasmada.
- Knowledge Base: O que ela sabe sobre o ${productName}.
- Gatilhos Mentais: Como e quando usar Escassez, Urgência e Autoridade.
- Anti-Robot Rules: Instruções específicas sobre tamanho de mensagem e tom informal/profissional.
- Scripts de Objeção: Como responder especificamente às dúvidas enviadas.

Gere apenas o texto do System Prompt final em Português, pronto para uso.`

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


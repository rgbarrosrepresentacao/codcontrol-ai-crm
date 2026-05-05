export type AiTag = 'NOVO_LEAD' | 'EM_ATENDIMENTO' | 'QUALIFICADO' | 'INTERESSADO' | 'PROPOSTA_ENVIADA' | 'AGUARDANDO_RESPOSTA' | 'FECHADO' | 'PERDIDO';

export class AIService {
    /**
     * Extrai dados de pedido da conversa
     */
    static async extractOrderData(messages: any[], openaiKey: string): Promise<any> {
        try {
            const conversationText = messages.map(m => `${m.role === 'assistant' ? 'IA' : 'Cliente'}: ${m.content}`).join('\n');
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { 
                            role: 'system', 
                            content: `Você é um extrator de dados de pedidos. Sua tarefa é extrair os dados do cliente para preencher um formulário de entrega.
                            REGRAS:
                            - Extraia: Nome Completo, CPF, CEP, Rua, Número, Bairro, Cidade, Estado.
                            - Deduza o Estado (ex: SP) pela Cidade se necessário.
                            - Identifique qual Produto o cliente quer.
                            - Retorne APENAS um JSON puro.`
                        },
                        { role: 'user', content: `Extraia os dados desta conversa:\n\n${conversationText}` }
                    ],
                    temperature: 0,
                    response_format: { type: 'json_object' }
                })
            });
            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;
            if (!content) return null;
            const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(cleanContent);
        } catch (err) {
            console.error('[AIService] Extraction error:', err);
            return null;
        }
    }

    /**
     * Classifica o contato baseado nas últimas mensagens
     */
    static async classifyContact(messages: any[], openaiKey: string): Promise<AiTag | null> {
        try {
            const conversationText = messages.slice(-20).map(m => `${m.role === 'user' ? 'Cliente' : 'IA'}: ${m.content}`).join('\n');
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: `Você é um classificador de leads. Responda APENAS com uma dessas palavras: NOVO_LEAD, EM_ATENDIMENTO, QUALIFICADO, INTERESSADO, PROPOSTA_ENVIADA, AGUARDANDO_RESPOSTA, FECHADO, PERDIDO.`
                        },
                        { role: 'user', content: `Classifique esta conversa:\n\n${conversationText}` }
                    ],
                    temperature: 0.1,
                    max_tokens: 20
                })
            });
            if (!response.ok) return null;
            const data = await response.json();
            const tag = data.choices[0].message.content.trim().toUpperCase() as AiTag;
            return tag;
        } catch {
            return null;
        }
    }

    /**
     * Gera mensagem de encerramento ao fechar venda
     */
    static async generateClosingMessage(messages: any[], aiConfig: any, openaiKey: string): Promise<string> {
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: `Você é ${aiConfig.bot_name}. ${aiConfig.system_prompt}. TAREFA: O cliente fechou o pedido. Escreva uma mensagem FINAL calorosa (2-4 linhas).`
                        },
                        ...messages.slice(-10)
                    ],
                    temperature: 0.7,
                    max_tokens: 200
                })
            });
            if (!response.ok) throw new Error();
            const data = await response.json();
            return data.choices[0].message.content;
        } catch {
            return 'Obrigada pelo seu pedido! 🎉 Em breve nossa equipe entrará em contato.';
        }
    }

    /**
     * Gera a resposta principal da IA
     */
    static async generateResponse(
        messages: any[], 
        aiConfig: any, 
        openaiKey: string,
        knowledgeContext: string = '',
        leadContext: string = '',
        campaignPrompt: string = ''
    ): Promise<string | null> {
        try {
            // Se houver um prompt de campanha, ele substitui ou reforça o global
            const systemInstructions = campaignPrompt 
                ? `${campaignPrompt}\n\nREGRAS GERAIS: ${aiConfig.system_prompt}`
                : aiConfig.system_prompt;

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: `Você é ${aiConfig.bot_name}. ${systemInstructions}.
                            
                            CONHECIMENTO ADICIONAL:
                            ${knowledgeContext}
                            
                            CONTEXTO DO LEAD:
                            ${leadContext}
                            
                            REGRAS DE CONDUTA:
                            - Responda de forma natural e humana.
                            - Use emojis moderadamente.
                            - Se o cliente quiser comprar, direcione para o fechamento.`
                        },
                        ...messages
                    ],
                    temperature: 0.7,
                    max_tokens: 500
                })
            });

            if (!response.ok) return null;
            const data = await response.json();
            return data.choices?.[0]?.message?.content || null;
        } catch (err) {
            console.error('[AIService] Error generating response:', err);
            return null;
        }
    }
    /**
     * Avalia uma condição de funil baseado na resposta do cliente
     */
    static async evaluateCondition(
        messages: any[], 
        conditionLabel: string, 
        openaiKey: string
    ): Promise<{ decision: 'yes' | 'no' | 'unclear' | 'human'; confidence: number; reason: string }> {
        try {
            const conversationText = messages.slice(-10).map(m => `${m.role === 'user' ? 'Cliente' : 'IA'}: ${m.content}`).join('\n');
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: `Você é um avaliador de condições lógicas de vendas.
                            OBJETIVO: Avaliar se a última resposta do cliente atende à condição: "${conditionLabel}".
                            
                            REGRAS:
                            - "yes": Cliente confirmou, disse "sim", "quero", "tenho interesse", mandou emoji de joinha, ou demonstrou qualquer aceitação.
                            - "no": Cliente recusou explicitamente, disse que não quer agora ou demonstrou desinteresse total.
                            - "human": Cliente pediu para falar com um humano, suporte, atendente ou pessoa real.
                            - "unclear": A resposta foi apenas um "olá", uma dúvida técnica não relacionada à decisão, ou algo totalmente vago que exige resposta da IA antes de decidir.
                            
                            IMPORTANTE: Se o cliente disser apenas "Sim", "Quero" ou algo positivo curto, a decisão DEVE ser "yes".
                            {
                                "decision": "yes" | "no" | "unclear" | "human",
                                "confidence": 0-100,
                                "reason": "explicação curta"
                            }`
                        },
                        { role: 'user', content: `Avalie esta conversa:\n\n${conversationText}` }
                    ],
                    temperature: 0,
                    response_format: { type: 'json_object' }
                })
            });

            if (!response.ok) throw new Error();
            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;
            if (!content) throw new Error();
            
            return JSON.parse(content);
        } catch (err) {
            console.error('[AIService] Condition evaluation error:', err);
            return { decision: 'unclear', confidence: 0, reason: 'Erro na avaliação' };
        }
    }
}

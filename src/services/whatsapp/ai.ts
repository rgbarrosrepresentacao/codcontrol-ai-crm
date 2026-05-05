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
}

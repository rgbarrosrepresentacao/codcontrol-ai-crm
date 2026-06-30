import { LANGUAGE_GUARD } from '@/lib/constants';

export interface FollowUpAiResult {
    silence_reason: 'preco' | 'esquecimento' | 'ocupado' | 'perdeu_interesse' | 'pensando' | 'falta_confianca' | 'precisa_falar_com_alguem' | 'aguardando_pagamento' | 'duvida_nao_respondida' | 'outro';
    message: string;
}

export class FollowUpAIService {
    /**
     * Auxiliar para tratar erros específicos de status da OpenAI
     */
    private static async handleResponseStatus(response: any) {
        if (!response.ok) {
            const errText = await response.text();
            if (response.status === 429) {
                console.error(`[FollowUpAIService] OpenAI Quota Exceeded (429): ${errText}`);
                throw new Error('OPENAI_QUOTA_EXCEEDED');
            }
            if (response.status === 401) {
                console.error(`[FollowUpAIService] OpenAI Invalid Key (401): ${errText}`);
                throw new Error('OPENAI_INVALID_KEY');
            }
            console.error(`[FollowUpAIService] OpenAI API error (${response.status}): ${errText}`);
            throw new Error(`OpenAI API error: ${response.status} - ${errText}`);
        }
    }

    /**
     * Executa a chamada à OpenAI para detectar o motivo do silêncio e gerar a mensagem de follow-up personalizada.
     */
    static async generateFollowUpMessage(params: {
        openaiKey: string;
        contactName: string;
        contactTag: string;
        contactNotes?: string;
        history: { role: 'user' | 'assistant'; content: string }[];
        botName: string;
        systemPrompt: string;
        tone: string;
        strategy: string;
        objective: string;
        attemptNumber: number;
        maxAttempts: number;
        customPrompt?: string;
    }): Promise<FollowUpAiResult | null> {
        try {
            const conversationText = params.history
                .map(m => `${m.role === 'assistant' ? 'IA' : 'Cliente'}: ${m.content}`)
                .join('\n');

            const systemInstruction = `Você é uma inteligência artificial especialista em vendas e retenção de clientes integrada ao CRM. Seu objetivo é analisar o histórico de uma conversa e gerar uma mensagem de acompanhamento (follow-up) de forma humana, natural e persuasiva.

${LANGUAGE_GUARD}

DADOS DO ATENDENTE / BOT:
- Nome do Bot/Atendente: ${params.botName}
- Prompt Base do Atendente: ${params.systemPrompt}
- Tom de Voz do Atendente: ${params.tone}

DADOS DO CLIENTE:
- Nome: ${params.contactName}
- Tag/Status Atual no CRM: ${params.contactTag}
- Observações do Contato: ${params.contactNotes || 'Nenhuma'}

DIRETRIZES DO FOLLOW-UP:
- Estratégia de Abordagem: ${params.strategy}
- Objetivo do Follow-up: ${params.objective}
- Tentativa Atual: ${params.attemptNumber} de ${params.maxAttempts}
- Instrução Personalizada do Usuário: ${params.customPrompt || 'Nenhuma'}

REGRAS DE TENTATIVA:
- Tentativa 1: Deve ser muito leve, natural, apenas um lembrete ou check-in casual.
- Tentativa 2: Deve ser mais consultiva, buscando entender se o cliente tem dúvidas ou se precisa de ajuda.
- Tentativa 3 ou superior: Deve ser mais objetiva, focando em encerramento ou em uma última chamada amigável, sem pressão excessiva.

DIRETRIZES DE ESCRITA DA MENSAGEM:
1. CURTA: Deve ter entre 1 e 3 frases curtas. Máximo de 500 caracteres.
2. NATURAL E HUMANA: Evite jargões robóticos, formatações excessivas de listas ou textos formais demais. Escreva como se fosse um atendente humano digitando no WhatsApp.
3. NÃO COBRE O CLIENTE: Nunca soe como cobrança ou reclamação de que ele não respondeu.
4. NUNCA INVENTE informações falsas, descontos que não foram mencionados na conversa, prazos falsos de escassez ou links que não existem. Se precisar propor algo, seja sutil.
5. SEM REPETIÇÕES: Não repita as mesmas palavras das mensagens anteriores.

ANÁLISE DO SILÊNCIO (silence_reason):
Identifique o motivo provável pelo qual o cliente parou de responder, escolhendo exatamente uma das opções abaixo:
- "preco" (achou caro ou reclamou de preço)
- "esquecimento" (simplesmente esqueceu de responder)
- "ocupado" (estava no trabalho ou ocupado)
- "perdeu_interesse" (não demonstrou mais interesse no produto/serviço)
- "pensando" (disse que ia pensar ou analisar)
- "falta_confianca" (inseguro com a empresa, frete ou pagamento)
- "precisa_falar_com_alguem" (mencionou precisar falar com cônjuge/sócio)
- "aguardando_pagamento" (gerou boleto/pix mas ainda não pagou)
- "duvida_nao_respondida" (ficou alguma dúvida pendente do nosso lado)
- "outro" (nenhuma das opções acima)

O retorno deve ser estritamente um objeto JSON contendo as chaves "silence_reason" e "message".`;

            const userPrompt = `Histórico da conversa:\n\n${conversationText}\n\nAnalise o histórico e gere o objeto JSON conforme as instruções de follow-up.`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${params.openaiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: systemInstruction },
                        { role: 'user', content: userPrompt }
                    ],
                    temperature: 0.7,
                    response_format: { type: 'json_object' }
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            await FollowUpAIService.handleResponseStatus(response);
            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;
            if (!content) return null;

            const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
            const result = JSON.parse(cleanContent) as FollowUpAiResult;

            // Validações básicas do retorno da IA
            const validReasons = [
                'preco', 'esquecimento', 'ocupado', 'perdeu_interesse', 'pensando',
                'falta_confianca', 'precisa_falar_com_alguem', 'aguardando_pagamento',
                'duvida_nao_respondida', 'outro'
            ];

            if (!result.message || typeof result.message !== 'string') {
                throw new Error('A IA não gerou o campo "message" como string.');
            }

            if (!validReasons.includes(result.silence_reason)) {
                result.silence_reason = 'outro';
            }

            // Trunca a mensagem caso ultrapasse os 500 caracteres
            if (result.message.length > 500) {
                result.message = result.message.slice(0, 497) + '...';
            }

            return result;

        } catch (err: any) {
            if (err?.name === 'AbortError') {
                console.error('[FollowUpAIService] Timeout na chamada da OpenAI.');
                throw new Error('OPENAI_TIMEOUT');
            }
            if (err?.message === 'OPENAI_QUOTA_EXCEEDED' || err?.message === 'OPENAI_INVALID_KEY') {
                throw err;
            }
            console.error('[FollowUpAIService] Erro na geração da mensagem de follow-up:', err.message || err);
            return null;
        }
    }
}

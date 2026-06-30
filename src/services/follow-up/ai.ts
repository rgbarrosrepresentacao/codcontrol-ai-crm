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
        learningProfile?: {
            best_strategy: string | null;
            best_hour: number | null;
            dominant_silence_reason: string | null;
            best_attempt_number: number | null;
            learning_summary: string | null;
        } | null;
    }): Promise<FollowUpAiResult | null> {
        try {
            const conversationText = params.history
                .map(m => `${m.role === 'assistant' ? 'IA' : 'Cliente'}: ${m.content}`)
                .join('\n');

            let learningContext = '';
            if (params.learningProfile) {
                const lp = params.learningProfile;
                learningContext = `
APRENDIZADOS DO FOLLOW-UP DESTE USUÁRIO (HISTÓRICO):
- Melhor estratégia de conversão: ${lp.best_strategy || 'não identificada'}
- Melhor horário de conversão: ${lp.best_hour !== null ? `${lp.best_hour}h` : 'não identificado'}
- Objeção/silêncio mais frequente: ${lp.dominant_silence_reason || 'não identificado'}
- Resumo do aprendizado: ${lp.learning_summary || 'Nenhum resumo de aprendizado disponível.'}

Use estes aprendizados como contexto para otimizar as nuances da abordagem (ex: se o motivo dominante for preço, apresente valor sutilmente). IMPORTANTE: NUNCA altere a estratégia de abordagem (${params.strategy}) ou qualquer configuração explicitamente configurada pelo usuário. O tom definido pelo usuário deve ser rigorosamente respeitado.`;
            }

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
${learningContext ? `\n${learningContext}` : ''}

REGRAS DE TENTATIVA:
- Tentativa 1: Deve ser muito leve, natural, apenas um lembrete ou check-in casual.
- Tentativa 2: Deve ser mais consultiva, buscando entender se o cliente tem dúvidas ou se precisa de ajuda.
- Tentativa 3 ou superior: Deve ser mais objetiva, focando em encerramento ou em uma última chamada amigável, sem pressão excessiva.

DIRETRIZES DE ESCRITA DA MENSAGEM:
1. CURTA: Deve ter entre 1 e 3 frases curtas. Máximo de 500 caracteres.
2. NATURAL E HUMANA: Evite jargões robóticos, formatações excessivas de locais ou listas, ou textos formais demais. Escreva como se fosse um atendente humano digitando no WhatsApp.
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

    /**
     * Calcula o score de engajamento do lead (0 a 100)
     */
    static calculateLeadScore(params: {
        attemptNumber: number;
        silenceReason: string;
        repliedAnyBefore: boolean;
        contactTag: string;
        lastAttemptCreatedAt?: string | Date;
    }): number {
        let score = 0;
        
        if (params.attemptNumber === 1) {
            score += 30;
        }
        if (['pensando', 'duvida_nao_respondida', 'precisa_falar_com_alguem'].includes(params.silenceReason)) {
            score += 20;
        }
        if (params.repliedAnyBefore) {
            score += 20;
        }
        if (['INTERESSADO', 'PROPOSTA_ENVIADA', 'QUENTE'].includes(params.contactTag)) {
            score += 15;
        }
        if (params.lastAttemptCreatedAt) {
            const lastTime = new Date(params.lastAttemptCreatedAt).getTime();
            const daysSince = (Date.now() - lastTime) / (1000 * 60 * 60 * 24);
            if (daysSince <= 3) {
                score += 10;
            }
            if (daysSince > 7) {
                score -= 20;
            }
        }
        
        if (params.attemptNumber >= 3) {
            score -= 20;
        }
        if (params.silenceReason === 'perdeu_interesse') {
            score -= 30;
        }
        
        return Math.max(0, Math.min(100, score));
    }

    /**
     * Calcula o score de confiança da IA na mensagem gerada (0 a 100)
     */
    static calculateConfidenceScore(params: {
        historyLength: number;
        attemptNumber: number;
        silenceReason: string;
        repliedAnyBefore: boolean;
        contactTag: string;
    }): number {
        let score = 0;
        if (params.historyLength >= 5) {
            score += 20;
        }
        if (params.attemptNumber === 1) {
            score += 20;
        }
        if (params.silenceReason && params.silenceReason !== 'outro') {
            score += 20;
        }
        if (params.repliedAnyBefore) {
            score += 20;
        }
        if (['INTERESSADO', 'PROPOSTA_ENVIADA', 'QUENTE'].includes(params.contactTag)) {
            score += 20;
        }
        return Math.max(0, Math.min(100, score));
    }
}

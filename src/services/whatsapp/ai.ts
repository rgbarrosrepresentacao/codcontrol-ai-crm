export type AiTag = 'NOVO_LEAD' | 'EM_ATENDIMENTO' | 'QUALIFICADO' | 'INTERESSADO' | 'PROPOSTA_ENVIADA' | 'AGUARDANDO_RESPOSTA' | 'FECHADO' | 'PERDIDO' | 'FRIO' | 'MORNO' | 'QUENTE' | 'COMPRADOR' | 'LEAD_QUALIFICADO';

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
                            content: `Você é um classificador de leads estratégico. Responda APENAS com uma dessas palavras: FRIO, MORNO, QUENTE, COMPRADOR, LEAD_QUALIFICADO, NOVO_LEAD, EM_ATENDIMENTO, QUALIFICADO, INTERESSADO, PROPOSTA_ENVIADA, AGUARDANDO_RESPOSTA, FECHADO, PERDIDO.`
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
        campaignPrompt: string = '',
        funnelContext: string = '',
        catalogueContext: string = '',
        leadIntelligence: any = null
    ): Promise<string | null> {
        try {
            // Prepara o contexto do funil se existir
            const funnelInfo = funnelContext 
                ? `\nCONTEXTO DO FUNIL DE VENDAS (HISTÓRICO RECENTE):\n${funnelContext}\nInstrução: O cliente acabou de passar por este fluxo automatizado. Use essas informações para continuar o atendimento sem repetir o que já foi dito.`
                : '';

            // Prepara a Memória Estratégica se existir
            const memoryInfo = leadIntelligence && Object.keys(leadIntelligence).length > 0
                ? `\n[MEMÓRIA ESTRATÉGICA DO LEAD]\n` +
                  `- Interesse: ${leadIntelligence.main_interest || 'A descobrir'}\n` +
                  `- Dor: ${leadIntelligence.main_pain || 'A descobrir'}\n` +
                  `- Objeção: ${leadIntelligence.main_objection || 'Nenhuma detectada'}\n` +
                  `- Estágio: ${leadIntelligence.buying_stage || 'frio'}\n` +
                  `- Próxima melhor ação: ${leadIntelligence.next_best_action || 'Qualificar'}\n` +
                  `- Última oferta: ${leadIntelligence.last_offer || 'Nenhuma'}\n`
                : '';

            // ── MONTAGEM DA HIERARQUIA DO PROMPT (MODO ELITE MULTI-PRODUTO) ──
            const systemContent = `
Você é ${aiConfig.bot_name}.

IDIOMA OBRIGATÓRIO: ${aiConfig.language || 'Português do Brasil (pt-BR)'}.
REGRAS DE IDIOMA:
- Responda OBRIGATORIAMENTE em ${aiConfig.language === 'pt-BR' || !aiConfig.language ? 'Português do Brasil (pt-BR)' : aiConfig.language}.
- Jamais use inglês ou outro idioma, mesmo que o cliente fale em outra língua.
- Mantenha o tom de voz e a personalidade definidos abaixo.

${catalogueContext ? `PRODUTOS QUE VOCÊ REPRESENTA (CATÁLOGO):\n${catalogueContext}\n` : ''}

REGRAS GERAIS E CONDUTA:
${aiConfig.system_prompt}

${funnelInfo}

${memoryInfo}

CONHECIMENTO E MÍDIAS DISPONÍVEIS:
${knowledgeContext}

${knowledgeContext ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ REGRA OBRIGATÓRIA DE ENVIO DE MÍDIA ⚠️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Você TEM ACESSO a arquivos reais (imagens e vídeos) listados acima.
QUANDO o cliente pedir para VER uma imagem, foto, vídeo ou resultado, você DEVE:
1. Escrever sua resposta normalmente.
2. Ao FINAL da mensagem, adicionar EXATAMENTE o comando: [SEND_MEDIA:ID_DO_ARQUIVO]
   Exemplo: "Claro! Veja aqui o resultado incrível 🤩 [SEND_MEDIA:abc-123]"
3. Substituir ID_DO_ARQUIVO pelo ID correto da mídia listada acima.
4. Esta regra se aplica a TODOS os tipos: imagem, vídeo, documento.
5. NUNCA diga "não tenho vídeo" ou "não posso enviar" se houver um vídeo na lista acima.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : ''}

CONTEXTO DA CAMPANHA E PRODUTO (MANUAL DE VENDAS ATIVO):
${campaignPrompt || 'Nenhuma campanha específica ativa no momento. Siga as regras gerais de atendimento.'}

INSTRUÇÃO DE VENDA DO PRODUTO ATUAL (PRIORIDADE MÁXIMA):
${leadContext}
- Responda de forma natural, humana e empática.
- Use emojis de forma moderada e estratégica.
- ANTI-ALUCINAÇÃO: Se o cliente perguntar algo sobre preço ou características que não estejam nos manuais acima, diga educadamente que vai verificar. NUNCA invente informações.
- RIGIDEZ DE IDIOMA: Não mude de idioma em hipótese alguma.
- FOCO EM CONVERSÃO: Use os dados do manual ativo para direcionar o cliente ao fechamento da venda.
`.trim();

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: systemContent },
                        ...messages
                    ],
                    temperature: 0.6,
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
     * Analisa a conversa para atualizar a inteligência estratégica do lead
     */
    static async analyzeIntelligence(messages: any[], openaiKey: string, currentIntelligence: any = {}): Promise<any> {
        try {
            const conversationText = messages.slice(-10).map(m => `${m.role === 'assistant' ? 'IA' : 'Cliente'}: ${m.content}`).join('\n');
            
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: `Você é um analista estratégico de vendas. Sua tarefa é extrair a "alma" da conversa para ajudar a IA a vender melhor.
                            
                            DADOS ATUAIS:
                            ${JSON.stringify(currentIntelligence)}

                            REGRAS DE EXTRAÇÃO (JSON):
                            - lead_summary: Um resumo curto do momento do lead.
                            - main_interest: O que ele realmente quer?
                            - main_pain: Qual o problema que ele quer resolver?
                            - main_objection: O que está impedindo a compra?
                            - buying_stage: OBRIGATORIAMENTE um destes: [frio, morno, quente, comprador, perdido, precisa_humano]. NUNCA use outros termos.
                            - next_best_action: O que a IA deve fazer agora?
                            - last_offer: Último preço ou condição oferecida.
                            
                            Retorne APENAS o JSON puro.`
                        },
                        { role: 'user', content: `Analise as últimas interações e atualize a inteligência estratégica:\n\n${conversationText}` }
                    ],
                    temperature: 0,
                    response_format: { type: 'json_object' }
                })
            });

            if (!response.ok) return currentIntelligence;
            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;
            if (!content) return currentIntelligence;

            const intelligence = JSON.parse(content);

            // Validação e Normalização Rígida de Estágio (Ponto 1)
            const validStages = ['frio', 'morno', 'quente', 'comprador', 'perdido', 'precisa_humano'];
            if (!validStages.includes(intelligence.buying_stage)) {
                console.log(`[AI] Normalizando estágio inválido: ${intelligence.buying_stage}`);
                // Mapeamento simples para casos comuns ou fallback para 'morno'
                if (intelligence.buying_stage?.toLowerCase().includes('consider')) intelligence.buying_stage = 'morno';
                else if (intelligence.buying_stage?.toLowerCase().includes('interessado')) intelligence.buying_stage = 'quente';
                else intelligence.buying_stage = intelligence.buying_stage ? 'morno' : (currentIntelligence.buying_stage || 'frio');
            }

            return intelligence;
        } catch (err) {
            console.error('[AIService] Intelligence analysis error:', err);
            return currentIntelligence;
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
                            
                            Responda estritamente em formato JSON.
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

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
            }
            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;
            if (!content) throw new Error('Empty response from OpenAI');
            
            return JSON.parse(content);
        } catch (err: any) {
            console.error('[AIService] Condition evaluation error:', err.message);
            
            // FALLBACK MANUAL: Se a IA falhar, fazemos um match simples de palavras-chave
            // Isso evita que o funil trave por erro de API
            const lastUserMsg = messages[messages.length - 1]?.content?.toLowerCase().trim() || '';
            
            // Regex mais abrangente para respostas positivas curtas
            if (lastUserMsg.match(/^(sim|s|ss|si|simm|quero|queremos|vontade|interesse|pode|com certeza|claro|ok|agora|manda|bora|vqv|👍|✅)$/i) || 
                lastUserMsg.match(/\b(sim|quero|tenho interesse|pode mandar|com certeza)\b/i)) {
                return { decision: 'yes', confidence: 100, reason: 'Fallback manual: Palavra-chave positiva detectada' };
            }
            
            if (lastUserMsg.match(/^(não|nao|n|nn|no|nem|parar|cancelar|sair|👎|❌)$/i) || 
                lastUserMsg.match(/\b(não quero|nao tenho interesse|agora não)\b/i)) {
                return { decision: 'no', confidence: 100, reason: 'Fallback manual: Palavra-chave negativa detectada' };
            }

            if (lastUserMsg.match(/\b(atendente|humano|pessoa|suporte|falar com alguém)\b/i)) {
                return { decision: 'human', confidence: 100, reason: 'Fallback manual: Pedido de humano detectado' };
            }
            return { decision: 'unclear', confidence: 0, reason: 'Erro na avaliação e sem palavras-chave claras' };
        }
    }
}

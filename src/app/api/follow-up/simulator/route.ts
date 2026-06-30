import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { FollowUpAIService } from '@/services/follow-up/ai';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SILENCE_REASONS: Record<string, string> = {
    preco: 'Preço',
    esquecimento: 'Esquecimento',
    ocupado: 'Ocupado',
    perdeu_interesse: 'Perdeu interesse',
    pensando: 'Pensando',
    falta_confianca: 'Falta de confiança',
    precisa_falar_com_alguem: 'Falar com parceiro/sócio',
    aguardando_pagamento: 'Aguardando pagamento',
    duvida_nao_respondida: 'Dúvida pendente',
    outro: 'Outro'
};

export async function POST(req: NextRequest) {
    console.log('[FOLLOWUP_SIMULATOR_POST] Iniciando simulação de follow-up...');
    try {
        const supabaseAuth = await createSupabaseServerClient();
        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

        if (authError || !user) {
            console.error('[FOLLOWUP_SIMULATOR_ERROR] Usuário não autenticado.');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { conversation_id, strategy, objective } = body;

        if (!conversation_id) {
            return NextResponse.json({ error: 'O campo conversation_id é obrigatório.' }, { status: 400 });
        }

        const supabase = getSupabaseAdmin();

        // 1. Buscar a conversa e garantir que ela pertence ao usuário (tenant-safe)
        const { data: conversation, error: convErr } = await supabase
            .from('conversations')
            .select('*')
            .eq('id', conversation_id)
            .eq('user_id', user.id)
            .single();

        if (convErr || !conversation) {
            console.error('[FOLLOWUP_SIMULATOR_ERROR] Conversa não encontrada ou sem acesso.');
            return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
        }

        // 2. Buscar o contato associado à conversa
        const { data: contact, error: contactErr } = await supabase
            .from('contacts')
            .select('*')
            .eq('id', conversation.contact_id)
            .eq('user_id', user.id)
            .single();

        if (contactErr || !contact) {
            console.error('[FOLLOWUP_SIMULATOR_ERROR] Contato não encontrado ou sem acesso.');
            return NextResponse.json({ error: 'Contato associado não encontrado.' }, { status: 404 });
        }

        // 3. Buscar as configurações de follow-up do usuário
        const { data: settings } = await supabase
            .from('followup_settings')
            .select('*')
            .eq('user_id', user.id)
            .single();

        const activeSettings = settings || {
            strategy: 'consultivo',
            objective: 'recuperar_venda',
            max_attempts: 3,
            custom_prompt: ''
        };

        // 4. Buscar as últimas 20 mensagens da conversa (mesmo limite do Bloco 3)
        const { data: messages, error: msgErr } = await supabase
            .from('messages')
            .select('from_me, content, created_at')
            .eq('conversation_id', conversation.id)
            .order('created_at', { ascending: false })
            .limit(20);

        if (msgErr || !messages || messages.length === 0) {
            return NextResponse.json({ error: 'A conversa não possui mensagens suficientes para simulação.' }, { status: 400 });
        }

        // Inverter as mensagens para ordem cronológica correta na chamada da OpenAI
        const chronologicalMessages = [...messages].reverse();

        // 5. Descobrir o número da próxima tentativa baseando-se no histórico real
        const { data: previousAttempts } = await supabase
            .from('followup_attempts')
            .select('*')
            .eq('contact_id', contact.id)
            .eq('status', 'sent');

        const attemptNumber = (previousAttempts?.length || 0) + 1;

        // Verificar se respondeu a algum follow-up anterior
        let repliedAnyBefore = false;
        if (previousAttempts && previousAttempts.length > 0) {
            for (const att of previousAttempts) {
                if (att.sent_at) {
                    const { data: replies } = await supabase
                        .from('messages')
                        .select('id')
                        .eq('conversation_id', conversation.id)
                        .eq('from_me', false)
                        .gt('created_at', att.sent_at)
                        .limit(1);
                    if (replies && replies.length > 0) {
                        repliedAnyBefore = true;
                        break;
                    }
                }
            }
        }

        // 5.5 Buscar perfil de aprendizado do usuário se existir (IA Adaptativa)
        const { data: learningProfile } = await supabase
            .from('followup_learning_profiles')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();

        // 6. Chamar a OpenAI para gerar a mensagem e o silêncio (Sem gravar nada no banco!)
        const openaiKey = process.env.OPENAI_API_KEY || '';
        if (!openaiKey) {
            return NextResponse.json({ error: 'Chave da OpenAI não configurada no servidor.' }, { status: 503 });
        }

        const aiResult = await FollowUpAIService.generateFollowUpMessage({
            openaiKey,
            contactName: contact.name || 'Cliente',
            contactTag: contact.ai_tag || '',
            contactNotes: contact.notes || '',
            history: chronologicalMessages.map(m => ({
                role: m.from_me ? 'assistant' : 'user',
                content: m.content
            })),
            botName: 'IA',
            systemPrompt: 'Você é uma IA de recuperação de vendas.',
            tone: 'natural',
            strategy: strategy || activeSettings.strategy,
            objective: objective || activeSettings.objective,
            attemptNumber,
            maxAttempts: activeSettings.max_attempts,
            customPrompt: activeSettings.custom_prompt,
            learningProfile
        });

        if (!aiResult) {
            return NextResponse.json({ error: 'Erro ao gerar mensagem na OpenAI.' }, { status: 500 });
        }

        // 7. Calcular os Scores com as funções centralizadas do Bloco 7
        const leadScore = FollowUpAIService.calculateLeadScore({
            attemptNumber,
            silenceReason: aiResult.silence_reason,
            repliedAnyBefore,
            contactTag: contact.ai_tag || '',
            lastAttemptCreatedAt: previousAttempts?.[0]?.created_at
        });

        const confidenceScore = FollowUpAIService.calculateConfidenceScore({
            historyLength: messages.length,
            attemptNumber,
            silenceReason: aiResult.silence_reason,
            repliedAnyBefore,
            contactTag: contact.ai_tag || ''
        });

        // 8. Construir a lista de raciocínio lógico (Reasoning)
        const reasoning: string[] = [];
        const lastMsg = messages[0]; // Mensagem mais recente (está no topo de messages desc)

        if (lastMsg) {
            if (!lastMsg.from_me) {
                reasoning.push('A última mensagem foi enviada pelo cliente.');
            } else {
                reasoning.push('A última mensagem foi enviada por nós.');
            }

            const diffMs = Date.now() - new Date(lastMsg.created_at).getTime();
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

            if (diffDays > 0) {
                reasoning.push(`O cliente está sem responder há ${diffDays} ${diffDays === 1 ? 'dia' : 'dias'}.`);
            } else {
                reasoning.push(`O cliente está sem responder há ${diffHours} ${diffHours === 1 ? 'hora' : 'horas'}.`);
            }
        }

        reasoning.push(`A objeção provável detectada foi: "${SILENCE_REASONS[aiResult.silence_reason] || aiResult.silence_reason}".`);
        reasoning.push(`Esta simulação representa o comportamento da tentativa #${attemptNumber}.`);

        if (repliedAnyBefore) {
            reasoning.push('O cliente já engajou com follow-ups anteriores na mesma conversa.');
        }
        if (['INTERESSADO', 'PROPOSTA_ENVIADA', 'QUENTE'].includes(contact.ai_tag || '')) {
            reasoning.push(`O lead possui um estágio qualificado no CRM (${contact.ai_tag}).`);
        }

        // Retornar os dados completos sem alterar nada no banco de dados
        return NextResponse.json({
            success: true,
            preview: {
                silence_reason: aiResult.silence_reason,
                strategy_used: strategy || activeSettings.strategy,
                attempt_number: attemptNumber,
                lead_score: leadScore,
                confidence: confidenceScore,
                generated_message: aiResult.message,
                reasoning
            }
        });

    } catch (err: any) {
        console.error('[FOLLOWUP_SIMULATOR_ERROR] Erro fatal no POST:', err.message || err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

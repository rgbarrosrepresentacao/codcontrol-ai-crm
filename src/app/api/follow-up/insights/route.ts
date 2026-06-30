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
    precisa_falar_com_alguem: 'Precisa falar com alguém',
    aguardando_pagamento: 'Aguardando pagamento',
    duvida_nao_respondida: 'Dúvida não respondida',
    outro: 'Outro'
};

const DAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export async function GET(req: NextRequest) {
    console.log('[FOLLOWUP_INSIGHTS_GET] Iniciando cálculo de insights...');
    try {
        const supabaseAuth = await createSupabaseServerClient();
        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

        if (authError || !user) {
            console.error('[FOLLOWUP_INSIGHTS_ERROR] Usuário não autenticado.');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const range = searchParams.get('range') || '7d';

        // Calcular as datas limites no fuso de Brasília (America/Sao_Paulo)
        const nowBr = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
        let rangeStartDate = new Date(0); // Padrão: tudo
        let rangeEndDate = new Date();

        if (range === 'today') {
            const start = new Date(nowBr);
            start.setHours(0, 0, 0, 0);
            rangeStartDate = start;
        } else if (range === 'yesterday') {
            const start = new Date(nowBr);
            start.setDate(start.getDate() - 1);
            start.setHours(0, 0, 0, 0);
            rangeStartDate = start;

            const end = new Date(nowBr);
            end.setDate(end.getDate() - 1);
            end.setHours(23, 59, 59, 999);
            rangeEndDate = end;
        } else if (range === '7d') {
            const start = new Date(nowBr);
            start.setDate(start.getDate() - 7);
            start.setHours(0, 0, 0, 0);
            rangeStartDate = start;
        } else if (range === '30d') {
            const start = new Date(nowBr);
            start.setDate(start.getDate() - 30);
            start.setHours(0, 0, 0, 0);
            rangeStartDate = start;
        }

        const supabase = getSupabaseAdmin();

        // 1. Buscar todas as tentativas do usuário no período
        let query = supabase
            .from('followup_attempts')
            .select('*, contacts(name, phone, ai_tag, updated_at)')
            .eq('user_id', user.id)
            .gte('created_at', rangeStartDate.toISOString());

        if (range === 'yesterday') {
            query = query.lte('created_at', rangeEndDate.toISOString());
        }

        const { data: attempts, error: attemptsErr } = await query.order('created_at', { ascending: false });

        if (attemptsErr) {
            console.error('[FOLLOWUP_INSIGHTS_ERROR] Erro ao buscar tentativas:', attemptsErr.message);
            return NextResponse.json({ error: 'Erro ao buscar dados de insights' }, { status: 500 });
        }

        if (!attempts || attempts.length === 0) {
            return NextResponse.json({
                success: true,
                range,
                silence_reasons: [],
                best_hours: [],
                best_days: [],
                attempt_performance: [],
                hot_leads: [],
                cold_leads: [],
                recommendations: [],
                weekly_summary: {
                    title: 'Sem dados no período',
                    text: 'Ainda não existem tentativas de follow-up registradas no período selecionado.'
                }
            });
        }

        // 2. Coletar IDs de conversas únicas para buscar respostas
        const convIds = Array.from(new Set(attempts.map(a => a.conversation_id).filter(Boolean)));
        let replyMessages: any[] = [];
        if (convIds.length > 0) {
            const { data: msgs, error: msgsErr } = await supabase
                .from('messages')
                .select('conversation_id, created_at')
                .eq('from_me', false)
                .in('conversation_id', convIds);

            if (msgsErr) {
                console.error('[FOLLOWUP_INSIGHTS_ERROR] Erro ao buscar respostas:', msgsErr.message);
            } else {
                replyMessages = msgs || [];
            }
        }

        // --- CÁLCULOS DETERMINÍSTICOS ---

        // A. Motivos de Silêncio
        const silenceMap = new Map<string, number>();
        let silenceWithReasonCount = 0;
        attempts.forEach(a => {
            if (a.silence_reason) {
                silenceMap.set(a.silence_reason, (silenceMap.get(a.silence_reason) || 0) + 1);
                silenceWithReasonCount++;
            }
        });

        const silenceReasons = Array.from(silenceMap.entries())
            .map(([reason, count]) => ({
                reason,
                label: SILENCE_REASONS[reason] || reason,
                count,
                percentage: silenceWithReasonCount > 0 ? Math.round((count / silenceWithReasonCount) * 100) : 0
            }))
            .sort((a, b) => b.count - a.count);

        // B. Agrupamento de Performance (Horas, Dias, Tentativas)
        const hourMap = new Map<string, { sent: number; replied: number }>();
        const dayMap = new Map<number, { sent: number; replied: number }>();
        const attemptMap = new Map<number, { sent: number; replied: number }>();
        
        let totalSent = 0;
        let totalReplied = 0;
        let totalFailed = 0;

        attempts.forEach(a => {
            if (a.status === 'failed') {
                totalFailed++;
            }

            if (a.status === 'sent' && a.sent_at) {
                totalSent++;
                const sentTime = new Date(a.sent_at);
                
                // Obter hora e dia no fuso local de Brasília
                const localStr = sentTime.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
                const localDate = new Date(localStr);
                
                const hourStr = `${String(localDate.getHours()).padStart(2, '0')}:00`;
                const dayOfWeek = localDate.getDay();
                const attemptNum = a.attempt_number;

                // Verificar se o cliente respondeu após o envio
                const hasReply = replyMessages.some(m => 
                    m.conversation_id === a.conversation_id &&
                    new Date(m.created_at).getTime() > sentTime.getTime()
                );

                if (hasReply) {
                    totalReplied++;
                }

                // Agrupar Hora
                const hData = hourMap.get(hourStr) || { sent: 0, replied: 0 };
                hData.sent++;
                if (hasReply) hData.replied++;
                hourMap.set(hourStr, hData);

                // Agrupar Dia
                const dData = dayMap.get(dayOfWeek) || { sent: 0, replied: 0 };
                dData.sent++;
                if (hasReply) dData.replied++;
                dayMap.set(dayOfWeek, dData);

                // Agrupar Tentativa
                const attData = attemptMap.get(attemptNum) || { sent: 0, replied: 0 };
                attData.sent++;
                if (hasReply) attData.replied++;
                attemptMap.set(attemptNum, attData);
            }
        });

        // Formatar e ordenar Horas
        const bestHours = Array.from(hourMap.entries())
            .map(([hour, data]) => ({
                hour,
                sent: data.sent,
                replied: data.replied,
                rate: data.sent > 0 ? Math.round((data.replied / data.sent) * 100) : 0,
                low_sample: data.sent < 3
            }))
            .sort((a, b) => b.rate - a.rate || b.sent - a.sent);

        // Formatar e ordenar Dias
        const bestDays = Array.from(dayMap.entries())
            .map(([day, data]) => ({
                day,
                label: DAY_LABELS[day],
                sent: data.sent,
                replied: data.replied,
                rate: data.sent > 0 ? Math.round((data.replied / data.sent) * 100) : 0,
                low_sample: data.sent < 3
            }))
            .sort((a, b) => b.rate - a.rate || b.sent - a.sent);

        // Formatar Performance por Tentativa
        const attemptPerformance = Array.from(attemptMap.entries())
            .map(([attempt_number, data]) => ({
                attempt_number,
                sent: data.sent,
                replied: data.replied,
                rate: data.sent > 0 ? Math.round((data.replied / data.sent) * 100) : 0
            }))
            .sort((a, b) => a.attempt_number - b.attempt_number);

        // C. Leads Quentes e Leads Frios (Score de 0 a 100)
        const contactMap = new Map<string, { contact: any; attempts: any[]; repliedAny: boolean }>();
        attempts.forEach(a => {
            if (a.contact_id) {
                const cData = contactMap.get(a.contact_id) || { contact: a.contacts, attempts: [], repliedAny: false };
                cData.attempts.push(a);
                
                // Verificar se respondeu a esse específico
                if (a.status === 'sent' && a.sent_at) {
                    const hasReply = replyMessages.some(m => 
                        m.conversation_id === a.conversation_id &&
                        new Date(m.created_at).getTime() > new Date(a.sent_at).getTime()
                    );
                    if (hasReply) {
                        cData.repliedAny = true;
                    }
                }
                
                contactMap.set(a.contact_id, cData);
            }
        });

        const scoredLeads = Array.from(contactMap.values()).map(({ contact, attempts: cAttempts, repliedAny }) => {
            const lastAttempt = cAttempts[0]; // Ordenado por created_at desc
            const contactTag = contact?.ai_tag || '';
            const silenceReason = lastAttempt.silence_reason || '';
            
            // 1. Cálculo do Score Quente (Hot Score) com o algoritmo centralizado
            let hotScore = FollowUpAIService.calculateLeadScore({
                attemptNumber: lastAttempt.attempt_number,
                silenceReason: silenceReason,
                repliedAnyBefore: repliedAny,
                contactTag: contactTag,
                lastAttemptCreatedAt: lastAttempt.created_at
            });

            let hotReasons: string[] = [];
            if (lastAttempt.attempt_number === 1) {
                hotReasons.push('Em fase inicial de follow-up.');
            }
            if (['pensando', 'duvida_nao_respondida', 'precisa_falar_com_alguem'].includes(silenceReason)) {
                hotReasons.push(`Motivo de silêncio amigável (${SILENCE_REASONS[silenceReason] || silenceReason}).`);
            }
            if (repliedAny) {
                hotReasons.push('Já interagiu anteriormente.');
            }
            if (['INTERESSADO', 'PROPOSTA_ENVIADA', 'QUENTE'].includes(contactTag)) {
                hotReasons.push(`Lead em estágio avançado no CRM (${contactTag}).`);
            }
            if (silenceReason === 'perdeu_interesse') {
                hotReasons.push('Demonstrou perda de interesse.');
            }
            const daysSinceLastAttempt = (Date.now() - new Date(lastAttempt.created_at).getTime()) / (1000 * 60 * 60 * 24);

            // 2. Cálculo do Score Frio (Cold Score)
            let coldScore = 0;
            let coldReasons: string[] = [];

            if (lastAttempt.attempt_number >= 3) {
                coldScore += 25;
                coldReasons.push('Múltiplas tentativas sem retorno.');
            }
            if (silenceReason === 'perdeu_interesse') {
                coldScore += 30;
                coldReasons.push('Declarou perda de interesse.');
            }
            if (daysSinceLastAttempt > 7) {
                coldScore += 25;
                coldReasons.push('Sem resposta há mais de uma semana.');
            }
            if (!repliedAny) {
                coldScore += 20;
            }
            if (['FRIO', 'MORNO'].includes(contactTag)) {
                coldScore += 10;
            }

            // Redutores de Frieza (deixa o lead quente)
            if (repliedAny) {
                coldScore -= 30;
            }
            if (['COMPRADOR', 'FECHADO'].includes(contactTag)) {
                coldScore -= 20;
            }

            coldScore = Math.max(0, Math.min(100, coldScore));

            return {
                contact_name: contact?.name || 'Sem Nome',
                phone: contact?.phone || 'Sem Telefone',
                conversation_id: lastAttempt.conversation_id,
                silence_reason: lastAttempt.silence_reason,
                last_attempt_at: lastAttempt.created_at,
                hot_score: hotScore,
                hot_reason: hotReasons.join(' ') || 'Lead com interações recentes padrão.',
                cold_score: coldScore,
                cold_reason: coldReasons.join(' ') || 'Sem sinais críticos de desistência.'
            };
        });

        // Top 10 Hot Leads (maior hot_score)
        const hotLeads = [...scoredLeads]
            .filter(l => l.hot_score > 30)
            .sort((a, b) => b.hot_score - a.hot_score)
            .slice(0, 10);

        // Top 10 Cold Leads (maior cold_score)
        const coldLeads = [...scoredLeads]
            .filter(l => l.cold_score > 30)
            .sort((a, b) => b.cold_score - a.cold_score)
            .slice(0, 10);

        // D. Recomendações Estratégicas
        const recommendations: any[] = [];
        
        // 1. Caso preço seja objeção principal
        const topSilence = silenceReasons[0];
        if (topSilence && topSilence.reason === 'preco' && topSilence.percentage > 30) {
            recommendations.push({
                type: 'strategy',
                title: 'Preço é a principal objeção',
                description: `Cerca de ${topSilence.percentage}% dos seus clientes param de responder ao falar de preço. Experimente mudar sua abordagem para 'Consultiva' e enfatizar os benefícios ou facilidades antes do valor final.`,
                impact: 'alto'
            });
        }

        // 2. Caso a primeira tentativa seja disparada com maior taxa de resposta
        const att1 = attemptPerformance.find(p => p.attempt_number === 1);
        const att2 = attemptPerformance.find(p => p.attempt_number === 2);
        if (att1 && att2 && att1.rate > att2.rate + 15) {
            recommendations.push({
                type: 'strategy',
                title: 'A primeira tentativa é a mais forte',
                description: `A tentativa #1 tem uma taxa de resposta de ${att1.rate}%, enquanto a #2 cai para ${att2.rate}%. Foque em deixar o primeiro follow-up extremamente natural, leve e amigável.`,
                impact: 'médio'
            });
        }

        // 3. Taxa de conversão geral baixa
        const overallRate = totalSent > 0 ? Math.round((totalReplied / totalSent) * 100) : 0;
        if (totalSent >= 5 && overallRate < 25) {
            recommendations.push({
                type: 'strategy',
                title: 'Taxa de resposta abaixo do ideal',
                description: `Sua taxa de conversão de follow-ups está em ${overallRate}%. Considere reduzir o tom de voz para 'Muito Leve' ou 'Leve' para diminuir a pressão de venda e incentivar o retorno natural.`,
                impact: 'alto'
            });
        }

        // 4. Pico de horário
        const topHour = bestHours[0];
        if (topHour && topHour.rate > 45 && !topHour.low_sample) {
            recommendations.push({
                type: 'timing',
                title: `Melhor horário de engajamento: ${topHour.hour}`,
                description: `Os disparos feitos por volta de ${topHour.hour} têm a maior taxa de resposta (${topHour.rate}%). Considere concentrar seus follow-ups próximos a essa janela.`,
                impact: 'médio'
            });
        }

        // 5. Falhas altas
        if (totalFailed > 0 && (totalFailed / (attempts.length)) > 0.15) {
            recommendations.push({
                type: 'system',
                title: 'Alto índice de falhas detectado',
                description: 'Uma parcela significativa dos agendamentos falhou. Certifique-se de que sua instância na Evolution API está conectada e com saldo ou sinal ativo.',
                impact: 'alto'
            });
        }

        // Adicionar recomendação padrão se a lista estiver vazia
        if (recommendations.length === 0) {
            recommendations.push({
                type: 'general',
                title: 'Continue coletando dados',
                description: 'Seu follow-up está performando dentro dos parâmetros esperados. Conforme mais mensagens forem enviadas, novas análises serão exibidas aqui.',
                impact: 'baixo'
            });
        }

        // E. Resumo Semanal/Período
        const mainSilenceLabel = topSilence ? topSilence.label : 'não identificado';
        const weeklySummary = {
            title: 'Resumo do período',
            text: `No período selecionado, você realizou ${attempts.length} tentativas de follow-up, das quais ${totalSent} foram enviadas com sucesso. A taxa geral de resposta dos clientes foi de ${overallRate}%. A principal causa de silêncio identificada pela IA foi: "${mainSilenceLabel}".`
        };

        return NextResponse.json({
            success: true,
            range,
            silence_reasons: silenceReasons,
            best_hours: bestHours,
            best_days: bestDays,
            attempt_performance: attemptPerformance,
            hot_leads: hotLeads,
            cold_leads: coldLeads,
            recommendations,
            weekly_summary: weeklySummary
        });

    } catch (err: any) {
        console.error('[FOLLOWUP_INSIGHTS_ERROR] Erro fatal no GET:', err.message || err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

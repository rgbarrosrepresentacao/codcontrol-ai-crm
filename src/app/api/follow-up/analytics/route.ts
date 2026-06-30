import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
    console.log('[FOLLOWUP_ANALYTICS_GET] Iniciando busca de métricas...');
    try {
        const supabaseAuth = await createSupabaseServerClient();
        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

        if (authError || !user) {
            console.error('[FOLLOWUP_ANALYTICS_ERROR] Usuário não autenticado.');
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

        // 1. Buscar todas as tentativas do usuário no período selecionado
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
            console.error('[FOLLOWUP_ANALYTICS_ERROR] Erro ao buscar tentativas:', attemptsErr.message);
            return NextResponse.json({ error: 'Erro ao buscar métricas' }, { status: 500 });
        }

        // 2. Coletar IDs de conversas únicas para buscar respostas do cliente
        const convIds = Array.from(new Set((attempts || []).map(a => a.conversation_id).filter(Boolean)));
        
        let replyMessages: any[] = [];
        if (convIds.length > 0) {
            const { data: msgs, error: msgsErr } = await supabase
                .from('messages')
                .select('conversation_id, created_at')
                .eq('from_me', false)
                .in('conversation_id', convIds);

            if (msgsErr) {
                console.error('[FOLLOWUP_ANALYTICS_ERROR] Erro ao buscar mensagens de resposta:', msgsErr.message);
            } else {
                replyMessages = msgs || [];
            }
        }

        // 3. Processar métricas e construir o resumo (Summary)
        let pending = 0;
        let processing = 0;
        let ready = 0;
        let sent = 0;
        let skipped = 0;
        let failed = 0;
        let replied = 0;
        let recoveredSales = 0;

        const processedAttempts = (attempts || []).map((attempt: any) => {
            const contact = attempt.contacts || {};
            let resultStatus = 'Aguardando agendamento';
            let clientReplied = false;
            let saleRecovered = false;

            if (attempt.status === 'pending') {
                pending++;
                resultStatus = 'Aguardando';
            } else if (attempt.status === 'processing') {
                processing++;
                resultStatus = 'Processando';
            } else if (attempt.status === 'ready') {
                ready++;
                resultStatus = 'Pronto para envio';
            } else if (attempt.status === 'skipped') {
                skipped++;
                resultStatus = 'Ignorado';
            } else if (attempt.status === 'failed') {
                failed++;
                resultStatus = 'Falhou';
            } else if (attempt.status === 'sent') {
                sent++;
                resultStatus = 'Enviado';

                // Verificar se o cliente respondeu depois do envio
                if (attempt.sent_at) {
                    const sentTime = new Date(attempt.sent_at).getTime();
                    const hasReply = replyMessages.some(m => 
                        m.conversation_id === attempt.conversation_id &&
                        new Date(m.created_at).getTime() > sentTime
                    );

                    if (hasReply) {
                        clientReplied = true;
                        replied++;
                        resultStatus = 'Cliente respondeu';
                    }

                    // Verificar se houve venda recuperada (tag COMPRADOR ou FECHADO depois do envio)
                    const isBuyer = ['COMPRADOR', 'FECHADO'].includes(contact.ai_tag || '');
                    if (isBuyer && contact.updated_at) {
                        const updatedTime = new Date(contact.updated_at).getTime();
                        if (updatedTime > sentTime) {
                            saleRecovered = true;
                            recoveredSales++;
                            resultStatus = 'Venda recuperada';
                        }
                    }
                }
            } else if (attempt.status === 'cancelled') {
                resultStatus = 'Cancelado';
            }

            return {
                id: attempt.id,
                contact_name: contact.name || 'Sem Nome',
                phone: contact.phone || 'Sem Telefone',
                attempt_number: attempt.attempt_number,
                status: attempt.status,
                silence_reason: attempt.silence_reason,
                generated_message: attempt.generated_message,
                sent_at: attempt.sent_at,
                created_at: attempt.created_at,
                conversation_id: attempt.conversation_id,
                message_id: attempt.message_id,
                result: resultStatus,
                client_replied: clientReplied,
                sale_recovered: saleRecovered
            };
        });

        const totalScheduled = (attempts || []).length;
        const recoveryRate = sent > 0 ? Math.round((replied / sent) * 100) : 0;

        // 4. Agrupar dados por dia para o gráfico (limite de 30 dias)
        const chartMap = new Map<string, { date: string; sent: number; replied: number; sales: number; failed: number }>();
        
        // Inicializar os últimos N dias no gráfico para não vir vazio
        const daysToRender = range === 'today' || range === 'yesterday' ? 2 : range === '7d' ? 7 : 30;
        for (let i = daysToRender - 1; i >= 0; i--) {
            const d = new Date(nowBr);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            chartMap.set(dateStr, { date: dateStr, sent: 0, replied: 0, sales: 0, failed: 0 });
        }

        processedAttempts.forEach(a => {
            const dateStr = new Date(a.created_at).toISOString().split('T')[0];
            if (chartMap.has(dateStr)) {
                const dayData = chartMap.get(dateStr)!;
                if (a.status === 'sent') {
                    dayData.sent++;
                    if (a.client_replied) dayData.replied++;
                    if (a.sale_recovered) dayData.sales++;
                } else if (a.status === 'failed') {
                    dayData.failed++;
                }
            }
        });

        const chartData = Array.from(chartMap.values()).sort((a, b) => a.date.localeCompare(b.date));

        // 5. Retornar resposta formatada
        return NextResponse.json({
            success: true,
            range,
            summary: {
                scheduled: totalScheduled,
                pending,
                processing,
                ready,
                sent,
                skipped,
                failed,
                replied,
                recovered_sales: recoveredSales,
                recovery_rate: recoveryRate
            },
            chart: chartData,
            recent_attempts: processedAttempts.slice(0, 50) // Limite de 50 registros no histórico recente
        });

    } catch (err: any) {
        console.error('[FOLLOWUP_ANALYTICS_ERROR] Erro fatal no GET:', err.message || err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

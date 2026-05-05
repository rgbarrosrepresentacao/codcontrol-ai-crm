import { createClient } from '@supabase/supabase-js';
import { evolutionApi } from '@/lib/evolution';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export class FunnelService {
    /**
     * Executa o fluxo do funil a partir de um nó específico.
     * 
     * @param funnelId       - ID do funil
     * @param startNodeId    - ID do nó de partida (pode ser o nó 'start')
     * @param instanceName   - Nome da instância WhatsApp (Evolution API)
     * @param remoteJid      - Número do destinatário
     * @param contactId      - ID do contato no banco
     * @param userId         - ID do usuário dono do funil
     * @param useHandle      - Handle para ramificações ('default', 'yes', 'no', etc.)
     */
    static async execute(
        funnelId: string,
        startNodeId: string,
        instanceName: string,
        remoteJid: string,
        contactId: string,
        userId: string,
        useHandle: string = 'default'
    ): Promise<void> {
        let currentNodeId: string | null = startNodeId;
        let handle = useHandle;

        console.log(`\n[FUNNEL_ENGINE] ==========================================`);
        console.log(`[FUNNEL_ENGINE] 🚀 START | Funil: ${funnelId}`);
        console.log(`[FUNNEL_ENGINE] 📌 Nó Inicial: ${startNodeId} | Handle: ${handle}`);
        console.log(`[FUNNEL_ENGINE] ==========================================\n`);

        try {
            while (currentNodeId) {
                // ── Passo A: Guarda-chuva — verifica se o funil ainda está ativo ──
                const { data: latestContact } = await supabase
                    .from('contacts')
                    .select('funnel_status, is_funnel_active')
                    .eq('id', contactId)
                    .single();

                if (!latestContact || latestContact.is_funnel_active === false) {
                    console.log(`[FUNNEL_ENGINE] 🛑 Contato desativado externamente. Parando.`);
                    break;
                }

                // ── Passo B: Carrega dados completos do nó atual ──
                const { data: node, error: nodeError } = await supabase
                    .from('funnel_steps')
                    .select('*')
                    .eq('id', currentNodeId)
                    .single();

                if (nodeError || !node) {
                    console.error(`[FUNNEL_ENGINE] ❌ Nó não encontrado: ${currentNodeId}`, nodeError);
                    break;
                }

                console.log(`[FUNNEL_ENGINE] ┌─ Processando: [${node.order_index}] type="${node.node_type}" id="${node.id}"`);

                // ── Passo C: Nó START — não executa nada, apenas avança para o próximo ──
                if (node.node_type === 'start') {
                    console.log(`[FUNNEL_ENGINE] │  ↳ Nó START detectado — buscando próximo nó via edge...`);
                    const nextId = await this.getNextNodeId(funnelId, currentNodeId, handle);
                    console.log(`[FUNNEL_ENGINE] │  ↳ Próximo nó: ${nextId || 'NENHUM'}`);

                    if (!nextId || nextId === currentNodeId) {
                        console.log(`[FUNNEL_ENGINE] └─ Funil sem nós após o START. Encerrando.`);
                        break;
                    }
                    currentNodeId = nextId;
                    continue; // Não aplica delay para o nó start
                }

                // ── Passo D: Nó CONDITION — pausa e aguarda resposta ──
                // Se o handle for 'default', não temos uma resposta ainda → pausa
                if (node.node_type === 'condition' && handle === 'default') {
                    console.log(`[FUNNEL_ENGINE] │  ↳ Nó CONDITION sem handle — PAUSANDO para aguardar resposta.`);
                    await supabase.from('contacts').update({
                        funnel_current_node_id: currentNodeId,
                        funnel_status: 'PAUSADO',
                    }).eq('id', contactId);
                    console.log(`[FUNNEL_ENGINE] └─ Estado salvo: PAUSADO no nó ${currentNodeId}`);
                    break;
                }

                // ── Passo E: Nó DELAY — pausa (cron de followup avança depois) ──
                if (node.node_type === 'delay') {
                    const delaySecs = node.delay_seconds || node.node_data?.delay_seconds || 0;
                    console.log(`[FUNNEL_ENGINE] │  ↳ Nó DELAY (${delaySecs}s) — PAUSANDO.`);
                    await supabase.from('contacts').update({
                        funnel_current_node_id: currentNodeId,
                        funnel_status: 'PAUSADO',
                    }).eq('id', contactId);
                    console.log(`[FUNNEL_ENGINE] └─ Estado salvo: PAUSADO no nó DELAY ${currentNodeId}`);
                    break;
                }

                // ── Passo F: Atualiza estado para EM_ANDAMENTO antes de enviar ──
                await supabase.from('contacts').update({
                    funnel_current_node_id: currentNodeId,
                    funnel_status: 'EM_ANDAMENTO',
                }).eq('id', contactId);

                // ── Passo G: Executa a ação do nó ──
                try {
                    // Grava log de execução do nó (o que está sendo enviado)
                    const logData = {
                        user_id: userId,
                        contact_id: contactId,
                        funnel_id: funnelId,
                        node_id: node.id,
                        node_type: node.node_type,
                        action_executed: node.content || node.node_data?.caption || node.node_data?.text || ''
                    };
                    await supabase.from('funnel_execution_logs').insert(logData);

                    await this.executeNode(node, instanceName, remoteJid);
                } catch (execErr) {
                    console.error(`[FUNNEL_ENGINE] ❌ Erro ao executar nó ${node.id} (${node.node_type}):`, execErr);
                    // Não quebramos o loop — tentamos continuar para o próximo nó
                }

                // ── Passo H: Nó END — finaliza o funil ──
                if (node.node_type === 'end') {
                    console.log(`[FUNNEL_ENGINE] └─ 🏁 Nó END alcançado. Funil FINALIZADO.`);
                    await supabase.from('contacts').update({
                        funnel_status: 'FINALIZADO',
                        is_funnel_active: false,
                    }).eq('id', contactId);
                    break;
                }

                // ── Passo I: wait_for_reply — pausa após envio e aguarda resposta ──
                if (node.wait_for_reply === true) {
                    console.log(`[FUNNEL_ENGINE] │  ↳ wait_for_reply=true — PAUSANDO após envio.`);
                    await supabase.from('contacts').update({
                        funnel_current_node_id: currentNodeId,
                        funnel_status: 'PAUSADO',
                    }).eq('id', contactId);
                    console.log(`[FUNNEL_ENGINE] └─ Estado salvo: PAUSADO no nó ${currentNodeId}`);
                    break;
                }

                // ── Passo J: Busca próximo nó via edges ──
                const nextNodeId = await this.getNextNodeId(funnelId, currentNodeId, handle);
                console.log(`[FUNNEL_ENGINE] │  ↳ Próximo nó via edge: ${nextNodeId || 'NENHUM (fim do fluxo)'}`);

                // Reseta handle após ser consumido uma vez (importante para pós-condição)
                handle = 'default';

                if (!nextNodeId || nextNodeId === currentNodeId) {
                    console.log(`[FUNNEL_ENGINE] └─ Fim do fluxo. Nenhum próximo nó.`);
                    await supabase.from('contacts').update({
                        funnel_status: 'FINALIZADO',
                        is_funnel_active: false,
                    }).eq('id', contactId);
                    break;
                }

                currentNodeId = nextNodeId;

                // Delay entre nós para garantir ordem de entrega na Evolution API
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        } catch (fatalErr) {
            console.error('[FUNNEL_ENGINE] 💀 Erro fatal no loop:', fatalErr);
            // CORREÇÃO: Salva FINALIZADO para não deixar o contato travado em EM_ANDAMENTO
            try {
                await supabase.from('contacts').update({
                    funnel_status: 'FINALIZADO',
                    is_funnel_active: false,
                }).eq('id', contactId);
                console.error('[FUNNEL_ENGINE] 🔒 Status salvo como FINALIZADO após erro fatal.');
            } catch (saveErr) {
                console.error('[FUNNEL_ENGINE] Não foi possível salvar estado após erro fatal:', saveErr);
            }
        }

        console.log(`[FUNNEL_ENGINE] ==========================================`);
        console.log(`[FUNNEL_ENGINE] ✅ Execução finalizada para funil ${funnelId}`);
        console.log(`[FUNNEL_ENGINE] ==========================================\n`);
    }

    /**
     * Encontra o ID do próximo nó a partir dos edges do editor visual.
     * 
     * CORREÇÃO BUG #2: A coluna correta no banco é 'source_handle', não 'condition_value'.
     * Os edges do React Flow salvam o caminho escolhido em 'source_handle' ('yes', 'no', 'default').
     */
    static async getNextNodeId(
        funnelId: string,
        currentNodeId: string,
        handle: string = 'default'
    ): Promise<string | null> {
        // 1. Prioridade: Edges do editor visual (React Flow)
        const { data: edges, error } = await supabase
            .from('funnel_edges')
            .select('source_node_id, target_node_id, source_handle')
            .eq('funnel_id', funnelId)
            .eq('source_node_id', currentNodeId);

        if (error) {
            console.error(`[FUNNEL_ENGINE] ❌ Erro ao buscar edges para nó ${currentNodeId}:`, error);
        }

        console.log(`[FUNNEL_ENGINE]    Edges encontrados para ${currentNodeId}: ${edges?.length || 0}`);

        if (edges && edges.length > 0) {
            // Se há múltiplas saídas (nó de condição com yes/no), tenta casar o handle
            if (handle !== 'default' && edges.length > 1) {
                // CORREÇÃO: usa 'source_handle' (campo real da tabela), não 'condition_value'
                const matchedEdge = edges.find(
                    e => e.source_handle?.toLowerCase() === handle.toLowerCase()
                );
                if (matchedEdge) {
                    console.log(`[FUNNEL_ENGINE]    ✅ Edge com handle "${handle}" encontrado → ${matchedEdge.target_node_id}`);
                    return matchedEdge.target_node_id;
                }
                console.warn(`[FUNNEL_ENGINE]    ⚠️ Nenhum edge com handle "${handle}". Usando o primeiro edge disponível.`);
            }

            // Fallback: pega o primeiro edge (para fluxos lineares ou quando há apenas uma saída)
            console.log(`[FUNNEL_ENGINE]    ↳ Usando primeiro edge → ${edges[0].target_node_id}`);
            return edges[0].target_node_id;
        }

        // 2. Fallback legado: order_index (para funis migrados sem edges)
        console.log(`[FUNNEL_ENGINE]    Sem edges. Tentando fallback por order_index...`);
        const { data: currentStep } = await supabase
            .from('funnel_steps')
            .select('order_index')
            .eq('id', currentNodeId)
            .single();

        if (currentStep) {
            const { data: nextStep } = await supabase
                .from('funnel_steps')
                .select('id, node_type')
                .eq('funnel_id', funnelId)
                .eq('order_index', (currentStep.order_index || 0) + 1)
                .maybeSingle();

            if (nextStep) {
                console.log(`[FUNNEL_ENGINE]    ↳ Fallback order_index → ${nextStep.id} (${nextStep.node_type})`);
                return nextStep.id;
            }
        }

        console.log(`[FUNNEL_ENGINE]    ↳ Nenhum próximo nó encontrado.`);
        return null;
    }

    /**
     * Executa a ação específica de cada tipo de nó.
     * Extração de URL/conteúdo robusta: tenta content, node_data.content, e node_data.url.
     */
    private static async executeNode(node: any, instanceName: string, remoteJid: string): Promise<void> {
        // Extração robusta de conteúdo — cobre todos os formatos salvos pelo editor
        const content: string = node.content || node.node_data?.content || node.node_data?.url || '';
        const caption: string = node.caption || node.node_data?.caption || '';

        console.log(`[FUNNEL_ENGINE]    📤 executeNode type="${node.node_type}" | content_len=${content.length} | caption_len=${caption.length}`);

        if (!content && !caption && !['start', 'end', 'condition', 'delay', 'action'].includes(node.node_type)) {
            console.warn(`[FUNNEL_ENGINE]    ⚠️ Nó "${node.node_type}" sem conteúdo. Pulando envio.`);
            return;
        }

        switch (node.node_type) {
            case 'text': {
                if (!content) break;
                await evolutionApi.sendPresence(instanceName, remoteJid, 'composing');
                await new Promise(r => setTimeout(r, 1000));
                await evolutionApi.sendTextMessage(instanceName, remoteJid, content);
                console.log(`[FUNNEL_ENGINE]    ✅ Texto enviado (${content.length} chars)`);
                break;
            }

            case 'video': {
                if (!content) { console.warn(`[FUNNEL_ENGINE]    ⚠️ Vídeo sem URL.`); break; }

                let videoSent = false;

                // Tentativa 1: formato padrão (Evolution v1 / compatível)
                try {
                    await evolutionApi.sendMedia(instanceName, remoteJid, content, 'video', caption);
                    videoSent = true;
                    console.log(`[FUNNEL_ENGINE]    ✅ Vídeo enviado (formato padrão).`);
                } catch (e1: any) {
                    console.warn(`[FUNNEL_ENGINE]    ⚠️ Formato padrão falhou: ${e1.message}. Tentando formato v2...`);
                }

                // Tentativa 2: formato mediaMessage (Evolution v2)
                if (!videoSent) {
                    try {
                        const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://api.codcontrolpro.bond';
                        const res = await fetch(`${EVOLUTION_URL}/message/sendMedia/${instanceName}`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'apikey': process.env.EVOLUTION_API_KEY || '',
                            },
                            body: JSON.stringify({
                                number: remoteJid,
                                mediaMessage: {
                                    mediatype: 'video',
                                    fileName: 'video.mp4',
                                    caption: caption || '',
                                    media: content,
                                }
                            }),
                        });
                        if (res.ok) {
                            videoSent = true;
                            console.log(`[FUNNEL_ENGINE]    ✅ Vídeo enviado (formato v2 mediaMessage).`);
                        } else {
                            const errBody = await res.text();
                            console.error(`[FUNNEL_ENGINE]    ❌ Formato v2 também falhou (${res.status}):`, errBody);
                        }
                    } catch (e2: any) {
                        console.error(`[FUNNEL_ENGINE]    ❌ Ambos os formatos falharam. Erro:`, e2.message);
                    }
                }

                // Delay extra para vídeos (upload pode demorar na rede do destinatário)
                await new Promise(r => setTimeout(r, 4000));
                break;
            }

            case 'image': {
                if (!content) { console.warn(`[FUNNEL_ENGINE]    ⚠️ Imagem sem URL.`); break; }
                await evolutionApi.sendMedia(instanceName, remoteJid, content, 'image', caption);
                console.log(`[FUNNEL_ENGINE]    ✅ Imagem enviada.`);
                await new Promise(r => setTimeout(r, 1500));
                break;
            }

            case 'audio': {
                if (!content) { console.warn(`[FUNNEL_ENGINE]    ⚠️ Áudio sem URL.`); break; }
                await evolutionApi.sendPresence(instanceName, remoteJid, 'recording');
                await new Promise(r => setTimeout(r, 1000));
                await evolutionApi.sendMedia(instanceName, remoteJid, content, 'audio', '');
                console.log(`[FUNNEL_ENGINE]    ✅ Áudio enviado.`);
                break;
            }

            case 'action': {
                // Nó de ação: envia o caption como mensagem (geralmente contém link)
                const actionMsg = caption || content;
                if (!actionMsg) break;
                await evolutionApi.sendPresence(instanceName, remoteJid, 'composing');
                await new Promise(r => setTimeout(r, 1000));
                await evolutionApi.sendTextMessage(instanceName, remoteJid, actionMsg);
                console.log(`[FUNNEL_ENGINE]    ✅ Action enviado.`);
                break;
            }

            case 'end': {
                if (!content) break;
                await evolutionApi.sendPresence(instanceName, remoteJid, 'composing');
                await new Promise(r => setTimeout(r, 800));
                await evolutionApi.sendTextMessage(instanceName, remoteJid, content);
                console.log(`[FUNNEL_ENGINE]    ✅ Mensagem END enviada.`);
                break;
            }

            // Tipos que não enviam nada (condição e delay são tratados antes de chegar aqui)
            case 'condition':
            case 'delay':
            case 'start':
                break;

            default:
                console.warn(`[FUNNEL_ENGINE]    ⚠️ Tipo de nó desconhecido: "${node.node_type}"`);
        }

        // Delay padrão pós-envio
        await new Promise(r => setTimeout(r, 500));
    }

    /**
     * Gera um resumo comercial e limpo do que aconteceu no funil para a IA
     */
    static async getFunnelSummary(funnelId: string, contactId: string): Promise<string | null> {
        try {
            // Busca os logs reais da última execução deste contato neste funil
            const { data: logs } = await supabase
                .from('funnel_execution_logs')
                .select('*')
                .eq('contact_id', contactId)
                .eq('funnel_id', funnelId)
                .order('created_at', { ascending: true })
                .limit(20);

            if (!logs || logs.length === 0) return null;

            let summary = `Resumo da interação automática (Funil):\n`;
            
            logs.forEach(log => {
                if (log.node_type === 'video' || log.node_type === 'image') {
                    summary += `- Viu um ${log.node_type}.\n`;
                } else if (log.node_type === 'text' && log.action_executed) {
                    // Pega apenas os primeiros 50 caracteres para não poluir
                    const cleanText = log.action_executed.substring(0, 50).replace(/\n/g, ' ');
                    summary += `- Recebeu: "${cleanText}..."\n`;
                }

                if (log.customer_response) {
                    summary += `  ↳ Cliente respondeu: "${log.customer_response}"\n`;
                }

                if (log.ai_decision) {
                    const decision = (log.ai_decision as any).decision;
                    if (decision === 'yes') summary += `  ↳ Demonstrou INTERESSE.\n`;
                    if (decision === 'no') summary += `  ↳ Demonstrou DESINTERESSE.\n`;
                }
            });

            return summary;
        } catch (err) {
            console.error('[FUNNEL_SERVICE] Error generating summary:', err);
            return null;
        }
    }
}

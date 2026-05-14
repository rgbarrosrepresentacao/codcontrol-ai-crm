import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { MessageService } from './messages';
import { evolutionApi } from '@/lib/evolution';


export class FunnelService {
    /**
     * Executa o fluxo do funil a partir de um nó específico.
     */
    static async execute(
        funnelId: string,
        startNodeId: string,
        instanceId: string,
        remoteJid: string,
        contactId: string,
        userId: string,
        useHandle: string = 'default'
    ): Promise<void> {
        const supabase = getSupabaseAdmin();
        let currentNodeId: string | null = startNodeId;
        let handle = useHandle;

        console.log(`\n[FUNNEL_ENGINE] ==========================================`);
        console.log(`[FUNNEL_ENGINE] 🚀 START | Funil: ${funnelId}`);
        console.log(`[FUNNEL_ENGINE] 📌 Nó Inicial: ${startNodeId} | Handle: ${handle}`);
        console.log(`[FUNNEL_ENGINE] ==========================================\n`);

        try {
            while (currentNodeId) {
                // ── Passo A: Verifica se o funil ainda está ativo ──
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

                // ── Passo C: Nó START — avança para o próximo ──
                if (node.node_type === 'start') {
                    const nextId = await this.getNextNodeId(funnelId, currentNodeId, handle);
                    if (!nextId || nextId === currentNodeId) break;
                    currentNodeId = nextId;
                    continue;
                }

                // ── Passo D: Nó CONDITION — pausa e aguarda resposta ──
                if (node.node_type === 'condition' && handle === 'default') {
                    await supabase.from('contacts').update({
                        funnel_current_node_id: currentNodeId,
                        funnel_status: 'PAUSADO',
                    }).eq('id', contactId);
                    break;
                }

                // ── Passo E: Nó DELAY ──
                if (node.node_type === 'delay') {
                    await supabase.from('contacts').update({
                        funnel_current_node_id: currentNodeId,
                        funnel_status: 'PAUSADO',
                    }).eq('id', contactId);
                    break;
                }

                // ── Passo F: Atualiza estado para EM_ANDAMENTO ──
                await supabase.from('contacts').update({
                    funnel_current_node_id: currentNodeId,
                    funnel_status: 'EM_ANDAMENTO',
                    is_funnel_active: true
                }).eq('id', contactId);

                // ── Passo G: Executa a ação do nó ──
                try {
                    const logData = {
                        user_id: userId,
                        contact_id: contactId,
                        funnel_id: funnelId,
                        node_id: node.id,
                        node_type: node.node_type,
                        action_executed: node.content || node.node_data?.caption || node.node_data?.text || ''
                    };
                    await supabase.from('funnel_execution_logs').insert(logData);

                    await this.executeNode(node, instanceId, remoteJid);
                } catch (execErr) {
                    console.error(`[FUNNEL_ENGINE] ❌ Erro ao executar nó ${node.id}:`, execErr);
                }

                // ── Passo H: Nó END ──
                if (node.node_type === 'end') {
                    await supabase.from('contacts').update({
                        funnel_status: 'FINALIZADO',
                        is_funnel_active: false,
                    }).eq('id', contactId);
                    break;
                }

                // ── Passo I: wait_for_reply ──
                if (node.wait_for_reply === true) {
                    await supabase.from('contacts').update({
                        funnel_current_node_id: currentNodeId,
                        funnel_status: 'PAUSADO',
                    }).eq('id', contactId);
                    break;
                }

                // ── Passo J: Busca próximo nó ──
                const nextNodeId = await this.getNextNodeId(funnelId, currentNodeId, handle);
                handle = 'default';

                if (!nextNodeId || nextNodeId === currentNodeId) {
                    await supabase.from('contacts').update({
                        funnel_status: 'FINALIZADO',
                        is_funnel_active: false,
                    }).eq('id', contactId);
                    break;
                }

                currentNodeId = nextNodeId;
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        } catch (fatalErr) {
            console.error('[FUNNEL_ENGINE] 💀 Erro fatal:', fatalErr);
            await supabase.from('contacts').update({ funnel_status: 'FINALIZADO', is_funnel_active: false }).eq('id', contactId);
        }
    }

    /**
     * Encontra o ID do próximo nó
     */
    static async getNextNodeId(funnelId: string, currentNodeId: string, handle: string = 'default'): Promise<string | null> {
        const supabase = getSupabaseAdmin();
        const { data: edges } = await supabase
            .from('funnel_edges')
            .select('target_node_id, source_handle')
            .eq('funnel_id', funnelId)
            .eq('source_node_id', currentNodeId);

        if (edges && edges.length > 0) {
            if (handle !== 'default' && edges.length > 1) {
                const matchedEdge = edges.find(e => e.source_handle?.toLowerCase() === handle.toLowerCase());
                if (matchedEdge) return matchedEdge.target_node_id;
            }
            return edges[0].target_node_id;
        }

        // Fallback legado
        const { data: currentStep } = await supabase.from('funnel_steps').select('order_index').eq('id', currentNodeId).single();
        if (currentStep) {
            const { data: nextStep } = await supabase.from('funnel_steps').select('id').eq('funnel_id', funnelId).eq('order_index', (currentStep.order_index || 0) + 1).maybeSingle();
            if (nextStep) return nextStep.id;
        }
        return null;
    }

    /**
     * Executa a ação do nó via MessageService (Híbrido)
     */
    private static async executeNode(node: any, instanceId: string, remoteJid: string): Promise<void> {
        const content: string = node.content || node.node_data?.content || node.node_data?.url || '';
        const caption: string = node.caption || node.node_data?.caption || '';

        switch (node.node_type) {
            case 'text':
                if (content) await MessageService.send(instanceId, remoteJid, content);
                break;
            case 'video':
                if (content) await MessageService.sendMedia(instanceId, remoteJid, content, 'video', caption);
                break;
            case 'image':
                if (content) await MessageService.sendMedia(instanceId, remoteJid, content, 'image', caption);
                break;
            case 'audio':
                if (content) await MessageService.sendMedia(instanceId, remoteJid, content, 'audio', '');
                break;
            case 'action':
                const actionMsg = caption || content;
                if (actionMsg) await MessageService.send(instanceId, remoteJid, actionMsg);
                break;
            case 'end':
                if (content) await MessageService.send(instanceId, remoteJid, content);
                break;
        }
        await new Promise(r => setTimeout(r, 500));
    }

    /**
     * Resumo comercial para a IA
     */
    static async getFunnelSummary(funnelId: string, contactId: string): Promise<string | null> {
        const supabase = getSupabaseAdmin();
        try {
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
                    summary += `- Recebeu: "${log.action_executed.substring(0, 50)}..."\n`;
                }
                if (log.customer_response) summary += `  ↳ Cliente respondeu: "${log.customer_response}"\n`;
            });
            return summary;
        } catch (err) {
            return null;
        }
    }
}

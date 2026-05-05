import { createClient } from '@supabase/supabase-js';
import { evolutionApi } from '@/lib/evolution';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export class FunnelService {
    /**
     * Executa o fluxo do funil a partir de um nó específico
     */
    static async execute(
        funnelId: string,
        startNodeId: string,
        instanceName: string,
        remoteJid: string,
        contactId: string,
        useHandle: string = 'default'
    ): Promise<void> {
        let currentNodeId: string | null = startNodeId;
        let handle = useHandle;

        while (currentNodeId) {
            const { data: latestContact } = await supabase.from('contacts').select('funnel_status, is_funnel_active').eq('id', contactId).single();
            
            if (latestContact?.funnel_status === 'PAUSADO' && handle === 'default') return;
            if (latestContact?.is_funnel_active === false) return;

            const { data: node } = await supabase.from('funnel_steps').select('*').eq('id', currentNodeId).single() as { data: any };
            if (!node) break;

            console.log(`[FunnelService] Node: ${node.node_type} (${currentNodeId})`);

            await supabase.from('contacts').update({ funnel_current_node_id: currentNodeId, funnel_status: 'EM_ANDAMENTO' }).eq('id', contactId);

            try {
                await this.executeNode(node, instanceName, remoteJid);
            } catch (err) {
                console.error(`[FunnelService] Execution error on ${currentNodeId}:`, err);
            }

            if (node.wait_for_reply || node.node_type === 'condition' && handle === 'default') {
                await supabase.from('contacts').update({ funnel_status: 'PAUSADO', funnel_lock_until: null }).eq('id', contactId);
                return;
            }

            // Busca próximo nó
            const { data: edge } = await supabase
                .from('funnel_edges')
                .select('target_node_id')
                .eq('source_node_id', currentNodeId)
                .eq('source_handle', handle)
                .maybeSingle() as { data: { target_node_id: string } | null };

            handle = 'default';

            if (edge?.target_node_id) {
                currentNodeId = edge.target_node_id;
            } else {
                const { data: nextStep } = await supabase
                    .from('funnel_steps')
                    .select('id')
                    .eq('funnel_id', funnelId)
                    .eq('order_index', (node.order_index || 0) + 1)
                    .maybeSingle();
                currentNodeId = nextStep?.id || null;
            }

            if (!currentNodeId) {
                await supabase.from('contacts').update({ funnel_status: 'FINALIZADO', is_funnel_active: false }).eq('id', contactId);
            }
        }
    }

    private static async executeNode(node: any, instanceName: string, remoteJid: string) {
        if (node.node_type === 'delay') {
            const secs = node.node_data?.delay_seconds || node.delay_seconds || 5;
            await new Promise(r => setTimeout(r, secs * 1000));
        } else if (node.node_type === 'text') {
            await evolutionApi.sendPresence(instanceName, remoteJid, 'composing');
            const content = node.content || node.node_data?.content || '';
            if (content) await evolutionApi.sendTextMessage(instanceName, remoteJid, content);
        } else if (node.node_type === 'audio') {
            await evolutionApi.sendPresence(instanceName, remoteJid, 'recording');
            const url = node.content || node.node_data?.content || '';
            if (url) await evolutionApi.sendMedia(instanceName, remoteJid, url, 'audio');
        } else if (node.node_type === 'image') {
            const url = node.content || node.node_data?.content || '';
            if (url) await evolutionApi.sendMedia(instanceName, remoteJid, url, 'image', node.node_data?.caption || '');
        } else if (node.node_type === 'end') {
             const msg = node.content || node.node_data?.content || '';
             if (msg) await evolutionApi.sendTextMessage(instanceName, remoteJid, msg);
        }
        await new Promise(r => setTimeout(r, 1500));
    }
}

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { MessageService } from './messages';
import { evolutionApi } from '@/lib/evolution';

export class KnowledgeService {
    /**
     * Busca mídias cadastradas e monta o contexto para a IA
     */
    static async buildContext(userId: string, campaignId: string | null): Promise<{ context: string; items: any[] }> {
        const supabase = getSupabaseAdmin();
        try {
            // Busca todas as mídias do usuário para filtrar de forma inteligente
            const { data: allItems } = await supabase
                .from('ai_knowledge')
                .select('id, name, description, media_url, media_type, campaign_id')
                .eq('user_id', userId);

            if (!allItems || allItems.length === 0) return { context: '', items: [] };

            let items = [];
            if (campaignId) {
                // Prioridade 1: Mídias da Campanha Específica
                const campaignItems = allItems.filter(i => i.campaign_id === campaignId);
                
                // Se houver mídias da campanha, usamos apenas elas para evitar confusão
                // Se não houver, usamos as mídias globais como fallback
                items = campaignItems.length > 0 
                    ? campaignItems 
                    : allItems.filter(i => !i.campaign_id);
            } else {
                // Sem campanha: Usamos apenas mídias globais
                items = allItems.filter(i => !i.campaign_id);
            }

            if (!items || items.length === 0) return { context: '', items: [] };

            const context = `
── MÍDIAS DISPONÍVEIS (USE COM SABEDORIA) ──
Instrução: Se o cliente pedir um arquivo, foto, vídeo ou se for o momento ideal para mostrar o produto, envie o comando [SEND_MEDIA:ID] no final da sua mensagem.
Mídias:
${items.map(k => `- ID:${k.id} | Tipo:${k.media_type} | Nome:"${k.name}" | Descrição: "${k.description}"`).join('\n')}
`;

            return { context, items };
        } catch (err) {
            console.error('[KnowledgeService] Error building context:', err);
            return { context: '', items: [] };
        }
    }

    /**
     * Detecta se a IA enviou um gatilho de mídia e limpa a resposta
     */
    static detectMediaTrigger(reply: string, items: any[]): { item: any | null; cleanReply: string } {
        const mediaTagMatch = reply.match(/\[SEND_MEDIA:([a-zA-Z0-9\-]+)\]/);
        if (mediaTagMatch) {
            const mediaId = mediaTagMatch[1];
            const item = items.find(k => k.id === mediaId) || null;
            const cleanReply = reply.replace(/\s*\[SEND_MEDIA:[a-zA-Z0-9\-]+\]/g, '').trim();
            return { item, cleanReply };
        }
        return { item: null, cleanReply: reply };
    }

    /**
     * Envia a mídia via MessageService (Híbrido) e salva no banco
     */
    static async sendMedia(
        instanceId: string,
        remoteJid: string,
        item: any,
        userId: string,
        conversationId: string,
        contactId: string
    ) {
        const supabase = getSupabaseAdmin();
        try {
            // Pequeno delay para parecer que a vendedora está buscando o arquivo
            await new Promise(r => setTimeout(r, 1500));
            
            const mType = item.media_type as 'image' | 'video' | 'document' | 'audio';
            await MessageService.sendMedia(instanceId, remoteJid, item.media_url, mType);
            
            console.log(`[Knowledge] ✅ Mídia enviada: ${item.name}`);

            // Salva o registro da mídia no histórico para evitar repetições
            await supabase.from('messages').insert({
                user_id: userId,
                conversation_id: conversationId,
                instance_id: instanceId,
                contact_id: contactId,
                from_me: true,
                content: `[MÍDIA ENVIADA: ${item.id} | ${item.name}]`,
                type: mType,
                ai_generated: true,
                status: 'sent'
            });

            return true;
        } catch (err) {
            console.error('[Knowledge] ❌ Erro ao enviar mídia:', err);
            return false;
        }
    }
}

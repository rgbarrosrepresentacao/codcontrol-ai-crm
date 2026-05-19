import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { evolutionApi } from '@/lib/evolution';
import { MetaProvider } from './MetaProvider';

export class MessageService {
    /**
     * Salva uma mensagem no histórico
     */
    static async save(data: {
        user_id: string;
        conversation_id: string;
        instance_id: string;
        contact_id: string;
        message_id?: string;
        from_me: boolean;
        content: string;
        type: 'text' | 'audio' | 'image' | 'video' | 'document';
        ai_generated?: boolean;
        payload?: any;
    }) {
        const supabase = getSupabaseAdmin();
        await supabase.from('messages').insert({
            ...data,
            status: data.from_me ? 'sent' : 'delivered'
        });

        if (data.from_me) {
            await supabase.rpc('increment_messages_sent', { instance_id_param: data.instance_id });
        } else {
            await supabase.rpc('increment_messages_received', { instance_id_param: data.instance_id });
        }

        await supabase.from('conversations').update({ 
            last_message: data.content,
            last_message_at: new Date().toISOString()
        }).eq('id', data.conversation_id);

        // Se a mensagem for do contato, incrementa contador de não lidas
        if (!data.from_me) {
            await supabase.rpc('increment_unread_count', { conv_id: data.conversation_id });
        }
    }

    /**
     * Caso contrário (Meta ou Evolution Padrão), faz fallback pro comportamento antigo (URL)
     */
    static async sendAudio(instanceId: string, remoteJid: string, mediaUrl: string, base64Data?: string): Promise<{ success: boolean, messageId?: string, error?: string }> {
        const supabase = getSupabaseAdmin();
        const { data: instance, error } = await supabase
            .from('whatsapp_instances')
            .select('instance_name, provider_type, meta_config, meta_access_token_encrypted')
            .eq('id', instanceId)
            .single();

        if (error || !instance) {
            console.error(`[MessageService.sendAudio] Instância ${instanceId} não encontrada:`, error);
            return { success: false, error: 'Instância não encontrada' };
        }

        if (instance.provider_type === 'META') {
            try {
                // Para Meta, precisamos de uma URL pública.
                let audioUrl = mediaUrl;
                
                if (!audioUrl.startsWith('http') && audioUrl.length > 500) { 
                    const fileName = `temp-audios/${Date.now()}-${Math.random().toString(36).substring(7)}.ogg`;
                    const buffer = Buffer.from(audioUrl, 'base64');
                    
                    const { error: uploadError } = await supabase.storage
                        .from('funnel-assets')
                        .upload(fileName, buffer, { contentType: 'audio/ogg' });

                    if (uploadError) throw uploadError;

                    const { data: { publicUrl } } = supabase.storage
                        .from('funnel-assets')
                        .getPublicUrl(fileName);
                    
                    audioUrl = publicUrl;
                }

                const provider = new MetaProvider(instance.meta_config as any, instance.meta_access_token_encrypted || '');
                const result = await provider.sendMedia(remoteJid, { link: audioUrl }, 'audio');
                return { success: result.success, messageId: result.message_id, error: result.error };
            } catch (err) {
                console.error('[MessageService.sendAudio] Erro ao processar áudio para Meta:', err);
                return { success: false, error: 'Erro no envio via Meta' };
            }
        } else {
            if (instance.provider_type === 'EVOLUTION' && base64Data) {
                console.log(`[EVOLUTION_SEND] Enviando áudio em base64 direto pela Evolution. Instance: ${instance.instance_name} | To: ${remoteJid}`);
                const result = await evolutionApi.sendWhatsAppAudio(instance.instance_name, remoteJid, base64Data);
                console.log(`[EVOLUTION_RESPONSE] Recebido resposta da Evolution (Áudio). MessageID: ${result?.key?.id}`);
                return { success: true, messageId: result?.key?.id };
            } else {
                console.log(`[PROVIDER_ROUTER] Fallback sendAudio -> sendMedia (URL)`);
                return await this.sendMedia(instanceId, remoteJid, mediaUrl, 'audio');
            }
        }
    }

    /**
     * Envia mídia via provedor correto
     */
    static async sendMedia(instanceId: string, remoteJid: string, url: string, type: 'image' | 'video' | 'audio' | 'document', caption?: string): Promise<{ success: boolean, messageId?: string, error?: string }> {
        const supabase = getSupabaseAdmin();
        const { data: instance, error } = await supabase
            .from('whatsapp_instances')
            .select('instance_name, provider_type, meta_config, meta_access_token_encrypted')
            .eq('id', instanceId)
            .single();

        if (error || !instance) {
            console.error(`[MessageService.sendMedia] Instância ${instanceId} não encontrada:`, error);
            return { success: false, error: 'Instância não encontrada' };
        }

        if (instance.provider_type === 'META') {
            // Validações defensivas para evitar falhas silenciosas
            const metaConfig = instance.meta_config as any;
            if (!metaConfig || !metaConfig.phone_number_id) {
                console.error(`[MessageService.sendMedia] ❌ META: meta_config ausente ou sem phone_number_id para instância ${instanceId}`);
                return { success: false, error: 'Configuração da Meta incompleta' };
            }
            if (!instance.meta_access_token_encrypted) {
                console.error(`[MessageService.sendMedia] ❌ META: meta_access_token_encrypted ausente para instância ${instanceId}`);
                return { success: false, error: 'Token da Meta ausente' };
            }

            console.log(`[MessageService.sendMedia] 📤 META: Enviando ${type} para ${remoteJid} | URL: ${url.slice(0, 80)}...`);
            
            try {
                const provider = new MetaProvider(metaConfig, instance.meta_access_token_encrypted);
                const result = await provider.sendMedia(remoteJid, { link: url }, type, caption);
                if (!result.success) {
                    console.error(`[MessageService.sendMedia] ❌ META: Erro no envio de ${type}:`, result.error);
                } else {
                    console.log(`[MessageService.sendMedia] ✅ META: ${type} enviado com sucesso. ID: ${result.message_id}`);
                }
                return { success: result.success, messageId: result.message_id, error: result.error };
            } catch (decryptErr: any) {
                console.error(`[MessageService.sendMedia] ❌ META: Erro ao descriptografar token:`, decryptErr);
                return { success: false, error: decryptErr.message };
            }
        } else {
            console.log(`[EVOLUTION_SEND] Enviando mídia/áudio via Evolution. Instance: ${instance.instance_name} | To: ${remoteJid}`);
            const result = await evolutionApi.sendMedia(instance.instance_name, remoteJid, url, type, caption);
            console.log(`[EVOLUTION_RESPONSE] Recebido resposta da Evolution para Mídia. MessageID: ${result?.key?.id}`);
            return { success: true, messageId: result?.key?.id };
        }
        return { success: false };
    }

    /**
     * Envia mensagem via provedor correto (Evolution ou Meta)
     * C3: Falhas de envio agora são tratadas explicitamente com log e marcação do contato.
     * C2 básico: Erro 131047 (janela 24h fechada) é identificado e registrado separadamente.
     */
    static async send(instanceId: string, remoteJid: string, text: string, contactId?: string): Promise<{ success: boolean, messageId?: string, error?: string }> {
        const supabase = getSupabaseAdmin();
        // Busca info da instância para saber o provedor
        const { data: instance, error } = await supabase
            .from('whatsapp_instances')
            .select('instance_name, provider_type, meta_config, meta_access_token_encrypted')
            .eq('id', instanceId)
            .single();

        if (error || !instance) {
            console.error(`[MessageService.send] Instância ${instanceId} não encontrada:`, error);
            return { success: false, error: 'Instância não encontrada' };
        }

        if (instance.provider_type === 'META') {
            const provider = new MetaProvider(instance.meta_config as any, instance.meta_access_token_encrypted || '');
            const result = await provider.sendText(remoteJid, text);

            if (!result.success) {
                // C2 básico: Detectar erro de janela de 24h da Meta
                const is24hWindowClosed = result.error?.includes('131047') || result.error?.includes('24') || false;

                if (is24hWindowClosed) {
                    console.error(`[MessageService.send] ⛔ [META 131047] Janela de 24h fechada para ${remoteJid}. Mensagem NÃO enviada. Template necessário.`);
                } else {
                    console.error(`[MessageService.send] ❌ [META] Falha ao enviar para ${remoteJid}:`, result.error);
                }

                // C3: Marcar contato como "atenção necessária" se tivermos o contactId
                if (contactId) {
                    await supabase
                        .from('contacts')
                        .update({
                            ai_tag: 'ATENCAO',
                            notes: is24hWindowClosed
                                ? `[${new Date().toLocaleString('pt-BR')}] ⛔ Meta: Janela 24h fechada. Requer template para retomada.`
                                : `[${new Date().toLocaleString('pt-BR')}] ❌ Meta: Falha de envio — ${result.error}`
                        })
                        .eq('id', contactId);
                    console.warn(`[MessageService.send] 🏷️ Contato ${contactId} marcado como ATENCAO.`);
                }
            }
            return { success: result.success, messageId: result.message_id, error: result.error };
        } else {
            // Evolution API usa o nome da instância
            console.log(`[EVOLUTION_SEND] Enviando via Evolution pela IA/API. Instance: ${instance.instance_name} | To: ${remoteJid}`);
            const result = await evolutionApi.sendTextMessage(instance.instance_name, remoteJid, text);
            console.log(`[EVOLUTION_RESPONSE] Recebido resposta da Evolution. MessageID: ${result?.key?.id}`);
            return { success: true, messageId: result?.key?.id };
        }
    }
}


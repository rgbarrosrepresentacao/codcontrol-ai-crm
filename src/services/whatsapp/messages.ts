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
     * Envia áudio (Base64 ou URL) via provedor correto
     */
    static async sendAudio(instanceId: string, remoteJid: string, audioData: string) {
        const supabase = getSupabaseAdmin();
        const { data: instance, error } = await supabase
            .from('whatsapp_instances')
            .select('instance_name, provider_type, meta_config, meta_access_token_encrypted')
            .eq('id', instanceId)
            .single();

        if (error || !instance) {
            console.error(`[MessageService.sendAudio] Instância ${instanceId} não encontrada:`, error);
            return;
        }

        if (instance.provider_type === 'META') {
            try {
                // Para Meta, precisamos de uma URL pública.
                // Se recebemos Base64, fazemos upload temporário para o Supabase Storage.
                let audioUrl = audioData;
                
                if (audioData.length > 500) { // Provavelmente é Base64
                    const fileName = `temp-audios/${Date.now()}-${Math.random().toString(36).substring(7)}.ogg`;
                    const buffer = Buffer.from(audioData, 'base64');
                    
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
                await provider.sendMedia(remoteJid, { link: audioUrl }, 'audio');
            } catch (err) {
                console.error('[MessageService.sendAudio] Erro ao processar áudio para Meta:', err);
            }
        } else {
            // Para Evolution, enviamos o Base64 direto (ou URL se for o caso)
            await evolutionApi.sendWhatsAppAudio(instance.instance_name, remoteJid, audioData);
        }
    }

    /**
     * Envia mídia via provedor correto
     */
    static async sendMedia(instanceId: string, remoteJid: string, url: string, type: 'image' | 'video' | 'audio' | 'document', caption?: string) {
        const supabase = getSupabaseAdmin();
        const { data: instance, error } = await supabase
            .from('whatsapp_instances')
            .select('instance_name, provider_type, meta_config, meta_access_token_encrypted')
            .eq('id', instanceId)
            .single();

        if (error || !instance) {
            console.error(`[MessageService.sendMedia] Instância ${instanceId} não encontrada:`, error);
            return;
        }

        if (instance.provider_type === 'META') {
            // Validações defensivas para evitar falhas silenciosas
            const metaConfig = instance.meta_config as any;
            if (!metaConfig || !metaConfig.phone_number_id) {
                console.error(`[MessageService.sendMedia] ❌ META: meta_config ausente ou sem phone_number_id para instância ${instanceId}`);
                return;
            }
            if (!instance.meta_access_token_encrypted) {
                console.error(`[MessageService.sendMedia] ❌ META: meta_access_token_encrypted ausente para instância ${instanceId}`);
                return;
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
            } catch (decryptErr) {
                console.error(`[MessageService.sendMedia] ❌ META: Erro ao descriptografar token:`, decryptErr);
            }
        } else {
            await evolutionApi.sendMedia(instance.instance_name, remoteJid, url, type, caption);
        }
    }

    /**
     * Envia mensagem via provedor correto (Evolution ou Meta)
     * C3: Falhas de envio agora são tratadas explicitamente com log e marcação do contato.
     * C2 básico: Erro 131047 (janela 24h fechada) é identificado e registrado separadamente.
     */
    static async send(instanceId: string, remoteJid: string, text: string, contactId?: string) {
        const supabase = getSupabaseAdmin();
        // Busca info da instância para saber o provedor
        const { data: instance, error } = await supabase
            .from('whatsapp_instances')
            .select('instance_name, provider_type, meta_config, meta_access_token_encrypted')
            .eq('id', instanceId)
            .single();

        if (error || !instance) {
            console.error(`[MessageService.send] Instância ${instanceId} não encontrada:`, error);
            return;
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
        } else {
            // Evolution API usa o nome da instância
            await evolutionApi.sendTextMessage(instance.instance_name, remoteJid, text);
        }
    }
}


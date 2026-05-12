import { createClient } from '@supabase/supabase-js';
import { evolutionApi } from '@/lib/evolution';
import { MetaProvider } from './MetaProvider';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

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
    }

    /**
     * Envia áudio (Base64 ou URL) via provedor correto
     */
    static async sendAudio(instanceId: string, remoteJid: string, audioData: string) {
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
                    const fileName = `temp-audios/${Date.now()}-${Math.random().toString(36).substring(7)}.mp3`;
                    const buffer = Buffer.from(audioData, 'base64');
                    
                    const { error: uploadError } = await supabase.storage
                        .from('funnel-assets')
                        .upload(fileName, buffer, { contentType: 'audio/mpeg' });

                    if (uploadError) throw uploadError;

                    const { data: { publicUrl } } = supabase.storage
                        .from('funnel-assets')
                        .getPublicUrl(fileName);
                    
                    audioUrl = publicUrl;
                }

                const provider = new MetaProvider(instance.meta_config as any, instance.meta_access_token_encrypted || '');
                await provider.sendMedia(remoteJid, audioUrl, 'audio');
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
            const provider = new MetaProvider(instance.meta_config as any, instance.meta_access_token_encrypted || '');
            const result = await provider.sendMedia(remoteJid, url, type, caption);
            if (!result.success) {
                console.error(`[MessageService.sendMedia] Erro no envio via Meta (${type}):`, result.error);
            }
        } else {
            await evolutionApi.sendMedia(instance.instance_name, remoteJid, url, type, caption);
        }
    }

    /**
     * Envia mensagem via provedor correto (Evolution ou Meta)
     */
    static async send(instanceId: string, remoteJid: string, text: string) {
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
                console.error('[MessageService.send] Erro no envio via Meta:', result.error);
            }
        } else {
            // Evolution API usa o nome da instância
            await evolutionApi.sendTextMessage(instance.instance_name, remoteJid, text);
        }
    }
}

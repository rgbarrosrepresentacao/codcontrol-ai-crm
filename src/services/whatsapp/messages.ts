import { createClient } from '@supabase/supabase-js';
import { evolutionApi } from '@/lib/evolution';

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
     * Envia mensagem via Evolution API
     */
    static async send(instanceName: string, remoteJid: string, text: string) {
        await evolutionApi.sendTextMessage(instanceName, remoteJid, text);
    }
}

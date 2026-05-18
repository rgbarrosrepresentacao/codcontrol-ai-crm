import { evolutionApi } from '@/lib/evolution';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import crypto from 'crypto';

export class ProcessorService {
    /**
     * Extrai o conteúdo de texto de uma mensagem (incluindo áudio e visão)
     */
    static async extractMessageContent(body: any, instanceName: string, openaiKey: string | null): Promise<{ text: string | null, audioUrl?: string } | null> {
        const messageData = body.data?.message;
        if (!messageData) return null;

        // 1. Texto Direto
        let text = messageData.conversation || messageData.extendedTextMessage?.text || messageData.imageMessage?.caption;
        let audioUrl: string | undefined;

        // 2. Transcrição de Áudio
        if (!text && messageData.audioMessage && openaiKey) {
            const result = await this.transcribeAudio(body, instanceName, openaiKey);
            text = result?.text;
            audioUrl = result?.audioUrl;
        }

        // 3. Vision (Análise de Imagem)
        if (!text && messageData.imageMessage && openaiKey) {
            text = await this.analyzeImage(body, instanceName, openaiKey);
        }

        // 4. Fallbacks de Status
        if (!text) {
            if (messageData.audioMessage) text = '[Áudio]';
            else if (messageData.imageMessage) text = '[Imagem]';
            else if (messageData.videoMessage) text = '[Vídeo]';
            else if (messageData.stickerMessage) text = '[Figurinha]';
            else if (messageData.documentMessage) text = '[Documento]';
            else if (messageData.contactMessage || messageData.contactsArrayMessage) text = '[Contato]';
            else if (messageData.locationMessage) text = '[Localização]';
        }

        return { text: text || null, audioUrl };
    }

    private static async transcribeAudio(body: any, instanceName: string, openaiKey: string): Promise<{ text: string | null, audioUrl?: string } | null> {
        try {
            const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://api.codcontrolpro.bond';
            const mediaRes = await fetch(`${EVOLUTION_URL}/chat/getBase64FromMediaMessage/${instanceName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': process.env.EVOLUTION_API_KEY || '' },
                body: JSON.stringify({ message: body.data, convertToMp4: false })
            });

            if (!mediaRes.ok) return null;
            const mediaData = await mediaRes.json();
            const base64Audio = mediaData.base64 || mediaData.base64Data || mediaData.data;
            if (!base64Audio) return null;

            const audioBuffer = Buffer.from(base64Audio, 'base64');
            
            // Upload para Supabase Storage
            const supabase = getSupabaseAdmin();
            const fileName = `received-audios/${instanceName}/${crypto.randomUUID()}.ogg`;
            const { error: uploadError } = await supabase.storage
                .from('chat-media')
                .upload(fileName, audioBuffer, { contentType: 'audio/ogg' });

            let audioUrl = '';
            if (!uploadError) {
                const { data: { publicUrl } } = supabase.storage
                    .from('chat-media')
                    .getPublicUrl(fileName);
                audioUrl = publicUrl;
            } else {
                console.error('[ProcessorService] Storage upload error:', uploadError);
            }

            const formData = new FormData();
            formData.append('file', new File([audioBuffer as any], 'audio.ogg', { type: 'audio/ogg' }));
            formData.append('model', 'whisper-1');
            formData.append('language', 'pt');

            const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${openaiKey}` },
                body: formData
            });

            if (whisperRes.ok) {
                const whisperData = await whisperRes.json();
                return { text: whisperData.text, audioUrl };
            }
        } catch (err) {
            console.error('[ProcessorService] Audio error:', err);
        }
        return null;
    }

    private static async analyzeImage(body: any, instanceName: string, openaiKey: string): Promise<string | null> {
        try {
            const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://api.codcontrolpro.bond';
            const mediaRes = await fetch(`${EVOLUTION_URL}/chat/getBase64FromMediaMessage/${instanceName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': process.env.EVOLUTION_API_KEY || '' },
                body: JSON.stringify({ message: body.data, convertToMp4: false })
            });

            if (!mediaRes.ok) return null;
            const mediaData = await mediaRes.json();
            const base64Image = mediaData.base64 || mediaData.base64Data || mediaData.data;
            if (!base64Image) return null;

            const visionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: 'Você é um assistente de extração de dados. Extraia: Nome, CPF, Endereço e CEP.' },
                        { role: 'user', content: [{ type: 'text', text: 'Extraia os dados:' }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } }] }
                    ],
                    max_tokens: 300
                })
            });

            if (visionResponse.ok) {
                const visionData = await visionResponse.json();
                return `[VISION: ${visionData.choices[0].message.content}]`;
            }
        } catch (err) {
            console.error('[ProcessorService] Vision error:', err);
        }
        return null;
    }
}

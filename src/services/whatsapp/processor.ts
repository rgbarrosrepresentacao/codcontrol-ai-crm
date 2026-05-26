import { evolutionApi } from '@/lib/evolution';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import crypto from 'crypto';
import { validateMediaBuffer, sanitizeStoragePath } from '@/lib/media-validator';

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
            let audioBuffer: Buffer;
            let audioUrl = body.metaAudioUrl || body.data?.message?.audioMessage?.url || '';

            if (body.provider === 'meta' && audioUrl) {
                console.log(`[ProcessorService] [META_AUDIO] Baixando áudio para transcrição: ${audioUrl}`);
                const audioRes = await fetch(audioUrl);
                if (!audioRes.ok) throw new Error(`Falha ao baixar áudio da URL: ${audioUrl}`);
                audioBuffer = Buffer.from(await audioRes.arrayBuffer());
            } else {
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

                audioBuffer = Buffer.from(base64Audio, 'base64');
            }

            // ── Validação de tamanho do áudio recebido ──
            const audioValidation = validateMediaBuffer(audioBuffer, 'audio/ogg', 'audio', `processor/${instanceName}`);
            if (!audioValidation.valid) {
                console.warn(`[MEDIA_REJECTED] [processor/${instanceName}] Áudio recebido rejeitado: ${audioValidation.error}`);
                return { text: '[Audio muito grande para transcrever]', audioUrl: undefined };
            }

            if (body.provider !== 'meta' || !audioUrl) {
                // Upload para Supabase Storage com path sanitizado
                const supabase = getSupabaseAdmin();
                const fileName = sanitizeStoragePath('audio', 'audio/ogg', `received-audios/${instanceName}`);
                const { error: uploadError } = await supabase.storage
                    .from('chat-media')
                    .upload(fileName, audioBuffer, { contentType: 'audio/ogg' });

                if (!uploadError) {
                    const { data: { publicUrl } } = supabase.storage
                        .from('chat-media')
                        .getPublicUrl(fileName);
                    audioUrl = publicUrl;
                    console.log(`[MEDIA_UPLOAD_DONE] [processor/${instanceName}] audio=${publicUrl}`);
                } else {
                    console.error('[ProcessorService] Storage upload error:', uploadError);
                }
            }

            const formData = new FormData();
            formData.append('file', new File([audioBuffer as any], 'audio.ogg', { type: 'audio/ogg' }));
            formData.append('model', 'whisper-1');
            formData.append('language', 'pt');

            const whisperRes = await this.fetchWithTimeout('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${openaiKey}` },
                body: formData
            }, 45000); // 45s timeout

            if (whisperRes.ok) {
                const whisperData = await whisperRes.json();
                return { text: whisperData.text, audioUrl };
            } else {
                const errText = await whisperRes.text();
                console.error('[ProcessorService] Whisper error response:', errText);
            }
        } catch (err: any) {
            if (err?.message === 'OPENAI_TIMEOUT') {
                console.error('[ProcessorService] [OPENAI_TIMEOUT] Whisper request timed out.');
            }
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

            // ── Validação de tamanho de imagem recebida ──
            // Estima tamanho do buffer: base64 aumenta tamanho em ~33%
            const estimatedBytes = Math.ceil(base64Image.length * 0.75);
            const imageValidation = validateMediaBuffer(
                Buffer.alloc(estimatedBytes), // buffer falso só para checar tamanho
                'image/jpeg',
                'image',
                `vision/${instanceName}`
            );
            // Substitui por verificação direta de tamanho
            const IMG_LIMIT = 10 * 1024 * 1024; // 10 MB
            if (estimatedBytes > IMG_LIMIT) {
                console.warn(`[MEDIA_REJECTED] [vision/${instanceName}] Imagem muito grande (${(estimatedBytes / 1024 / 1024).toFixed(1)} MB) para Vision. Pulando.`);
                return '[Imagem muito grande para análise]';
            }

            const visionResponse = await this.fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
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
            }, 30000); // 30s timeout

            if (visionResponse.ok) {
                const visionData = await visionResponse.json();
                return `[VISION: ${visionData.choices[0].message.content}]`;
            }
        } catch (err: any) {
            if (err?.message === 'OPENAI_TIMEOUT') {
                console.error('[ProcessorService] [OPENAI_TIMEOUT] Vision request timed out.');
            }
            console.error('[ProcessorService] Vision error:', err);
        }
        return null;
    }

    private static async fetchWithTimeout(url: string, options: any, timeoutMs: number): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            return response;
        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.error(`[OPENAI_TIMEOUT] Request to ${url} timed out after ${timeoutMs}ms`);
                throw new Error('OPENAI_TIMEOUT');
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }
}

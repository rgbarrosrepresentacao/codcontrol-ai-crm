// Evolution API client

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://api.codcontrolpro.bond'
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || ''

const headers = {
    'Content-Type': 'application/json',
    'apikey': EVOLUTION_KEY,
}

export const evolutionApi = {
    async createInstance(instanceName: string) {
        const res = await fetch(`${EVOLUTION_URL}/instance/create`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                instanceName,
                qrcode: true,
                integration: 'WHATSAPP-BAILEYS',
                reject_call: false,
                groups_ignore: false,
                always_online: false,
                read_messages: false,
                read_status: false,
                syncFullHistory: false,
            }),
        })
        if (!res.ok) throw new Error(`Failed to create instance: ${res.statusText}`)
        return res.json()
    },

    async getQrCode(instanceName: string) {
        const res = await fetch(`${EVOLUTION_URL}/instance/connect/${instanceName}`, {
            method: 'GET',
            headers,
        })
        if (!res.ok) throw new Error(`Failed to get QR code: ${res.statusText}`)
        return res.json()
    },

    async getInstanceStatus(instanceName: string) {
        const res = await fetch(`${EVOLUTION_URL}/instance/connectionState/${instanceName}`, {
            method: 'GET',
            headers,
        })
        if (!res.ok) return { instance: { state: 'close' } }
        return res.json()
    },

    async setWebhook(instanceName: string, webhookUrl: string) {
        const res = await fetch(`${EVOLUTION_URL}/webhook/set/${instanceName}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                webhook: {
                    enabled: true,
                    url: webhookUrl,
                    webhookByEvents: true,
                    webhookBase64: true,
                    events: [
                        'MESSAGES_UPSERT',
                        'MESSAGES_UPDATE',
                        'CONNECTION_UPDATE',
                        'SEND_MESSAGE',
                        'CONTACTS_UPSERT',
                    ],
                },
            }),
        })
        if (!res.ok) throw new Error(`Failed to set webhook: ${res.statusText}`)
        return res.json()
    },

    async deleteInstance(instanceName: string) {
        const res = await fetch(`${EVOLUTION_URL}/instance/delete/${instanceName}`, {
            method: 'DELETE',
            headers,
        })
        if (!res.ok) throw new Error(`Failed to delete instance: ${res.statusText}`)
        return res.json()
    },

    async logout(instanceName: string) {
        const res = await fetch(`${EVOLUTION_URL}/instance/logout/${instanceName}`, {
            method: 'DELETE',
            headers,
        })
        if (!res.ok) throw new Error(`Failed to logout: ${res.statusText}`)
        return res.json()
    },

    async sendTextMessage(instanceName: string, to: string, text: string) {
        const res = await fetch(`${EVOLUTION_URL}/message/sendText/${instanceName}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                number: to,
                text,
            }),
        })
        if (!res.ok) throw new Error(`Failed to send message: ${res.statusText}`)
        return res.json()
    },

    async sendPresence(instanceName: string, to: string, presence: 'composing' | 'recording' | 'available' | 'unavailable' = 'composing') {
        const res = await fetch(`${EVOLUTION_URL}/chat/sendPresence/${instanceName}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                number: to,
                delay: 1200,
                presence,
            }),
        })
        if (!res.ok) {
            console.error(`Failed to send presence: ${res.statusText}`)
            return null
        }
        return res.json()
    },

    async sendWhatsAppAudio(instanceName: string, to: string, audioBase64: string) {
        const res = await fetch(`${EVOLUTION_URL}/message/sendWhatsAppAudio/${instanceName}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                number: to,
                audio: audioBase64,
                delay: 1500,
            }),
        })
        if (!res.ok) throw new Error(`Failed to send audio: ${res.statusText}`)
        return res.json()
    },

    async sendMedia(instanceName: string, to: string, mediaUrl: string, mediaType: 'audio' | 'video' | 'image' | 'document', caption?: string, ptt: boolean = false) {
        // Monta payload limpo
        const payload: any = {
            number: to,
            media: mediaUrl,
            mediatype: mediaType,
            caption: caption || '',
        };

        if (mediaType === 'audio' && ptt) {
            payload.ptt = true;
        }

        console.log(`[EVOLUTION_API] sendMedia → ${instanceName} | type=${mediaType} | to=${to}`);
        console.log(`[EVOLUTION_API] URL: ${mediaUrl.substring(0, 80)}...`);

        const res = await fetch(`${EVOLUTION_URL}/message/sendMedia/${instanceName}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const errorText = await res.text();
            console.error(`[EVOLUTION_API] ❌ sendMedia FALHOU (${res.status}) para ${to}:`, errorText);
            throw new Error(`sendMedia failed [${res.status}]: ${errorText}`);
        }

        const result = await res.json();
        console.log(`[EVOLUTION_API] ✅ sendMedia OK → key.id=${result?.key?.id || 'unknown'}`);
        return result;
    },

    async fetchInstances() {
        const res = await fetch(`${EVOLUTION_URL}/instance/fetchInstances`, {
            method: 'GET',
            headers,
        })
        if (!res.ok) throw new Error(`Failed to fetch instances: ${res.statusText}`)
        return res.json()
    },
}

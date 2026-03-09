// Evolution API client

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://api.codcontrolpro.bond'
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || 'fNJvOh3c3wiNlzEuHbH2BegImGcbW8J7'

const headers = {
    'Content-Type': 'application/json',
    'apikey': EVOLUTION_KEY,
}

export const evolutionApi = {
    async createInstance(instanceName: string, userId: string) {
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

    async fetchInstances() {
        const res = await fetch(`${EVOLUTION_URL}/instance/fetchInstances`, {
            method: 'GET',
            headers,
        })
        if (!res.ok) throw new Error(`Failed to fetch instances: ${res.statusText}`)
        return res.json()
    },
}

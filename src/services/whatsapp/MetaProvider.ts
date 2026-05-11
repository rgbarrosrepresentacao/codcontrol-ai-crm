/**
 * MetaProvider — Provedor de mensagens via API Oficial da Meta (Graph API).
 * Fase inicial: envio de texto simples e validação de token.
 * Não interfere na Evolution API.
 */
import { decrypt } from '@/lib/crypto'

const GRAPH_API_VERSION = 'v20.0'
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

export interface MetaConfig {
    waba_id: string
    phone_number_id: string
    business_id?: string
    verify_token: string
}

export interface MetaSendResult {
    success: boolean
    message_id?: string
    error?: string
}

export class MetaProvider {
    private phoneNumberId: string
    private accessToken: string

    constructor(config: MetaConfig, encryptedToken: string) {
        this.phoneNumberId = config.phone_number_id
        this.accessToken = decrypt(encryptedToken)
    }

    /**
     * Envia mensagem de texto simples via Graph API.
     * @param to Número no formato internacional, ex: 5511999999999
     * @param text Texto a ser enviado
     */
    async sendText(to: string, text: string): Promise<MetaSendResult> {
        try {
            const url = `${GRAPH_API_BASE}/${this.phoneNumberId}/messages`
            const body = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: to.replace(/\D/g, ''), // remove caracteres não numéricos
                type: 'text',
                text: { preview_url: false, body: text },
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            })

            const data = await response.json()

            if (!response.ok) {
                const errorMsg = data?.error?.message || 'Erro desconhecido da Meta API'
                console.error('[MetaProvider] Erro no envio:', errorMsg)
                return { success: false, error: errorMsg }
            }

            const messageId = data?.messages?.[0]?.id
            console.log('[MetaProvider] Mensagem enviada:', messageId)
            return { success: true, message_id: messageId }
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Erro interno'
            console.error('[MetaProvider] Exceção:', msg)
            return { success: false, error: msg }
        }
    }

    /**
     * Valida o token e Phone Number ID consultando o endpoint de detalhes.
     * Usado na tela de configuração para confirmar que as credenciais são válidas.
     */
    async validateCredentials(): Promise<{ valid: boolean; error?: string; phone?: string }> {
        try {
            const url = `${GRAPH_API_BASE}/${this.phoneNumberId}?fields=display_phone_number,verified_name`
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${this.accessToken}` },
            })

            const data = await response.json()

            if (!response.ok) {
                const errorMsg = data?.error?.message || 'Token ou Phone Number ID inválido'
                return { valid: false, error: errorMsg }
            }

            return {
                valid: true,
                phone: data.display_phone_number || data.verified_name,
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Erro de conexão'
            return { valid: false, error: msg }
        }
    }
}

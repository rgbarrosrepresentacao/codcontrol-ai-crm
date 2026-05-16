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
    private wabaId: string
    private accessToken: string

    constructor(config: MetaConfig, encryptedToken: string) {
        this.phoneNumberId = config.phone_number_id
        this.wabaId = config.waba_id
        this.accessToken = decrypt(encryptedToken)
    }

    /**
     * Cria um novo template na conta WABA.
     */
    async createTemplate(name: string, category: string, language: string, components: any[]): Promise<{ success: boolean; error?: string }> {
        try {
            const url = `${GRAPH_API_BASE}/${this.wabaId}/message_templates`
            const body = {
                name,
                category,
                language,
                components
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
                const metaError = data?.error?.message || 'Erro ao criar template'
                const metaDetails = data?.error?.error_data?.details || ''
                return { 
                    success: false, 
                    error: metaDetails ? `${metaError} (${metaDetails})` : metaError 
                }
            }

            return { success: true }
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Erro interno' }
        }
    }

    /**
     * Upload de mídia direto para os servidores da Meta.
     * Retorna o media_id.
     */
    async uploadMedia(fileBuffer: Buffer, mimeType: string): Promise<string | null> {
        try {
            const url = `${GRAPH_API_BASE}/${this.phoneNumberId}/media`
            
            const formData = new FormData()
            const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType })
            formData.append('file', blob)
            formData.append('messaging_product', 'whatsapp')
            formData.append('type', mimeType)

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                },
                body: formData,
            })

            const data = await response.json()
            if (!response.ok) {
                console.error('[MetaProvider] Erro no upload de media:', data)
                return null
            }

            return data.id
        } catch (error) {
            console.error('[MetaProvider] Exceção no upload de media:', error)
            return null
        }
    }

    /**
     * Envia mídia (imagem, vídeo, áudio, documento) via URL externa ou Media ID.
     */
    async sendMedia(to: string, media: { link?: string, id?: string }, type: 'audio' | 'image' | 'video' | 'document', caption?: string): Promise<MetaSendResult> {
        try {
            const endpoint = `${GRAPH_API_BASE}/${this.phoneNumberId}/messages`
            
            const mediaObject: any = media.id ? { id: media.id } : { link: media.link }
            
            if (caption && (type === 'image' || type === 'video' || type === 'document')) {
                mediaObject.caption = caption
            }

            const body = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: to.replace(/\D/g, ''),
                type: type,
                [type]: mediaObject
            }

            console.log(`[MetaProvider] Sending ${type} to ${body.to} via ${media.id ? 'ID' : 'link'}...`)

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            })

            const data = await response.json()
            console.log(`[MetaProvider] Response for ${type}:`, JSON.stringify(data))

            if (!response.ok) {
                const errorMsg = data?.error?.message || `Erro ao enviar ${type}`
                console.error(`[MetaProvider] ❌ Erro no envio de ${type}:`, errorMsg)
                return { success: false, error: errorMsg }
            }

            return { success: true, message_id: data?.messages?.[0]?.id }
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Erro interno'
            console.error(`[MetaProvider] Exceção no envio de ${type}:`, msg)
            return { success: false, error: msg }
        }
    }

    /**
     * Envia mensagem de texto simples via Graph API.
     */
    async sendText(to: string, text: string): Promise<MetaSendResult> {
        try {
            const url = `${GRAPH_API_BASE}/${this.phoneNumberId}/messages`
            const body = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: to.replace(/\D/g, ''),
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
                const errorMsg = data?.error?.message || 'Erro de texto da Meta API'
                return { success: false, error: errorMsg }
            }

            return { success: true, message_id: data?.messages?.[0]?.id }
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Erro interno' }
        }
    }

    /**
     * Valida o token e Phone Number ID consultando o endpoint de detalhes.
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

    /**
     * Envia um template oficial da Meta.
     */
    async sendTemplate(to: string, templateName: string, languageCode: string = 'pt_BR', components: any[] = []): Promise<MetaSendResult> {
        try {
            const url = `${GRAPH_API_BASE}/${this.phoneNumberId}/messages`
            const body = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: to.replace(/\D/g, ''),
                type: 'template',
                template: {
                    name: templateName,
                    language: { code: languageCode },
                    components: components
                }
            }

            console.log(`[MetaProvider] Sending template "${templateName}" to ${body.to}...`)

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            })

            const data = await response.json()
            console.log(`[MetaProvider] Response for template "${templateName}":`, JSON.stringify(data))

            if (!response.ok) {
                const errorMsg = data?.error?.message || 'Erro ao enviar template da Meta'
                return { success: false, error: errorMsg }
            }

            return { success: true, message_id: data?.messages?.[0]?.id }
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Erro interno'
            console.error(`[MetaProvider] Exceção no envio de template:`, msg)
            return { success: false, error: msg }
        }
    }
}

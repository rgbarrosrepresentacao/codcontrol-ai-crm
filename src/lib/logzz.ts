
const LOGZZ_API_BASE = 'https://api.logzz.com.br/api/v1'

export interface LogzzOrder {
    name: string
    email: string
    cpf_cnpj: string
    phone: string
    zipcode: string
    address: string
    address_number: string
    neighborhood: string
    city: string
    state: string
    items: Array<{
        product_id: string
        quantity: number
        price?: number
    }>
    payment_method: 'pix' | 'boleto' | 'credit_card' | 'delivery_payment'
}

export const logzzApi = {
    async getProducts(apiKey: string) {
        const response = await fetch(`${LOGZZ_API_BASE}/products`, {
            headers: { 
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json'
            }
        })
        return response.json()
    },

    async createOrder(apiKey: string, order: LogzzOrder) {
        console.log('[Logzz] 📤 Enviando pedido para API:', JSON.stringify(order, null, 2))
        
        const response = await fetch(`${LOGZZ_API_BASE}/external-sales`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(order)
        })

        const responseBody = await response.json()

        if (!response.ok) {
            console.error(`[Logzz] ❌ Erro HTTP ${response.status} ao criar pedido:`, JSON.stringify(responseBody))
            throw new Error(`Logzz API Error ${response.status}: ${JSON.stringify(responseBody)}`)
        }

        console.log('[Logzz] 📥 Resposta da API Logzz:', JSON.stringify(responseBody))
        return responseBody
    }
}

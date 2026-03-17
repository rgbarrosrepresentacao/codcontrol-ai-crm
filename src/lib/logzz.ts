
const LOGZZ_API_BASE = 'https://app.logzz.com.br/api/v1'

export interface LogzzOrder {
    client_name: string
    client_email: string
    client_document: string
    client_phone: string
    client_zip_code: string
    client_address: string
    client_address_number: string
    client_address_district: string
    client_address_city: string
    client_address_state: string
    products: Array<{
        hash: string
        quantity: number
        offer_hash?: string
    }>
    payment_method: string
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
        const response = await fetch(`${LOGZZ_API_BASE}/orders`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(order)
        })
        return response.json()
    }
}

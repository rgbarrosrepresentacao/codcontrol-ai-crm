import { createClient } from '@supabase/supabase-js'

export class KiwifyClient {
    private clientId: string
    private clientSecret: string
    private accessToken: string | null = null
    private tokenExpiresAt: number | null = null

    constructor() {
        this.clientId = process.env.KIWIFY_CLIENT_ID || ''
        this.clientSecret = process.env.KIWIFY_CLIENT_SECRET || ''
    }

    private async authenticate() {
        // Se já tem token válido, usa ele
        if (this.accessToken && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt) {
            return this.accessToken
        }

        console.log('[KIWIFY_API] Authenticating with Kiwify...')
        const response = await fetch('https://api.kiwify.com.br/v1/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: this.clientId,
                client_secret: this.clientSecret
            })
        })

        if (!response.ok) {
            const err = await response.text()
            throw new Error(`Failed to authenticate with Kiwify: ${err}`)
        }

        const data = await response.json()
        this.accessToken = data.access_token
        this.tokenExpiresAt = Date.now() + (data.expires_in * 1000) - 60000 // 1 min buffer
        
        console.log('[KIWIFY_API] Successfully authenticated.')
        return this.accessToken
    }

    async getSales(page = 1, perPage = 20) {
        const token = await this.authenticate()
        const response = await fetch(`https://api.kiwify.com.br/v1/sales?page=${page}&per_page=${perPage}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })

        if (!response.ok) throw new Error('Failed to fetch sales from Kiwify')
        return await response.json()
    }

    async getSubscription(subscriptionId: string) {
        const token = await this.authenticate()
        const response = await fetch(`https://api.kiwify.com.br/v1/subscriptions/${subscriptionId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })

        if (!response.ok) throw new Error('Failed to fetch subscription from Kiwify')
        return await response.json()
    }

    async refundSale(orderId: string) {
        const token = await this.authenticate()
        console.log(`[KIWIFY_API] Issuing refund for order: ${orderId}`)
        const response = await fetch(`https://api.kiwify.com.br/v1/sales/${orderId}/refund`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        })

        if (!response.ok) {
            const err = await response.json()
            throw new Error(err.message || 'Failed to refund sale')
        }
        
        return await response.json()
    }

    async getAccountBalance() {
        const token = await this.authenticate()
        const response = await fetch('https://api.kiwify.com.br/v1/account/balance', {
            headers: { 'Authorization': `Bearer ${token}` }
        })

        if (!response.ok) throw new Error('Failed to fetch account balance from Kiwify')
        return await response.json()
    }
}

export const kiwify = new KiwifyClient()

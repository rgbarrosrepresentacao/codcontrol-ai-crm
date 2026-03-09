import { NextRequest, NextResponse } from 'next/server'
import { evolutionApi } from '@/lib/evolution'

export async function GET(req: NextRequest) {
    const instance = req.nextUrl.searchParams.get('instance')
    if (!instance) return NextResponse.json({ error: 'Instance required' }, { status: 400 })
    try {
        const data = await evolutionApi.getInstanceStatus(instance)
        const state = data?.instance?.state || 'close'
        const statusMap: Record<string, string> = {
            open: 'connected',
            close: 'disconnected',
            connecting: 'connecting',
        }
        const phone = data?.instance?.profileName || data?.instance?.wuid?.replace('@s.whatsapp.net', '') || null
        return NextResponse.json({ status: statusMap[state] || 'disconnected', phone })
    } catch (error: any) {
        return NextResponse.json({ status: 'disconnected' })
    }
}

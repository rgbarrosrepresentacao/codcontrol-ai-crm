import { NextRequest, NextResponse } from 'next/server'
import { evolutionApi } from '@/lib/evolution'

export async function GET(req: NextRequest) {
    const instance = req.nextUrl.searchParams.get('instance')
    if (!instance) return NextResponse.json({ error: 'Instance required' }, { status: 400 })
    try {
        const data = await evolutionApi.getQrCode(instance)
        const qrCode = data?.base64 || data?.qrcode?.base64 || data?.code
        return NextResponse.json({ qrCode })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

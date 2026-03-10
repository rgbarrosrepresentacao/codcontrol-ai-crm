import { NextRequest, NextResponse } from 'next/server'
import { evolutionApi } from '@/lib/evolution'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function DELETE(req: NextRequest) {
    const instance = req.nextUrl.searchParams.get('instance')
    if (!instance) return NextResponse.json({ error: 'Instance required' }, { status: 400 })
    try {
        // Tenta deletar na Evolution, mas ignora erro se a instância não existir mais lá
        await evolutionApi.deleteInstance(instance).catch(err => {
            console.warn(`Aviso: Instância ${instance} não encontrada ou erro na Evolution ao deletar:`, err.message)
        })
        return NextResponse.json({ success: true })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

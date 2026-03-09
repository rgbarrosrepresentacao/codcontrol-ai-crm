import { NextRequest, NextResponse } from 'next/server'
import { evolutionApi } from '@/lib/evolution'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function DELETE(req: NextRequest) {
    const instance = req.nextUrl.searchParams.get('instance')
    if (!instance) return NextResponse.json({ error: 'Instance required' }, { status: 400 })
    try {
        await evolutionApi.deleteInstance(instance)
        return NextResponse.json({ success: true })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

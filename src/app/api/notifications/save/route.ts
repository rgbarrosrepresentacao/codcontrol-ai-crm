import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createSupabaseServerClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

        const body = await req.json()
        const { notification_whatsapp, sale_notifications_enabled } = body

        // Valida o número (apenas dígitos, mínimo 10)
        if (notification_whatsapp !== undefined && notification_whatsapp !== '') {
            const digits = String(notification_whatsapp).replace(/\D/g, '')
            if (digits.length < 10 || digits.length > 15) {
                return NextResponse.json({ error: 'Número de WhatsApp inválido. Use o formato com DDD (ex: 11999998888).' }, { status: 400 })
            }
        }

        const updates: Record<string, any> = {}
        if (notification_whatsapp !== undefined) updates.notification_whatsapp = String(notification_whatsapp).replace(/\D/g, '') || null
        if (sale_notifications_enabled !== undefined) updates.sale_notifications_enabled = sale_notifications_enabled

        const { error } = await supabase.from('profiles').update(updates).eq('id', user.id)
        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (err: any) {
        console.error('[Notifications] Erro ao salvar:', err)
        return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 })
    }
}

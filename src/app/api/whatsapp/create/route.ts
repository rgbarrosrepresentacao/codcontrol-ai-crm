import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { evolutionApi } from '@/lib/evolution'
import { generateInstanceName } from '@/lib/utils'

const WEBHOOK_URL = process.env.APP_URL || 'https://codcontrolpro.bond/api/whatsapp/webhook'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createSupabaseServerClient()
        const { data: { user } } = await supabase.auth.getSession().then(res => ({ data: { user: res.data.session?.user || null } }))
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { displayName } = await req.json()
        if (!displayName) return NextResponse.json({ error: 'Display name required' }, { status: 400 })

        // Check plan limits
        const { data: profile } = await supabase
            .from('profiles')
            .select('*, plans(max_whatsapp)')
            .eq('id', user.id)
            .single()

        const maxWhatsapp = (profile as any)?.plans?.max_whatsapp || 1
        const { count: existingCount } = await supabase
            .from('whatsapp_instances')
            .select('id', { count: 'exact' })
            .eq('user_id', user.id)

        if (existingCount !== null && existingCount >= maxWhatsapp) {
            return NextResponse.json({ error: `Seu plano permite apenas ${maxWhatsapp} instância(s). Faça upgrade para adicionar mais.` }, { status: 403 })
        }

        const instanceName = generateInstanceName(user.id)

        // Create instance on Evolution API
        let qrCode: string | undefined
        try {
            const evoResult = await evolutionApi.createInstance(instanceName)
            qrCode = evoResult?.qrcode?.base64 || evoResult?.base64
        } catch (evoErr: any) {
            console.error('Evolution API error:', evoErr)
        }

        // Save to database
        const { data: instance, error: dbError } = await supabase
            .from('whatsapp_instances')
            .insert({
                user_id: user.id,
                instance_name: instanceName,
                display_name: displayName,
                status: 'qr_code',
            })
            .select()
            .single()

        if (dbError) throw dbError

        // Configure webhook asynchronously
        try {
            await evolutionApi.setWebhook(instanceName, WEBHOOK_URL)
            await supabase.from('whatsapp_instances').update({ webhook_configured: true }).eq('id', instance.id)
        } catch (webhookErr) {
            console.error('Webhook setup error:', webhookErr)
        }

        return NextResponse.json({
            instanceName,
            instanceId: instance.id,
            qrCode,
        })
    } catch (error: any) {
        console.error('Create instance error:', error)
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
    }
}


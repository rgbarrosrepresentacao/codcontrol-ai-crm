'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { kiwify } from '@/lib/kiwify'
import { sendEmail, buildEmailTemplate, BulkEmailResult } from '@/lib/mail'

export async function toggleUserStatusAction(userId: string, isActive: boolean) {
    const adminSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { error } = await adminSupabase.from('profiles').update({ is_active: !isActive }).eq('id', userId)
    if (error) throw new Error(error.message)
    return true
}

export async function deleteUserAction(userId: string) {
    const adminSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    // Tenta deletar do Auth (isolará do sistema de login)
    const { error: authError } = await adminSupabase.auth.admin.deleteUser(userId)
    
    // Deleta do banco de dados (perfis, etc) - redundância de segurança
    const { error: dbError } = await adminSupabase.from('profiles').delete().eq('id', userId)
    
    if (authError && dbError) throw new Error(authError.message || dbError.message)
    
    revalidatePath('/dashboard/admin')
    return true
}
export async function updateUserTrialAction(userId: string, daysToAdd: number) {
    const adminSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Buscar data atual do usuário ou usar data de hoje
    const { data: user } = await adminSupabase.from('profiles').select('trial_ends_at').eq('id', userId).single()

    let baseDate = new Date()
    if (user?.trial_ends_at && new Date(user.trial_ends_at) > new Date()) {
        baseDate = new Date(user.trial_ends_at)
    }

    baseDate.setDate(baseDate.getDate() + daysToAdd)

    const { error } = await adminSupabase
        .from('profiles')
        .update({ trial_ends_at: baseDate.toISOString() })
        .eq('id', userId)

    if (error) throw new Error(error.message)
    return baseDate.toISOString()
}

export async function saveAnnouncementAction(title: string, content: string, type: string) {
    const adminSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    const { error } = await adminSupabase.from('announcements').insert({
        title,
        content,
        type,
        is_active: true
    })
    
    if (error) throw new Error(error.message)
    revalidatePath('/dashboard/admin')
    return true
}

export async function deleteAnnouncementAction(id: string) {
    const adminSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    const { error } = await adminSupabase.from('announcements').delete().eq('id', id)
    if (error) throw new Error(error.message)
    revalidatePath('/dashboard/admin')
    return true
}

export async function saveMaterialAction(title: string, type: string, link: string) {
    const adminSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    const { error } = await adminSupabase.from('academy_materials').insert({
        title,
        type,
        link
    })
    
    if (error) throw new Error(error.message)
    revalidatePath('/dashboard/tutoriais')
    revalidatePath('/dashboard/admin')
    return true
}

export async function deleteMaterialAction(id: string) {
    const adminSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    const { error } = await adminSupabase.from('academy_materials').delete().eq('id', id)
    if (error) throw new Error(error.message)
    revalidatePath('/dashboard/tutoriais')
    revalidatePath('/dashboard/admin')
    return true
}

// ─── KIWIFY FINANCIAL ACTIONS ─────────────────────────────────────────

export async function getKiwifyStatsAction() {
    try {
        const [salesData, balanceData] = await Promise.all([
            kiwify.getSales(1, 15).catch((e) => {
                console.error('[KIWIFY_ACTION] Sales error:', e.message)
                return { data: [] }
            }),
            kiwify.getAccountBalance().catch((e) => {
                console.error('[KIWIFY_ACTION] Balance error:', e.message)
                return { balance: 0, pending: 0, currency: 'BRL' }
            })
        ])
        return { sales: salesData.data || [], balance: balanceData }
    } catch (e: any) {
        throw new Error(e.message)
    }
}

export async function refundKiwifyOrderAction(orderId: string) {
    try {
        await kiwify.refundSale(orderId)
        revalidatePath('/dashboard/admin')
        return true
    } catch (e: any) {
        throw new Error(e.message)
    }
}

// ─── MARKETING EMAIL ACTION ────────────────────────────────────────────────

export async function sendMarketingEmailAction(
    subject: string,
    bodyContent: string,
    audience: 'leads' | 'paid' | 'all'
): Promise<BulkEmailResult> {
    // 1. Cliente admin do Supabase (service role)
    const adminSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 2. Validações de segurança
    if (!subject?.trim() || !bodyContent?.trim()) {
        throw new Error('Assunto e corpo do e-mail são obrigatórios.')
    }
    if (!['leads', 'paid', 'all'].includes(audience)) {
        throw new Error('Público inválido.')
    }

    // 3. Buscar usuários conforme público selecionado
    const { data: allUsers, error } = await adminSupabase
        .from('profiles')
        .select('id, name, email, stripe_subscription_status, kiwify_subscription_status, is_admin')
        .eq('is_active', true)
        .not('email', 'is', null)

    if (error) throw new Error('Erro ao buscar usuários: ' + error.message)

    const isPaid = (u: any) =>
        u.stripe_subscription_status === 'active' || u.kiwify_subscription_status === 'active'
    const isLead = (u: any) => !isPaid(u) && !u.is_admin

    let targets = (allUsers || []).filter(u => {
        if (u.is_admin) return false // nunca envia para si mesmo
        if (audience === 'paid') return isPaid(u)
        if (audience === 'leads') return isLead(u)
        return true // 'all'
    })

    // 4. Disparo com controle de resultado (fire-and-collect)
    const result: BulkEmailResult = { sent: 0, failed: 0, errors: [] }

    for (const user of targets) {
        try {
            const html = buildEmailTemplate({
                userName: user.name || 'Usuário',
                subject,
                bodyContent,
            })
            await sendEmail({
                to: user.email,
                toName: user.name || undefined,
                subject,
                htmlBody: html,
            })
            result.sent++
            // Pequeno delay para não sobrecarregar o SMTP
            await new Promise(r => setTimeout(r, 150))
        } catch (err: any) {
            result.failed++
            result.errors.push(`${user.email}: ${err.message}`)
            console.error(`[MAIL] Falha ao enviar para ${user.email}:`, err.message)
        }
    }

    return result
}

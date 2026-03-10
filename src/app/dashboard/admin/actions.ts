'use server'

import { createClient } from '@supabase/supabase-js'

export async function toggleUserStatusAction(userId: string, isActive: boolean) {
    const adminSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { error } = await adminSupabase.from('profiles').update({ is_active: !isActive }).eq('id', userId)
    if (error) throw new Error(error.message)
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

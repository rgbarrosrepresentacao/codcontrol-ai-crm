'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

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

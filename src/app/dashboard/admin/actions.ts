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

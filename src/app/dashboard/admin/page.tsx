import { createSupabaseServerClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import AdminPanel from './AdminPanel'

export default async function AdminPage() {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) redirect('/dashboard')

    const [usersRes, instancesRes, plansRes] = await Promise.all([
        supabase.from('profiles').select('*, plans(name)').order('created_at', { ascending: false }),
        supabase.from('whatsapp_instances').select('id, status'),
        supabase.from('plans').select('*'),
    ])

    return (
        <AdminPanel
            users={usersRes.data || []}
            instances={instancesRes.data || []}
            plans={plansRes.data || []}
        />
    )
}

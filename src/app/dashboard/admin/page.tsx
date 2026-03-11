import { createSupabaseServerClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import AdminPanel from './AdminPanel'
import { createClient } from '@supabase/supabase-js'

export default async function AdminPage() {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) redirect('/dashboard')

    const adminSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const [usersRes, instancesRes, plansRes, announcementsRes] = await Promise.all([
        adminSupabase.from('profiles').select('*, plans(name)').order('created_at', { ascending: false }),
        adminSupabase.from('whatsapp_instances').select('id, status'),
        adminSupabase.from('plans').select('*'),
        adminSupabase.from('announcements').select('*').order('created_at', { ascending: false })
    ])

    return (
        <AdminPanel
            users={usersRes.data || []}
            instances={instancesRes.data || []}
            plans={plansRes.data || []}
            initialAnnouncements={announcementsRes.data || []}
        />
    )
}

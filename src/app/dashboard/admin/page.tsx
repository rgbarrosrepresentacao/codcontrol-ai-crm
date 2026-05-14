import { createSupabaseServerClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import AdminPanel from './AdminPanel'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export default async function AdminPage() {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) redirect('/dashboard')

    try {
        const adminSupabase = getSupabaseAdmin()
        const [usersRes, instancesRes, plansRes, announcementsRes, materialsRes] = await Promise.all([
            adminSupabase.from('profiles').select('*, plans(name)').order('created_at', { ascending: false }),
            adminSupabase.from('whatsapp_instances').select('id, status'),
            adminSupabase.from('plans').select('*'),
            adminSupabase.from('announcements').select('*').order('created_at', { ascending: false }),
            adminSupabase.from('academy_materials').select('*').order('created_at', { ascending: false })
        ])

        if (usersRes.error) throw usersRes.error

        return (
            <AdminPanel
                users={usersRes.data || []}
                instances={instancesRes.data || []}
                plans={plansRes.data || []}
                initialAnnouncements={announcementsRes.data || []}
                initialMaterials={materialsRes.data || []}
            />
        )
    } catch (error) {
        console.error('Error fetching admin data:', error)
        return (
            <div className="flex flex-col items-center justify-center h-screen gap-4">
                <h1 className="text-2xl font-bold text-red-500">Erro ao carregar dados do Admin</h1>
                <p className="text-muted-foreground">Verifique se as variáveis de ambiente do Supabase estão configuradas corretamente.</p>
                <code className="p-4 bg-secondary rounded-lg text-xs truncate max-w-lg">
                    {JSON.stringify(error, null, 2)}
                </code>
            </div>
        )
    }
}


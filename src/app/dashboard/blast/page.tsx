import { createSupabaseServerClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import BlastPanel from '../admin/BlastPanel'

export default async function BlastAdminPage() {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) redirect('/dashboard')

    return (
        <div className="p-4 md:p-8 space-y-6 animate-fade-in">
            <div>
                <h1 className="text-2xl font-bold text-foreground">Disparo Inteligente</h1>
                <p className="text-muted-foreground text-sm mt-1">Gerencie suas campanhas de envio em massa com segurança e humanização.</p>
            </div>

            <div className="animate-slide-up">
                <BlastPanel />
            </div>
        </div>
    )
}

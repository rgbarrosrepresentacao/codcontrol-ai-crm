import { createSupabaseServerClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('*, plans(name)')
        .eq('id', user.id)
        .single()

    return (
        <div className="flex h-screen overflow-hidden bg-background">
            <Sidebar
                isAdmin={profile?.is_admin}
                userName={profile?.name || user.email?.split('@')[0]}
                userEmail={user.email}
                planName={(profile as any)?.plans?.name || 'Básico'}
            />
            <main className="flex-1 overflow-y-auto">
                {children}
            </main>
        </div>
    )
}

import { createSupabaseServerClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/Sidebar'
import { TrialWall } from '@/components/TrialWall'
import { AnnouncementBanner } from '@/components/AnnouncementBanner'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getSession().then(res => ({ data: { user: res.data.session?.user || null } }))

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
                trialEndsAt={profile?.trial_ends_at}
                subscriptionStatus={profile?.stripe_subscription_status}
            />
            <main className="flex-1 overflow-y-auto relative">
                <AnnouncementBanner />
                <TrialWall
                    isAdmin={profile?.is_admin}
                    trialEndsAt={profile?.trial_ends_at}
                    subscriptionStatus={profile?.stripe_subscription_status}
                >
                    {children}
                </TrialWall>
            </main>
        </div>
    )
}


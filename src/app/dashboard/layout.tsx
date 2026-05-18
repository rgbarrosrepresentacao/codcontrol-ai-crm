import { createSupabaseServerClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/Sidebar'
import { TrialWall } from '@/components/TrialWall'
import { AnnouncementBanner } from '@/components/AnnouncementBanner'
import { SubscriptionAlert } from '@/components/SubscriptionAlert'
import { OpenAiKeyAlert } from '@/components/OpenAiKeyAlert'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('*, plans(name, slug)')
        .eq('id', user.id)
        .single()

    const planName     = (profile as any)?.plans?.name || 'Básico'
    const planSlug     = (profile as any)?.plans?.slug || 'basico'
    const affiliateId  = (profile as any)?.affiliate_id || null

    return (
        <div className="flex h-screen overflow-hidden bg-background">
            <Sidebar
                isAdmin={profile?.is_admin}
                userName={profile?.name || user.email?.split('@')[0]}
                userEmail={user.email}
                planName={planName}
                planSlug={planSlug}
                trialEndsAt={profile?.trial_ends_at}
                subscriptionStatus={profile?.stripe_subscription_status}
            />
            <main className="flex-1 overflow-y-auto relative">
                <AnnouncementBanner />
                {/* Alerta de vencimento de mensalidade — aparece quando faltam ≤7 dias */}
                <SubscriptionAlert
                    trialEndsAt={profile?.trial_ends_at ?? null}
                    subscriptionStatus={profile?.stripe_subscription_status ?? null}
                    planName={planName}
                    isAdmin={profile?.is_admin}
                    affiliateId={affiliateId}
                />
                {/* Alerta de status da chave OpenAI */}
                <OpenAiKeyAlert
                    openaiKeyStatus={profile?.openai_key_status ?? null}
                    isAdmin={profile?.is_admin}
                />
                <TrialWall
                    isAdmin={profile?.is_admin}
                    trialEndsAt={profile?.trial_ends_at}
                    subscriptionStatus={profile?.stripe_subscription_status}
                    isActiveAccount={profile?.is_active}
                    affiliateId={affiliateId}
                >
                    {children}
                </TrialWall>
            </main>
        </div>
    )
}


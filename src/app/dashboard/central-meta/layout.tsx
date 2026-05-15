import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { canUseMetaAPI } from '@/lib/plan-features'

export default async function CentralMetaLayout({ children }: { children: React.ReactNode }) {
    const cookieStore = await cookies()

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() { return cookieStore.getAll() },
                setAll() {},
            },
        }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin, plan_slug')
        .eq('id', user.id)
        .single()

    const allowed = canUseMetaAPI({ is_admin: profile?.is_admin ?? false, plan_slug: profile?.plan_slug })

    if (!allowed) {
        // Redireciona para planos com mensagem de upgrade
        redirect('/dashboard/planos?upgrade=central-meta')
    }

    return <>{children}</>
}

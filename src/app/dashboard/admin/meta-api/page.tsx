import { createSupabaseServerClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { canUseMetaAPI } from '@/lib/plan-features'
import MetaApiClientPage from './MetaApiClientPage'

// ── Guard de Plano (Server-side) ────────────────────────────────────────────
// Verifica plano antes de renderizar qualquer conteúdo.
// Usuário Básico que digitar a URL diretamente é redirecionado.
export default async function MetaApiPage() {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin, plans(slug)')
        .eq('id', user.id)
        .single()

    const planSlug = (profile as any)?.plans?.slug || 'basico'
    const hasAccess = canUseMetaAPI({ is_admin: profile?.is_admin ?? false, plan_slug: planSlug })

    if (!hasAccess) {
        redirect('/dashboard/planos?upgrade=meta-api')
    }

    return <MetaApiClientPage />
}

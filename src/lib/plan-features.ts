/**
 * plan-features.ts
 *
 * Helper centralizado de features por plano.
 * NUNCA espalhe regras de plano pelo código — use sempre estas funções.
 *
 * Planos: basico | pro | agencia
 */

export interface PlanProfile {
    is_admin: boolean
    plan_slug?: string | null // vem do JOIN profiles → plans
}

/**
 * Verifica se o usuário pode usar a API Oficial da Meta (WhatsApp Cloud API).
 * Elegível: Admin, Pro, Agência.
 * Bloqueado: Básico.
 */
export function canUseMetaAPI(profile: PlanProfile): boolean {
    if (profile.is_admin) return true
    const ALLOWED_PLANS = ['pro', 'agencia']
    return ALLOWED_PLANS.includes(profile.plan_slug || '')
}

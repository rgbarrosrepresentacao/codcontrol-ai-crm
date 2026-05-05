import { SUBSCRIPTION_CONSTANTS } from '@/lib/constants';

export interface ProfileAccess {
    id: string;
    is_admin: boolean;
    stripe_subscription_status: string | null;
    trial_ends_at: string | null;
    openai_api_key: string | null;
}

export class GuardService {
    /**
     * Verifica se o usuário tem acesso ativo (Pago, Trial ou Admin)
     */
    static checkAccess(profile: ProfileAccess): { hasAccess: boolean; reason?: string } {
        if (!profile) return { hasAccess: false, reason: 'Profile not found' };
        
        // Admin sempre tem acesso
        if (profile.is_admin) return { hasAccess: true };

        const status = (profile.stripe_subscription_status || '').toLowerCase();
        const trialEndsAt = profile.trial_ends_at;
        
        // Status considerados "pagos"
        const isPaidStatus = ['paid', 'active', 'aprovado', 'approved'].includes(status);

        if (isPaidStatus) {
            // Legado ou sem data de fim = acesso total
            if (!trialEndsAt) return { hasAccess: true };

            // Verifica carência
            const graceEnd = new Date(new Date(trialEndsAt).getTime() + SUBSCRIPTION_CONSTANTS.GRACE_PERIOD_MS);
            if (new Date() <= graceEnd) return { hasAccess: true };
            
            return { hasAccess: false, reason: 'Subscription expired' };
        }

        // Período de Trial
        if (status === 'trialing' && trialEndsAt) {
            const graceEnd = new Date(new Date(trialEndsAt).getTime() + SUBSCRIPTION_CONSTANTS.GRACE_PERIOD_MS);
            if (new Date() <= graceEnd) return { hasAccess: true };
            
            return { hasAccess: false, reason: 'Trial expired' };
        }

        return { hasAccess: false, reason: 'No active subscription' };
    }

    /**
     * Verifica se a IA deve ser pausada (Handoff)
     */
    static shouldPauseAI(currentTag: string | null): boolean {
        const HANDOFF_TAGS = ['PEDIDO_FECHADO', 'FECHADO', 'PERDIDO', 'HUMANO'];
        return !!currentTag && HANDOFF_TAGS.includes(currentTag);
    }
}

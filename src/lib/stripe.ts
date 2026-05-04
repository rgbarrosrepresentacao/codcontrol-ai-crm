/**
 * STRIPE DESATIVADO
 *
 * Este sistema utiliza exclusivamente a Kiwify como plataforma de pagamento.
 * Esta lib foi mantida como stub para evitar erros de importação em código legado.
 * Qualquer chamada ao objeto `stripe` lançará um erro claro em desenvolvimento.
 */

console.warn('[STRIPE] ⚠️ lib/stripe.ts foi desativada — sistema utiliza Kiwify.')

export const stripe = new Proxy({} as any, {
    get(_target, prop) {
        throw new Error(
            `[STRIPE] Tentativa de uso do cliente Stripe bloqueada (prop: "${String(prop)}"). ` +
            `Este sistema utiliza Kiwify para pagamentos. Verifique o código que está importando @/lib/stripe.`
        )
    }
})

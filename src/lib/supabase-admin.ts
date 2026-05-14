import { createClient } from '@supabase/supabase-js'

/**
 * Cria uma instância administrativa do Supabase (Service Role).
 * IMPORTANTE: Use apenas em ambiente de servidor (Server Side).
 * 
 * Refatorado para ser uma função para evitar inicialização no escopo global
 * durante o build do Next.js, o que causava falhas quando as envs não estavam presentes.
 */
export function getSupabaseAdmin() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder'

    if (!supabaseKey && typeof window === 'undefined' && process.env.NODE_ENV === 'production') {
        console.warn('⚠️ AVISO: SUPABASE_SERVICE_ROLE_KEY não configurada. Operações administrativas podem falhar.')
    }

    return createClient(
        supabaseUrl,
        supabaseKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    )
}

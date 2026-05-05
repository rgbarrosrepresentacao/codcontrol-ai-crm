import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!supabaseKey && typeof window === 'undefined') {
    console.error('❌ CRÍTICO: SUPABASE_SERVICE_ROLE_KEY não configurada. Operações administrativas falharão.')
}

export const supabaseAdmin = createClient(
    supabaseUrl,
    supabaseKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '', // Fallback apenas para não quebrar o tipo, mas logado acima
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
)

/** 
 * Nota: Se SUPABASE_SERVICE_ROLE_KEY não estiver no .env, 
 * este client usará a ANON_KEY e estará sujeito às regras de RLS.
 */

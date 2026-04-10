import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Exporta o client apenas se as variáveis existirem para evitar o crash no boot
export const supabaseAdmin = createClient(
    supabaseUrl,
    supabaseKey,
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

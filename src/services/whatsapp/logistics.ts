import { getSupabaseAdmin } from '@/lib/supabase-admin';

export class ContactService {
    /**
     * Cria ou atualiza o contato no CRM
     */
    static async upsert(userId: string, instanceId: string, remoteJid: string, phone: string, pushName: string | null) {
        const supabase = getSupabaseAdmin();
        const { data: contact } = await supabase.from('contacts').upsert({
            user_id: userId,
            instance_id: instanceId,
            whatsapp_id: remoteJid,
            phone: phone,
            push_name: pushName,
            name: pushName || phone,
            status: 'active',
            last_message_at: new Date().toISOString(),
            followup_stage: 0
        }, { onConflict: 'user_id,whatsapp_id' })
        .select('*')
        .single();

        return contact;
    }
}

export class LogisticsService {
    /**
     * Valida se a localidade/CEP é atendida
     */
    static async check(userId: string, input: string): Promise<string | null> {
        const supabase = getSupabaseAdmin();
        const { data: rules } = await supabase.from('logistics_rules').select('*').eq('user_id', userId).eq('is_active', true);
        if (!rules || rules.length === 0) return null;

        const normalizedInput = input.toLowerCase().trim();
        const cleanInput = normalizedInput.replace(/[^a-z0-9]/g, '');
        const isPotentialZip = /^[0-9]{5,8}$/.test(cleanInput);

        for (const rule of rules) {
            if (rule.type === 'zipcode' && isPotentialZip) {
                if (rule.content.includes(cleanInput)) return `[SISTEMA: CEP ${input} ATENDIDO]`;
            } else if (rule.type === 'city') {
                if (normalizedInput.includes(rule.content.toLowerCase())) return `[SISTEMA: CIDADE ${input} ATENDIDA]`;
            }
        }
        return null;
    }
}

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export class CampaignService {
    /**
     * Detecta a campanha ativa baseada na mensagem
     */
    static async detect(userId: string, instanceId: string, textMessage: string): Promise<string | null> {
        const { data: campaigns } = await supabase
            .from('campaigns')
            .select('*')
            .eq('user_id', userId)
            .eq('instance_id', instanceId)
            .eq('is_active', true);

        if (!campaigns || campaigns.length === 0) return null;

        const normalize = (txt: string) => txt?.toLowerCase()?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.,\/#!$%\^&\*;:{}=\-_`~()!]/g,"")?.replace(/\s{2,}/g," ")?.trim() || "";
        const normalizedMessage = normalize(textMessage);

        const scoredCampaigns = campaigns.map(c => {
            const normalizedTrigger = normalize(c.trigger_phrase);
            const normalizedName = normalize(c.name);
            let score = 0;

            if (normalizedMessage === normalizedTrigger) score += 1000;
            if (normalizedName.length > 3 && normalizedMessage.includes(normalizedName)) score += (normalizedName.length * 10);
            if (normalizedTrigger.length > 3 && normalizedMessage.includes(normalizedTrigger)) score += normalizedTrigger.length;

            return { ...c, score };
        });

        const matchedCampaign = scoredCampaigns
            .filter(c => c.score > 0)
            .sort((a, b) => b.score - a.score)[0];

        return matchedCampaign?.id || null;
    }
}

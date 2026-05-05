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

    /**
     * Usa IA para detectar intenção de produto quando a busca simples falha
     */
    static async detectWithAI(userId: string, instanceId: string, textMessage: string, openaiKey: string): Promise<string | null> {
        // Primeiro tenta a detecção rápida por texto
        const fastId = await this.detect(userId, instanceId, textMessage);
        if (fastId) return fastId;

        // Se falhou, usa a IA para entender a intenção
        const { data: campaigns } = await supabase
            .from('campaigns')
            .select('id, name, trigger_phrase')
            .eq('user_id', userId)
            .eq('instance_id', instanceId)
            .eq('is_active', true);

        if (!campaigns || campaigns.length === 0) return null;

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: `Você é um classificador de intenção de compra. O cliente enviou uma mensagem e você deve identificar se ele está interessado em um dos produtos abaixo.
                            Produtos:
                            ${campaigns.map(c => `- ID: ${c.id} | Nome: ${c.name} | Gatilho: ${c.trigger_phrase}`).join('\n')}
                            
                            REGRAS:
                            - Se identificar interesse claro em um produto, retorne APENAS o ID dele.
                            - Se a mensagem não tiver relação com os produtos, retorne "NONE".
                            - Responda apenas com o ID ou "NONE".`
                        },
                        { role: 'user', content: textMessage }
                    ],
                    temperature: 0,
                    max_tokens: 50
                })
            });

            if (!response.ok) return null;
            const data = await response.json();
            const result = data.choices?.[0]?.message?.content?.trim();

            if (result && result !== 'NONE' && result.length > 10) { // IDs de UUID costumam ter > 10 chars
                return result;
            }
            return null;
        } catch (err) {
            console.error('[CampaignService] AI detection error:', err);
            return null;
        }
    }
}

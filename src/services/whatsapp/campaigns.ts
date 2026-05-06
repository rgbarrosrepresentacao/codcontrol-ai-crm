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
     * Usa IA para detectar intenção de produto com Score de Confiança (Engine V2)
     */
    static async detectWithAI(userId: string, instanceId: string, textMessage: string, openaiKey: string, origin: string = ''): Promise<{ 
        campaign_id: string | null, 
        campaign_name: string | null,
        confidence_score: number, 
        reason: string 
    }> {
        // 1. Tenta a detecção rápida por texto (Score 100 se bater exato)
        const fastId = await this.detect(userId, instanceId, textMessage);
        if (fastId) {
            const { data: camp } = await supabase.from('campaigns').select('name').eq('id', fastId).single();
            return {
                campaign_id: fastId,
                campaign_name: camp?.name || null,
                confidence_score: 100,
                reason: "Mensagem corresponde exatamente ao gatilho ou nome do produto."
            };
        }

        // 2. Busca campanhas disponíveis
        const { data: campaigns } = await supabase
            .from('campaigns')
            .select('id, name, trigger_phrase')
            .eq('user_id', userId)
            .eq('is_active', true);

        if (!campaigns || campaigns.length === 0) {
            return { campaign_id: null, campaign_name: null, confidence_score: 0, reason: "Nenhuma campanha ativa encontrada." };
        }

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: `Você é o Motor de Intenção de Produto (Engine V2). Sua tarefa é analisar a mensagem do cliente e identificar o interesse em um dos produtos.
                            
                            ORIGEM DO LEAD: ${origin || 'Desconhecida'}
                            (Dê mais peso a produtos relacionados à origem se a mensagem for ambígua)

                            PRODUTOS DISPONÍVEIS:
                            ${campaigns.map(c => `- ID: ${c.id} | Nome: ${c.name} | Gatilho: ${c.trigger_phrase}`).join('\n')}
                            
                            REGRAS:
                            - Retorne um JSON com: campaign_id, campaign_name, confidence_score (0-100), reason.
                            - Se não houver relação clara, retorne campaign_id: null e score baixo.
                            - Se a origem for específica, aumente o score do produto relacionado se houver a mínima menção.`
                        },
                        { role: 'user', content: textMessage }
                    ],
                    temperature: 0,
                    response_format: { type: 'json_object' }
                })
            });

            if (!response.ok) throw new Error();
            const data = await response.json();
            const result = JSON.parse(data.choices?.[0]?.message?.content);

            return {
                campaign_id: result.campaign_id !== 'null' ? result.campaign_id : null,
                campaign_name: result.campaign_name || null,
                confidence_score: result.confidence_score || 0,
                reason: result.reason || ""
            };
        } catch (err) {
            console.error('[CampaignService] AI detection error:', err);
            return { campaign_id: null, campaign_name: null, confidence_score: 0, reason: "Erro no processamento da IA." };
        }
    }
}

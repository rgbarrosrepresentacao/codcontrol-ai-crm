const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function simulateInteraction(contactId, messageText) {
    console.log(`\n--- SIMULANDO INTERAÇÃO ---`);
    console.log(`Cliente: ${messageText}`);

    // 1. Busca contato e inteligência atual
    const { data: contact } = await supabase
        .from('contacts')
        .select('*, profiles(openai_api_key)')
        .eq('id', contactId)
        .single();

    if (!contact) {
        console.error('Contato não encontrado');
        return;
    }

    const openaiKey = contact.profiles.openai_api_key;
    const currentIntelligence = contact.lead_intelligence || {};

    console.log(`\n🧠 Memória ANTES:`, JSON.stringify(currentIntelligence, null, 2));

    // 2. Simula Análise (Como o AIService.analyzeIntelligence faria)
    // Para o teste, vamos chamar a API diretamente simulando o novo método
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `Você é um analista estratégico de vendas. Extraia a inteligência da conversa.
                    DADOS ATUAIS: ${JSON.stringify(currentIntelligence)}
                    REGRAS: Retorne JSON com lead_summary, main_interest, main_pain, main_objection, buying_stage, next_best_action, last_offer.`
                },
                { role: 'user', content: `Cliente disse: "${messageText}"\nIA respondeu: "Claro! A Meia Calça DivaSlim está com uma promoção de R$ 79,90 hoje. Como posso te ajudar?"` }
            ],
            temperature: 0,
            response_format: { type: 'json_object' }
        })
    });

    const data = await response.json();
    const updatedIntelligence = JSON.parse(data.choices[0].message.content);

    console.log(`\n🧠 Memória DEPOIS:`, JSON.stringify(updatedIntelligence, null, 2));

    // 3. Atualiza no banco (Simulando o fim do Webhook)
    const { error } = await supabase
        .from('contacts')
        .update({ lead_intelligence: updatedIntelligence })
        .eq('id', contactId);

    if (error) console.error('Erro ao atualizar:', error);
    else console.log(`\n✅ Banco de dados atualizado com sucesso!`);
}

// Teste com a Selma San (Meia Calça)
const selmaId = '2ea4afaf-a8fc-4b0b-8dc6-da0fb2d9ce7b';
simulateInteraction(selmaId, 'Achei o preço um pouco alto, tem algum desconto?');

// Simulador de Webhook de Venda Fechada
// Execute: node scripts/simular_venda.mjs

const WEBHOOK_URL = 'https://codcontrolpro.bond/api/whatsapp/webhook'

const payload = {
    "event": "messages.upsert",
    "instance": "crm_bf2a9710_qb2a", // Instância real configurada
    "data": {
        "key": {
            "remoteJid": "558699597851@s.whatsapp.net",
            "fromMe": false,
            "id": "TEST_ID_" + Date.now()
        },
        "pushName": "Cliente de Teste",
        "message": {
            "conversation": "FECHADO! Pode gerar o pedido para o Rafael Barros. O endereço é Rua das Palmeiras, 450, Bairro Centro, Cidade São Paulo - SP, CEP 01310-100. O produto é 1x Progressiva Liso Máximo."
        },
        "messageTimestamp": Math.floor(Date.now() / 1000)
    }
}

async function test() {
    console.log('🚀 Enviando simulação de venda para o servidor local...')
    try {
        const res = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        const data = await res.json()
        console.log('✅ Resposta do Servidor:', data)
        console.log('\nVerifique o terminal onde o "npm run dev" está rodando para ver os logs do alerta!')
    } catch (err) {
        console.error('❌ Erro ao conectar no servidor local. Ele está rodando?', err.message)
    }
}

test()

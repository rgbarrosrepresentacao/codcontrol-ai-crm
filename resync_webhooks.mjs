const EVOLUTION_URL = 'https://api.codcontrolpro.bond'
const EVOLUTION_KEY = 'fNJvOh3c3wiNlzEuHbH2BegImGcbW8J7'
const WEBHOOK_URL = 'https://codcontrolpro.bond/api/whatsapp/webhook'

async function resync() {
    const instances = ['crm_bf2a9710_oy0n', 'crm_bf2a9710_sfy9']
    for (const inst of instances) {
        console.log(`Resyncing ${inst}...`)
        const res = await fetch(`${EVOLUTION_URL}/webhook/set/${inst}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': EVOLUTION_KEY
            },
            body: JSON.stringify({
                webhook: {
                    enabled: true,
                    url: WEBHOOK_URL,
                    webhookByEvents: false,
                    webhookBase64: true,
                    events: [
                        'MESSAGES_UPSERT',
                        'MESSAGES_UPDATE',
                        'CONNECTION_UPDATE',
                        'SEND_MESSAGE'
                    ]
                }
            })
        })
        console.log(`Result for ${inst}:`, await res.status)
    }
}

resync()

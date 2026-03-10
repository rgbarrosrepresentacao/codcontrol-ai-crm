const EVOLUTION_URL = 'https://api.codcontrolpro.bond'
const EVOLUTION_KEY = 'fNJvOh3c3wiNlzEuHbH2BegImGcbW8J7'

async function checkWebhooks() {
    const instances = ['crm_bf2a9710_oy0n', 'crm_bf2a9710_sfy9']
    for (const inst of instances) {
        const res = await fetch(`${EVOLUTION_URL}/webhook/find/${inst}`, {
            headers: { 'apikey': EVOLUTION_KEY }
        })
        const data = await res.json()
        console.log(`Webhook for ${inst}:`, JSON.stringify(data, null, 2))
    }
}

checkWebhooks()

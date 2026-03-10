const EVOLUTION_URL = 'https://api.codcontrolpro.bond'
const EVOLUTION_KEY = 'fNJvOh3c3wiNlzEuHbH2BegImGcbW8J7'

async function listAll() {
    const res = await fetch(`${EVOLUTION_URL}/instance/fetchInstances`, {
        headers: { 'apikey': EVOLUTION_KEY }
    })
    const data = await res.json()
    console.log('Evolution All Instances:', JSON.stringify(data, null, 2))
}

listAll()

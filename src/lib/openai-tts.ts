import { Buffer } from 'buffer'

export async function generateSpeech(text: string, voice: string, apiKey: string): Promise<string> {
    try {
        const response = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'tts-1',
                voice: voice,
                input: text,
            })
        })

        if (!response.ok) {
            const error = await response.json()
            throw new Error(error.message || 'Failed to generate speech')
        }

        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        return buffer.toString('base64')
    } catch (error) {
        console.error('Error in generateSpeech:', error)
        throw error
    }
}

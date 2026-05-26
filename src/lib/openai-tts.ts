import { Buffer } from 'buffer'

export async function generateSpeech(text: string, voice: string, apiKey: string, format: 'opus' | 'mp3' = 'opus'): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout
    try {
        const response = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'tts-1-hd',
                voice: voice,
                input: text,
                response_format: format
            }),
            signal: controller.signal
        })

        if (!response.ok) {
            const error = await response.json()
            throw new Error(error.message || 'Failed to generate speech')
        }

        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        return buffer.toString('base64')
    } catch (error: any) {
        if (error.name === 'AbortError') {
            console.error(`[OPENAI_TIMEOUT] generateSpeech request timed out after 20000ms`);
            throw new Error('OPENAI_TIMEOUT');
        }
        console.error('Error in generateSpeech:', error)
        throw error
    } finally {
        clearTimeout(timeoutId);
    }
}

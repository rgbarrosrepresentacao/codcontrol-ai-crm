import { Buffer } from 'buffer'

export async function generateSpeech(
    text: string, 
    voice: string, 
    apiKey: string, 
    format: 'opus' | 'mp3' = 'opus'
): Promise<string> {
    const startTime = Date.now();
    const primaryModel = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
    const modelsToTry = [primaryModel, "tts-1-hd"];

    let lastError: any = null;

    for (const model of modelsToTry) {
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
                    model: model,
                    voice: voice,
                    input: text,
                    response_format: format
                }),
                signal: controller.signal
            });

            if (!response.ok) {
                const errJson = await response.json().catch(() => ({ message: response.statusText }));
                throw new Error(errJson?.error?.message || errJson.message || `HTTP error ${response.status}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            
            const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
            const sizeKB = (buffer.length / 1024).toFixed(0);
            
            console.log(`[TTS] Modelo: ${model} | Voz: ${voice} | Tempo: ${durationSec}s | Tamanho: ${sizeKB} KB | Status: OK`);
            
            clearTimeout(timeoutId);
            return buffer.toString('base64');
        } catch (error: any) {
            clearTimeout(timeoutId);
            lastError = error;
            
            const errMsg = error.name === 'AbortError' ? 'Timeout de 20s atingido' : (error.message || error);
            console.warn(`[TTS_TRY_FAILED] Falha ao tentar modelo "${model}" com voz "${voice}". Erro: ${errMsg}`);
            
            // Continua para o próximo modelo (fallback)
        }
    }

    console.error(`[TTS_ERROR] Falha na geração do TTS. Erro: ${lastError?.message || lastError}`);
    throw lastError || new Error('Falha na geração de áudio por TTS');
}

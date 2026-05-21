/**
 * @file media-validator.ts
 * @description Biblioteca centralizada de validação, sanitização e limites de mídia.
 *
 * Aplica-se a TODOS os pontos de entrada de mídia do sistema:
 *  - /api/chat/send-media (upload manual pelo operador)
 *  - ProcessorService (áudio/imagem recebidos via Evolution/Meta)
 *  - /dashboard/conhecimento (Knowledge Base)
 *  - /dashboard/funis (assets de funil)
 *
 * Princípios:
 *  - Nunca confiar apenas na extensão — valida MIME type e magic bytes
 *  - Nunca usar nome original do cliente como path final
 *  - Limites por tipo: áudio 15MB, imagem 10MB, vídeo 50MB, documento 25MB
 *  - Logs estruturados em todos os pontos de decisão
 */

// ── Limites por tipo de mídia ─────────────────────────────────────────────────

export const MEDIA_LIMITS = {
    audio:    15 * 1024 * 1024,  // 15 MB
    image:    10 * 1024 * 1024,  // 10 MB
    video:    50 * 1024 * 1024,  // 50 MB
    document: 25 * 1024 * 1024,  // 25 MB
} as const

export type MediaCategory = keyof typeof MEDIA_LIMITS

// ── MIME types permitidos por categoria ───────────────────────────────────────

export const ALLOWED_MIME = {
    audio: new Set([
        'audio/ogg', 'audio/ogg; codecs=opus',
        'audio/webm', 'audio/webm; codecs=opus',
        'audio/mpeg', 'audio/mp3',
        'audio/mp4',
        'audio/aac',
        'audio/wav',
        'audio/x-wav',
        'audio/flac',
        'audio/x-m4a',
    ]),
    image: new Set([
        'image/jpeg', 'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/heic', 'image/heif',
    ]),
    video: new Set([
        'video/mp4',
        'video/quicktime',
        'video/webm',
        'video/3gpp',
        'video/x-matroska',
    ]),
    document: new Set([
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'text/csv',
    ]),
} satisfies Record<MediaCategory, Set<string>>

// ── Magic bytes (assinaturas de arquivo) ─────────────────────────────────────
// Detectamos o tipo real pelo cabeçalho binário, não pela extensão.

const MAGIC_BYTES: Array<{ category: MediaCategory; mimePrefix: string; bytes: number[]; offset: number }> = [
    // JPEG: FF D8 FF
    { category: 'image', mimePrefix: 'image/jpeg', bytes: [0xFF, 0xD8, 0xFF], offset: 0 },
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    { category: 'image', mimePrefix: 'image/png', bytes: [0x89, 0x50, 0x4E, 0x47], offset: 0 },
    // GIF: 47 49 46 38
    { category: 'image', mimePrefix: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38], offset: 0 },
    // WebP: RIFF....WEBP
    { category: 'image', mimePrefix: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },
    // PDF: %PDF
    { category: 'document', mimePrefix: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46], offset: 0 },
    // MP4/M4A: ftyp at offset 4
    { category: 'video', mimePrefix: 'video/mp4', bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
    // OGG: OggS
    { category: 'audio', mimePrefix: 'audio/ogg', bytes: [0x4F, 0x67, 0x67, 0x53], offset: 0 },
    // WebM: EBML
    { category: 'audio', mimePrefix: 'audio/webm', bytes: [0x1A, 0x45, 0xDF, 0xA3], offset: 0 },
    // MP3: ID3 or FF FB
    { category: 'audio', mimePrefix: 'audio/mpeg', bytes: [0x49, 0x44, 0x33], offset: 0 },
]

function detectMagicCategory(buf: Buffer): MediaCategory | null {
    for (const { category, bytes, offset } of MAGIC_BYTES) {
        if (buf.length < offset + bytes.length) continue
        const matches = bytes.every((b, i) => buf[offset + i] === b)
        if (matches) return category
    }
    return null
}

// ── Resultado de validação ────────────────────────────────────────────────────

export interface MediaValidationResult {
    valid: boolean
    category: MediaCategory | null
    mimeType: string
    sizeBytes: number
    error?: string
    limitMB?: number
}

// ── Validação de arquivo (File API — browser/Next.js route) ───────────────────

export async function validateMediaFile(
    file: File,
    expectedCategory?: MediaCategory,
    context?: string
): Promise<MediaValidationResult> {
    const mimeType = (file.type || '').toLowerCase().split(';')[0].trim()
    const sizeBytes = file.size
    const ctx = context || 'UNKNOWN'

    // 1. Detectar categoria pelo MIME
    let detectedCategory: MediaCategory | null = null
    for (const [cat, set] of Object.entries(ALLOWED_MIME) as [MediaCategory, Set<string>][]) {
        // Match normalizado: ignora parâmetros após ;
        const normalizedSet = new Set([...set].map(m => m.split(';')[0].trim()))
        if (normalizedSet.has(mimeType)) {
            detectedCategory = cat
            break
        }
    }

    // 2. MIME não reconhecido
    if (!detectedCategory) {
        const msg = `MIME type não permitido: ${mimeType}`
        console.warn(`[MEDIA_REJECTED] [${ctx}] ${msg} | size=${sizeBytes}`)
        return { valid: false, category: null, mimeType, sizeBytes, error: msg }
    }

    // 3. Categoria esperada diferente
    if (expectedCategory && detectedCategory !== expectedCategory) {
        const msg = `Tipo de arquivo incorreto — esperado ${expectedCategory}, recebido ${detectedCategory} (${mimeType})`
        console.warn(`[MEDIA_REJECTED] [${ctx}] ${msg}`)
        return { valid: false, category: detectedCategory, mimeType, sizeBytes, error: msg }
    }

    const category = expectedCategory || detectedCategory

    // 4. Verificação de tamanho
    const limitBytes = MEDIA_LIMITS[category]
    const limitMB = Math.round(limitBytes / (1024 * 1024))
    if (sizeBytes > limitBytes) {
        const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(1)
        const msg = `Arquivo muito grande: ${sizeMB} MB (limite ${limitMB} MB para ${category})`
        console.warn(`[MEDIA_REJECTED] [${ctx}] ${msg}`)
        return { valid: false, category, mimeType, sizeBytes, error: msg, limitMB }
    }

    // 5. Magic bytes — lê apenas os primeiros 16 bytes para verificar assinatura real
    // (evita carregar arquivo inteiro em memória só para validar)
    try {
        const headerSlice = file.slice(0, 16)
        const headerBuffer = Buffer.from(await headerSlice.arrayBuffer())
        const magicCategory = detectMagicCategory(headerBuffer)

        // Se detectamos magic bytes de uma categoria diferente, rejeitar
        if (magicCategory && magicCategory !== category) {
            const msg = `Assinatura de arquivo suspeita — MIME declara ${category} mas magic bytes indicam ${magicCategory}`
            console.warn(`[MEDIA_REJECTED] [${ctx}] ${msg} | mime=${mimeType}`)
            return { valid: false, category, mimeType, sizeBytes, error: msg }
        }
    } catch {
        // Se não conseguimos ler magic bytes, seguimos com MIME apenas (não bloqueamos)
        console.warn(`[MEDIA_VALIDATE] [${ctx}] Não foi possível verificar magic bytes — usando só MIME`)
    }

    console.log(`[MEDIA_VALIDATE] [${ctx}] ✅ válido | category=${category} | mime=${mimeType} | size=${(sizeBytes / 1024).toFixed(0)}KB`)
    return { valid: true, category, mimeType, sizeBytes }
}

// ── Validação de buffer (servidor — Evolution/Meta) ───────────────────────────

export function validateMediaBuffer(
    buf: Buffer,
    mimeType: string,
    expectedCategory: MediaCategory,
    context?: string
): MediaValidationResult {
    const ctx = context || 'BUFFER'
    const sizeBytes = buf.length
    const normalizedMime = mimeType.split(';')[0].trim().toLowerCase()

    // 1. Tamanho
    const limitBytes = MEDIA_LIMITS[expectedCategory]
    const limitMB = Math.round(limitBytes / (1024 * 1024))
    if (sizeBytes > limitBytes) {
        const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(1)
        const msg = `Buffer muito grande: ${sizeMB} MB (limite ${limitMB} MB para ${expectedCategory})`
        console.warn(`[MEDIA_REJECTED] [${ctx}] ${msg}`)
        return { valid: false, category: expectedCategory, mimeType: normalizedMime, sizeBytes, error: msg, limitMB }
    }

    // 2. Magic bytes
    const magicCategory = detectMagicCategory(buf)
    if (magicCategory && magicCategory !== expectedCategory) {
        const msg = `Magic bytes indicam ${magicCategory} mas esperava ${expectedCategory}`
        console.warn(`[MEDIA_REJECTED] [${ctx}] ${msg} | mime=${normalizedMime}`)
        return { valid: false, category: expectedCategory, mimeType: normalizedMime, sizeBytes, error: msg }
    }

    console.log(`[MEDIA_VALIDATE] [${ctx}] ✅ válido | category=${expectedCategory} | mime=${normalizedMime} | size=${(sizeBytes / 1024).toFixed(0)}KB`)
    return { valid: true, category: expectedCategory, mimeType: normalizedMime, sizeBytes }
}

// ── Sanitização de nome de arquivo ───────────────────────────────────────────

/**
 * Retorna um path seguro para upload no Supabase Storage.
 * Nunca usa o nome original do cliente como path final.
 * Formato: {prefix}/{uuid}.{ext}
 *
 * @param originalName - Nome original do arquivo (pode ser inseguro)
 * @param mimeType - MIME type detectado/declarado
 * @param prefix - Prefixo já seguro (ex: `${userId}/${conversationId}`)
 */
export function sanitizeStoragePath(originalName: string, mimeType: string, prefix: string): string {
    // Extensão segura derivada do MIME type (não do nome original)
    const mimeToExt: Record<string, string> = {
        'audio/ogg': 'ogg',
        'audio/webm': 'webm',
        'audio/mpeg': 'mp3',
        'audio/mp4': 'mp4',
        'audio/aac': 'aac',
        'audio/wav': 'wav',
        'audio/x-m4a': 'm4a',
        'audio/flac': 'flac',
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'image/heic': 'heic',
        'video/mp4': 'mp4',
        'video/quicktime': 'mov',
        'video/webm': 'webm',
        'video/3gpp': '3gp',
        'application/pdf': 'pdf',
        'text/plain': 'txt',
        'text/csv': 'csv',
    }

    const normalizedMime = mimeType.split(';')[0].trim().toLowerCase()
    let ext = mimeToExt[normalizedMime]

    if (!ext) {
        // Fallback: tenta extrair extensão do nome original mas sanitiza
        const rawExt = originalName.split('.').pop()?.toLowerCase() || 'bin'
        // Permite apenas letras e números, máximo 6 chars
        ext = rawExt.replace(/[^a-z0-9]/g, '').slice(0, 6) || 'bin'
    }

    // UUID garante unicidade e elimina qualquer path traversal ou nome malicioso
    const uuid = crypto.randomUUID()

    // Sanitizar prefix: remover caracteres perigosos (path traversal, etc.)
    const safePrefix = prefix
        .replace(/\.\./g, '')           // elimina path traversal
        .replace(/[^a-zA-Z0-9/_-]/g, '') // apenas chars seguros
        .replace(/\/+/g, '/')           // colapsa barras duplas
        .replace(/^\/|\/$/g, '')        // remove barras extremas

    return `${safePrefix}/${uuid}.${ext}`
}

// ── Mensagens de erro amigáveis ───────────────────────────────────────────────

export function friendlyMediaError(result: MediaValidationResult): string {
    if (!result.error) return 'Arquivo inválido.'
    if (result.error.includes('muito grande') || result.error.includes('MB')) {
        return `Arquivo muito grande. O limite para ${result.category || 'este tipo'} é ${result.limitMB} MB. Reduza o tamanho e tente novamente.`
    }
    if (result.error.includes('MIME') || result.error.includes('não permitido')) {
        return `Tipo de arquivo não suportado (${result.mimeType || 'desconhecido'}). Use formatos padrão de WhatsApp.`
    }
    if (result.error.includes('suspeita') || result.error.includes('magic bytes')) {
        return 'Arquivo com formato inválido ou corrompido. Verifique o arquivo e tente novamente.'
    }
    return 'Arquivo inválido ou não suportado.'
}

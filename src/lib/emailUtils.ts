import { BulkEmailResult } from './mail'

// Utilitário de e-mail — pode ser importado tanto no client quanto no server

export type EmailActionResult = BulkEmailResult & { error?: string }

/** Valida formato básico de e-mail */
export function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

/** 
 * Parseia uma string de e-mails separados por newline, vírgula ou ponto-e-vírgula.
 * Remove duplicatas e identifica inválidos.
 */
export function parseEmailList(raw: string): {
    valid: string[]
    invalid: string[]
    duplicates: number
} {
    const tokens = raw.split(/[\n,;]+/).map(e => e.trim().toLowerCase()).filter(Boolean)
    const seen = new Set<string>()
    const valid: string[] = []
    const invalid: string[] = []
    let duplicates = 0

    for (const token of tokens) {
        if (!isValidEmail(token)) {
            invalid.push(token)
        } else if (seen.has(token)) {
            duplicates++
        } else {
            seen.add(token)
            valid.push(token)
        }
    }

    return { valid, invalid, duplicates }
}

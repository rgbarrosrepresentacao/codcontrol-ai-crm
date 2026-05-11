/**
 * Utilitário de criptografia AES-256-CBC para tokens sensíveis.
 * Usado para criptografar o Meta Access Token antes de salvar no banco.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-cbc'

function getKey(): Buffer {
    const key = process.env.ENCRYPTION_KEY
    if (!key || key.length < 32) {
        throw new Error('ENCRYPTION_KEY deve ter pelo menos 32 caracteres no .env')
    }
    return Buffer.from(key.slice(0, 32), 'utf-8')
}

/**
 * Criptografa um texto com AES-256-CBC.
 * Retorna string no formato: iv_hex:encrypted_hex
 */
export function encrypt(text: string): string {
    const iv = randomBytes(16)
    const cipher = createCipheriv(ALGORITHM, getKey(), iv)
    const encrypted = Buffer.concat([cipher.update(text, 'utf-8'), cipher.final()])
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Descriptografa uma string no formato: iv_hex:encrypted_hex
 */
export function decrypt(encryptedText: string): string {
    const [ivHex, encryptedHex] = encryptedText.split(':')
    if (!ivHex || !encryptedHex) throw new Error('Formato de token criptografado inválido')
    const iv = Buffer.from(ivHex, 'hex')
    const encrypted = Buffer.from(encryptedHex, 'hex')
    const decipher = createDecipheriv(ALGORITHM, getKey(), iv)
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
    return decrypted.toString('utf-8')
}

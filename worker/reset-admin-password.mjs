/**
 * Gera o hash PBKDF2 compatível com o Worker e imprime o SQL para atualizar o admin.
 * Uso: node worker/reset-admin-password.mjs <nova-senha>
 */
import { webcrypto } from 'node:crypto'

const password = process.argv[2]
if (!password || password.length < 8) {
  console.error('Uso: node worker/reset-admin-password.mjs <senha-minimo-8-chars>')
  process.exit(1)
}

async function hashPassword(password) {
  const enc = new TextEncoder()
  const salt = webcrypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await webcrypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  )
  const bits = await webcrypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  )
  const hashArr = Array.from(new Uint8Array(bits))
  const saltArr = Array.from(salt)
  return JSON.stringify({ salt: saltArr, hash: hashArr })
}

const hash = await hashPassword(password)
const escaped = hash.replace(/'/g, "''")

console.log('\n=== Execute o comando abaixo na pasta worker/ para atualizar a senha no D1 ===\n')
console.log(`npx wrangler d1 execute caredesk-sprint --command "UPDATE agents SET password_hash = '${escaped}' WHERE id = 'admin-default-0000-0000-000000000001'" --remote`)
console.log('\n===============================================================================\n')

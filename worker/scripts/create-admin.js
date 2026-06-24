#!/usr/bin/env node
// Cria o admin inicial via endpoint de setup (worker deve estar rodando localmente)
// Uso: node scripts/create-admin.js [email] [senha]

const BASE = process.env.WORKER_URL || 'http://localhost:8787'

const email    = process.argv[2]
const password = process.argv[3]
const name     = process.argv[4] || 'Administrador'

if (!email || !password) {
  console.error('Uso: node scripts/create-admin.js <email> <senha> [nome]')
  process.exit(1)
}

console.log(`\nCriando admin em ${BASE}...`)
console.log(`  Email: ${email}`)
console.log(`  Senha: ${password}\n`)

const res = await fetch(`${BASE}/api/setup/admin`, {
  method:  'POST',
  headers: { 'Content-Type': 'application/json' },
  body:    JSON.stringify({ name, email, password }),
})

const data = await res.json()

if (res.ok) {
  console.log('✓', data.message)
  console.log('\nAcesse: http://localhost:5173/login\n')
} else {
  console.error('✗ Erro:', data.error)
  process.exit(1)
}

# CareDesk — Guia de Implementação de Segurança

> Detalhamento técnico das melhorias, da mais urgente à menos urgente.
> Data do teste: 2026-07-22. Alvo: `caredesk-lou.pages.dev` + worker `caredesk-worker.faugusto-thecoral.workers.dev`.

## Premissas de stack (ajuste se diferente)

Deduzido do teste (headers helmet-style, JWT HS256, SQL parametrizado, React/Zustand/Vite):

| Camada | Tecnologia assumida |
|---|---|
| API | Cloudflare Worker + **Hono** |
| Banco | Cloudflare **D1** (SQLite) |
| Auth | JWT HS256 via `hono/jwt` ou `jose`, segredo em `env` |
| Front | React + Zustand (`persist` em `localStorage`, store `caredesk-auth`) |

Se você usa `itty-router`/`express`-like em vez de Hono, a lógica é a mesma — muda só a assinatura do middleware.

---

# P0 — Crítico

## 1. Blindar a conta `admin` padrão

Achado: conta seed `admin` (`id: admin-default-0000-0000-000000000001`, email `admin`, `role: admin`). Único vetor prático de invasão — o resto do sistema resistiu.

### 1.1. Trocar senha e email do default

```bash
# Gerar senha forte (32 chars)
openssl rand -base64 24
```

No banco, atualizar hash (nunca senha em texto). Se usa bcrypt/scrypt via Worker:

```sql
-- D1: conferir hash atual NÃO é default previsível
SELECT id, email, substr(password_hash,1,12) FROM agents WHERE role='admin';
```

Trocar via endpoint próprio já existente (`/auth/change-password`) logado, ou seed script:

```ts
// scripts/reset-admin.ts  (rodar com wrangler d1 execute)
import bcrypt from 'bcryptjs';
const hash = await bcrypt.hash(process.env.NEW_ADMIN_PASSWORD!, 12);
// UPDATE agents SET email=?, password_hash=? WHERE id='admin-default-...0001'
```

- Renomear email `admin` para algo não previsível.
- **Não** versionar a senha nova. Guardar em gerenciador de senhas.

### 1.2. Ativar 2FA (TOTP) no login

Fluxo: senha OK → se `agent.totp_enabled`, exigir código de 6 dígitos antes de emitir JWT.

**Schema D1:**

```sql
ALTER TABLE agents ADD COLUMN totp_secret TEXT;      -- base32, cifrado idealmente
ALTER TABLE agents ADD COLUMN totp_enabled INTEGER DEFAULT 0;
```

**Enrollment (`POST /auth/2fa/setup`, logado):**

```ts
import { TOTP, Secret } from 'otpauth';

app.post('/auth/2fa/setup', authMiddleware, async (c) => {
  const agent = c.get('agent');
  const secret = new Secret({ size: 20 });
  const totp = new TOTP({ issuer: 'CareDesk', label: agent.email, secret });
  // salvar secret.base32 no agent (ainda totp_enabled=0 até confirmar)
  await c.env.DB.prepare('UPDATE agents SET totp_secret=? WHERE id=?')
    .bind(secret.base32, agent.id).run();
  return c.json({ otpauth_url: totp.toString() }); // vira QR no front
});

app.post('/auth/2fa/verify', authMiddleware, async (c) => {
  const { code } = await c.req.json();
  const agent = c.get('agent');
  const row = await c.env.DB.prepare('SELECT totp_secret FROM agents WHERE id=?')
    .bind(agent.id).first();
  const totp = new TOTP({ secret: Secret.fromBase32(row.totp_secret) });
  if (totp.validate({ token: code, window: 1 }) === null)
    return c.json({ error: 'Código inválido' }, 400);
  await c.env.DB.prepare('UPDATE agents SET totp_enabled=1 WHERE id=?')
    .bind(agent.id).run();
  return c.json({ ok: true });
});
```

**Login com 2FA (`POST /auth/login`):**

```ts
// após validar senha:
if (agent.totp_enabled) {
  const { totp_code } = body;
  if (!totp_code) return c.json({ error: '2FA obrigatório', need_2fa: true }, 401);
  const totp = new TOTP({ secret: Secret.fromBase32(agent.totp_secret) });
  if (totp.validate({ token: totp_code, window: 1 }) === null)
    return c.json({ error: 'Código 2FA inválido' }, 401);
}
// só então emitir JWT
```

Dep: `npm i otpauth` (funciona em Workers, usa WebCrypto).

### 1.3. 2FA na conta Cloudflare

Painel Cloudflare → My Profile → Authentication → **Two-Factor Authentication**. Sem isso, D1/KV inteiro vaza independente do app.

---

# P1 — Alto

## 2. Reduzir exposição do JWT

Achado: token em `localStorage`, TTL 8h. XSS futuro rouba sessão total.

### 2.1. Cortar TTL + refresh token

```ts
const ACCESS_TTL = 60 * 15;          // 15 min
const REFRESH_TTL = 60 * 60 * 24 * 7; // 7 dias

// no login:
const access = await sign({ sub, role, exp: now + ACCESS_TTL }, env.JWT_SECRET);
const refresh = await sign({ sub, type: 'refresh', exp: now + REFRESH_TTL }, env.JWT_REFRESH_SECRET);
```

Endpoint de renovação:

```ts
app.post('/auth/refresh', async (c) => {
  const rt = getCookie(c, 'refresh_token');      // ver 2.2
  const payload = await verify(rt, c.env.JWT_REFRESH_SECRET).catch(() => null);
  if (!payload || payload.type !== 'refresh') return c.json({ error: 'inválido' }, 401);
  // emitir novo access token
});
```

### 2.2. Migrar para cookie HttpOnly (recomendado)

Remove o token do alcance do JS → XSS não consegue exfiltrar.

**Worker — setar no login:**

```ts
import { setCookie } from 'hono/cookie';

setCookie(c, 'access_token', access, {
  httpOnly: true, secure: true, sameSite: 'Strict',
  path: '/', maxAge: ACCESS_TTL,
});
setCookie(c, 'refresh_token', refresh, {
  httpOnly: true, secure: true, sameSite: 'Strict',
  path: '/api/auth/refresh', maxAge: REFRESH_TTL,
});
```

**Worker — ler no middleware:**

```ts
const authMiddleware = async (c, next) => {
  const token = getCookie(c, 'access_token')
    ?? c.req.header('Authorization')?.replace('Bearer ', ''); // compat transição
  if (!token) return c.json({ error: 'Não autenticado' }, 401);
  const payload = await verify(token, c.env.JWT_SECRET).catch(() => null);
  if (!payload) return c.json({ error: 'Não autenticado' }, 401);
  c.set('agent', payload);
  await next();
};
```

**CORS — cookie cross-site exige credenciais explícitas:**

```ts
app.use('*', cors({
  origin: ['https://caredesk-lou.pages.dev'], // sem '*'
  credentials: true,
}));
```

**Front — parar de persistir token e enviar cookie:**

```ts
// store zustand: remover 'token' do partialize
persist(store, { name: 'caredesk-auth', partialize: (s) => ({ agent: s.agent }) });

// fetch: incluir cookie, remover header Bearer
fetch(url, { credentials: 'include', /* sem Authorization */ });
```

> Transição sem downtime: aceitar cookie **e** Bearer no middleware (como acima) por um release, depois remover o Bearer.

### 2.3. Se mantiver `localStorage` (mínimo viável)

Não migrando agora: manter CSP rígida atual (é o que segura hoje) + aplicar só o TTL curto (2.1).

## 3. Sanitização server-side dos campos de paciente

Achado: `<script>`/`<img onerror>` gravam crus no banco. Hoje não executam (React escapa + CSP), mas é latente.

**Middleware de sanitização (worker):**

```ts
function stripHtml(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.replace(/<[^>]*>/g, '').trim();   // remove tags
}

app.post('/patients', authMiddleware, async (c) => {
  const b = await c.req.json();
  const patient = {
    name: stripHtml(b.name).slice(0, 120),
    procedure: stripHtml(b.procedure).slice(0, 120),
    notes: stripHtml(b.notes).slice(0, 2000),
    phone: (b.phone ?? '').replace(/[^\d+()\s-]/g, '').slice(0, 20),
    surgery_date: /^\d{4}-\d{2}-\d{2}$/.test(b.surgery_date) ? b.surgery_date : null,
    status: ['active', 'inactive', 'done'].includes(b.status) ? b.status : 'active',
  };
  if (!patient.name || !patient.procedure || !patient.surgery_date)
    return c.json({ error: 'Nome, procedimento e data da cirurgia são obrigatórios' }, 400);
  // ... INSERT parametrizado (já é o caso)
});
```

Regra permanente: **nunca** usar `dangerouslySetInnerHTML` com dado de paciente. Manter validação de `email`/`phone` no server, não só no front.

> Bônus já validado: mass assignment já protegido (server ignora `id`/`role`/`created_by` forjados). Manter o padrão de montar o objeto campo a campo — nunca `INSERT ... (spread do body)`.

---

# P2 — Médio

## 4. Endurecer rate-limit

Achado: funciona por IP (429 após poucas tentativas, janela ~15 min), mas só por IP e sem `Retry-After`.

### 4.1. Lockout por conta (além do por IP)

```ts
// KV: chave por email, contador de falhas
const key = `login_fail:${email.toLowerCase()}`;
const fails = parseInt(await c.env.KV.get(key) ?? '0');
if (fails >= 5)
  return c.json({ error: 'Conta bloqueada. Tente em 15 min.' }, 429,
    { 'Retry-After': '900' });

// em falha de senha:
await c.env.KV.put(key, String(fails + 1), { expirationTtl: 900 });
// em sucesso:
await c.env.KV.delete(key);
```

Bloqueia ataque distribuído (muitos IPs) que contorna o rate-limit por-IP.

### 4.2. Header `Retry-After` no 429 por-IP

```ts
return c.json({ error: 'Muitas tentativas de login. Aguarde 15 minutos.' },
  429, { 'Retry-After': '900' });
```

### 4.3. CAPTCHA após X falhas

Cloudflare Turnstile (grátis, mesmo ecossistema): renderizar após 3 falhas, validar token no worker antes de checar senha.

## 5. LGPD / dados em repouso

Base = contato de terceiros + contexto pós-cirúrgico (dado de saúde, sensível na LGPD).

- **Cripto em repouso:** D1 é cifrado pela Cloudflare em disco; para colunas sensíveis (notes/telefone) considerar cifra em nível de aplicação com chave em `env`/secret.
- **Base legal + retenção:** definir por que armazena, por quanto tempo, e rotina de descarte.
- **Consentimento:** registrar aceite do cliente pro contato/lembrete (campo `consent_at`).
- **Direito de exclusão:** endpoint que apaga de fato o registro a pedido do titular.

---

# P3 — Baixo / Higiene

## 6. Limpar CSP de produção

Achado: `connect-src` inclui `http://localhost:8787` (sobra de dev, `http://` em página `https://`).

Onde a CSP é definida (header no Pages `_headers` ou no worker):

```diff
- connect-src 'self' https://caredesk-worker.faugusto-thecoral.workers.dev http://localhost:8787;
+ connect-src 'self' https://caredesk-worker.faugusto-thecoral.workers.dev;
```

Usar env separado pra CSP de dev vs prod, não hardcode com localhost.

## 7. Verificações opcionais

- **Crack offline do segredo HS256** com wordlist completa (rockyou + hashcat modo 16500) — confirmar que `JWT_SECRET` não é fraco além dos 34 comuns já testados. Se for curto/adivinhável, rotacionar por `openssl rand -base64 48`.
- **Validar FKs no create:** `assigned_agent_id`/`protocol_id` aceitos no `POST /patients` devem referenciar objetos existentes (evita registros órfãos/inconsistentes).

---

## Checklist de execução

| # | Item | Prioridade | Esforço | Feito |
|---|---|---|---|---|
| 1.1 | Trocar senha/email do admin default | P0 | Baixo | ☐ |
| 1.2 | 2FA TOTP no login | P0 | Médio | ☐ |
| 1.3 | 2FA na conta Cloudflare | P0 | Trivial | ☐ |
| 2.1 | TTL curto + refresh token | P1 | Médio | ☐ |
| 2.2 | Cookie HttpOnly | P1 | Médio | ☐ |
| 3 | Sanitização server-side | P1 | Baixo | ☐ |
| 4.1 | Lockout por conta | P2 | Baixo | ☐ |
| 4.2 | Header Retry-After | P2 | Trivial | ☐ |
| 4.3 | CAPTCHA (Turnstile) | P2 | Médio | ☐ |
| 5 | LGPD / cripto repouso | P2 | Médio | ☐ |
| 6 | Limpar CSP prod | P3 | Trivial | ☐ |
| 7 | Crack offline + validar FKs | P3 | Baixo | ☐ |

**Maior ganho / menor esforço: P0 (1.1 + 1.3).** Config pura, sem código, fecha o único vetor prático de invasão.

---

## Estado atual (o que já está bom — não regredir)

- CSP rígida (`script-src 'self'`), `X-Frame-Options: DENY`, `nosniff`, HSTS no worker.
- CORS não reflete origin arbitrária.
- Authn enforçada em 100% dos endpoints (`401` sem token).
- JWT: `alg:none` rejeitado, assinatura verificada, segredo não trivialmente fraco.
- SQL parametrizado (sem SQLi).
- Mass assignment protegido.
- Rate-limit por IP funcional.

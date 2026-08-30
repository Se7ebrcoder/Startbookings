// auth/login-throttle.js — limitador de tentativas de login no lado do cliente.
//
// IMPORTANTE sobre o que isto é e o que NÃO é:
// - A proteção REAL contra brute-force nesta stack (SPA estática, sem backend
//   próprio) é server-side, no Supabase: (1) o hCaptcha é OBRIGATÓRIO — o endpoint
//   /auth/v1/token recusa qualquer tentativa sem token válido (erro captcha_failed),
//   então um atacante não consegue automatizar chamadas diretas à API; e (2) os
//   rate limits de Auth do painel do Supabase (por IP/e-mail).
// - Este módulo é DEFESA EM PROFUNDIDADE + UX: freia quem usa a própria tela de
//   login, evita disparos acidentais e dá feedback claro. Como roda no navegador,
//   é contornável por si só — por isso não substitui os controles acima.
//
// Estratégia: N tentativas livres; depois, cooldown com backoff exponencial,
// limitado a um teto. O estado vive em sessionStorage (sobrevive a reload/refresh
// da aba, mas não vaza entre sessões nem persiste PII).

const KEY = "sb_login_throttle";
const FREE_ATTEMPTS = 5;      // tentativas antes do primeiro bloqueio
const BASE_COOLDOWN_MS = 30_000;  // 30s no 1º bloqueio
const MAX_COOLDOWN_MS = 15 * 60_000; // teto de 15min

function read() {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : { fails: 0, blockedUntil: 0 };
  } catch (e) { return { fails: 0, blockedUntil: 0 }; }
}

function write(state) {
  try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* modo privado: só perde a persistência */ }
}

// Retorna { blocked, waitSeconds }. Chame ANTES de tentar autenticar.
export function checkLoginThrottle() {
  const s = read();
  const now = Date.now();
  if (s.blockedUntil && now < s.blockedUntil) {
    return { blocked: true, waitSeconds: Math.ceil((s.blockedUntil - now) / 1000) };
  }
  return { blocked: false, waitSeconds: 0 };
}

// Registre uma FALHA de autenticação (senha errada, etc.).
export function recordLoginFailure() {
  const s = read();
  s.fails = (s.fails || 0) + 1;
  if (s.fails >= FREE_ATTEMPTS) {
    // backoff: 30s, 60s, 120s, ... até o teto.
    const over = s.fails - FREE_ATTEMPTS;
    const cooldown = Math.min(BASE_COOLDOWN_MS * Math.pow(2, over), MAX_COOLDOWN_MS);
    s.blockedUntil = Date.now() + cooldown;
  }
  write(s);
}

// Registre um SUCESSO — zera o contador.
export function recordLoginSuccess() {
  write({ fails: 0, blockedUntil: 0 });
}

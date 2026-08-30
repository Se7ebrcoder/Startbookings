// utils/id.js — geração de identificadores e sorteios com aleatoriedade criptográfica.
//
// Por que não Math.random(): a saída dele é previsível (PRNG não criptográfico) e,
// como os IDs daqui viram chave primária no Supabase, um valor adivinhável facilita
// colisão/enumeração. A Web Crypto API (crypto.getRandomValues) é síncrona, existe em
// todos os navegadores suportados e no Node 18+, então serve como única fonte.

function randomBytes(n) {
  const buf = new Uint8Array(n);
  const c = (typeof globalThis !== "undefined" && globalThis.crypto) || null;
  if (!c || typeof c.getRandomValues !== "function") {
    throw new Error("Web Crypto indisponível: não é possível gerar identificadores seguros.");
  }
  c.getRandomValues(buf);
  return buf;
}

// Sufixo hexadecimal aleatório (padrão: 4 bytes = 8 caracteres).
export function randomHex(bytes = 4) {
  return Array.from(randomBytes(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Inteiro em [0, max) sem viés (rejeita os valores da "sobra" da divisão).
export function randomInt(max) {
  if (!Number.isInteger(max) || max <= 0) return 0;
  const limit = Math.floor(0xffffffff / max) * max;
  let v;
  do {
    const b = randomBytes(4);
    v = ((b[0] << 24) >>> 0) + (b[1] << 16) + (b[2] << 8) + b[3];
  } while (v >= limit);
  return v % max;
}

// Item aleatório de um array (usado nas cores de tag).
export function randomPick(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  return arr[randomInt(arr.length)];
}

// ID local no formato "<prefixo>-<timestamp><hex>" — mantém a ordenação por
// criação que o formato antigo já dava e troca só a parte aleatória.
export function newId(prefix) {
  return `${prefix}-${Date.now()}${randomHex()}`;
}

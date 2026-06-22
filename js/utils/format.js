// utils/format.js — formatação de moeda e datas (funções puras).

export function formatCurrency(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

export function daysUntil(dateStr, todayStr) {
  if (!dateStr) return Infinity;
  const d = new Date(dateStr + 'T00:00:00');
  const t = new Date((todayStr || new Date().toISOString().slice(0, 10)) + 'T00:00:00');
  return Math.round((d - t) / 86400000);
}

// Normaliza uma data digitada (DD/MM/AAAA, DD-MM-AAAA, DD/MM/AA, AAAA-MM-DD,
// DDMMAAAA, DDMMAA) para o formato canônico AAAA-MM-DD. Entradas não
// reconhecidas voltam inalteradas. (Centraliza a lógica antes duplicada.)
export function normalizeDate(input) {
  let val = (input == null) ? "" : String(input);
  const dStr = val.replace(/[^\d/\-]/g, '');
  if (dStr.includes('/') || dStr.includes('-')) {
    const separator = dStr.includes('/') ? '/' : '-';
    const parts = dStr.split(separator);
    if (parts.length >= 2) {
      const d = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      let y = parts[2] || new Date().getFullYear().toString();
      if (y.length === 2) y = '20' + y;
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${(parts[2] || '').padStart(2, '0')}`;
      }
      return `${y}-${m}-${d}`;
    }
    return val;
  } else if (dStr.length >= 6) {
    const d = dStr.slice(0, 2);
    const m = dStr.slice(2, 4);
    let y = dStr.slice(4);
    if (y.length === 2) y = '20' + y;
    return `${y}-${m}-${d}`;
  }
  return val;
}

export function formatDate(dateStr) {
  if (!dateStr) return "";
  const parts = String(dateStr).split("-");
  if (parts.length !== 3) return String(dateStr);
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

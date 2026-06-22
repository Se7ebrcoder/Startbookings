// data/client.js — acesso base ao Supabase (paginação segura).
import { sbClient } from '../core/supabase.js';

// Busca TODAS as linhas de uma tabela paginando em blocos de 1000 (evita o teto
// padrão do Supabase, que truncaria silenciosamente). Ordena por coluna estável.
export async function fetchAllRows(table, orderColumn) {
  const PAGE = 1000;
  let from = 0;
  let all = [];
  while (true) {
    let q = sbClient.from(table).select('*').range(from, from + PAGE - 1);
    if (orderColumn) q = q.order(orderColumn, { ascending: true });
    const { data, error } = await q;
    if (error) return { data: null, error };
    const batch = data || [];
    all = all.concat(batch);
    if (batch.length < PAGE) break;   // última página
    from += PAGE;
  }
  return { data: all, error: null };
}

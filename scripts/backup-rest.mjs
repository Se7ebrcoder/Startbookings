// =====================================================================
//  StartBookings — Backup dos DADOS via API REST (sem senha de banco)
//
//  POR QUE ESTE CAMINHO
//   O backup por conexao Postgres exige a SENHA DO BANCO — que e diferente da
//   senha da conta, e gerada aleatoriamente. Ela e facil de perder e cheia de
//   armadilhas de codificacao de URL (@, %, : quebram a string de conexao).
//
//   Aqui usamos a chave `service_role`, que se copia e cola inteira, nao tem
//   caractere problematico e le TODAS as tabelas (ela ignora o RLS). Zero
//   dependencias: usa o fetch nativo do Node.
//
//  COMO USAR
//    1. Supabase > Project Settings > API > "service_role" (secret) > copiar
//    2. Colar em scripts/.backup-env.ps1:
//         $env:SB_SERVICE_KEY = "cole-a-chave-aqui"
//    3. node scripts/backup-rest.mjs
//
//  ⚠️ A chave service_role IGNORA todas as regras de seguranca do banco.
//     Trate como senha mestra: nunca comitar, nunca colar no frontend, nunca
//     compartilhar. O arquivo .backup-env.ps1 ja esta no .gitignore.
//
//  LGPD: o arquivo gerado CONTEM dados pessoais. Guarde em local controlado.
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const URL_BASE = process.env.SB_URL || 'https://jijjacpgbnubamawbscw.supabase.co';
const CHAVE = process.env.SB_SERVICE_KEY;

if (!CHAVE) {
  console.error('\nERRO: SB_SERVICE_KEY nao definida.\n');
  console.error('  1. Supabase > Project Settings > API > chave "service_role" (secret)');
  console.error('  2. Adicione em scripts/.backup-env.ps1:');
  console.error('       $env:SB_SERVICE_KEY = "cole-a-chave-aqui"\n');
  process.exit(1);
}

const cab = { apikey: CHAVE, Authorization: `Bearer ${CHAVE}` };

function carimbo() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

const destino = process.argv[2] || path.join(os.homedir(), 'StartBookings-Backups', carimbo());

// Literal SQL com escape correto.
function sql(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

// Descobre as tabelas pelo OpenAPI que o PostgREST expoe na raiz.
async function listarTabelas() {
  const r = await fetch(`${URL_BASE}/rest/v1/`, { headers: cab });
  if (!r.ok) {
    throw new Error(`Nao consegui listar as tabelas (HTTP ${r.status}). `
      + `Confira se a chave e mesmo a "service_role" (secret), nao a publishable.`);
  }
  const spec = await r.json();
  return Object.keys(spec.definitions || spec.components?.schemas || {}).sort();
}

// Busca todas as linhas paginando de 1000 em 1000.
async function buscarTudo(tabela) {
  const todas = [];
  const PAG = 1000;
  for (let de = 0; ; de += PAG) {
    const r = await fetch(`${URL_BASE}/rest/v1/${encodeURIComponent(tabela)}?select=*`, {
      headers: { ...cab, Range: `${de}-${de + PAG - 1}`, 'Range-Unit': 'items' },
    });
    if (!r.ok) throw new Error(`${tabela}: HTTP ${r.status} — ${(await r.text()).slice(0, 120)}`);
    const lote = await r.json();
    todas.push(...lote);
    if (lote.length < PAG) break;
  }
  return todas;
}

console.log('\nStartBookings - Backup de dados (via API REST)');
console.log(`Destino: ${destino}\n`);

let tabelas;
try {
  tabelas = await listarTabelas();
} catch (e) {
  console.error('ERRO:', e.message, '\n');
  process.exit(1);
}

fs.mkdirSync(destino, { recursive: true });

const partes = [
  '-- StartBookings — backup de DADOS',
  `-- Gerado em ${new Date().toLocaleString('pt-BR')}`,
  '-- Origem: Supabase sa-east-1 (Sao Paulo), via API REST',
  '--',
  '-- COMO RESTAURAR:',
  '--  1. Rode as migracoes 001..020 num projeto novo (cria a estrutura).',
  '--  2. Cole este arquivo no SQL Editor e execute.',
  '--',
  '-- Se aparecer erro de chave estrangeira, execute antes:',
  '--   set session_replication_role = replica;',
  '-- e ao final:',
  '--   set session_replication_role = origin;',
  '',
];

const resumo = [];
let total = 0;

for (const t of tabelas) {
  let linhas;
  try {
    linhas = await buscarTudo(t);
  } catch (e) {
    console.log(`  ${t.padEnd(24)} ERRO: ${e.message}`);
    partes.push(`\n-- ===== ${t}: FALHOU (${e.message}) =====`);
    continue;
  }
  total += linhas.length;
  resumo.push({ tabela: t, linhas: linhas.length });
  console.log(`  ${t.padEnd(24)} ${String(linhas.length).padStart(6)} linhas${linhas.length ? '' : ' (vazia)'}`);

  partes.push(`\n-- ===== ${t} (${linhas.length} linhas) =====`);
  for (const r of linhas) {
    const cols = Object.keys(r);
    partes.push(
      `INSERT INTO public."${t}" (${cols.map(c => `"${c}"`).join(', ')}) `
      + `VALUES (${cols.map(c => sql(r[c])).join(', ')}) ON CONFLICT DO NOTHING;`
    );
  }
}

// Contas de login — referencia (nao se restaura por INSERT).
try {
  const r = await fetch(`${URL_BASE}/auth/v1/admin/users?per_page=1000`, { headers: cab });
  if (r.ok) {
    const { users = [] } = await r.json();
    partes.push(`\n-- ===== contas de login (${users.length}) — SOMENTE REFERENCIA =====`);
    partes.push('-- Nao restauraveis por INSERT: recrie pelo painel ou peca novo cadastro.');
    for (const u of users) partes.push(`--   ${u.email}  (criada em ${String(u.created_at).slice(0, 10)})`);
    resumo.push({ tabela: 'contas de login (ref)', linhas: users.length });
    console.log(`  ${'contas de login (ref)'.padEnd(24)} ${String(users.length).padStart(6)} contas`);
  }
} catch (e) { /* opcional */ }

const arquivo = path.join(destino, 'dados.sql');
fs.writeFileSync(arquivo, partes.join('\n'), 'utf8');
const kb = (fs.statSync(arquivo).size / 1024).toFixed(1);

fs.writeFileSync(path.join(destino, 'RESUMO.txt'), [
  'StartBookings — Backup de DADOS (via API REST)',
  `Data....: ${new Date().toLocaleString('pt-BR')}`,
  `Arquivo.: dados.sql (${kb} KB)`,
  `Linhas..: ${total}`,
  '',
  'Contagem por tabela:',
  ...resumo.map(r => `  ${r.tabela.padEnd(28)} ${r.linhas}`),
  '',
  'A ESTRUTURA do banco esta versionada em migrations/ no Git.',
  'Restauracao: rode 001..020 e depois dados.sql. Ver docs/BACKUP.md.',
  '',
  'ATENCAO (LGPD): contem dados pessoais — cachês, contatos de clientes e',
  'roteiros de viagem. Guarde em local controlado e aplique retencao.',
].join('\n'), 'utf8');

console.log(`\n  Total: ${total} linhas em dados.sql (${kb} KB)`);
console.log(`\nBackup concluido: ${destino}`);
console.log('Guarde uma copia FORA deste computador.\n');

// =====================================================================
//  StartBookings — Backup dos DADOS do banco (sem Docker)
//
//  POR QUE ESTE SCRIPT EXISTE
//   O `supabase db dump` da CLI oficial exige Docker Desktop instalado, o que
//   e desproporcional para fazer backup. Aqui conectamos direto no Postgres
//   com o driver `pg` e geramos INSERTs restauraveis.
//
//   E por que so os DADOS? Porque a ESTRUTURA do banco (tabelas, funcoes,
//   policies RLS, triggers) ja esta versionada em migrations/ dentro do Git.
//   Para reconstruir do zero: rode as migracoes 001..020 e depois este dump.
//
//  COMO USAR
//    node scripts/backup-dados.mjs
//   (a credencial vem de scripts/.backup-env.ps1, lida pelo backup.ps1,
//    ou da variavel de ambiente SB_DB_URL)
//
//  LGPD: o arquivo gerado CONTEM dados pessoais. Guarde em local controlado.
// =====================================================================

import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const URL_BANCO = process.env.SB_DB_URL;
if (!URL_BANCO) {
  console.error('\nERRO: SB_DB_URL nao definida.');
  console.error('Rode pelo backup.ps1, ou defina a variavel antes de chamar este script.\n');
  process.exit(1);
}

const destino = process.argv[2]
  || path.join(os.homedir(), 'StartBookings-Backups', carimbo());

function carimbo() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

// Converte um valor JS para literal SQL, com escape correto.
function sql(v, tipo) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (Array.isArray(v) || (typeof v === 'object' && tipo !== 'json' && tipo !== 'jsonb')) {
    return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  }
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

const cliente = new pg.Client({
  connectionString: URL_BANCO,
  ssl: { rejectUnauthorized: false },
});

try {
  await cliente.connect();
} catch (e) {
  // Traduz os dois erros mais comuns do pooler — eles apontam para causas
  // OPOSTAS e a mensagem crua nao deixa isso claro.
  const m = e.message || '';
  console.error('\nERRO ao conectar.\n');
  if (/tenant.*not found/i.test(m)) {
    console.error('  Causa: HOST errado (o prefixo da regiao nao bate).');
    console.error('  O Supabase usa aws-0-, aws-1-, etc. conforme o projeto.');
    console.error('  Copie a URI exata em: painel > Connect > aba Session pooler.');
  } else if (/password authentication failed/i.test(m)) {
    console.error('  Causa: SENHA errada (o host esta correto).');
    console.error('  A senha do BANCO e diferente da senha da sua conta Supabase.');
    console.error('  Redefina em: Project Settings > Database > Reset database password.');
    console.error('  Se a senha tiver @ : / ? # % ou espaco, precisa ser codificada na URL.');
  } else {
    console.error('  ' + m);
  }
  console.error('\n  Arquivo a editar: scripts/.backup-env.ps1\n');
  process.exit(1);
}

fs.mkdirSync(destino, { recursive: true });

const { rows: tabelas } = await cliente.query(`
  select table_name
    from information_schema.tables
   where table_schema = 'public' and table_type = 'BASE TABLE'
   order by table_name
`);

const partes = [];
const resumo = [];

partes.push(`-- StartBookings — backup de DADOS`);
partes.push(`-- Gerado em ${new Date().toLocaleString('pt-BR')}`);
partes.push(`-- Origem: Supabase sa-east-1 (Sao Paulo)`);
partes.push(`--`);
partes.push(`-- COMO RESTAURAR:`);
partes.push(`--  1. Rode as migracoes 001..020 num projeto novo (cria a estrutura).`);
partes.push(`--  2. Cole este arquivo no SQL Editor e execute.`);
partes.push(`--`);
partes.push(`-- Se aparecer erro de chave estrangeira, execute antes:`);
partes.push(`--   set session_replication_role = replica;`);
partes.push(`-- e ao final:`);
partes.push(`--   set session_replication_role = origin;`);
partes.push(``);

console.log(`\nStartBookings - Backup de dados`);
console.log(`Destino: ${destino}\n`);

let totalLinhas = 0;

for (const { table_name: t } of tabelas) {
  const { rows, fields } = await cliente.query(`select * from public.${JSON.stringify(t)}`);
  totalLinhas += rows.length;
  resumo.push({ tabela: t, linhas: rows.length });

  const marca = rows.length === 0 ? ' (vazia)' : '';
  console.log(`  ${t.padEnd(24)} ${String(rows.length).padStart(6)} linhas${marca}`);

  partes.push(`\n-- ===== ${t} (${rows.length} linhas) =====`);
  if (rows.length === 0) continue;

  const cols = fields.map(f => `"${f.name}"`).join(', ');
  for (const r of rows) {
    const vals = fields.map(f => sql(r[f.name], f.format)).join(', ');
    partes.push(`INSERT INTO public."${t}" (${cols}) VALUES (${vals}) ON CONFLICT DO NOTHING;`);
  }
}

// Referencia das contas de login (o schema auth e gerenciado pelo Supabase;
// nao se restaura por INSERT, mas saber QUEM tinha conta e essencial).
try {
  const { rows: us } = await cliente.query(
    `select id, email, created_at from auth.users order by created_at`);
  partes.push(`\n-- ===== auth.users (${us.length}) — SOMENTE REFERENCIA =====`);
  partes.push(`-- Contas de login nao sao restauraveis por INSERT: recrie pelo painel`);
  partes.push(`-- do Supabase ou peca a cada pessoa que se cadastre de novo.`);
  for (const u of us) partes.push(`--   ${u.email}  (criada em ${u.created_at.toISOString().slice(0, 10)})`);
  resumo.push({ tabela: 'auth.users (referencia)', linhas: us.length });
  console.log(`  ${'auth.users (ref)'.padEnd(24)} ${String(us.length).padStart(6)} contas`);
} catch (e) {
  partes.push(`\n-- auth.users nao pode ser lido: ${e.message}`);
}

await cliente.end();

const arquivo = path.join(destino, 'dados.sql');
fs.writeFileSync(arquivo, partes.join('\n'), 'utf8');

const kb = (fs.statSync(arquivo).size / 1024).toFixed(1);
fs.writeFileSync(
  path.join(destino, 'RESUMO.txt'),
  [
    'StartBookings — Backup de DADOS',
    `Data....: ${new Date().toLocaleString('pt-BR')}`,
    `Arquivo.: dados.sql (${kb} KB)`,
    `Linhas..: ${totalLinhas}`,
    '',
    'Contagem por tabela:',
    ...resumo.map(r => `  ${r.tabela.padEnd(28)} ${r.linhas}`),
    '',
    'A ESTRUTURA do banco esta versionada em migrations/ no Git.',
    'Restauracao: rode 001..020 e depois dados.sql. Ver docs/BACKUP.md.',
    '',
    'ATENCAO (LGPD): contem dados pessoais — cachês, contatos de clientes e',
    'roteiros de viagem. Guarde em local controlado e aplique retencao.',
  ].join('\n'),
  'utf8'
);

console.log(`\n  Total: ${totalLinhas} linhas em dados.sql (${kb} KB)`);
console.log(`\nBackup concluido: ${destino}`);
console.log(`Guarde uma copia FORA deste computador.\n`);

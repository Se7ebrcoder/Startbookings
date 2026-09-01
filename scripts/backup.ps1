# =====================================================================
#  StartBookings — Backup do banco de dados (Supabase / PostgreSQL)
#
#  POR QUE ESTE SCRIPT EXISTE
#   O plano Free do Supabase NAO faz backup automatico. A propria
#   documentacao deles recomenda: "free tier plan projects [should] regularly
#   export their data using the Supabase CLI db dump command and maintain
#   off-site backups". Sem isto, uma exclusao acidental ou uma falha do
#   projeto levaria embora agenda, financeiro, clientes e logistica.
#
#  COMO USAR
#   1. No painel do Supabase, clique no botao "Connect" no topo da pagina do
#      projeto e copie a URI da aba "Session pooler" (porta 5432).
#      NAO use a conexao direta: neste projeto ela resolve so em IPv6 e nao
#      responde de rede IPv4 comum. NAO use o Transaction pooler (6543): ele
#      nao suporta prepared statements e o dump falha.
#   2. Guarde a string num arquivo local que NAO vai para o Git:
#        scripts\.backup-env.ps1  com a linha:
#        $env:SB_DB_URL = "postgresql://postgres.<ref>:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"
#   3. Rode:  powershell -ExecutionPolicy Bypass -File scripts\backup.ps1
#
#  O QUE GERA (3 arquivos por execucao, dentro de uma pasta com a data)
#   schema.sql  -> estrutura: tabelas, funcoes, policies RLS, triggers
#   data.sql    -> os dados
#   roles.sql   -> papeis do cluster
#   Os tres juntos permitem reconstruir o projeto do zero.
#
#  LGPD: o backup CONTEM dados pessoais (cachês, contatos, roteiros de
#  viagem). Guarde em local controlado, nao compartilhe, e aplique a mesma
#  retencao do sistema. Ver docs/BACKUP.md.
# =====================================================================

$ErrorActionPreference = "Stop"

# --- Onde salvar (fora do repositorio, para nunca ir para o Git) ----------
$RaizBackup = if ($env:SB_BACKUP_DIR) { $env:SB_BACKUP_DIR } else {
  Join-Path $env:USERPROFILE "StartBookings-Backups"
}

# --- Credencial ----------------------------------------------------------
$envFile = Join-Path $PSScriptRoot ".backup-env.ps1"
if (Test-Path $envFile) { . $envFile }

if (-not $env:SB_DB_URL) {
  Write-Host ""
  Write-Host "ERRO: a variavel SB_DB_URL nao esta definida." -ForegroundColor Red
  Write-Host ""
  Write-Host "Crie o arquivo scripts\.backup-env.ps1 com a linha:" -ForegroundColor Yellow
  Write-Host '  $env:SB_DB_URL = "postgresql://postgres.SEU_REF:SUA_SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"'
  Write-Host ""
  Write-Host "Copie em: painel do Supabase > botao Connect (topo) > aba Session pooler"
  Write-Host "(esse arquivo ja esta no .gitignore e NAO vai para o GitHub)"
  Write-Host ""
  exit 1
}

# --- Placeholder nao trocado? avisa de forma clara -----------------------
if ($env:SB_DB_URL -match "SUA_SENHA") {
  Write-Host ""
  Write-Host "A senha ainda nao foi preenchida." -ForegroundColor Red
  Write-Host ""
  Write-Host "Abra o arquivo abaixo e troque SUA_SENHA_AQUI pela senha do banco:" -ForegroundColor Yellow
  Write-Host ("  {0}" -f $envFile)
  Write-Host ""
  Write-Host "A senha esta em: painel do Supabase > Connect (topo) > aba Session pooler."
  Write-Host "Nao lembra? Project Settings > Database > Reset database password."
  Write-Host ""
  exit 1
}

# --- Pasta desta execucao ------------------------------------------------
$carimbo = Get-Date -Format "yyyy-MM-dd_HHmm"
$destino = Join-Path $RaizBackup $carimbo
New-Item -ItemType Directory -Force -Path $destino | Out-Null

Write-Host ""
Write-Host "StartBookings - Backup do banco" -ForegroundColor Cyan
Write-Host "Destino: $destino"
Write-Host ""

# --- As tres partes ------------------------------------------------------
$partes = @(
  @{ Nome = "schema"; Arquivo = "schema.sql"; Flags = @() },
  @{ Nome = "dados";  Arquivo = "data.sql";   Flags = @("--data-only", "--use-copy") },
  @{ Nome = "papeis"; Arquivo = "roles.sql";  Flags = @("--role-only") }
)

$falhou = $false
foreach ($p in $partes) {
  $saida = Join-Path $destino $p.Arquivo
  Write-Host ("  Exportando {0}..." -f $p.Nome) -NoNewline

  $args = @("--yes", "supabase@latest", "db", "dump", "--db-url", $env:SB_DB_URL, "-f", $saida) + $p.Flags
  & npx @args 2>&1 | Out-Null

  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $saida)) {
    Write-Host " FALHOU" -ForegroundColor Red
    $falhou = $true
  } else {
    $kb = [math]::Round((Get-Item $saida).Length / 1KB, 1)
    Write-Host (" OK ({0} KB)" -f $kb) -ForegroundColor Green
  }
}

if ($falhou) {
  Write-Host ""
  Write-Host "Backup INCOMPLETO. Verifique a SB_DB_URL e a conexao." -ForegroundColor Red
  exit 1
}

# --- Contagem de linhas por tabela, para conferencia rapida --------------
$resumo = Join-Path $destino "RESUMO.txt"
@"
StartBookings - Backup
Data......: $(Get-Date -Format "dd/MM/yyyy HH:mm")
Origem....: Supabase (sa-east-1 / Sao Paulo)
Arquivos..: schema.sql, data.sql, roles.sql

COMO RESTAURAR: ver docs/BACKUP.md

ATENCAO (LGPD): este backup contem dados pessoais - cachês, contatos de
clientes e roteiros de viagem de artistas. Guarde em local controlado e
aplique a mesma retencao do sistema.
"@ | Out-File -FilePath $resumo -Encoding utf8

# --- Retencao: mantem as 12 execucoes mais recentes ----------------------
$antigos = Get-ChildItem -Path $RaizBackup -Directory |
           Sort-Object Name -Descending | Select-Object -Skip 12
foreach ($a in $antigos) {
  Remove-Item -Recurse -Force $a.FullName
  Write-Host ("  Backup antigo removido: {0}" -f $a.Name) -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Backup concluido com sucesso." -ForegroundColor Green
Write-Host "Guarde uma copia FORA deste computador (nuvem ou HD externo)." -ForegroundColor Yellow
Write-Host ""

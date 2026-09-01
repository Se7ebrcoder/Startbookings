# =====================================================================
#  StartBookings — Backup automatico (chamado pela Tarefa Agendada)
#
#  O QUE FAZ, NESTA ORDEM
#   1. Espera a internet ficar REALMENTE disponivel (nao basta a placa de
#      rede estar ativa: no logon ela sobe antes do DNS/rota funcionarem).
#      Tenta por ate 10 minutos.
#   2. Roda o backup dos dados. O proprio script garante 1 BACKUP POR
#      INICIALIZACAO e a retencao de 3 GB.
#   3. Grava tudo num log, para que uma falha silenciosa nao passe batida.
#
#  Log: %USERPROFILE%\StartBookings-Backups\_log-backup.txt
#
#  Execucao manual (ignora a regra de 1 por inicializacao):
#    powershell -ExecutionPolicy Bypass -File scripts\backup-agendado.ps1 -Forcar
# =====================================================================

param([switch]$Forcar)

$ErrorActionPreference = "Stop"

$projeto  = Split-Path $PSScriptRoot -Parent
$raizBkp  = Join-Path $env:USERPROFILE "StartBookings-Backups"
$log      = Join-Path $raizBkp "_log-backup.txt"

New-Item -ItemType Directory -Force -Path $raizBkp | Out-Null

function Escreve($txt) {
  $linha = "{0}  {1}" -f (Get-Date -Format "dd/MM/yyyy HH:mm:ss"), $txt
  Add-Content -Path $log -Value $linha -Encoding utf8
  Write-Host $linha
}

Escreve "----- inicio -----"

# --- 1. Internet realmente disponivel? -----------------------------------
# Test-NetConnection so olha a placa de rede. Aqui batemos no proprio
# Supabase: qualquer resposta HTTP (inclusive 401) prova que ha rota, DNS e
# TLS funcionando ate o destino que interessa.
$alvo = "https://jijjacpgbnubamawbscw.supabase.co/rest/v1/"
$online = $false
for ($i = 1; $i -le 20; $i++) {
  try {
    $null = Invoke-WebRequest -Uri $alvo -Method Head -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
    $online = $true
  } catch {
    # 401/404 tambem significam "chegou no servidor"
    if ($_.Exception.Response) { $online = $true }
  }
  if ($online) { Escreve "internet OK (tentativa $i)"; break }
  Escreve "sem internet ainda (tentativa $i/20) - aguardando 30s"
  Start-Sleep -Seconds 30
}

if (-not $online) {
  Escreve "ABORTADO: internet indisponivel apos 10 minutos."
  Escreve "----- fim -----"
  exit 1
}

# --- 2. Credencial --------------------------------------------------------
$envFile = Join-Path $PSScriptRoot ".backup-env.ps1"
if (-not (Test-Path $envFile)) {
  Escreve "ABORTADO: $envFile nao encontrado."
  Escreve "----- fim -----"
  exit 1
}
. $envFile

# --- 3. Backup ------------------------------------------------------------
Set-Location $projeto
$argumentos = @("scripts\backup-dados.mjs")
if ($Forcar) { $argumentos += "--force" }

$saida = & node @argumentos 2>&1
$codigo = $LASTEXITCODE

foreach ($l in $saida) {
  $t = "$l".Trim()
  if ($t) { Escreve "  $t" }
}

if ($codigo -eq 0) { Escreve "concluido com sucesso" }
else { Escreve "FALHOU (codigo $codigo)" }

# --- 4. Log nao pode crescer para sempre ---------------------------------
if ((Test-Path $log) -and ((Get-Item $log).Length -gt 1MB)) {
  $ultimas = Get-Content $log -Tail 500
  Set-Content -Path $log -Value $ultimas -Encoding utf8
  Escreve "log truncado (mantidas as ultimas 500 linhas)"
}

Escreve "----- fim -----"
exit $codigo

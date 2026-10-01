# Executado pelo Agendador de Tarefas. Roda a automação e grava o log do dia
# em logs\AAAA-MM-DD.log (o relatório da última execução fica em artifacts\).

$projeto = Split-Path -Parent $PSScriptRoot
Set-Location $projeto

$pastaLogs = Join-Path $projeto 'logs'
New-Item -ItemType Directory -Force -Path $pastaLogs | Out-Null
$log = Join-Path $pastaLogs ((Get-Date -Format 'yyyy-MM-dd') + '.log')

Add-Content -Path $log -Value ("===== Execução iniciada em " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + " =====")
cmd /c "node src\index.js >> `"$log`" 2>&1"
$codigo = $LASTEXITCODE
Add-Content -Path $log -Value ("===== Fim (código de saída $codigo) =====`r`n")

# Apaga logs com mais de 30 dias
Get-ChildItem $pastaLogs -Filter '*.log' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item -ErrorAction SilentlyContinue

exit $codigo

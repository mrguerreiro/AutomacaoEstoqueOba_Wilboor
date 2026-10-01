# Cria (ou atualiza) a tarefa no Agendador de Tarefas do Windows que roda a
# automação às 08h, 12h, 16h e 20h, acordando o PC se ele estiver suspenso.
#
# Uso (no PowerShell, dentro da pasta do projeto):
#   powershell -ExecutionPolicy Bypass -File windows\agendar.ps1
#
# Para remover a tarefa:
#   Unregister-ScheduledTask -TaskName "Sincronizar Estoque Oba Wilboor" -Confirm:$false

$ErrorActionPreference = 'Stop'
$taskName = 'Sincronizar Estoque Oba Wilboor'
$projeto = Split-Path -Parent $PSScriptRoot
$executar = Join-Path $PSScriptRoot 'executar.ps1'

# Confere o que a automação precisa antes de agendar
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js não encontrado. Instale em https://nodejs.org e rode este script de novo.'
}
if (-not (Test-Path (Join-Path $projeto 'node_modules'))) {
    throw 'Dependências não instaladas. Rode "npm install" e "npx playwright install chromium" na pasta do projeto.'
}
if (-not (Test-Path (Join-Path $projeto '.env'))) {
    throw 'Arquivo .env não encontrado. Copie .env.example para .env e preencha as senhas.'
}
if (-not (Test-Path (Join-Path $projeto 'oba-session.json'))) {
    Write-Warning 'oba-session.json não encontrado. Rode "npm run salvar-sessao" antes da primeira execução.'
}

$acao = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$executar`"" `
    -WorkingDirectory $projeto

$gatilhos = @('08:00', '12:00', '16:00', '20:00') | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ }

$config = New-ScheduledTaskSettingsSet `
    -WakeToRun `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
    -MultipleInstances IgnoreNew

$usuario = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $acao -Trigger $gatilhos -Settings $config -Principal $usuario `
    -Description 'Sincroniza notificações Esgotou!/Voltou! do obaobamix com o painel Wilboor.' -Force | Out-Null

Write-Host "Tarefa '$taskName' criada: todos os dias às 08h, 12h, 16h e 20h, acordando o PC se necessário." -ForegroundColor Green

# Permite que o Windows acorde o PC por tarefas agendadas (temporizadores de ativação),
# na tomada (AC) e na bateria (DC), no plano de energia atual.
try {
    foreach ($argumentos in @(
            @('/SETACVALUEINDEX', 'SCHEME_CURRENT', 'SUB_SLEEP', 'RTCWAKE', '1'),
            @('/SETDCVALUEINDEX', 'SCHEME_CURRENT', 'SUB_SLEEP', 'RTCWAKE', '1'),
            @('/SETACTIVE', 'SCHEME_CURRENT'))) {
        & powercfg @argumentos | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "powercfg retornou $LASTEXITCODE" }
    }
    Write-Host 'Temporizadores de ativação permitidos no plano de energia atual.' -ForegroundColor Green
} catch {
    Write-Warning ('Não foi possível permitir os temporizadores de ativação automaticamente. ' +
        'Ative manualmente em: Opções de energia > Alterar configurações do plano > ' +
        'Alterar configurações de energia avançadas > Suspender > Permitir temporizadores de ativação.')
}

Write-Host ''
Write-Host 'Para testar agora:  Start-ScheduledTask -TaskName "Sincronizar Estoque Oba Wilboor"'
Write-Host "Os logs ficam em:   $(Join-Path $projeto 'logs')"

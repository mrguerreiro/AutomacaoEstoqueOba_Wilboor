# Cria uma tarefa no Agendador do Windows que ACORDA o PC (se estiver suspenso ou
# hibernando) um pouco antes dos horários da extensão: 07:58, 11:58, 15:58 e 19:58.
# A tarefa não faz mais nada; quem executa a sincronização é a extensão do Edge.
#
# Uso (no PowerShell, dentro da pasta do projeto):
#   powershell -ExecutionPolicy Bypass -File windows\acordar-pc.ps1
#
# Para remover:
#   Unregister-ScheduledTask -TaskName "Acordar PC - Estoque Oba Wilboor" -Confirm:$false

$ErrorActionPreference = 'Stop'
$taskName = 'Acordar PC - Estoque Oba Wilboor'

$acao = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument '/c exit 0'
$gatilhos = @('07:58', '11:58', '15:58', '19:58') | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ }
$config = New-ScheduledTaskSettingsSet -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
$usuario = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $acao -Trigger $gatilhos -Settings $config -Principal $usuario `
    -Description 'Acorda o PC para a extensão Estoque Oba -> Wilboor rodar nos horários.' -Force | Out-Null
Write-Host "Tarefa '$taskName' criada: acorda o PC às 07:58, 11:58, 15:58 e 19:58." -ForegroundColor Green

# Permite que tarefas agendadas acordem o PC (temporizadores de ativação), na tomada e na bateria.
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

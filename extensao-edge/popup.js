const $ = (id) => document.getElementById(id);
const DEFAULT_HORARIOS = ['08:00', '12:00', '16:00', '20:00'];

async function load() {
  const s = await chrome.storage.local.get(['wilboorPassword', 'horarios', 'dryRun', 'runs']);
  $('senha').value = s.wilboorPassword || '';
  $('horarios').value = (s.horarios || DEFAULT_HORARIOS).join(', ');
  $('dryRun').checked = s.dryRun ?? true;
  showRun((s.runs || [])[0]);
}

function showRun(run) {
  if (!run) return;
  const quando = new Date(run.startedAt).toLocaleString('pt-BR');
  $('log').textContent = [`${quando} (${run.trigger}${run.dryRun ? ', simulação' : ''})`, ...run.log].join('\n');
}

$('salvar').onclick = async () => {
  const horarios = $('horarios').value.split(',').map((h) => h.trim()).filter(Boolean);
  if (!horarios.every((h) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h))) {
    $('status').textContent = 'Horários inválidos. Use o formato 08:00, 12:00...';
    return;
  }
  await chrome.storage.local.set({ wilboorPassword: $('senha').value, horarios, dryRun: $('dryRun').checked });
  await chrome.runtime.sendMessage({ type: 'reschedule' });
  $('status').textContent = 'Salvo.';
};

async function run(dryRun) {
  $('status').textContent = 'Executando... (pode levar alguns minutos)';
  const result = await chrome.runtime.sendMessage({ type: 'run', dryRun });
  if (result?.skipped) $('status').textContent = `Não executado: ${result.skipped}`;
  else { $('status').textContent = result?.fatal ? 'Terminou com falha.' : 'Concluído.'; showRun(result); }
}
$('simular').onclick = () => run(true);
$('executar').onclick = () => run(false);

load();

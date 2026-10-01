# AutomacaoEstoqueOba_Wilboor

Automação que, **todos os dias às 08h, 12h, 16h e 20h (horário de Brasília)**:

1. Entra em <https://app.obaobamix.com.br> com seu login, clica no **sino** de notificações e lê todas elas.
2. Ao mesmo tempo, entra no painel <https://wilboor.com.br/tocadochefe/painel/produtos>, aba **Gerenciar produtos**.
3. Para cada notificação com um código `OOM-XXXX`:

| Notificação | O que a automação faz no Wilboor |
|---|---|
| **Esgotou!** | Se o código estiver cadastrado e o produto estiver publicado → clica em **Pausar**. Senão, vai para a próxima. |
| **Voltou!**  | Se o código estiver cadastrado e o produto estiver **pausado** → clica em **Publicar**. Senão, vai para a próxima. |
| **Novo!** ou qualquer outra | Ignora e vai para a próxima. |

Se o mesmo código aparecer mais de uma vez (ex.: *Esgotou!* e depois *Voltou!*), vale a notificação **mais recente**, para nunca
pausar um produto que já voltou ao estoque. As ações são idempotentes: rodar de novo não “desfaz” nada.

## Onde roda

O obaobamix usa Cloudflare, que **bloqueia os servidores do GitHub**. Por isso a automação roda no seu **PC com
Windows**, agendada pelo **Agendador de Tarefas**, que acorda o PC se ele estiver suspenso ou hibernando.
Se o PC estiver **desligado**, a execução não acontece; se ele estava dormindo e perdeu um horário, a tarefa roda
assim que ele voltar.

## Configuração no Windows (uma única vez)

Requer [Node.js](https://nodejs.org) 20.12 ou mais recente. No PowerShell, dentro da pasta do projeto:

```powershell
git pull
npm install
npx playwright install chromium
copy .env.example .env    # abra o .env e preencha OBA_USER, OBA_PASSWORD e WILBOOR_PASSWORD
npm run salvar-sessao     # login manual no obaobamix (com captcha); gera oba-session.json
npm run dry-run           # teste: mostra o que faria, sem clicar em nada
```

Se o teste mostrar as notificações e os produtos certos, crie a tarefa agendada:

```powershell
powershell -ExecutionPolicy Bypass -File windows\agendar.ps1
```

Ela roda todos os dias às **08h, 12h, 16h e 20h**, com a opção **"Ativar o computador para executar esta tarefa"**.
O script também tenta permitir os *temporizadores de ativação* no plano de energia; se não conseguir, ele mostra
onde ativar manualmente.

- **Testar a tarefa agora:** `Start-ScheduledTask -TaskName "Sincronizar Estoque Oba Wilboor"`
- **Logs:** pasta `logs\` (um arquivo por dia; apagados após 30 dias). Relatório da última execução: `artifacts\relatorio.json`
  e, em caso de erro, capturas de tela em `artifacts\`.
- **Remover a tarefa:** `Unregister-ScheduledTask -TaskName "Sincronizar Estoque Oba Wilboor" -Confirm:$false`

**Sessão do obaobamix expirada:** se o log disser que a sessão expirou ou que o captcha pediu desafio de imagens,
rode `npm run salvar-sessao` de novo.

> Em notebook na bateria ou em PCs com "Modern Standby", o Windows pode ignorar o pedido para acordar. Nesses casos,
> configure o PC para não suspender quando estiver na tomada.

## Comandos úteis

```bash
npm run dry-run           # simula, sem clicar em nada
npm start                 # executa de verdade
npm start -- --headful    # executa mostrando o navegador
```

## Ajustes caso o layout dos sites mude

Os elementos (sino, campos de login, botões Pausar/Publicar, busca, paginação) são encontrados pelo texto e por
seletores genéricos. Se algum não for encontrado, a execução falha com uma mensagem clara e uma captura de tela. Todos
podem ser ajustados por variáveis de ambiente — veja `src/config.js` (por exemplo `OBA_BELL_SELECTOR`,
`OBA_NOTIFICATION_ITEM_SELECTOR`, `WILBOOR_SEARCH_SELECTOR`, `NOTIFICATION_ORDER`).

## Testes

```bash
npm test
```

Inclui testes da interpretação das notificações e um teste ponta a ponta contra versões simuladas dos dois sites.

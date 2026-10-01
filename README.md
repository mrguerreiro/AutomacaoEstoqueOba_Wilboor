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

## Configuração (uma única vez) — GitHub Actions

O agendamento roda no próprio GitHub, sem precisar deixar computador ligado.

1. **Salve a sessão do obaobamix** (o login de lá tem captcha "Não sou um robô", então ele é feito por você uma vez):
   no seu computador, siga “Rodar no seu computador” abaixo até o `npm install` e rode `npm run salvar-sessao`.
   Um navegador abre; faça login normalmente (marque o captcha), espere o Dashboard aparecer e pressione ENTER
   no terminal. Ele mostra um texto longo — esse é o valor do secret `OBA_SESSION`.
2. No repositório, vá em **Settings → Secrets and variables → Actions → New repository secret** e crie:
   - `OBA_SESSION` — o texto gerado no passo 1
   - `OBA_USER` e `OBA_PASSWORD` — login do obaobamix (usado só se a sessão expirar: a automação marca a caixinha
     do captcha; se o Google pedir o desafio de imagens, ela para e o GitHub te avisa por e-mail — aí é só repetir o passo 1
     e atualizar o `OBA_SESSION`)
   - `WILBOOR_PASSWORD` — senha do painel Wilboor (o painel não tem usuário, só senha)
3. Faça o merge deste código na branch principal (`master`). O GitHub só executa agendamentos da branch principal.
4. Teste manualmente em **Actions → Sincronizar estoque obaobamix -> Wilboor → Run workflow**, marcando
   **“Somente simular”** na primeira vez. O log mostra cada notificação e o que seria feito.
5. Cada execução gera um artefato `relatorio-N` com `relatorio.json` e capturas de tela em caso de erro.
   Se algo falhar, o GitHub envia e-mail avisando.

> O GitHub pode atrasar execuções agendadas em alguns minutos em horários de pico. O horário está em
> `.github/workflows/sincronizar-estoque.yml` (em UTC: 11h, 15h, 19h e 23h = 08h, 12h, 16h e 20h em Brasília).

## Rodar no seu computador

Requer Node.js 20.12 ou mais recente.

```bash
npm install
npx playwright install chromium
cp .env.example .env      # preencha as credenciais
npm run salvar-sessao     # login manual no obaobamix (captcha); gera oba-session.json
npm run dry-run           # simula, sem clicar em nada
npm start                 # executa de verdade
```

Use `HEADFUL=true` no `.env` para ver o navegador trabalhando. Para agendar localmente (Linux/macOS), use o cron:

```
0 8,12,16,20 * * * cd /caminho/AutomacaoEstoqueOba_Wilboor && npm start >> automacao.log 2>&1
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

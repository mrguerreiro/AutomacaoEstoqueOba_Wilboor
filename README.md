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

## Como funciona

O obaobamix usa Cloudflare, que **bloqueia navegadores automatizados**. Por isso a automação é uma **extensão do
Microsoft Edge** (pasta `extensao-edge/`) que roda dentro do seu próprio navegador, onde você já está logado.

- Nos horários configurados (padrão 08h, 12h, 16h e 20h), ela abre uma janela minimizada, lê o sino do obaobamix,
  entra no painel Wilboor e pausa/publica os produtos. Depois fecha a janela.
- **Wilboor deslogou?** A extensão entra sozinha com a senha salva nela.
- **obaobamix deslogou?** O login de lá tem captcha, que a extensão **não** resolve: ela pula a execução e mostra
  um aviso do Windows "Faça login no obaobamix". Clique no aviso, entre no site (marque "Lembrar-me", se houver) e
  as próximas execuções voltam a funcionar.
- Ela começa em **"Somente simular"**: mostra o que faria, sem clicar. Desmarque quando conferir que está certo.
- Ao final, mostra um aviso com quantos produtos foram pausados/publicados, ou se algo falhou.

## Instalação no Edge (uma única vez)

1. Baixe/atualize o projeto (`git pull`) — a extensão está na pasta `extensao-edge`.
2. No Edge, abra `edge://extensions`, ligue **"Modo do desenvolvedor"** e clique em **"Carregar descompactado"**.
   Escolha a pasta `extensao-edge`.
3. Clique no ícone de quebra-cabeça da barra do Edge e fixe **"Estoque Oba → Wilboor"**. Clique nele:
   - digite a **senha do painel Wilboor** e clique em **Salvar**;
   - esteja logado no obaobamix e clique em **Simular agora**. O log aparece na própria janelinha.
4. Se a simulação estiver certa, desmarque **"Somente simular"** e clique em **Salvar**.

### Para rodar com o PC "parado"

- **Edge fechado:** em `edge://settings/system`, ligue **"Continuar executando extensões e aplicativos em segundo
  plano quando o Microsoft Edge estiver fechado"**.
- **PC suspenso/hibernando:** crie a tarefa que acorda o PC antes dos horários (no PowerShell, na pasta do projeto):

  ```powershell
  powershell -ExecutionPolicy Bypass -File windows\acordar-pc.ps1
  ```

  Se o PC perdeu um horário dormindo, a extensão roda assim que ele acordar. **Desligado**, nada roda.

> Em notebook na bateria ou em PCs com "Modern Standby", o Windows pode ignorar o pedido para acordar. Nesses casos,
> configure o PC para não suspender quando estiver na tomada.

> A senha do Wilboor fica guardada nas configurações da extensão, no seu perfil do Edge, neste PC.

## Versão por linha de comando (Playwright)

A pasta `src/` tem a mesma automação usando Playwright (`npm start`, `npm run dry-run`). Ela **é bloqueada pelo
Cloudflare do obaobamix** e fica apenas como referência e para os testes.

## Ajustes caso o layout dos sites mude

Os elementos (sino, campos de login, botões Pausar/Publicar, busca, paginação) são encontrados pelo texto e por
seletores genéricos. Se algum não for encontrado, a execução falha com uma mensagem clara e uma captura de tela. Todos
podem ser ajustados por variáveis de ambiente — veja `src/config.js` (por exemplo `OBA_BELL_SELECTOR`,
`OBA_NOTIFICATION_ITEM_SELECTOR`, `WILBOOR_SEARCH_SELECTOR`, `NOTIFICATION_ORDER`).

## Testes

```bash
npm test
```

Inclui testes da interpretação das notificações e testes ponta a ponta (extensão e Playwright) contra versões
simuladas dos dois sites.

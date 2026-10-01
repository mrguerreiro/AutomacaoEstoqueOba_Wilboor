'use strict';

// Servidor HTTP com versões simplificadas dos dois sites, para testes locais.
const http = require('node:http');

const page = (body, script = '') =>
  `<!doctype html><html><body>${body}<script>${script}</script></body></html>`;

function createMockServer(products) {
  const state = { obaLogged: false, wilLogged: false, products };

  const handlers = {
    'GET /oba': () =>
      state.obaLogged
        ? page(`
          <header><button class="btn" aria-label="Notificações"><i class="fa fa-bell"></i></button></header>
          <div id="dd" style="display:none"><ul>
            <li><div><b>Voltou!</b></div><div>Molho especial - OOM-0001</div></li>
            <li><div><b>Novo!</b></div><div>Tempero - OOM-0003</div></li>
            <li><div><b>Esgotou!</b></div><div>Molho especial - OOM-0001</div></li>
            <li><div><b>Esgotou!</b></div><div>Pimenta - OOM-0002</div></li>
            <li><div><b>Esgotou!</b></div><div>Não cadastrado - OOM-7777</div></li>
            <li><div><b>Voltou!</b></div><div>Sal - OOM-0004</div></li>
          </ul></div>`,
          `document.querySelector('[aria-label]').onclick=()=>{document.getElementById('dd').style.display='block'}`)
        : page(`<form method="post" action="/oba/login"><input type="email" name="email"><input type="password" name="senha"><button type="submit">Entrar</button></form>`),
    'POST /oba/login': (body, res) => {
      state.obaLogged = body.includes('email=oba%40x.com') && body.includes('senha=123');
      res.writeHead(302, { Location: '/oba' }).end();
    },
    'GET /painel/produtos': (_b, _r, url) => {
      if (!state.wilLogged) return null;
      const q = (url.searchParams.get('q') || '').toUpperCase();
      const pg = Number(url.searchParams.get('p') || 1);
      const list = state.products.filter((p) => !q || p.sku.includes(q));
      const perPage = 2;
      const rows = list.slice((pg - 1) * perPage, pg * perPage).map(
        (p) => `<tr><td>${p.name}</td><td>${p.sku}</td><td>${p.paused ? 'Pausado' : 'Ativo'}</td>
          <td><a class="btn" href="#" onclick="return act('${p.sku}','${p.paused ? 'publicar' : 'pausar'}')">${p.paused ? 'Publicar' : 'Pausar'}</a></td></tr>`,
      );
      const hasNext = pg * perPage < list.length;
      return page(
        `<nav><a href="/painel/produtos">Gerenciar Produtos</a></nav>
         <form><input type="search" name="q" placeholder="Buscar produto" value=""></form>
         <table>${rows.join('')}</table>
         ${hasNext ? `<a href="/painel/produtos?p=${pg + 1}">Próxima</a>` : ''}`,
        `function act(sku,a){ if(!confirm('Confirma?')) return false;
           fetch('/painel/acao',{method:'POST',body:sku+'|'+a}).then(()=>location.reload()); return false; }`,
      );
    },
    'GET /painel': () =>
      page(`<form method="post" action="/painel/login"><input type="text" name="usuario"><input type="password" name="senha"><button>Acessar</button></form>`),
    'POST /painel/login': (body, res) => {
      state.wilLogged = body.includes('usuario=admin') && body.includes('senha=abc');
      res.writeHead(302, { Location: '/painel/produtos' }).end();
    },
    'POST /painel/acao': (body, res) => {
      const [sku, a] = body.split('|');
      const p = state.products.find((x) => x.sku === sku);
      p.paused = a === 'pausar';
      state.clicks = [...(state.clicks || []), `${sku}:${a}`];
      res.end('ok');
    },
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const handler = handlers[`${req.method} ${url.pathname}`];
      if (!handler) return res.writeHead(404).end();
      const html = handler(body, res, url);
      if (res.writableEnded) return undefined;
      if (html === null) return res.writeHead(302, { Location: '/painel' }).end();
      return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
    });
  });
  return { server, state };
}

module.exports = { createMockServer };

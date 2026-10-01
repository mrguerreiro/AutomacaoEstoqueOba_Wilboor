'use strict';

// Servidor HTTP com versões simplificadas dos dois sites, para testes locais.
const http = require('node:http');

const page = (body, script = '') =>
  `<!doctype html><html><body>${body}<script>${script}</script></body></html>`;

function createMockServer(products) {
  const state = { obaLogged: false, wilLogged: false, products };

  const handlers = {
    'GET /oba': (_b, _r, _u, req) =>
      /sess=ok/.test(req.headers.cookie || '')
        ? page(`
          <style>.fa-bell::before{content:"\\1F514"}.fa-eye::before{content:"\\1F441"}</style>
          <header><a href="#" class="nav-link"><i class="fa fa-eye"></i></a>
            <a href="#" class="nav-link" id="bell"><i class="far fa-bell"></i><span class="badge"></span></a></header>
          <div class="dropdown-menu" id="dd" style="display:none">
            <h6>Notificações</h6>
            <div style="max-height:120px; overflow-y:auto">
              <a class="dropdown-item"><div><span>●</span> Voltou! OOM-0001</div><small>Molho especial (MOLHO-1)</small><small>há 3 horas</small></a>
              <a class="dropdown-item"><div><span>●</span> Novo! OOM-0003</div><small>Tempero</small><small>há 3 horas</small></a>
              <a class="dropdown-item"><div><span>●</span> Preço alterado! OOM-0005</div><small>Outro</small><small>há 3 horas</small></a>
              <a class="dropdown-item"><div><span>●</span> Esgotou! OOM-0001</div><small>Molho especial</small><small>há 4 horas</small></a>
              <a class="dropdown-item"><div><span>●</span> Esgotou! OOM-0002</div><small>Kit Pimenta (OOM-KIT020) OOM-0005</small><small>há 4 horas</small></a>
              <a class="dropdown-item"><div><span>●</span> Esgotou! OOM-7777</div><small>Não cadastrado</small><small>há 5 horas</small></a>
              <a class="dropdown-item"><div><span>●</span> Voltou! OOM-0004</div><small>Sal</small><small>há 6 horas</small></a>
            </div>
          </div>`,
          `document.getElementById('bell').onclick=(e)=>{e.preventDefault();document.getElementById('dd').style.display='block'}`)
        : page(`<form method="post" action="/oba/login"><input type="email" name="email"><input type="password" name="senha"><button type="submit">Entrar</button></form>`),
    'POST /oba/login': (body, res) => {
      const ok = body.includes('email=oba%40x.com') && body.includes('senha=123');
      res.writeHead(302, { Location: '/oba', ...(ok ? { 'Set-Cookie': 'sess=ok; Path=/' } : {}) }).end();
    },
    'GET /painel/produtos': (_b, _r, url) => {
      if (!state.wilLogged) return null;
      const q = (url.searchParams.get('q') || '').toUpperCase();
      const pg = Number(url.searchParams.get('p') || 1);
      const list = state.products.filter((p) => !q || p.sku.includes(q));
      const perPage = 2;
      const cards = list.slice((pg - 1) * perPage, pg * perPage).map(
        (p) => `<div class="col"><div class="card">
          ${p.paused ? '<span class="badge">PAUSADO</span>' : ''}<img alt="">
          <div class="card-body"><small>#${p.sku}</small><h5>${p.name}</h5><p>R$ 10.00</p>
            <div class="btns"><a class="btn">✎ Editar</a><a class="btn">☆ Destacar</a>
            <a class="btn" href="#" onclick="return act('${p.sku}','${p.paused ? 'publicar' : 'pausar'}')"><i class="fa"></i>${p.paused ? '▶ Publicar' : '⏸ Pausar'}</a>
            <a class="btn" href="#" onclick="alert('NÃO DEVERIA DELETAR');return false">🗑 Deletar</a></div></div></div></div>`,
      );
      const hasNext = pg * perPage < list.length;
      return page(
        `<input type="text" placeholder="Filtrar por nome ou código..." oninput="filt(this.value)">
         <select><option>Todos os departamentos</option></select>
         <div class="row">${cards.join('')}</div>
         ${hasNext ? `<a href="/painel/produtos?p=${pg + 1}">Próxima</a>` : ''}`,
        `function filt(v){ document.querySelectorAll('.col').forEach(c=>{c.style.display=c.innerText.toUpperCase().includes(v.toUpperCase())?'':'none'}) }
         function act(sku,a){
           fetch('/painel/acao',{method:'POST',body:sku+'|'+a}).then(()=>location.reload()); return false; }`,
      );
    },
    'GET /painel': () =>
      page(`<form method="post" action="/painel/login"><input type="password" name="senha" placeholder="Senha"><button>Acessar</button></form>`),
    'POST /painel/login': (body, res) => {
      state.wilLogged = body === 'senha=abc';
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
      const html = handler(body, res, url, req);
      if (res.writableEnded) return undefined;
      if (html === null) return res.writeHead(302, { Location: '/painel' }).end();
      return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
    });
  });
  return { server, state };
}

module.exports = { createMockServer };

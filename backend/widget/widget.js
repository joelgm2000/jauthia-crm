/*!
 * Widget de chat web · JAUTHIA CRM
 * Pega esto antes de </body> en el sitio del cliente:
 *   <script src="https://TU-DOMINIO/widget.js?t=ID-DEL-CLIENTE" data-title="EvoSport" data-color="#ff6b1a" async></script>
 * Los mensajes llegan a la bandeja del CRM como canal "Chat web" y los responde el mismo bot.
 */
(function () {
  'use strict';
  if (window.__jauthiaChat) return;
  window.__jauthiaChat = true;

  var script = document.currentScript;
  var SRC = new URL(script.src);
  var BASE = SRC.origin;
  var TENANT = script.getAttribute('data-tenant') || SRC.searchParams.get('t') || '';
  if (!/^[a-z0-9-]{3,60}$/.test(TENANT)) { console.warn('[chat] Falta el id del cliente (?t=)'); return; }
  var API = BASE + '/webhooks/' + TENANT + '/webchat';
  var TITLE = script.getAttribute('data-title') || 'Chat';
  var COLOR = script.getAttribute('data-color') || '#ff6b1a';
  var SUBTITLE = script.getAttribute('data-subtitle') || 'Te respondemos en minutos';
  var KEY = 'jauthia_chat_sid_' + TENANT;

  function sessionId() {
    var sid = null;
    try { sid = localStorage.getItem(KEY); } catch (e) {}
    if (!sid || !/^[A-Za-z0-9_-]{16,64}$/.test(sid)) {
      var bytes = new Uint8Array(18);
      crypto.getRandomValues(bytes);
      sid = Array.from(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      try { localStorage.setItem(KEY, sid); } catch (e) {}
    }
    return sid;
  }
  var SID = sessionId();

  // ---------------------------------------------------------------------------
  // Interfaz (Shadow DOM: no choca con los estilos del sitio)
  // ---------------------------------------------------------------------------
  var host = document.createElement('div');
  host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483000';
  document.body.appendChild(host);
  var root = host.attachShadow({ mode: 'open' });
  root.innerHTML =
    '<style>' +
    ':host{all:initial}*{box-sizing:border-box;font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
    '.fab{width:60px;height:60px;border-radius:50%;border:0;background:' + COLOR + ';color:#fff;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.25);display:grid;place-items:center;transition:transform .15s}' +
    '.fab:hover{transform:scale(1.06)}.fab svg{width:28px;height:28px}' +
    '.panel{position:absolute;right:0;bottom:76px;width:min(380px,calc(100vw - 32px));height:min(600px,calc(100vh - 110px));background:#efeae2;border-radius:18px;box-shadow:0 16px 48px rgba(0,0,0,.28);display:none;flex-direction:column;overflow:hidden}' +
    '.panel.open{display:flex}' +
    '.head{background:' + COLOR + ';color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px}' +
    '.head b{display:block;font-size:15px}.head small{opacity:.85;font-size:12px}.head .x{margin-left:auto;background:none;border:0;color:#fff;font-size:22px;cursor:pointer;line-height:1}' +
    '.av{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.25);display:grid;place-items:center;font-weight:800}' +
    '.msgs{flex:1;overflow-y:auto;padding:14px 12px;display:flex;flex-direction:column;gap:6px}.msgs>*{flex-shrink:0}' +
    '.b{max-width:82%;padding:8px 11px;border-radius:12px;font-size:14px;line-height:1.4;background:#fff;color:#111;box-shadow:0 1px .5px rgba(0,0,0,.13);white-space:pre-wrap;overflow-wrap:anywhere}' +
    '.in{align-self:flex-end;background:#d9fdd3}.out{align-self:flex-start}' +
    '.b img{display:block;width:100%;border-radius:8px;margin-bottom:6px;aspect-ratio:4/3;object-fit:cover}.b video{display:block;width:100%;max-height:320px;border-radius:8px;margin-bottom:6px;background:#000}.b .h{font-weight:700;margin-bottom:2px}.b .f{font-size:12px;color:#667;margin-top:4px}' +
    '.qr{align-self:flex-start;display:flex;flex-direction:column;gap:4px;width:82%}' +
    '.qr button,.card button{background:#fff;border:0;border-radius:9px;padding:9px;color:#027eb5;font-weight:600;font-size:14px;cursor:pointer;box-shadow:0 1px .5px rgba(0,0,0,.13)}' +
    '.qr button:hover,.card button:hover{background:#f3f4f6}.qr button small{display:block;color:#667;font-weight:400;font-size:12px}' +
    '.car{display:flex;gap:8px;overflow-x:auto;padding-bottom:6px;align-self:stretch;scroll-snap-type:x mandatory}' +
    '.card{flex:0 0 200px;background:#fff;border-radius:12px;overflow:hidden;display:flex;flex-direction:column;scroll-snap-align:start;box-shadow:0 1px 2px rgba(0,0,0,.15)}' +
    '.card img{width:100%;aspect-ratio:4/3;object-fit:cover}.card .t{padding:8px 10px;flex:1}.card .t b{display:block;font-size:14px;color:#111}.card .t small{color:#667;font-size:12px}' +
    '.card button{border-radius:0;box-shadow:none;border-top:1px solid #eee}' +
    '.typing{align-self:flex-start;background:#fff;border-radius:12px;padding:10px 12px;display:none;gap:4px}.typing.on{display:flex}' +
    '.typing i{width:6px;height:6px;border-radius:50%;background:#999;animation:bl 1.2s infinite}.typing i:nth-child(2){animation-delay:.2s}.typing i:nth-child(3){animation-delay:.4s}' +
    '@keyframes bl{0%,80%,100%{opacity:.25}40%{opacity:1}}' +
    'form{display:flex;gap:8px;padding:10px;background:#f0f2f5}input{flex:1;border:0;border-radius:20px;padding:10px 14px;font-size:14px;outline:none}' +
    'form button{width:42px;height:42px;border-radius:50%;border:0;background:' + COLOR + ';color:#fff;cursor:pointer}' +
    '.pw{font-size:10px;color:#889;text-align:center;padding:0 0 6px;background:#f0f2f5}' +
    '</style>' +
    '<div class="panel" part="panel"><div class="head"><div class="av"></div><div><b></b><small></small></div><button class="x" aria-label="Cerrar">×</button></div>' +
    '<div class="msgs"><div class="typing"><i></i><i></i><i></i></div></div>' +
    '<form><input maxlength="1000" placeholder="Escribe un mensaje…" aria-label="Mensaje" /><button aria-label="Enviar">➤</button></form><div class="pw">Atención con IA · JAUTHIA</div></div>' +
    '<button class="fab" aria-label="Abrir chat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>';

  var $ = function (s) { return root.querySelector(s); };
  var panel = $('.panel'), msgs = $('.msgs'), typing = $('.typing'), input = $('input');
  $('.head b').textContent = TITLE;
  $('.head small').textContent = SUBTITLE;
  $('.av').textContent = TITLE.charAt(0).toUpperCase();

  var seen = {};
  var lastAt = 0;
  var greeted = false;
  var pollTimer = null;

  function abs(url) {
    if (!url) return '';
    if (/^https:\/\//.test(url)) return url;
    if (url.charAt(0) === '/') return BASE + url;
    return '';
  }

  // Texto seguro: nunca se usa innerHTML con contenido del servidor.
  function richText(el, text) {
    var parts = String(text || '').split(/(\*[^*\n]+\*)/g);
    parts.forEach(function (p) {
      if (/^\*[^*\n]+\*$/.test(p)) {
        var b = document.createElement('b');
        b.textContent = p.slice(1, -1);
        el.appendChild(b);
      } else el.appendChild(document.createTextNode(p));
    });
  }

  function el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function add(node) {
    msgs.insertBefore(node, typing);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function button(b) {
    var btn = el('button');
    btn.type = 'button';
    btn.textContent = b.title;
    if (b.description) {
      var s = el('small');
      s.textContent = b.description;
      btn.appendChild(s);
    }
    btn.addEventListener('click', function () { send(b.title, b.id); });
    return btn;
  }

  function render(m) {
    if (!m || (m.id && seen[m.id])) return;
    if (m.id) seen[m.id] = true;
    if (m.createdAt && m.createdAt > lastAt) lastAt = m.createdAt;
    if (m.type === 'note') return;
    var mine = m.direction === 'in';

    if (m.type === 'carousel') {
      var car = el('div', 'car');
      (m.cards || []).forEach(function (c) {
        var card = el('div', 'card');
        var src = abs(c.imageUrl);
        if (src) { var img = el('img'); img.src = src; img.alt = c.title; img.loading = 'lazy'; card.appendChild(img); }
        var t = el('div', 't');
        var b = el('b'); b.textContent = c.title; t.appendChild(b);
        var s = el('small'); s.textContent = c.subtitle; t.appendChild(s);
        card.appendChild(t);
        (c.buttons || []).forEach(function (x) { card.appendChild(button(x)); });
        car.appendChild(card);
      });
      add(car);
      return;
    }

    var bubble = el('div', 'b ' + (mine ? 'in' : 'out'));
    var src = abs(m.imageUrl);
    if (src) { var img = el('img'); img.src = src; img.alt = m.header || ''; bubble.appendChild(img); }
    var vsrc = abs(m.videoUrl);
    if (vsrc) { var vid = el('video'); vid.src = vsrc; vid.controls = true; vid.preload = 'metadata'; vid.playsInline = true; bubble.appendChild(vid); }
    if (m.header) { var h = el('div', 'h'); h.textContent = m.header; bubble.appendChild(h); }
    var body = el('div'); richText(body, m.text); bubble.appendChild(body);
    if (m.footer) { var f = el('div', 'f'); f.textContent = m.footer; bubble.appendChild(f); }
    add(bubble);

    if (!mine && m.buttons && m.buttons.length) {
      var qr = el('div', 'qr');
      m.buttons.forEach(function (b) { qr.appendChild(button(b)); });
      add(qr);
    }
  }

  function post(body) {
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json(); });
  }

  function send(text, buttonId) {
    text = String(text || '').trim();
    if (!text) return;
    typing.classList.add('on');
    msgs.scrollTop = msgs.scrollHeight;
    post({ sessionId: SID, text: text, title: buttonId ? text : undefined, buttonId: buttonId })
      .then(function (r) { (r.messages || []).forEach(render); })
      .catch(function () { render({ direction: 'out', type: 'text', text: 'No pudimos enviar tu mensaje. Intenta de nuevo.' }); })
      .finally(function () { typing.classList.remove('on'); });
  }

  // Respuestas de la asesora desde el CRM: se consultan cada 4 s mientras el chat está abierto.
  function poll() {
    fetch(API + '/' + SID + '/messages?after=' + lastAt)
      .then(function (r) { return r.ok ? r.json() : { messages: [] }; })
      .then(function (r) { (r.messages || []).forEach(render); })
      .catch(function () {});
  }

  function open() {
    panel.classList.add('open');
    input.focus();
    if (!greeted) {
      greeted = true;
      poll();
      setTimeout(function () { if (!Object.keys(seen).length) send('Hola'); }, 600);
    }
    if (!pollTimer) pollTimer = setInterval(poll, 4000);
  }

  function close() {
    panel.classList.remove('open');
    clearInterval(pollTimer);
    pollTimer = null;
  }

  $('.fab').addEventListener('click', function () { panel.classList.contains('open') ? close() : open(); });
  $('.x').addEventListener('click', close);
  $('form').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = input.value;
    input.value = '';
    send(v);
  });
})();

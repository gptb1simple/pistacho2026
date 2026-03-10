// ── STATE ──
let sessionUser       = null;
let sessionCompany    = null;
let sessionIdCliente  = '';
let sessionSapUrl     = '';
let sessionCookie     = '';
let conversationHistory = [];
let queryCount        = 0;
let isTyping          = false;
let lastQueryTime     = 0;

// ── RATE LIMITING ──
function canQuery() {
  const now = Date.now();
  if (now - lastQueryTime < 2000) return false;
  lastQueryTime = now;
  return true;
}

// ── SANITIZAR INPUT ──
function sanitize(text) {
  return text
    .replace(/;/g, '')
    .replace(/--/g, '')
    .replace(/drop\s/gi, '')
    .replace(/delete\s/gi, '')
    .trim()
    .slice(0, 500); // máximo 500 caracteres
}

// ── FETCH CON TIMEOUT ──
async function fetchWithTimeout(url, options, timeout = 30000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

// ── RENOVAR COOKIE SAP ──
async function renovarCookie() {
  try {
    const res  = await fetchWithTimeout('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_cliente: sessionIdCliente, companydb: company, username: user, password: pass })
    });
    const data = await res.json();
    if (data.autorizado === true) {
      sessionCookie = data.cookieHeaders || '';
      sessionSapUrl = data.url_sap || sessionSapUrl;
      return true;
    }
  } catch(e) {}
  return false;
}

// Auto-renovar cookie cada 20 minutos
setInterval(() => {
  if (sessionIdCliente) renovarCookie();
}, 20 * 60 * 1000);

// ── PASO 1: BUSCAR BASES ──
async function buscarBases() {
  const idCliente = document.getElementById('login-id').value.trim().toUpperCase();
  const errEl     = document.getElementById('login-error-1');
  const btn       = document.getElementById('step1-btn');
  errEl.style.display = 'none';

  if (!idCliente) { errEl.textContent = 'Ingresá tu ID de acceso.'; errEl.style.display = 'block'; return; }

  if (idCliente === 'DEMO') {
    sessionIdCliente = 'DEMO';
    document.getElementById('step-1').style.display = 'none';
    document.getElementById('step-2').style.display = 'block';
    document.getElementById('login-company').innerHTML = '<option value="DEMO_CORP">Demo Corp</option>';
    return;
  }

  btn.disabled = true; btn.textContent = 'Buscando...';

  try {
    const res  = await fetchWithTimeout('/api/bases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_cliente: idCliente })
    });
    const data = await res.json();

    if (data.bases && data.bases.length > 0) {
      sessionIdCliente = idCliente;
      document.getElementById('login-company').innerHTML = data.bases.map(b => `<option value="${b}">${b}</option>`).join('');
      document.getElementById('step-1').style.display = 'none';
      document.getElementById('step-2').style.display = 'block';
    } else {
      errEl.textContent = 'ID no encontrado. Verificá tu código de acceso.'; errEl.style.display = 'block';
    }
  } catch(e) {
    errEl.textContent = 'Error al conectar. Intentá de nuevo.'; errEl.style.display = 'block';
  }

  btn.disabled = false; btn.textContent = 'Continuar →';
}

function volverPaso1() {
  document.getElementById('step-2').style.display = 'none';
  document.getElementById('step-1').style.display = 'block';
  document.getElementById('login-error-1').style.display = 'none';
}

// ── PASO 2: LOGIN SAP ──
async function doLogin() {
  const company = document.getElementById('login-company').value;
  const user    = document.getElementById('login-user').value.trim();
  const pass    = document.getElementById('login-pass').value;
  const errEl   = document.getElementById('login-error-2');
  const btn     = document.getElementById('login-btn');
  errEl.style.display = 'none';

  if (!company || !user || !pass) { errEl.textContent = 'Completá todos los campos.'; errEl.style.display = 'block'; return; }

  if (user === 'demo' && pass === 'demo123') { loginSuccess(user, company); return; }

  btn.disabled = true; btn.textContent = 'Conectando con SAP...';

  try {
    const res  = await fetchWithTimeout('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_cliente: sessionIdCliente, companydb: company, username: user, password: pass })
    });
    const data = await res.json();

    if (data.autorizado === true) {
      sessionSapUrl  = data.url_sap || '';
      sessionCookie  = data.cookieHeaders || '';
      loginSuccess(user, company);
    } else {
      errEl.textContent = data.error || 'Credenciales inválidas en SAP.'; errEl.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Ingresar a Pistacho →';
    }
  } catch(e) {
    const msg = e.name === 'AbortError' ? 'Tiempo de espera agotado. Intentá de nuevo.' : 'No se pudo conectar. Intentá de nuevo.';
    errEl.textContent = msg; errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Ingresar a Pistacho →';
  }
}

function loginSuccess(user, company) {
  sessionUser    = user;
  sessionCompany = company;
  const overlay  = document.getElementById('login-overlay');
  overlay.style.transition = 'opacity 0.3s';
  overlay.style.opacity    = '0';
  setTimeout(() => overlay.style.display = 'none', 300);

  document.getElementById('company-badge').textContent = company;
  document.getElementById('ctx-id').textContent        = sessionIdCliente;
  document.getElementById('ctx-user').textContent      = user.toUpperCase();
  document.getElementById('ctx-db').textContent        = company;
  document.getElementById('ctx-session').textContent   = new Date().toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'});
  document.getElementById('ctx-queries').textContent   = '0';

  addBotMessage(`¡Hola **${user}**! Estoy conectado a tu base de datos de SAP Business One. ¿En qué te puedo ayudar hoy? Podés preguntarme sobre ventas, compras, inventario o finanzas.`);
}

// ── CHAT ──
function getTime() { return new Date().toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'}); }

function addUserMessage(text) {
  document.getElementById('welcome-msg')?.remove();
  const msgs = document.getElementById('messages');
  const el   = document.createElement('div');
  el.className = 'msg user';
  el.innerHTML = `<div class="msg-avatar">👤</div><div class="msg-content"><div class="bubble">${escHtml(text)}</div><div class="msg-time">${getTime()}</div></div>`;
  msgs.appendChild(el); scrollBottom();
}

function addBotMessage(text) {
  const msgs      = document.getElementById('messages');
  const el        = document.createElement('div');
  el.className    = 'msg bot';
  const formatted = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/;/g, '<br>')
    .replace(/\n/g, '<br>');
  el.innerHTML = `<div class="msg-avatar">🌿</div><div class="msg-content"><div class="bubble">${formatted}</div><div class="msg-time">${getTime()}</div></div>`;
  msgs.appendChild(el); scrollBottom();
}

function showTyping() {
  const msgs = document.getElementById('messages');
  const el   = document.createElement('div');
  el.className = 'typing-indicator'; el.id = 'typing';
  el.innerHTML = `<div class="typing-avatar">🌿</div><div class="typing-bubble"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>`;
  msgs.appendChild(el); scrollBottom();
}

function hideTyping()   { document.getElementById('typing')?.remove(); }
function scrollBottom() { const m = document.getElementById('messages'); m.scrollTop = m.scrollHeight; }
function escHtml(t)     { return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const text  = input.value.trim();
  if (!text || isTyping) return;
  if (!canQuery()) { addBotMessage('Esperá un momento antes de enviar otra consulta.'); return; }
  input.value = ''; input.style.height = 'auto';
  addUserMessage(text); await callPistacho(text);
}

async function sendQuick(text) {
  if (isTyping) return;
  if (!canQuery()) { addBotMessage('Esperá un momento antes de enviar otra consulta.'); return; }
  document.getElementById('chat-input').value = '';
  addUserMessage(text); await callPistacho(text);
}

async function callPistacho(userText) {
  isTyping = true;
  document.getElementById('send-btn').disabled = true;
  showTyping();

  const cleanText = sanitize(userText);
  conversationHistory.push({ role: 'user', content: cleanText });

  // Limitar historial a últimas 10 interacciones
  if (conversationHistory.length > 10) conversationHistory = conversationHistory.slice(-10);

  const payload = {
    consulta_usuario: cleanText,
    historial:        JSON.stringify(conversationHistory),
    id_cliente:       sessionIdCliente,
    usuario:          sessionUser,
    companydb:        sessionCompany,
    url_sap:          sessionSapUrl || '',
    cookieHeaders:    sessionCookie || ''
  };

  try {
    let res  = await fetchWithTimeout('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    let data = await res.json();

    // Si SAP devolvió 401 → renovar cookie y reintentar
    if (data.error && String(data.error).includes('401')) {
      const renovado = await renovarCookie();
      if (renovado) {
        payload.cookieHeaders = sessionCookie;
        res  = await fetchWithTimeout('/api/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        data = await res.json();
      }
    }

    // Manejo de errores SAP específicos
    if (data.error) {
      let reply = 'Ocurrió un error. Intentá de nuevo.';
      if (String(data.error).includes('timeout'))    reply = 'SAP tardó demasiado en responder. Intentá de nuevo.';
      if (String(data.error).includes('connection')) reply = 'No pude conectar con SAP en este momento.';
      hideTyping(); addBotMessage(reply);
      conversationHistory.pop();
      isTyping = false;
      document.getElementById('send-btn').disabled = false;
      document.getElementById('chat-input').focus();
      return;
    }

    let reply = data.respuesta || data.mensaje_bot || data.output_text || (typeof data === 'string' ? data : '');
    if (!reply) reply = 'No pude obtener una respuesta. Intentá de nuevo.';

    conversationHistory.push({ role: 'assistant', content: reply });
    queryCount++;
    document.getElementById('ctx-queries').textContent = queryCount;

    hideTyping(); addBotMessage(reply);
  } catch(e) {
    hideTyping();
    const msg = e.name === 'AbortError'
      ? 'La consulta tardó demasiado. Intentá de nuevo.'
      : 'Hubo un error al conectar. Verificá tu conexión e intentá de nuevo.';
    addBotMessage(msg);
    conversationHistory.pop();
  }

  isTyping = false;
  document.getElementById('send-btn').disabled = false;
  document.getElementById('chat-input').focus();
}

function handleKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }
function autoResize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }

document.addEventListener('keydown', function(e) {
  if (e.key !== 'Enter') return;
  const overlay = document.getElementById('login-overlay');
  if (getComputedStyle(overlay).display === 'none') return;
  document.getElementById('step-2').style.display === 'none' ? buscarBases() : doLogin();
});

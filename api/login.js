import crypto from 'node:crypto';

// SAP Service Layer suele usar certificados autofirmados
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  let body = {};
  try {
    body = typeof req.body === 'object' ? req.body : JSON.parse(req.body);
  } catch(e) {
    return res.status(400).json({ error: 'invalid_json' });
  }

  const { id_cliente, companydb, username, password } = body;
  if (!id_cliente || !companydb || !username || !password)
    return res.status(400).json({ error: 'bad_request' });

  const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
  const APPS_SECRET     = process.env.APPS_SECRET;

  try {
    // Paso 1: obtener url_sap desde Apps Script
    const ts  = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac('sha256', APPS_SECRET).update(`${id_cliente}|${ts}`).digest('hex');
    const appsUrl = `${APPS_SCRIPT_URL}?id_cliente=${encodeURIComponent(id_cliente)}&companydb=${encodeURIComponent(companydb)}&ts=${ts}&sig=${sig}`;

    const appsRes  = await fetch(appsUrl);
    const appsData = await appsRes.json();

    if (!appsData.url_sap) {
      return res.status(401).json({ error: 'cliente_no_encontrado' });
    }

    // url_sap ya incluye /b1s/v1 en el Apps Script
    const url_sap = appsData.url_sap.replace(/\/$/, '');

    // Paso 2: login directo a SAP Business One Service Layer
    const sapRes = await fetch(`${url_sap}/Login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ UserName: username, Password: password, CompanyDB: companydb })
    });

    const sapRawText = await sapRes.text();

    if (sapRes.ok) {
      const setCookie    = sapRes.headers.get('set-cookie') || '';
      const sessionMatch = setCookie.match(/B1SESSION=([^;]+)/);
      const routeMatch   = setCookie.match(/ROUTEID=([^;]+)/);

      let sessionId = sessionMatch?.[1];
      if (!sessionId) {
        try {
          const sapData = JSON.parse(sapRawText);
          sessionId = sapData.SessionId || '';
        } catch(e) {}
      }

      if (sessionId) {
        const cookieHeaders = [
          `B1SESSION=${sessionId}`,
          routeMatch ? `ROUTEID=${routeMatch[1]}` : ''
        ].filter(Boolean).join('; ');

        return res.status(200).json({ autorizado: true, cookieHeaders, url_sap });
      }
    }

    return res.status(401).json({ error: 'Credenciales inválidas en SAP.' });

  } catch (e) {
    return res.status(500).json({ error: 'sap_connection_error', detalle: e.message });
  }
}

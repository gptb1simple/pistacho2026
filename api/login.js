const crypto = require('crypto');
const https  = require('https');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const { id_cliente, companydb, username, password } = body;
  if (!id_cliente || !companydb || !username || !password)
    return res.status(400).json({ error: 'bad_request' });

  const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
  const APPS_SECRET     = process.env.APPS_SECRET;

  try {
    const ts  = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac('sha256', APPS_SECRET).update(`${id_cliente}|${ts}`).digest('hex');
    const url = `${APPS_SCRIPT_URL}?id_cliente=${encodeURIComponent(id_cliente)}&companydb=${encodeURIComponent(companydb)}&ts=${ts}&sig=${sig}`;

    const scriptRes  = await fetch(url);
    const scriptData = await scriptRes.json();

    if (scriptData.error) return res.status(403).json({ error: scriptData.error });

    const url_sap = (scriptData.url_sap || '').replace(/\/$/, '');
    if (!url_sap) return res.status(500).json({ error: 'url_sap_missing' });

    const agent  = new https.Agent({ rejectUnauthorized: false });
    const sapRes = await fetch(`${url_sap}/Login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ UserName: username, Password: password, CompanyDB: companydb }),
      agent
    });

    if (sapRes.status === 200) {
      const setCookie    = sapRes.headers.get('set-cookie') || '';
      const sessionMatch = setCookie.match(/B1SESSION=([^;]+)/);
      const routeMatch   = setCookie.match(/ROUTEID=([^;]+)/);
      const cookieHeaders = [
        sessionMatch ? `B1SESSION=${sessionMatch[1]}` : '',
        routeMatch   ? `ROUTEID=${routeMatch[1]}`     : ''
      ].filter(Boolean).join('; ');

      return res.status(200).json({ autorizado: true, cookieHeaders, url_sap });
    } else {
      return res.status(401).json({ error: 'credenciales_invalidas' });
    }

  } catch (e) {
    return res.status(500).json({ error: 'server_error', detalle: e.message });
  }
}

const crypto = require('crypto');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const { id_cliente, companydb, username, password } = JSON.parse(event.body || '{}');
  if (!id_cliente || !companydb || !username || !password)
    return { statusCode: 400, body: JSON.stringify({ error: 'bad_request' }) };

  const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
  const APPS_SECRET     = process.env.APPS_SECRET;

  try {
    // 1. Obtener url_sap del Apps Script
    const ts  = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac('sha256', APPS_SECRET).update(`${id_cliente}|${ts}`).digest('hex');
    const url = `${APPS_SCRIPT_URL}?id_cliente=${encodeURIComponent(id_cliente)}&companydb=${encodeURIComponent(companydb)}&ts=${ts}&sig=${sig}`;

    const scriptRes  = await fetch(url);
    const scriptData = await scriptRes.json();

    if (scriptData.error) return { statusCode: 403, body: JSON.stringify({ error: scriptData.error }) };

    const url_sap = (scriptData.url_sap || '').replace(/\/$/, '');
    if (!url_sap) return { statusCode: 500, body: JSON.stringify({ error: 'url_sap_missing' }) };

    // 2. Login directo en SAP con usuario y contraseña del cliente
    const sapRes = await fetch(`${url_sap}/Login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        UserName:  username,
        Password:  password,
        CompanyDB: companydb
      })
    });

    if (sapRes.status === 200) {
      const setCookie    = sapRes.headers.get('set-cookie') || '';
      const sessionMatch = setCookie.match(/B1SESSION=([^;]+)/);
      const routeMatch   = setCookie.match(/ROUTEID=([^;]+)/);
      const cookieHeaders = [
        sessionMatch ? `B1SESSION=${sessionMatch[1]}` : '',
        routeMatch   ? `ROUTEID=${routeMatch[1]}`     : ''
      ].filter(Boolean).join('; ');

      return {
        statusCode: 200,
        body: JSON.stringify({ autorizado: true, cookieHeaders, url_sap })
      };
    } else {
      return { statusCode: 401, body: JSON.stringify({ error: 'credenciales_invalidas' }) };
    }

  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: 'server_error', detalle: e.message }) };
  }
};

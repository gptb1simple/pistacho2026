const crypto = require('crypto');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const { id_cliente, companydb } = JSON.parse(event.body || '{}');
  if (!id_cliente || !companydb) return { statusCode: 400, body: JSON.stringify({ error: 'bad_request' }) };

  const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
  const APPS_SECRET     = process.env.APPS_SECRET;
  const MAKE_LOGIN_URL  = process.env.MAKE_LOGIN_URL;

  try {
    const ts  = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac('sha256', APPS_SECRET).update(`${id_cliente}|${ts}`).digest('hex');
    const url = `${APPS_SCRIPT_URL}?id_cliente=${encodeURIComponent(id_cliente)}&companydb=${encodeURIComponent(companydb)}&ts=${ts}&sig=${sig}`;

    const scriptRes  = await fetch(url);
    const scriptData = await scriptRes.json();

    if (scriptData.error) return { statusCode: 403, body: JSON.stringify({ error: scriptData.error }) };

    const makeRes  = await fetch(MAKE_LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username:  scriptData.username,
        password:  scriptData.password,
        companydb: scriptData.companydb,
        url_sap:   scriptData.url_sap
      })
    });
    const makeData = await makeRes.json();

    if (makeData.autorizado === true) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          autorizado:    true,
          cookieHeaders: makeData.cookieHeaders || '',
          url_sap:       makeData.url_sap || scriptData.url_sap
        })
      };
    } else {
      return { statusCode: 401, body: JSON.stringify({ error: makeData.error || 'login_failed' }) };
    }
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: 'server_error' }) };
  }
};

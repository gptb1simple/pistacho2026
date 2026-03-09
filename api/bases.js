const crypto = require('crypto');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const { id_cliente } = JSON.parse(event.body || '{}');
  if (!id_cliente) return { statusCode: 400, body: JSON.stringify({ error: 'bad_request' }) };

  const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
  const APPS_SECRET     = process.env.APPS_SECRET;

  const ts  = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', APPS_SECRET).update(`${id_cliente}|${ts}`).digest('hex');
  const url = `${APPS_SCRIPT_URL}?id_cliente=${encodeURIComponent(id_cliente)}&ts=${ts}&sig=${sig}`;

  try {
    const res  = await fetch(url);
    const data = await res.json();
    return { statusCode: 200, body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: 'apps_script_error' }) };
  }
};

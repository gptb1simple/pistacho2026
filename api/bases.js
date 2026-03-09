const crypto = require('crypto');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const { id_cliente } = body;
  if (!id_cliente) return res.status(400).json({ error: 'bad_request' });

  const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
  const APPS_SECRET     = process.env.APPS_SECRET;

  const ts  = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', APPS_SECRET).update(`${id_cliente}|${ts}`).digest('hex');
  const url = `${APPS_SCRIPT_URL}?id_cliente=${encodeURIComponent(id_cliente)}&ts=${ts}&sig=${sig}`;

  try {
    const response = await fetch(url);
    const data     = await response.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: 'apps_script_error' });
  }
}

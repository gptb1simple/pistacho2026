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

  const MAKE_LOGIN_URL = process.env.MAKE_LOGIN_URL;

  try {
    const makeRes  = await fetch(MAKE_LOGIN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id_cliente, companydb, username, password })
    });
    const makeData = await makeRes.json();

    if (makeData.autorizado === true) {
      return res.status(200).json({
        autorizado:    true,
        cookieHeaders: makeData.cookieHeaders || '',
        url_sap:       makeData.url_sap       || ''
      });
    } else {
      return res.status(401).json({ error: makeData.error || 'credenciales_invalidas' });
    }
  } catch (e) {
    return res.status(500).json({ error: 'credenciales_invalidas', detalle: e.message });
  }
}

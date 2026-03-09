export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { consulta_usuario, historial, id_cliente, usuario, companydb, url_sap, cookieHeaders } = req.body || {};
  if (!consulta_usuario) return res.status(400).json({ error: 'bad_request' });

  const MAKE_QUERY_URL = process.env.MAKE_QUERY_URL;

  let hist = [];
  try { hist = JSON.parse(historial || '[]'); } catch(e) {}

  try {
    const response = await fetch(MAKE_QUERY_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        consulta_usuario,
        historial:     JSON.stringify(hist.slice(-10)),
        id_cliente:    id_cliente    || '',
        usuario:       usuario       || '',
        companydb:     companydb     || '',
        url_sap:       url_sap       || '',
        cookieHeaders: cookieHeaders || ''
      })
    });

    const rawText = await response.text();
    let texto = '';
    try {
      const data = JSON.parse(rawText);
      texto = typeof data.respuesta === 'string' ? data.respuesta.trim() : '';
    } catch(e) {
      texto = rawText.trim();
    }

    if (!texto) texto = 'No pude generar una respuesta.';
    return res.status(200).json({ respuesta: texto });

  } catch (e) {
    return res.status(500).json({ error: 'make_error', detalle: e.message });
  }
}

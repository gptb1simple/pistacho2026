exports.handler = async (event) => {
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, body: 'Method Not Allowed' };

  const body = JSON.parse(event.body || '{}');
  const { consulta_usuario, historial, id_cliente, usuario, companydb, url_sap, cookieHeaders } = body;

  if (!consulta_usuario)
    return { statusCode: 400, body: JSON.stringify({ error: 'bad_request' }) };

  const MAKE_QUERY_URL = process.env.MAKE_QUERY_URL;

  let hist = [];
  try { hist = JSON.parse(historial || '[]'); } catch(e) {}

  const histLimitado = hist.slice(-10);

  try {

    const res = await fetch(MAKE_QUERY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        consulta_usuario,
        historial: JSON.stringify(histLimitado),
        id_cliente: id_cliente || '',
        usuario: usuario || '',
        companydb: companydb || '',
        url_sap: url_sap || '',
        cookieHeaders: cookieHeaders || ''
      })
    });

    const data = await res.json();

    let texto = '';

    try {

      if (data.respuesta) {

        if (typeof data.respuesta === 'string') {
          const parsed = JSON.parse(data.respuesta);
          texto = parsed.mensaje_bot || data.respuesta;
        }

        if (typeof data.respuesta === 'object') {
          texto = data.respuesta.mensaje_bot || '';
        }

      }

    } catch (e) {
      texto = data.respuesta || 'No pude generar respuesta.';
    }

    if (!texto) texto = 'No pude generar una respuesta.';

    return {
      statusCode: 200,
      body: JSON.stringify({ respuesta: texto })
    };

  } catch (e) {

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'make_error' })
    };

  }
};

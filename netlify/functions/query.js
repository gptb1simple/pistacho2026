process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

async function callOpenAI(apiKey, model, messages, tools) {
  const body = { model, messages, max_tokens: 2000 };
  if (tools) { body.tools = tools; body.tool_choice = 'auto'; }
  const res = await fetch(OPENAI_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body:    JSON.stringify(body)
  });
  return res.json();
}

const SAP_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'query_sap',
      description: 'Consulta una vista de SAP Business One. Llamala varias veces si necesitás cruzar datos.',
      parameters: {
        type: 'object',
        properties: {
          endpoint: {
            type: 'string',
            enum: [
              '/sml.svc/B1S_BOT_VENTAS_NPV',
              '/sml.svc/B1S_BOT_VENTAS_DETALLE',
              '/sml.svc/B1S_BOT_ABM_CLIENTES',
              '/sml.svc/B1S_BOT_ABM_ARTICULOS',
              '/sml.svc/B1S_BOT_COMPRAS_DETALLE',
              '/sml.svc/B1S_BOT_ABM_PROVEEDORES',
              '/sml.svc/B1S_BOT_INV_STOCKS'
            ]
          },
          params: { type: 'string', description: 'Query string OData sin el ?' }
        },
        required: ['endpoint']
      }
    }
  }
];

const SYSTEM = `Sos Pistacho, asistente de SAP Business One. Respondés en español, de forma clara y directa.

━━━ REGLAS DE DOMINIO ━━━
Si el dominio no está claro → preguntar UNA SOLA VEZ:
{"mensaje_bot":"¿Te referís a ventas, compras, inventario, tesorería o contabilidad?"}

Defaults automáticos (nunca preguntar):
- top clientes / ranking clientes → ventas, métrica ImporteARS
- top artículos → ventas, métrica ImporteARS
- top proveedores → compras, métrica ImporteARS
- más stock → inventario, métrica Disponible
- evolución / tendencia / cómo viene → traer todos los movimientos sin filtro de período

Si la consulta es analítica (top, ranking, mayor, menor, evolución) y no tiene dimensión clara → preguntar UNA SOLA VEZ:
{"mensaje_bot":"¿Querés ver el análisis por clientes, artículos, proveedores, vendedores o depósitos?"}

━━━ VISTAS DISPONIBLES ━━━

VENTAS (base):
/sml.svc/B1S_BOT_VENTAS_NPV → campos: Fecha, Documento, Cliente, ImporteARS, Moneda, TipodeCambio, Circuito, id__

VENTAS (por artículo / margen / vendedor):
/sml.svc/B1S_BOT_VENTAS_DETALLE → campos: Fecha, Documento, Cliente, Articulo, Cantidad, ImporteARS, CostoTotalARS, ContribucionARS, Moneda, TipodeCambio, Vendedor, Circuito, id__

CLIENTES (nombres):
/sml.svc/B1S_BOT_ABM_CLIENTES → campos: Cliente, NombreCliente, GrupoCliente, id__

ARTÍCULOS (nombres):
/sml.svc/B1S_BOT_ABM_ARTICULOS → campos: Articulo, NombreArticulo, GrupoArticulo, id__

COMPRAS:
/sml.svc/B1S_BOT_COMPRAS_DETALLE → campos: Fecha, Documento, Proveedor, ImporteARS, Moneda, TipodeCambio, Circuito, id__

PROVEEDORES (nombres):
/sml.svc/B1S_BOT_ABM_PROVEEDORES → campos: Proveedor, NombreProveedor, GrupoProveedor, id__

INVENTARIO:
/sml.svc/B1S_BOT_INV_STOCKS → campos: Articulo, Deposito, Stock, Comprometido, Solicitado, Disponible, id__

━━━ REGLAS DE DATOS ━━━
- Valores NULL → ignorarlos, calcular sumando líneas directamente sin mencionarlo al usuario
- FECHAS → filtrar con $filter=Fecha ge 'YYYY-MM-DD'. Si no especifica período, usar el año más reciente SIN preguntar
- RANKINGS → consolidar todos los registros, sumar por dimensión, ordenar descendente, mostrar top N
- JOINS → consultá el maestro correspondiente y cruzá internamente. Si no hay maestro, mostrar el código
- Usá $top=500 para rankings. Para maestros $top=1000

━━━ FORMATO DE RESPUESTA ━━━
1️⃣ Una línea con el resultado principal
2️⃣ Lista numerada con los datos (máximo 10 ítems)
3️⃣ Una línea de insight accionable (solo si aporta valor real)`;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, body: 'Method Not Allowed' };

  const body = JSON.parse(event.body || '{}');
  const { consulta_usuario, historial, usuario, companydb, url_sap, cookieHeaders } = body;
  if (!consulta_usuario)
    return { statusCode: 400, body: JSON.stringify({ error: 'bad_request' }) };

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const MODEL          = process.env.OPENAI_MODEL || 'gpt-4o';

  let hist = [];
  try { hist = JSON.parse(historial || '[]'); } catch(e) {}

  const messages = [
    { role: 'system', content: SYSTEM },
    ...hist.slice(-8),
    { role: 'user', content: consulta_usuario }
  ];

  try {
    const MAX_CALLS = 4;
    let calls = 0;

    while (calls < MAX_CALLS) {
      const result = await callOpenAI(OPENAI_API_KEY, MODEL, messages, SAP_TOOLS);
      const choice = result.choices?.[0];
      if (!choice) break;

      messages.push(choice.message);

      if (!choice.message.tool_calls?.length) {
        return { statusCode: 200, body: JSON.stringify({ respuesta: choice.message.content || 'No pude generar una respuesta.' }) };
      }

      for (const toolCall of choice.message.tool_calls) {
        const args   = JSON.parse(toolCall.function.arguments);
        const sapUrl = `${url_sap}${args.endpoint}${args.params ? '?' + args.params : ''}`;

        const sapRes = await fetch(sapUrl, {
          method:  'GET',
          headers: { 'Cookie': cookieHeaders, 'Prefer': 'odata.maxpagesize=500' }
        });

        if (sapRes.status === 401)
          return { statusCode: 200, body: JSON.stringify({ error: '401 - sesión SAP expirada' }) };

        let content = '[]';
        if (sapRes.ok) {
          const sapData = await sapRes.json();
          const records = sapData.value ?? sapData;
          content = JSON.stringify(records).slice(0, 10000);
        }

        messages.push({ role: 'tool', tool_call_id: toolCall.id, content });
      }

      calls++;
    }

    return { statusCode: 200, body: JSON.stringify({ respuesta: 'No pude generar una respuesta. Intentá de nuevo.' }) };

  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: 'query_error', detalle: e.message }) };
  }
};

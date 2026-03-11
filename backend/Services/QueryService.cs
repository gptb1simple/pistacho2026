using System.Text.Json;
using OpenAI;
using OpenAI.Chat;
using PistachoApi.Models;

namespace PistachoApi.Services;

public class QueryService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ChatClient         _chatClient;

    private static readonly string[] SapEndpoints =
    [
        "/sml.svc/B1S_BOT_VENTAS_NPV",
        "/sml.svc/B1S_BOT_VENTAS_DETALLE",
        "/sml.svc/B1S_BOT_ABM_CLIENTES",
        "/sml.svc/B1S_BOT_ABM_ARTICULOS",
        "/sml.svc/B1S_BOT_COMPRAS_DETALLE",
        "/sml.svc/B1S_BOT_ABM_PROVEEDORES",
        "/sml.svc/B1S_BOT_INV_STOCKS"
    ];

    private static readonly ChatTool SapTool = ChatTool.CreateFunctionTool(
        functionName: "query_sap",
        functionDescription: "Consulta una vista de SAP Business One. Llamala varias veces si necesitás cruzar datos.",
        functionParameters: BinaryData.FromString("""
        {
            "type": "object",
            "properties": {
                "endpoint": {
                    "type": "string",
                    "enum": [
                        "/sml.svc/B1S_BOT_VENTAS_NPV",
                        "/sml.svc/B1S_BOT_VENTAS_DETALLE",
                        "/sml.svc/B1S_BOT_ABM_CLIENTES",
                        "/sml.svc/B1S_BOT_ABM_ARTICULOS",
                        "/sml.svc/B1S_BOT_COMPRAS_DETALLE",
                        "/sml.svc/B1S_BOT_ABM_PROVEEDORES",
                        "/sml.svc/B1S_BOT_INV_STOCKS"
                    ]
                },
                "params": {
                    "type": "string",
                    "description": "Query string OData sin el ?. Ej: $select=Cliente,ImporteARS&$top=500"
                }
            },
            "required": ["endpoint"]
        }
        """)
    );

    public QueryService(IHttpClientFactory httpClientFactory)
    {
        _httpClientFactory = httpClientFactory;
        var apiKey = Environment.GetEnvironmentVariable("OPENAI_API_KEY") ?? "";
        var model  = Environment.GetEnvironmentVariable("OPENAI_MODEL")   ?? "gpt-4o";
        _chatClient = new OpenAIClient(apiKey).GetChatClient(model);
    }

    public async Task<object> ExecuteAsync(QueryRequest req)
    {
        var today    = DateTime.Now.ToString("yyyy-MM-dd");
        var thisYear = DateTime.Now.Year;

        var systemPrompt = $"""
            Sos Pistacho, asistente de SAP Business One para la empresa {req.companydb}. Hoy es {today}.
            Respondés preguntas en español sobre ventas, compras, inventario y finanzas usando datos reales de SAP.

            ━━━ REGLAS DE DOMINIO ━━━
            Si el dominio no está claro → preguntar UNA SOLA VEZ:
            {{"mensaje_bot":"¿Te referís a ventas, compras, inventario, tesorería o contabilidad?"}}

            Defaults automáticos (nunca preguntar):
            - top clientes / ranking clientes → ventas, métrica ImporteARS
            - top artículos → ventas, métrica ImporteARS
            - top proveedores → compras, métrica ImporteARS
            - más stock → inventario, métrica Disponible
            - evolución / tendencia / cómo viene → traer todos los movimientos sin filtro de período

            Si la consulta es analítica (top, ranking, mayor, menor, evolución) y no tiene dimensión clara → preguntar UNA SOLA VEZ:
            {{"mensaje_bot":"¿Querés ver el análisis por clientes, artículos, proveedores, vendedores o depósitos?"}}

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
            - FECHAS → filtrar con $filter=Fecha ge 'YYYY-MM-DD'. Si no especifica período, usar {thisYear} SIN preguntar
            - RANKINGS → consolidar todos los registros, sumar por dimensión, ordenar descendente, mostrar top N
            - JOINS → consultá el maestro correspondiente y cruzá internamente. Si no hay maestro, mostrar el código
            - Usá $top=500 para rankings. Para maestros $top=1000

            ━━━ FORMATO DE RESPUESTA ━━━
            1️⃣ Una línea con el resultado principal
            2️⃣ Lista numerada con los datos (máximo 10 ítems)
            3️⃣ Una línea de insight accionable (solo si aporta valor real)
            """;

        // Armar historial de conversación
        var messages = new List<ChatMessage> { new SystemChatMessage(systemPrompt) };

        if (!string.IsNullOrEmpty(req.historial))
        {
            try
            {
                var hist = JsonSerializer.Deserialize<JsonElement[]>(req.historial);
                if (hist != null)
                {
                    foreach (var msg in hist.TakeLast(8))
                    {
                        var role    = msg.GetProperty("role").GetString();
                        var content = msg.GetProperty("content").GetString() ?? "";
                        if (role == "user")      messages.Add(new UserChatMessage(content));
                        if (role == "assistant") messages.Add(new AssistantChatMessage(content));
                    }
                }
            }
            catch { /* historial inválido, ignorar */ }
        }

        messages.Add(new UserChatMessage(req.consulta_usuario));

        var options = new ChatCompletionOptions();
        options.Tools.Add(SapTool);

        var sapClient = _httpClientFactory.CreateClient("sap");

        // Loop: GPT puede llamar múltiples vistas SAP para JOINs
        for (int i = 0; i < 4; i++)
        {
            var completion = await _chatClient.CompleteChatAsync(messages, options);
            messages.Add(new AssistantChatMessage(completion.Value));

            if (completion.Value.FinishReason == ChatFinishReason.Stop)
                return new { respuesta = completion.Value.Content[0].Text };

            if (completion.Value.FinishReason == ChatFinishReason.ToolCalls)
            {
                foreach (var toolCall in completion.Value.ToolCalls)
                {
                    var args     = JsonSerializer.Deserialize<JsonElement>(toolCall.FunctionArguments);
                    var endpoint = args.GetProperty("endpoint").GetString()!;
                    var @params  = args.TryGetProperty("params", out var p) ? p.GetString() : null;

                    var sapUrl = $"{req.url_sap}{endpoint}{(@params != null ? "?" + @params : "")}";

                    string toolResult;
                    try
                    {
                        var sapReq = new HttpRequestMessage(HttpMethod.Get, sapUrl);
                        sapReq.Headers.TryAddWithoutValidation("Cookie",  req.cookieHeaders ?? "");
                        sapReq.Headers.TryAddWithoutValidation("Prefer",  "odata.maxpagesize=500");

                        var sapRes = await sapClient.SendAsync(sapReq);

                        if ((int)sapRes.StatusCode == 401)
                            return new { error = "401 - sesión SAP expirada" };

                        if (sapRes.IsSuccessStatusCode)
                        {
                            var body    = await sapRes.Content.ReadAsStringAsync();
                            var parsed  = JsonSerializer.Deserialize<JsonElement>(body);
                            var records = parsed.TryGetProperty("value", out var val) ? val : parsed;
                            toolResult  = records.GetRawText()[..Math.Min(records.GetRawText().Length, 10000)];
                        }
                        else
                        {
                            toolResult = "[]";
                        }
                    }
                    catch
                    {
                        toolResult = "[]";
                    }

                    messages.Add(new ToolChatMessage(toolCall.Id, toolResult));
                }
            }
        }

        return new { respuesta = "No pude generar una respuesta. Intentá de nuevo." };
    }
}

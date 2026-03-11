using System.Text;
using System.Text.Json;
using PistachoApi.Models;

namespace PistachoApi.Services;

public class LoginService
{
    private readonly IHttpClientFactory  _httpClientFactory;
    private readonly AppsScriptService   _appsScript;

    public LoginService(IHttpClientFactory httpClientFactory, AppsScriptService appsScript)
    {
        _httpClientFactory = httpClientFactory;
        _appsScript        = appsScript;
    }

    public async Task<object> LoginAsync(LoginRequest req)
    {
        // Paso 1: obtener url_sap desde Apps Script
        var clientData = await _appsScript.GetClientDataAsync(req.id_cliente, req.companydb);

        if (!clientData.TryGetProperty("url_sap", out var urlProp) || string.IsNullOrEmpty(urlProp.GetString()))
            return new { error = "cliente_no_encontrado" };

        var urlSap    = urlProp.GetString()!.TrimEnd('/');
        var loginUrl  = $"{urlSap}/Login";

        // Paso 2: login directo a SAP Service Layer
        var payload = new
        {
            UserName  = req.username,
            Password  = req.password,
            CompanyDB = req.companydb
        };

        var client  = _httpClientFactory.CreateClient("sap");
        var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
        var sapRes  = await client.PostAsync(loginUrl, content);

        if (sapRes.IsSuccessStatusCode)
        {
            // Extraer sesión del header Set-Cookie
            var sessionId   = string.Empty;
            var routeId     = string.Empty;

            if (sapRes.Headers.TryGetValues("Set-Cookie", out var cookies))
            {
                foreach (var cookie in cookies)
                {
                    var b1Match = System.Text.RegularExpressions.Regex.Match(cookie, @"B1SESSION=([^;]+)");
                    var rtMatch = System.Text.RegularExpressions.Regex.Match(cookie, @"ROUTEID=([^;]+)");
                    if (b1Match.Success) sessionId = b1Match.Groups[1].Value;
                    if (rtMatch.Success) routeId   = rtMatch.Groups[1].Value;
                }
            }

            // Fallback: SessionId en el body JSON
            if (string.IsNullOrEmpty(sessionId))
            {
                var bodyJson = await sapRes.Content.ReadAsStringAsync();
                var body     = JsonSerializer.Deserialize<JsonElement>(bodyJson);
                if (body.TryGetProperty("SessionId", out var sid))
                    sessionId = sid.GetString() ?? string.Empty;
            }

            if (!string.IsNullOrEmpty(sessionId))
            {
                var cookieHeaders = string.IsNullOrEmpty(routeId)
                    ? $"B1SESSION={sessionId}"
                    : $"B1SESSION={sessionId}; ROUTEID={routeId}";

                return new { autorizado = true, cookieHeaders, url_sap = urlSap };
            }
        }

        return new { error = "Credenciales inválidas en SAP." };
    }
}

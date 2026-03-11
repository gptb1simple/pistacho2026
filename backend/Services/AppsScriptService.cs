using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace PistachoApi.Services;

public class AppsScriptService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly string _scriptUrl;
    private readonly string _secret;

    public AppsScriptService(IHttpClientFactory httpClientFactory)
    {
        _httpClientFactory = httpClientFactory;
        _scriptUrl = Environment.GetEnvironmentVariable("APPS_SCRIPT_URL") ?? "";
        _secret    = Environment.GetEnvironmentVariable("APPS_SECRET")     ?? "";
    }

    // Devuelve las bases disponibles para un cliente
    public async Task<JsonElement> GetBasesAsync(string idCliente)
    {
        var url = BuildSignedUrl(idCliente, null);
        var client = _httpClientFactory.CreateClient("default");
        var res    = await client.GetAsync(url);
        var json   = await res.Content.ReadAsStringAsync();
        return JsonSerializer.Deserialize<JsonElement>(json);
    }

    // Devuelve url_sap para un cliente + companydb
    public async Task<JsonElement> GetClientDataAsync(string idCliente, string companydb)
    {
        var url    = BuildSignedUrl(idCliente, companydb);
        var client = _httpClientFactory.CreateClient("default");
        var res    = await client.GetAsync(url);
        var json   = await res.Content.ReadAsStringAsync();
        return JsonSerializer.Deserialize<JsonElement>(json);
    }

    private string BuildSignedUrl(string idCliente, string? companydb)
    {
        var ts  = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var sig = ComputeHmac($"{idCliente}|{ts}");
        var url = $"{_scriptUrl}?id_cliente={Uri.EscapeDataString(idCliente)}&ts={ts}&sig={sig}";
        if (companydb != null)
            url += $"&companydb={Uri.EscapeDataString(companydb)}";
        return url;
    }

    private string ComputeHmac(string data)
    {
        var key   = Encoding.UTF8.GetBytes(_secret);
        var msg   = Encoding.UTF8.GetBytes(data);
        var hmac  = new HMACSHA256(key);
        var hash  = hmac.ComputeHash(msg);
        return Convert.ToHexString(hash).ToLower();
    }
}

namespace PistachoApi.Models;

public record BasesRequest(string id_cliente);

public record LoginRequest(
    string id_cliente,
    string companydb,
    string username,
    string password);

public record QueryRequest(
    string consulta_usuario,
    string? historial,
    string? usuario,
    string? companydb,
    string? url_sap,
    string? cookieHeaders);

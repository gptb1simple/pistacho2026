using Microsoft.Extensions.FileProviders;
using PistachoApi.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();

// HttpClient con SSL bypass para SAP (usa certificados autofirmados)
builder.Services.AddHttpClient("sap").ConfigurePrimaryHttpMessageHandler(() =>
    new HttpClientHandler
    {
        ServerCertificateCustomValidationCallback =
            HttpClientHandler.DangerousAcceptAnyServerCertificateValidator
    });

builder.Services.AddHttpClient("default");

builder.Services.AddSingleton<AppsScriptService>();
builder.Services.AddSingleton<LoginService>();
builder.Services.AddSingleton<QueryService>();

var app = builder.Build();

// Archivos estáticos del frontend (directorio configurable via env var)
var staticPath = Environment.GetEnvironmentVariable("STATIC_FILES_PATH")
    ?? Path.Combine(app.Environment.ContentRootPath, "wwwroot");

if (Directory.Exists(staticPath))
{
    var fileProvider = new PhysicalFileProvider(staticPath);
    app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = fileProvider });
    app.UseStaticFiles(new StaticFileOptions { FileProvider = fileProvider });
}

app.UseRouting();
app.MapControllers();

// Fallback a index.html para SPA
app.MapFallbackToFile("index.html", new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(staticPath)
});

app.Run();

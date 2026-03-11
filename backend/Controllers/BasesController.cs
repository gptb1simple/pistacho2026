using Microsoft.AspNetCore.Mvc;
using PistachoApi.Models;
using PistachoApi.Services;

namespace PistachoApi.Controllers;

[ApiController]
[Route("api/bases")]
public class BasesController : ControllerBase
{
    private readonly AppsScriptService _appsScript;

    public BasesController(AppsScriptService appsScript) => _appsScript = appsScript;

    [HttpPost]
    public async Task<IActionResult> Post([FromBody] BasesRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.id_cliente))
            return BadRequest(new { error = "bad_request" });

        var result = await _appsScript.GetBasesAsync(req.id_cliente.Trim().ToUpper());
        return Ok(result);
    }
}

using Microsoft.AspNetCore.Mvc;
using PistachoApi.Models;
using PistachoApi.Services;

namespace PistachoApi.Controllers;

[ApiController]
[Route("api/query")]
public class QueryController : ControllerBase
{
    private readonly QueryService _queryService;

    public QueryController(QueryService queryService) => _queryService = queryService;

    [HttpPost]
    public async Task<IActionResult> Post([FromBody] QueryRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.consulta_usuario))
            return BadRequest(new { error = "bad_request" });

        var result = await _queryService.ExecuteAsync(req);
        return Ok(result);
    }
}

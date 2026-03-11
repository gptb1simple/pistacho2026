using Microsoft.AspNetCore.Mvc;
using PistachoApi.Models;
using PistachoApi.Services;

namespace PistachoApi.Controllers;

[ApiController]
[Route("api/login")]
public class LoginController : ControllerBase
{
    private readonly LoginService _loginService;

    public LoginController(LoginService loginService) => _loginService = loginService;

    [HttpPost]
    public async Task<IActionResult> Post([FromBody] LoginRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.id_cliente)  ||
            string.IsNullOrWhiteSpace(req.companydb)   ||
            string.IsNullOrWhiteSpace(req.username)    ||
            string.IsNullOrWhiteSpace(req.password))
            return BadRequest(new { error = "bad_request" });

        var result = await _loginService.LoginAsync(req);
        return Ok(result);
    }
}

# Prueba del rate-limiting de Kong (Semana 8, Paso 4).
# Uso: .\scripts\probar-rate-limit.ps1 [-BaseUrl http://localhost:8000] [-Peticiones 6]
#   .\scripts\probar-rate-limit.ps1 -BaseUrl https://kong-gateway-p9.onrender.com [-SslNoRevoke]
# Espera 200 en las primeras N-1 y, en la N.a, un 429 generado por Kong (minute: 5).
# Codigos de salida:
#   0 = OK: 200 en las primeras N-1 y 429 de Kong en la N.a
#   1 = no se vio el 429 o alguna de las primeras no fue 200 (contador ya usado: esperar al siguiente minuto)
#   2 = hubo 429, pero no de Kong (sin "API rate limit exceeded" ni X-RateLimit-Limit-Minute): otro proxy, p. ej. Cloudflare
# Usa curl.exe: en PowerShell "curl" es un alias de Invoke-WebRequest.
param(
  [string]$BaseUrl = "http://localhost:8000",
  [int]$Peticiones = 6,
  [int]$TimeoutSeg = 120,
  # Solo para equipos donde el antivirus impide a schannel comprobar la revocacion
  # (curl: (35) CRYPT_E_NO_REVOCATION_CHECK). No desactiva la validacion del certificado.
  [switch]$SslNoRevoke
)

$extra = @()
if ($SslNoRevoke) { $extra += "--ssl-no-revoke" }

$url = "$($BaseUrl.TrimEnd('/'))/productos"
Write-Output "URL: $url  (peticiones: $Peticiones)"
$previasOk = $true
foreach ($i in 1..($Peticiones - 1)) {
  $codigo = & curl.exe @extra -s -o NUL -m $TimeoutSeg -w "%{http_code}" $url
  Write-Output "Peticion ${i}: $codigo"
  if ($codigo -ne "200") { $previasOk = $false }
}

# La ultima peticion se muestra completa (estado, cabeceras X-RateLimit-* / Retry-After y cuerpo).
$salida = (& curl.exe @extra -s -i -m $TimeoutSeg -w "`n__CODIGO__%{http_code}" $url) -join "`n"
$partes = $salida -split "__CODIGO__"
$ultimo = $partes[-1].Trim()
$respuesta = $partes[0]
Write-Output "Peticion ${Peticiones}: $ultimo"
Write-Output ""
Write-Output "Peticion $Peticiones completa (curl.exe -i):"
Write-Output $respuesta

# Un 429 cuenta como de Kong solo si trae el cuerpo y la cabecera del plugin rate-limiting.
$cuerpoKong = $respuesta -match 'API rate limit exceeded'
$cabeceraKong = $respuesta -match '(?im)^X-RateLimit-Limit-Minute:'

if ($ultimo -eq "429" -and -not ($cuerpoKong -and $cabeceraKong)) {
  Write-Output "RESULTADO: 429 de otro proxy (Cloudflare/Render), no de Kong: falta 'API rate limit exceeded' o X-RateLimit-Limit-Minute"
  exit 2
}
if (-not $previasOk) {
  Write-Output "RESULTADO: alguna de las primeras $($Peticiones - 1) peticiones no fue 200 (contador ya usado o servicio caido); repetir al inicio de un minuto"
  exit 1
}
if ($ultimo -eq "429") {
  Write-Output "RESULTADO: OK, Kong devolvio 429 (API rate limit exceeded) en la peticion $Peticiones"
  exit 0
}
Write-Output "RESULTADO: no se vio 429 en la peticion $Peticiones (ultimo codigo: $ultimo)"
exit 1

# Prueba del rate-limiting de Kong (Semana 8, Paso 4).
# Uso: .\scripts\probar-rate-limit.ps1 [-BaseUrl http://localhost:8000] [-Peticiones 6]
#   .\scripts\probar-rate-limit.ps1 -BaseUrl https://kong-gateway-p9.onrender.com
# Espera 200 en las primeras 5 y 429 a partir de la 6.a (minute: 5).
# Usa curl.exe: en PowerShell "curl" es un alias de Invoke-WebRequest.
param(
  [string]$BaseUrl = "http://localhost:8000",
  [int]$Peticiones = 6,
  [int]$TimeoutSeg = 120
)

$url = "$($BaseUrl.TrimEnd('/'))/productos"
Write-Output "URL: $url  (peticiones: $Peticiones)"
foreach ($i in 1..($Peticiones - 1)) {
  $codigo = & curl.exe -s -o NUL -m $TimeoutSeg -w "%{http_code}" $url
  Write-Output "Peticion ${i}: $codigo"
}

# La ultima peticion se muestra completa (estado, cabeceras X-RateLimit-* / Retry-After y cuerpo).
$salida = (& curl.exe -s -i -m $TimeoutSeg -w "`n__CODIGO__%{http_code}" $url) -join "`n"
$partes = $salida -split "__CODIGO__"
$ultimo = $partes[-1].Trim()
Write-Output "Peticion ${Peticiones}: $ultimo"
Write-Output ""
Write-Output "Peticion $Peticiones completa (curl.exe -i):"
Write-Output $partes[0]

if ($ultimo -eq "429") {
  Write-Output "RESULTADO: OK, Kong devolvio 429 en la peticion $Peticiones"
  exit 0
}
Write-Output "RESULTADO: no se vio 429 en la peticion $Peticiones (ultimo codigo: $ultimo)"
exit 1

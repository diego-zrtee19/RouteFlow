
# open-dev-server.ps1
# Abre el servidor de desarrollo Next.js con las variables de entorno necesarias
$envDir = "C:\Users\diego\OneDrive\Desktop\RouteFlow"
Write-Output "=== Cargando variables de entorno desde .env.local ==="
$loaded = 0
Get-Content "$envDir\.env.local" -Encoding utf8 | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
        $parts = $line.Split('=', 2)
        $key = $parts[0].Trim()
        $val = $parts[1].Trim()
        if ($val.StartsWith('"') -and $val.EndsWith('"') -and $val.Length -gt 1) {
            $val = $val.Substring(1, $val.Length - 2)
        }
        Set-Item "env:$key" -Value $val
        $loaded++
    }
}
Write-Output "Variables cargadas: " + $loaded
Write-Output ""
$required = @('STRIPE_WEBHOOK_SECRET', 'STRIPE_SECRET_KEY', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'CLERK_SECRET_KEY', 'FEDEX_CLIENT_ID', 'FEDEX_ACCOUNT_NUMBER', 'DHL_API_KEY', 'DHL_API_SECRET')
Write-Output '=== Verificando variables de entorno requeridas ==='
$allPresent = $true
foreach ($v in $required) {
    $val = Get-Item "env:$v" -ErrorAction SilentlyContinue
    if ($val) {
        try {
            $len = $val.Value.Length
            if ($len -gt 10) { $len = 10 }
            $valShort = $val.Value.Substring(0, $len) + '...'
        } catch {
            $valShort = 'error'
        }
        Write-Output '  ' + $v + ': presente (' + $valShort + ')'
    } else {
        Write-Output '  ' + $v + ': AUSENTE'
        $allPresent = $false
    }
}
if (-not $allPresent) {
    Write-Output ''
    Write-Output 'ADVERTENCIA: Algunas variables no estan configuradas. El servidor iniciará pero las variables faltantes no estarán disponibles.'
    Write-Output 'Revisa el .env.local y asegúrate de que todas las variables estén definidas.'
    Write-Output ''
}
Write-Output '=== Levantando servidor dev en puerto 3000 ==='
Write-Output 'Presiona Ctrl+C para detener el servidor'
Write-Output ''
Set-Location $envDir
npx next dev --port 3000 --hostname localhost

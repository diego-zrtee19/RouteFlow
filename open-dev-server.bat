@echo off
REM open-dev-server.bat
REM Abre el servidor de desarrollo Next.js con las variables de entorno necesarias

cd /d C:\Users\diego\OneDrive\Desktop\RouteFlow

echo === Cargando variables de entorno desde .env.local ===

for /f "tokens=1,* delims==" %%a in (C:\Users\diego\OneDrive\Desktop\RouteFlow\.env.local) do (
    set "key=%%a"
    set "val=%%b"
    rem Quitar comillas al principio y al final
    if "%val:~0,1%"=="^"" set "val=%val:~1%"
    if "%val:~-1%"==""" set "val=%val:~0,-1%"
    set "key=%key:'=%"
    set "key=%key:~0,-1%"
    set "val=%val:'=%"
    set "val=%val:~0,-1%"
    set "key=%key: =%"
    set "val=%val: =%"
    
    echo Configurando %key% = %val%
    set "%key%=%%val%%"
)

echo.
echo === Verificando variables de entorno requeridas ===
set "required=STRIPE_WEBHOOK_SECRET STRIPE_SECRET_KEY NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY NEXT_PUBLIC_SUPABASE_URL CLERK_SECRET_KEY FEDEX_CLIENT_ID FEDEX_ACCOUNT_NUMBER DHL_API_KEY"
for %%v in (%required%) do (
    set "val=" & for %%i in (%%v) do set "val=%%i"
    for /f "delims=" %%i in ('set "%%v"') do set "val=%%i"
    if not defined val (
        echo %%v: AUSENTE
        set "allPresent=false"
    ) else (
        echo %%v: presente
    )
)

echo.
echo === Levantando servidor dev en puerto 3000 ===
echo Presiona Ctrl+C para detener el servidor
echo.

npx next dev --port 3000 --hostname localhost

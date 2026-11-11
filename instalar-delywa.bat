@echo off
setlocal EnableExtensions
title Instalador Delywa

rem ============================================================
rem  Instalador / actualizador de Delywa
rem  Baja el codigo desde GitHub y lo publica en Cloudflare.
rem
rem  Uso:
rem    instalar-delywa.bat            instala la ultima version (rama main)
rem    instalar-delywa.bat v2.0.0     instala una version especifica (tag)
rem ============================================================

set "REPO_URL=https://github.com/gocabletech-dotcom/delywa.git"
set "APP_DIR=%USERPROFILE%\Delywa\app"
set "D1_NAME=delywa-db"
set "VERSION=%~1"
set "PASO=inicio"

echo.
echo ============================================
echo   DELYWA - Instalador desde GitHub
echo ============================================
echo   Repositorio: %REPO_URL%
echo   Carpeta:     %APP_DIR%
if "%VERSION%"=="" (echo   Version:     ultima ^(main^)) else (echo   Version:     %VERSION%)
echo.

rem ---------- 1. Requisitos ----------
set "PASO=verificar requisitos"
echo [1/7] Verificando requisitos...
where git >nul 2>&1
if errorlevel 1 (
  echo   FALTA Git. Instalalo desde https://git-scm.com/download/win y vuelve a correr este archivo.
  goto :error
)
where node >nul 2>&1
if errorlevel 1 (
  echo   FALTA Node.js. Instala la version LTS desde https://nodejs.org y vuelve a correr este archivo.
  goto :error
)
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set "NODE_MAJOR=%%v"
if %NODE_MAJOR% LSS 20 (
  echo   Node.js %NODE_MAJOR% es muy viejo. Se necesita la version 20 o mayor: https://nodejs.org
  goto :error
)
echo   Git y Node.js %NODE_MAJOR% encontrados.

rem ---------- 2. Codigo desde GitHub ----------
set "PASO=bajar el codigo de GitHub"
echo.
echo [2/7] Bajando el codigo desde GitHub...
if exist "%APP_DIR%\.git" goto :actualizar
if not exist "%USERPROFILE%\Delywa" mkdir "%USERPROFILE%\Delywa"
git clone "%REPO_URL%" "%APP_DIR%"
if errorlevel 1 goto :error
goto :version

:actualizar
git -C "%APP_DIR%" fetch --tags --prune origin
if errorlevel 1 goto :error

:version
set "PASO=seleccionar la version"
if "%VERSION%"=="" goto :ultima
git -C "%APP_DIR%" checkout --force "%VERSION%"
if errorlevel 1 (
  echo   No existe la version "%VERSION%" en GitHub. Versiones disponibles:
  git -C "%APP_DIR%" tag --list
  goto :error
)
goto :dependencias

:ultima
git -C "%APP_DIR%" checkout --force main
if errorlevel 1 goto :error
git -C "%APP_DIR%" reset --hard origin/main
if errorlevel 1 goto :error

:dependencias
cd /d "%APP_DIR%"
if errorlevel 1 goto :error
for /f "delims=" %%i in ('git describe --tags --always') do set "INSTALADA=%%i"
echo   Codigo listo: %INSTALADA%

rem ---------- 3. Dependencias ----------
set "PASO=instalar dependencias (npm ci)"
echo.
echo [3/7] Instalando dependencias (puede tardar unos minutos)...
call npm ci --legacy-peer-deps --no-audit --no-fund
if errorlevel 1 goto :error

rem ---------- 4. Sesion de Cloudflare ----------
set "PASO=iniciar sesion en Cloudflare"
echo.
echo [4/7] Verificando la sesion de Cloudflare...
call npx wrangler whoami > "%TEMP%\delywa_whoami.txt" 2>&1
if errorlevel 1 goto :login
findstr /I /C:"not authenticated" "%TEMP%\delywa_whoami.txt" >nul
if not errorlevel 1 goto :login
echo   Sesion de Cloudflare activa.
goto :build

:login
echo   Se abrira el navegador para que autorices a Wrangler en tu cuenta de Cloudflare.
call npx wrangler login
if errorlevel 1 goto :error

:build
rem ---------- 5. Compilar ----------
set "PASO=compilar el frontend"
echo.
echo [5/7] Compilando...
call npm run build
if errorlevel 1 goto :error

rem ---------- 6. Base de datos ----------
set "PASO=aplicar migraciones en D1"
echo.
echo [6/7] Aplicando migraciones en la base de datos %D1_NAME%...
echo   Si pregunta "Ok to proceed?", escribe  y  y presiona Enter.
call npx wrangler d1 migrations apply %D1_NAME% --remote
if errorlevel 1 goto :error

rem ---------- 7. Publicar ----------
set "PASO=publicar el Worker"
echo.
echo [7/7] Publicando en Cloudflare...
call npx wrangler deploy
if errorlevel 1 goto :error

echo.
echo ============================================
echo   LISTO. Delywa %INSTALADA% quedo publicado.
echo   La direccion aparece arriba (termina en workers.dev).
echo ============================================
echo.
pause
exit /b 0

:error
echo.
echo ============================================
echo   ERROR en el paso: %PASO%
echo   No se completo la instalacion. Copia el mensaje de arriba
echo   y enviaselo a Claude para corregirlo.
echo ============================================
echo.
pause
exit /b 1

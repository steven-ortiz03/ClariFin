@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Falta instalar Node.js 22.12 o superior.
  echo Se abrira la pagina de descarga: instalalo y vuelve a abrir este archivo.
  start "" https://nodejs.org
  pause
  exit /b 1
)
node scripts\iniciar.js
if errorlevel 1 (
  echo.
  echo No fue posible iniciar la aplicacion. Revisa el mensaje anterior.
  pause
  exit /b 1
)

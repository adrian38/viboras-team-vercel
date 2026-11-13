@echo off
rem Doble clic para exportar las encuestas a Excel y CSV.
rem Necesita Node 18 o posterior: https://nodejs.org (boton LTS).
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo No encuentro Node en este ordenador.
  echo Instalalo desde https://nodejs.org ^(boton LTS^) y vuelve a intentarlo.
  echo.
  pause
  exit /b 1
)
node exportar.mjs %*
echo.
pause

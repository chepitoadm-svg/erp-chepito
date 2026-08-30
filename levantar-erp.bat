@echo off
title ERP Chepito - servidor local (no cerrar)
cd /d "C:\Users\Chepito\Documents\erp-chepito"
echo ==================================================
echo   Preparando la version RAPIDA (optimizada)...
echo   Tarda ~1-2 min, SOLO la primera vez que abris.
echo   No cierres esta ventana.
echo ==================================================
call npm run build
if errorlevel 1 (
  echo.
  echo   [!] Fallo la compilacion. Reviso el error arriba.
  echo   Se usara la ultima version compilada si existe.
)
:loop
echo ==================================================
echo   ERP Chepito ^(modo rapido^) en  http://localhost:3000
echo   No cierres esta ventana mientras lo uses.
echo   ^(Para verlo desde otra compu, usa la direccion
echo    del tunel de Cloudflare, no localhost.^)
echo ==================================================
call npm run start
echo.
echo   El servidor se detuvo. Reiniciando en 3 segundos...
echo   ^(Cerra esta ventana o Ctrl+C para salir de verdad.^)
timeout /t 3 /nobreak >nul
goto loop

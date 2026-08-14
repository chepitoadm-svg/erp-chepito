@echo off
title ERP Chepito - servidor local (no cerrar)
cd /d "C:\Users\Chepito\Documents\erp-chepito"
:loop
echo ==================================================
echo   ERP Chepito corriendo en  http://localhost:3000
echo   No cierres esta ventana mientras lo uses.
echo   (Para verlo desde otra compu, usa la direccion
echo    del tunel de Cloudflare, no localhost.)
echo ==================================================
call npm run dev
echo.
echo   El servidor se detuvo. Reiniciando en 3 segundos...
echo   (Cerra esta ventana o Ctrl+C para salir de verdad.)
timeout /t 3 /nobreak >nul
goto loop

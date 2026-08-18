@echo off
title ERP Chepito - tunel Cloudflare (no cerrar)
echo ==================================================
echo   Tunel Cloudflare para ver el ERP desde afuera.
echo   El ERP local debe estar corriendo (levantar-erp.bat).
echo.
echo   Cuando arranque, busca la linea:
echo     https://algo-algo.trycloudflare.com
echo   Esa es la direccion para la otra compu.
echo   (Cambia cada vez que reinicias el tunel.)
echo   No cierres esta ventana mientras lo uses.
echo ==================================================
echo.
"C:\Users\Chepito\cloudflared.exe" tunnel --url http://localhost:3000 --no-autoupdate
echo.
echo   El tunel se detuvo. Cierra esta ventana o corre de nuevo el .bat.
pause

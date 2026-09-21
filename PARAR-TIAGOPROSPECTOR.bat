@echo off
setlocal EnableExtensions EnableDelayedExpansion
title TiagoProspector - encerrar motores

rem ============================================================
rem  Encerra APENAS os processos que estao escutando nas portas
rem  do stack local (8787 Agent, 8788 Maps, 8789 Photos).
rem  Nao mata Chrome, Node ou Python de outros programas.
rem ============================================================

set "PORT_AGENT=8787"
set "PORT_MAPS=8788"
set "PORT_PHOTOS=8789"

echo.
echo  Encerrando os motores locais do TiagoProspector...
echo.

set "ACHOU=0"
for %%P in (%PORT_AGENT% %PORT_MAPS% %PORT_PHOTOS%) do (
  for /f "tokens=5" %%A in ('netstat -ano -p tcp ^| findstr /r /c:":%%P .*LISTENING"') do (
    if not "%%A"=="0" (
      echo   porta %%P: encerrando PID %%A
      taskkill /PID %%A /T /F >nul 2>&1
      set "ACHOU=1"
    )
  )
)

if "!ACHOU!"=="0" echo   Nenhum motor do TiagoProspector estava rodando.

echo.
echo  Pronto.
timeout /t 6 >nul
exit /b 0

@echo off
title TiagoProspector - Agent Runtime
cd /d "%~dp0agent-runtime"
if not exist "node_modules" (
  echo.
  echo  Primeira execucao: instalando dependencias do agente.
  echo  Isso pode levar alguns minutos...
  echo.
  call npm install
)

echo ============================================
echo   TiagoProspector - Agente LOCAL
echo ============================================
echo.

rem Ja existe um agente rodando neste computador?
curl -s http://127.0.0.1:8787/health | findstr /c:"\"ok\":true" >nul 2>&1
if not errorlevel 1 goto jaRodando

echo Iniciando o agente neste computador...
start "TiagoProspector Agent Runtime" cmd /k "npm run local"

echo Aguardando o agente ficar pronto...
set /a tentativas=0
:wait
timeout /t 2 >nul
set /a tentativas+=1
curl -s http://127.0.0.1:8787/health | findstr /c:"\"ok\":true" >nul 2>&1
if not errorlevel 1 goto pronto
if %tentativas% GEQ 45 goto falhou
goto wait

:jaRodando
echo  AGENTE LOCAL JA ESTA RODANDO neste computador.
echo.
echo  Abra no Chrome:  https://tiagoprospectoroficial.vercel.app
echo  Configuracoes - Provedores de IA - Runtime do agente - Este computador
echo  e clique em "Conectar agente". Se o Chrome pedir permissao para acessar
echo  a rede local, clique em Permitir.
echo.
pause
exit /b 0

:pronto
echo.
echo  AGENTE LOCAL PRONTO.
echo.
echo  Abrindo o TiagoProspector neste computador...
start "" "http://127.0.0.1:8787"
echo.
echo  IMPORTANTE: deixe esta janela do runtime aberta enquanto usar o app.
echo  (O app abre em http://127.0.0.1:8787 com o agente ja conectado.
echo   A versao publicada na Vercel continua disponivel para uso na nuvem.)
echo.
pause
exit /b 0

:falhou
echo.
echo  Nao consegui confirmar o agente local.
echo  Veja a janela "TiagoProspector Agent Runtime" e tente novamente.
echo.
pause
exit /b 1

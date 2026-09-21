@echo off
title TiagoProspector - Agent Runtime (este computador)
chcp 65001 >nul
echo ============================================
echo   TiagoProspector - Agent Runtime LOCAL
echo ============================================
echo.

cd /d "%~dp0agent-runtime"
if not exist "node_modules" (
  echo Primeira execucao: instalando dependencias do agente (pode levar alguns minutos)...
  call npm install
)

echo Iniciando o agente neste computador...
start "TiagoProspector Agent Runtime" cmd /k "npm run local"

echo Aguardando o agente ficar pronto...
set /a tentativas=0
:wait
timeout /t 2 >nul
set /a tentativas+=1
curl -s http://127.0.0.1:8787/health | findstr /c:"\"ok\":true" >nul 2>&1
if not errorlevel 1 goto ready
if %tentativas% GEQ 45 goto falhou
goto wait

:ready
echo.
echo  AGENTE LOCAL PRONTO.
echo.
echo  Abra no Chrome:  https://tiagoprospectoroficial.vercel.app
echo  E clique em "Conectar agente" (na primeira vez o Chrome pode pedir
echo  permissao para acessar dispositivos na sua rede local - clique em Permitir).
echo.
pause
exit /b 0

:falhou
echo.
echo  Nao consegui confirmar o agente local. Verifique a janela
echo  "TiagoProspector Agent Runtime" e tente novamente.
echo.
pause
exit /b 1

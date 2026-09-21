@echo off
setlocal EnableExtensions EnableDelayedExpansion
title TiagoProspector - motores locais
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

set "PORT_AGENT=8787"
set "PORT_MAPS=8788"
set "PORT_PHOTOS=8789"

echo.
echo  ================================================
echo    TiagoProspector - motores locais (background)
echo  ================================================
echo.

rem ---------------- dependencias: checagem UMA vez (marcador) ----------------
if not exist "%ROOT%\agent-runtime\node_modules" (
  echo  Agent Runtime: instalando dependencias ^(uma vez^)...
  pushd "%ROOT%\agent-runtime"
  call npm install
  popd
)

set "SEM_PYTHON="
where python >nul 2>&1
if errorlevel 1 (
  echo  AVISO: Python nao encontrado no PATH - Maps/Photos nao serao iniciados.
  set "SEM_PYTHON=1"
)

if not defined SEM_PYTHON if not exist "%ROOT%\mapscraper-service\.deps-ok" (
  echo  Maps Engine: conferindo dependencias ^(uma vez^)...
  python -c "import fastapi, uvicorn, aiohttp" >nul 2>&1
  if errorlevel 1 python -m pip install --quiet --disable-pip-version-check fastapi uvicorn aiohttp Brotli tqdm
  >"%ROOT%\mapscraper-service\.deps-ok" echo ok
)
if not defined SEM_PYTHON if not exist "%ROOT%\gmapsphotos-service\.deps-ok" (
  echo  Photos Engine: conferindo dependencias ^(uma vez, pode demorar^)...
  python -c "import fastapi, uvicorn, selenium, undetected_chromedriver" >nul 2>&1
  if errorlevel 1 python -m pip install --quiet --disable-pip-version-check fastapi uvicorn selenium undetected-chromedriver beautifulsoup4 lxml openpyxl requests psutil setuptools
  >"%ROOT%\gmapsphotos-service\.deps-ok" echo ok
)

rem ---------------- sobe o que estiver faltando (DESTACADO, sem janela) ----------------
call :health %PORT_AGENT% ok
if errorlevel 1 (
  echo  Agent Runtime ^(%PORT_AGENT%^): subindo em background...
  call :spawn "%ROOT%\agent-runtime" "npm run local" agent
)

if not defined SEM_PYTHON (
  call :health %PORT_MAPS% mapScraper
  if errorlevel 1 (
    echo  Maps Engine ^(%PORT_MAPS%^): subindo em background...
    call :spawn "%ROOT%\mapscraper-service" "python -m uvicorn app:app --host 127.0.0.1 --port %PORT_MAPS%" maps
  )
  call :health %PORT_PHOTOS% GMapsScraper
  if errorlevel 1 (
    echo  Photos Engine ^(%PORT_PHOTOS%^): subindo em background...
    call :spawn "%ROOT%\gmapsphotos-service" "set SCRAPER_WINDOWED=0 && python -m uvicorn app:app --host 127.0.0.1 --port %PORT_PHOTOS%" photos
  )
)

rem ---------------- confirma (curto: no maximo ~24s) ----------------
echo.
echo  Conferindo os motores...
set /a espera=0
:confirmar
call :health %PORT_AGENT% ok
set "ST_A=%errorlevel%"
if defined SEM_PYTHON (
  set "ST_M=1"
  set "ST_P=1"
) else (
  call :health %PORT_MAPS% mapScraper
  set "ST_M=%errorlevel%"
  call :health %PORT_PHOTOS% GMapsScraper
  set "ST_P=%errorlevel%"
)
if "%ST_A%%ST_M%%ST_P%"=="000" goto pronto
set /a espera+=1
if !espera! GEQ 12 goto ainda
echo|set /p=.
ping -n 3 127.0.0.1 >nul
goto confirmar

:pronto
echo.
echo  ================================================
echo    Agent Runtime :%PORT_AGENT%  OK
echo    Maps Engine   :%PORT_MAPS%  OK
echo    Photos Engine :%PORT_PHOTOS%  OK
echo  ================================================
echo.
echo   TIAGOPROSPECTOR PRONTO - rodando em SEGUNDO PLANO.
echo   Nenhuma janela do agente precisa ficar aberta.
echo   Diagnostico: http://127.0.0.1:%PORT_AGENT%/health
echo.
exit /b 0

:ainda
echo.
echo  ================================================
if "%ST_A%"=="0" (echo    Agent Runtime :%PORT_AGENT%  OK) else (echo    Agent Runtime :%PORT_AGENT%  AINDA SUBINDO)
if "%ST_M%"=="0" (echo    Maps Engine   :%PORT_MAPS%  OK) else (echo    Maps Engine   :%PORT_MAPS%  AINDA SUBINDO)
if "%ST_P%"=="0" (echo    Photos Engine :%PORT_PHOTOS%  OK) else (echo    Photos Engine :%PORT_PHOTOS%  AINDA SUBINDO)
echo  ================================================
echo   Eles continuam subindo em segundo plano - rode este arquivo de novo em ~30s.
echo.
exit /b 0

rem ============================================================
rem  :spawn <diretorio> <comando> <nome-do-log>
rem  Inicia DESTACADO e SEM JANELA: sobrevive ao fechamento deste .bat.
rem ============================================================
:spawn
powershell -NoProfile -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','%~2 1>> .%~3.log 2>&1' -WorkingDirectory '%~1' -WindowStyle Hidden"
exit /b 0

rem ============================================================
rem  :health <porta> <marcador>  -> 0 saudavel | 1 fora
rem  marcador: ok = /health com ok:true | outro = texto na raiz do servico
rem ============================================================
:health
if "%~2"=="ok" (
  powershell -NoProfile -Command "try{ if((Invoke-RestMethod 'http://127.0.0.1:%~1/health' -TimeoutSec 3).ok){exit 0} }catch{}; exit 1" >nul 2>&1
) else (
  powershell -NoProfile -Command "try{ if((Invoke-WebRequest 'http://127.0.0.1:%~1/' -UseBasicParsing -TimeoutSec 3).Content -like '*%~2*'){exit 0} }catch{}; exit 1" >nul 2>&1
)
exit /b %errorlevel%

@echo off
setlocal EnableExtensions EnableDelayedExpansion
title TiagoProspector - motores locais

rem ============================================================
rem  TiagoProspector - ponto UNICO de inicializacao (Windows)
rem  Sobe os tres motores locais e confirma cada um pelo /health.
rem  Rodar duas vezes NAO cria duplicatas (reutiliza o que ja esta no ar).
rem ============================================================

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

rem App LOCAL: o Agent Runtime serve o MESMO app na MESMA origem (127.0.0.1:8787) —
rem e isso que faz o preview, o WebContainer (SharedArrayBuffer) e os scrapers locais
rem funcionarem SEM permissao de rede e SEM cross-origin. A versao publicada continua
rem disponivel em https://tiagoprospectoroficial.vercel.app (para o modo Nuvem).
set "APP_URL=http://127.0.0.1:8787"

rem No BOOT do Windows o atalho chama com --boot: sobe os motores sem abrir o navegador.
set "ABRIR_APP=1"
if /i "%~1"=="--boot" set "ABRIR_APP=0"

set "PORT_AGENT=8787"
set "PORT_MAPS=8788"
set "PORT_PHOTOS=8789"

echo.
echo  ================================================
echo    TiagoProspector - iniciando os motores locais
echo  ================================================
echo.

set "SEM_PYTHON="
where python >nul 2>&1
if errorlevel 1 (
  echo  AVISO: Python nao encontrado no PATH.
  echo         Maps Engine e Photos Engine nao serao iniciados.
  set "SEM_PYTHON=1"
)

rem ---------------- dependencias (somente se faltarem) ----------------
if not exist "%ROOT%\agent-runtime\node_modules" (
  echo  Agent Runtime: instalando dependencias ^(primeira execucao^)...
  pushd "%ROOT%\agent-runtime"
  call npm install
  popd
)

if not defined SEM_PYTHON (
  if not exist "%ROOT%\mapscraper-service\.deps-ok" (
    echo  Maps Engine: instalando dependencias ^(primeira execucao^)...
    python -m pip install --quiet --disable-pip-version-check fastapi uvicorn aiohttp Brotli tqdm
    if errorlevel 1 (
      echo    FALHOU ao instalar as dependencias do Maps Engine.
    ) else (
      >"%ROOT%\mapscraper-service\.deps-ok" echo ok
    )
  )
  if not exist "%ROOT%\gmapsphotos-service\upstream\.deps-ok" (
    echo  Photos Engine: instalando dependencias ^(primeira execucao^)...
    python -m pip install --quiet --disable-pip-version-check fastapi uvicorn selenium undetected-chromedriver beautifulsoup4 lxml openpyxl requests psutil setuptools
    if errorlevel 1 (
      echo    FALHOU ao instalar as dependencias do Photos Engine.
    ) else (
      >"%ROOT%\gmapsphotos-service\upstream\.deps-ok" echo ok
    )
  )
)

rem ---------------- Agent Runtime :8787 ----------------
call :esperar %PORT_AGENT% ok
if not errorlevel 1 (
  echo  Agent Runtime ^(%PORT_AGENT%^): ja estava ativo - reutilizando
) else (
  echo  Agent Runtime ^(%PORT_AGENT%^): iniciando...
  start "TiagoProspector Agent Runtime" /min /d "%ROOT%\agent-runtime" cmd /k npm run local
)

rem ---------------- Maps Engine :8788 ----------------
if defined SEM_PYTHON (
  set "MAPS_OK=0"
) else (
  call :esperar %PORT_MAPS% mapScraper
  if not errorlevel 1 (
    echo  Maps Engine ^(%PORT_MAPS%^): ja estava ativo - reutilizando
  ) else (
    echo  Maps Engine ^(%PORT_MAPS%^): iniciando...
    start "TiagoProspector Maps Engine" /min /d "%ROOT%\mapscraper-service" cmd /k python -m uvicorn app:app --host 127.0.0.1 --port %PORT_MAPS%
  )
)

rem ---------------- Photos Engine :8789 ----------------
if defined SEM_PYTHON (
  set "PHOTOS_OK=0"
) else (
  call :esperar %PORT_PHOTOS% GMapsScraper
  if not errorlevel 1 (
    echo  Photos Engine ^(%PORT_PHOTOS%^): ja estava ativo - reutilizando
  ) else (
    echo  Photos Engine ^(%PORT_PHOTOS%^): iniciando...
    start "TiagoProspector Photos Engine" /min /d "%ROOT%\gmapsphotos-service" cmd /k "set SCRAPER_WINDOWED=0&& python -m uvicorn app:app --host 127.0.0.1 --port %PORT_PHOTOS%"
  )
)

rem ---------------- aguarda e confirma cada motor ----------------
echo.
echo  Aguardando os motores responderem...
echo.

call :esperar %PORT_AGENT% ok
if errorlevel 1 (set "AGENT_OK=0") else (set "AGENT_OK=1")

if defined SEM_PYTHON (
  set "MAPS_OK=0"
  set "PHOTOS_OK=0"
) else (
  call :esperar %PORT_MAPS% mapScraper
  if errorlevel 1 (set "MAPS_OK=0") else (set "MAPS_OK=1")
  call :esperar %PORT_PHOTOS% GMapsScraper
  if errorlevel 1 (set "PHOTOS_OK=0") else (set "PHOTOS_OK=1")
)

echo.
echo  ================================================
if "%AGENT_OK%"=="1"  (echo   Agent Runtime :8787  OK) else (echo   Agent Runtime :8787  INDISPONIVEL)
if "%MAPS_OK%"=="1"   (echo   Maps Engine   :8788  OK) else (echo   Maps Engine   :8788  INDISPONIVEL)
if "%PHOTOS_OK%"=="1" (echo   Photos Engine :8789  OK) else (echo   Photos Engine :8789  INDISPONIVEL)
echo  ================================================

if "%AGENT_OK%"=="1" (
  echo.
  echo   TIAGOPROSPECTOR PRONTO.
  echo.
  if "%ABRIR_APP%"=="1" (
    echo   Abrindo o app publicado: %APP_URL%
    start "" "%APP_URL%"
  ) else (
    echo   Motores no ar em segundo plano ^(inicio automatico do Windows^).
  )
  echo   No app, escolha "Este computador" em Configuracoes ^> Runtime do agente
  echo   e clique em "Conectar agente" ^(autorize a rede local se o Chrome pedir^).
  echo.
) else (
  echo.
  echo   O Agent Runtime nao respondeu em %PORT_AGENT%.
  echo   Veja a janela "TiagoProspector Agent Runtime" e rode este arquivo de novo.
  echo.
)

echo   Para encerrar os motores depois: PARAR-TIAGOPROSPECTOR.bat
echo.
timeout /t 12 >nul
exit /b 0

rem ============================================================
rem  :esperar <porta> <marcador>  -> espera o health responder
rem  marcador: ok = /health com ok:true | outro = texto na raiz do servico
rem ============================================================
:esperar
set /a _t=0
:esperar_loop
set /a _t+=1
if "%~2"=="ok" (
  powershell -NoProfile -Command "try{ if((Invoke-RestMethod 'http://127.0.0.1:%~1/health' -TimeoutSec 3).ok){exit 0} }catch{}; exit 1" >nul 2>&1
) else (
  powershell -NoProfile -Command "try{ if((Invoke-WebRequest 'http://127.0.0.1:%~1/' -UseBasicParsing -TimeoutSec 3).Content -like '*%~2*'){exit 0} }catch{}; exit 1" >nul 2>&1
)
if not errorlevel 1 exit /b 0
if %_t% GEQ 60 exit /b 1
timeout /t 2 >nul
goto esperar_loop

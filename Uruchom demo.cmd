@echo off
setlocal EnableExtensions
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "PORT=4180"
set "URL=http://127.0.0.1:%PORT%/"
set "CODEX_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
cd /d "%ROOT%"
echo.
echo OMRM demo - aktualna wersja
echo Katalog: %ROOT%
echo.
if not exist "%ROOT%\index.html" goto missing_files
if not exist "%ROOT%\demo-server.mjs" goto missing_files
if exist "%CODEX_NODE%" (set "NODE_EXE=%CODEX_NODE%") else (where node >nul 2>nul & if errorlevel 1 goto no_node & set "NODE_EXE=node")
echo Sprawdzam port %PORT%...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$url='%URL%'; try { $r=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1; if($r.StatusCode -eq 200 -and $r.Content -match 'app\.js'){ exit 0 } } catch {}; exit 1"
if not errorlevel 1 goto open_demo
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c=Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue; if($c){ exit 0 }; exit 1"
if not errorlevel 1 goto port_busy
echo Uruchamiam demo-server.mjs na porcie %PORT%...
start "OMRM Demo Server" /b "%NODE_EXE%" "%ROOT%\demo-server.mjs" %PORT%
echo Czekam na uruchomienie serwera...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$url='%URL%'; for($i=0; $i -lt 40; $i++){ try { $r=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1; if($r.StatusCode -eq 200 -and $r.Content -match 'app\.js'){ exit 0 } } catch {}; Start-Sleep -Milliseconds 250 }; exit 1"
if errorlevel 1 goto server_error
:open_demo
echo Serwer jest gotowy. Otwieram: %URL%
start "" "%URL%"
echo Demo dziala. Zamknij to okno, aby zakonczyc serwer.
pause
exit /b 0
:port_busy
echo BLAD: Port %PORT% jest zajety przez inny proces. Nie zamykam obcego procesu.
pause
exit /b 1
:server_error
echo BLAD: Nie udalo sie uruchomic aktualnego demo.
pause
exit /b 1
:no_node
echo BLAD: Nie znaleziono Node.js. Oczekiwany plik: %CODEX_NODE%
echo Zainstaluj Node.js albo przywroc runtime Codexa. Nie otwieram starego podgladu.
pause
exit /b 1
:missing_files
echo BLAD: Brakuje index.html lub demo-server.mjs w katalogu projektu.
pause
exit /b 1

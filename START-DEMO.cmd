@echo off
setlocal EnableExtensions

set "ROOT=C:\Users\Lukasz\Documents\Codex\2026-06-02\files-mentioned-by-the-user-karty-2\outputs\prototype"
set "PORT=4180"
set "URL=http://127.0.0.1:%PORT%/?v=20260630-clean-demo"
set "CODEX_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

cd /d "%ROOT%"

echo.
echo OMRM demo - aktualna wersja
echo.
echo Katalog demo:
echo %ROOT%
echo.

if not exist "%ROOT%\index.html" (
  echo BLAD: Nie znaleziono index.html w katalogu demo.
  echo %ROOT%
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$item = Get-Item -LiteralPath '%ROOT%\index.html'; Write-Host ('index.html - ostatnia modyfikacja: ' + $item.LastWriteTime.ToString('dd.MM.yyyy HH:mm:ss'))"
echo.

if not exist "%CODEX_NODE%" (
  where node >nul 2>nul
  if errorlevel 1 goto no_node
  set "CODEX_NODE=node"
)

echo Uruchamiam lokalny serwer pod adresem:
echo %URL%
echo.
echo Jezeli przegladarka nie otworzy sie automatycznie, skopiuj ten adres:
echo %URL%
echo.
echo Zamkniecie tego okna zatrzyma demo.
echo.

start "OMRM Demo Server" /b "%CODEX_NODE%" "%ROOT%\demo-server.mjs" %PORT%

echo Czekam na uruchomienie serwera...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$url='http://127.0.0.1:%PORT%/'; for($i=0; $i -lt 40; $i++){ try { $response=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1; if($response.StatusCode -eq 200){ exit 0 } } catch {}; Start-Sleep -Milliseconds 250 }; exit 1"
if errorlevel 1 goto server_error

echo Serwer jest gotowy. Otwieram przegladarke...
start "" "%URL%"
echo.
echo Demo dziala. Nie zamykaj tego okna podczas korzystania z aplikacji.
pause
exit /b

:server_error
echo.
echo BLAD: Nie udalo sie uruchomic lokalnego serwera.
echo Sprawdz, czy program zabezpieczajacy Windows nie zablokowal Node.js.
echo Sprobuj ponownie uruchomic ten plik prawym przyciskiem myszy.
echo.
pause
exit /b 1

:no_node
echo Nie znaleziono Node.js.
echo Nie musisz instalowac Pythona.
echo Nie mozna uruchomic pelnej wersji demo bez lokalnego serwera.
echo Otwieram awaryjny, uproszczony podglad.
echo.
start "" "%ROOT%\demo-standalone.html"
pause

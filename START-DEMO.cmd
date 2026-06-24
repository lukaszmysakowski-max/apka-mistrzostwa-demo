@echo off
setlocal EnableExtensions

set "ROOT=C:\Users\Lukasz\Documents\Codex\2026-06-02\files-mentioned-by-the-user-karty-2\outputs\prototype"
set "PORT=4180"
set "URL=http://127.0.0.1:%PORT%/?v=20260624-111411"
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

start "" "%URL%"
"%CODEX_NODE%" "%ROOT%\demo-server.mjs" %PORT%
echo.
echo Demo zostalo zatrzymane.
pause
exit /b

:no_node
echo Nie znaleziono Node.js.
echo Nie musisz instalowac Pythona.
echo Otwieram awaryjny podglad przez dwuklik.
echo.
start "" "%ROOT%\demo-standalone.html"
pause

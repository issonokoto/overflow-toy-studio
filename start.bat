@echo off
cd /d "%~dp0"
echo Starting OVERFLOW TOY ENGINE on http://127.0.0.1:8765 ...
start "" "http://127.0.0.1:8765/"
where node >nul 2>nul
if %ERRORLEVEL%==0 (
  node server.mjs
  goto :eof
)
where python >nul 2>nul
if %ERRORLEVEL%==0 (
  python -m http.server 8765 --bind 127.0.0.1
  goto :eof
)
echo Node.js or Python is required to run the local server.
pause

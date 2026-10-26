@echo off
rem Al-Syed POS - start the server (it also serves the app), then open it in the browser.
cd /d "%~dp0"
if not exist backend.env (
  echo backend.env is missing. Copy backend.env.example to backend.env and fill in the Supabase keys.
  pause
  exit /b 1
)
if not exist node_modules call npm install
if not exist backend
ode_modules (pushd backend & call npm install & popd)
rem The fast, built version of the app; made by update-app.bat, or here the first time
if not exist distindex.html (
  echo Building the app, one moment...
  call npm run build || (echo Build failed - read the message above. & pause & exit /b 1)
)
start "Al-Syed server" cmd /k "cd /d %~dp0backend && set NODE_ENV=production&& node server.js"
echo Starting... the app opens in your browser in a few seconds.
timeout /t 5 /nobreak >nul
start "" http://localhost:5000

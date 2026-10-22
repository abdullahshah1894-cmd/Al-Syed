@echo off
rem Al-Syed POS - start the server and the app, then open it in the browser.
cd /d "%~dp0"
if not exist backend\.env (
  echo backend\.env is missing. Copy backend\.env.example to backend\.env and fill in the Supabase keys.
  pause
  exit /b 1
)
if not exist node_modules call npm install
if not exist backend\node_modules (pushd backend & call npm install & popd)
start "Al-Syed server" cmd /k "cd /d %~dp0backend && npm start"
start "Al-Syed app" cmd /k "cd /d %~dp0 && npm run dev"
echo Starting... the app opens in your browser in a few seconds.
timeout /t 6 /nobreak >nul
start "" http://localhost:5173

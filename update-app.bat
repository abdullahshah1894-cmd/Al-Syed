@echo off
rem Al-Syed POS - get the newest version from GitHub (main branch), install its packages and build it.
cd /d "%~dp0"
echo Getting the newest version...
git checkout main || goto :fail
git pull origin main || goto :fail
echo Installing app packages...
call npm install || goto :fail
echo Installing server packages...
pushd backend
call npm install || (popd & goto :fail)
popd
echo Building the app...
call npm run build || goto :fail
echo.
echo Done. Close the old "Al-Syed server" window if it is open, then double-click start-app.bat.
pause
exit /b 0
:fail
echo.
echo Update failed - read the message above. Your data in the database is not affected.
pause
exit /b 1

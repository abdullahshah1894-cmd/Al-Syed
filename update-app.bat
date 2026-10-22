@echo off
rem Al-Syed POS - get the newest version from GitHub (main branch) and install its packages.
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
echo.
echo Done. Double-click start-app.bat to open the app.
pause
exit /b 0
:fail
echo.
echo Update failed - read the message above. Your data in the database is not affected.
pause
exit /b 1

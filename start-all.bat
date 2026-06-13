@echo off
echo ========================================
echo  RemoteOS - Starting all services
echo ========================================

echo [1/3] Starting Server...
start "RemoteOS-Server" cmd /c "cd /d C:\Users\Admin\remoteos && pnpm run --filter @remoteos/server dev"
timeout /t 10 /nobreak > nul

echo [2/3] Starting Agent...
start "RemoteOS-Agent" cmd /c "cd /d C:\Users\Admin\remoteos\packages\agent && node --env-file=..\..\..\.env dist\index.js"
timeout /t 5 /nobreak > nul

echo [3/3] Starting Bot...
start "RemoteOS-Bot" cmd /c "cd /d C:\Users\Admin\remoteos\packages\bot && node --env-file=..\..\..\.env dist\index.js"

echo.
echo ========================================
echo  All services started!
echo  Server: http://localhost:3000
echo  Bot: @remoteos_np_bot
echo ========================================
echo.
echo Press any key to stop all services...
pause > nul

echo Stopping all services...
taskkill /F /IM node.exe 2>nul
echo Done.

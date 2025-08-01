@echo off
echo Starting project setup...

REM Backend Setup
echo.
echo --- Backend Setup ---
echo Navigating to backend directory...
cd backend
echo Current directory:
cd

echo Installing/Verifying backend dependencies from backend/requirements.txt...
pip install -r requirements.txt
echo.
echo Starting backend server in a new window...
start "Backend - NextEra Workforce" cmd /k "echo Backend Server Window && cd /d "%~dp0backend" && echo Current directory: && cd && uvicorn main:app --reload --host 0.0.0.0 --port 8000"
echo Backend server start command issued.
cd ..
echo Returned to project root. Current directory:
cd

REM Frontend Setup
echo.
echo --- Frontend Setup ---
echo Navigating to frontend directory...
cd frontend
echo Current directory:
cd

echo Installing/Verifying frontend dependencies from frontend/package.json...
call npm install --legacy-peer-deps
if %ERRORLEVEL% NEQ 0 (
    echo Error: npm install failed
    pause
    exit /b 1
)
echo.
echo Starting frontend server in a new window...
start "Frontend - NextEra Workforce" cmd /k "title Frontend - NextEra Workforce && cd /d "%~dp0frontend" && echo Frontend Server Window && echo Current directory: && cd && call npm run dev"
echo Frontend server start command issued.
cd ..
echo Returned to project root. Current directory:
cd

echo.
echo --- Attempting to Open Webpage ---
echo Waiting for servers to initialize...
timeout /t 1 /nobreak >nul
echo Attempting to open http://localhost:8080 in your default browser...
start http://localhost:8080

echo.
echo --- Script Finished ---
echo Main script has completed.
echo - Check the 'Backend - NextEra Workforce' window for backend logs.
echo - CRITICALLY IMPORTANT: Check the 'Frontend - NextEra Workforce' window. It should be paused.
echo   If the frontend server did not start, this window will show the error message from 'npm run dev'.
echo   Please report any error messages you see in the 'Frontend - NextEra Workforce' window.
echo - The script attempted to open http://localhost:8080. This will only work if the frontend server started successfully.
exit
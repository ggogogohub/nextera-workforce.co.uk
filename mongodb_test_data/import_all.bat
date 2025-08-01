@echo off
setlocal

REM MongoDB Test Data Import Script for Windows
REM Usage: import_all.bat [database_name]
REM Default database name: employee_scheduling

if "%1"=="" (
    set DB_NAME=employee_scheduling
) else (
    set DB_NAME=%1
)

echo 🚀 Starting MongoDB import for database: %DB_NAME%
echo ================================================

REM Check if mongoimport is available
mongoimport --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Error: mongoimport command not found. Please install MongoDB tools.
    pause
    exit /b 1
)

REM Import each collection
echo 📥 Importing users...
mongoimport --db %DB_NAME% --collection users --file users.json --jsonArray --drop
if errorlevel 1 goto :error

echo ✅ Successfully imported users
echo.

echo 📥 Importing schedules...
mongoimport --db %DB_NAME% --collection schedules --file schedules.json --jsonArray --drop
if errorlevel 1 goto :error

echo ✅ Successfully imported schedules
echo.

echo 📥 Importing timeoff...
mongoimport --db %DB_NAME% --collection timeoff --file timeoff.json --jsonArray --drop
if errorlevel 1 goto :error

echo ✅ Successfully imported timeoff
echo.

echo 📥 Importing messages...
mongoimport --db %DB_NAME% --collection messages --file messages.json --jsonArray --drop
if errorlevel 1 goto :error

echo ✅ Successfully imported messages
echo.

echo 📥 Importing notifications...
mongoimport --db %DB_NAME% --collection notifications --file notifications.json --jsonArray --drop
if errorlevel 1 goto :error

echo ✅ Successfully imported notifications
echo.

echo 📥 Importing teams...
mongoimport --db %DB_NAME% --collection teams --file teams.json --jsonArray --drop
if errorlevel 1 goto :error

echo ✅ Successfully imported teams
echo.

echo 🎉 All collections imported successfully!
echo.
echo 📋 Test Credentials:
echo ===================
echo Administrator: admin@company.com / Admin123!
echo Manager:       manager@company.com / Manager123!
echo Employee 1:    employee1@company.com / Employee123!
echo Employee 2:    employee2@company.com / Employee123!
echo Test User:     test@example.com / testpass123
echo.
echo 🌐 Frontend: http://localhost:8080
echo 🔧 Backend:  http://localhost:8000
echo 📚 API Docs: http://localhost:8000/docs
echo.
pause
exit /b 0

:error
echo ❌ Import failed!
pause
exit /b 1

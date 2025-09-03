@echo off
echo 🚀 Setting up ALB Flow Analyzer...

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js 18+ first.
    exit /b 1
)

echo ✅ Node.js detected
node --version

REM Install root dependencies
echo 📦 Installing root dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ❌ Failed to install root dependencies
    exit /b 1
)

REM Install backend dependencies
echo 📦 Installing backend dependencies...
cd backend
call npm install
if %errorlevel% neq 0 (
    echo ❌ Failed to install backend dependencies
    exit /b 1
)
cd ..

REM Install frontend dependencies
echo 📦 Installing frontend dependencies...
cd frontend
call npm install
if %errorlevel% neq 0 (
    echo ❌ Failed to install frontend dependencies
    exit /b 1
)
cd ..

REM Create environment file if it doesn't exist
if not exist backend\.env (
    echo 📝 Creating environment configuration...
    copy backend\.env.example backend\.env
    echo ✅ Created backend\.env - please review and update as needed
) else (
    echo ✅ Environment file already exists
)

REM Create data directory
if not exist data mkdir data
if not exist uploads mkdir uploads
echo ✅ Created data and uploads directories

echo.
echo 🎉 Setup completed successfully!
echo.
echo To start development:
echo   npm run dev
echo.
echo To start individual services:
echo   npm run dev:backend  # Backend only
echo   npm run dev:frontend # Frontend only
echo.
echo URLs:
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:3001
echo   Health:   http://localhost:3001/health
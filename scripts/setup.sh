#!/bin/bash

# ALB Flow Analyzer Setup Script

echo "🚀 Setting up ALB Flow Analyzer..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Install root dependencies
echo "📦 Installing root dependencies..."
npm install

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd backend && npm install && cd ..

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd frontend && npm install && cd ..

# Create environment file if it doesn't exist
if [ ! -f backend/.env ]; then
    echo "📝 Creating environment configuration..."
    cp backend/.env.example backend/.env
    echo "✅ Created backend/.env - please review and update as needed"
else
    echo "✅ Environment file already exists"
fi

# Create data directory
mkdir -p data uploads
echo "✅ Created data and uploads directories"

# Run tests to verify setup
echo "🧪 Running tests to verify setup..."
npm run test

if [ $? -eq 0 ]; then
    echo ""
    echo "🎉 Setup completed successfully!"
    echo ""
    echo "To start development:"
    echo "  npm run dev"
    echo ""
    echo "To start individual services:"
    echo "  npm run dev:backend  # Backend only"
    echo "  npm run dev:frontend # Frontend only"
    echo ""
    echo "URLs:"
    echo "  Frontend: http://localhost:3000"
    echo "  Backend:  http://localhost:3001"
    echo "  Health:   http://localhost:3001/health"
else
    echo "❌ Setup verification failed. Please check the error messages above."
    exit 1
fi
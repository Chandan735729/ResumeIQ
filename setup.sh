#!/bin/bash
# Setup script for ResumeIQ development environment

echo "🚀 ResumeIQ Development Setup"
echo "=============================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "✅ .env created. Please edit it with your API keys."
else
    echo "✅ .env file already exists"
fi

# Check if backend/.env exists
if [ ! -f backend/.env ]; then
    echo "📝 Creating backend/.env file..."
    cp backend/.env.example backend/.env
    echo "✅ backend/.env created. Please edit it with your API keys."
else
    echo "✅ backend/.env file already exists"
fi

echo ""
echo "📦 Next steps:"
echo "1. Edit .env and add your GOOGLE_API_KEY"
echo "2. Run: docker-compose up --build"
echo "3. Wait for all services to start"
echo "4. Database will auto-migrate"
echo "5. Backend API available at: http://localhost:3000"
echo ""
echo "✨ Setup complete!"

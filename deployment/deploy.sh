#!/bin/bash
set -e

echo "========================================="
echo "RAG Chatbot Production Deployment"
echo "========================================="

PROJECT_DIR="/var/www/rag-chatbot"

if [ ! -d "$PROJECT_DIR" ]; then
    echo "Error: Project directory $PROJECT_DIR does not exist"
    exit 1
fi

cd "$PROJECT_DIR"

# Check .env file
if [ ! -f ".env" ]; then
    echo "Error: .env file not found!"
    exit 1
fi

source .env

if [ "$NODE_ENV" != "production" ]; then
    echo "Warning: NODE_ENV is not set to 'production'"
fi

# Install Node.js backend dependencies
echo "Installing backend dependencies..."
cd "$PROJECT_DIR/admin-backend"
npm install --production

# Start backend with PM2
echo "Starting Node.js backend..."
pm2 delete rag-backend 2>/dev/null || true
pm2 start server.js --name rag-backend
pm2 save

# Setup Python virtual environment
echo "Setting up Python environment..."
cd "$PROJECT_DIR"
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Create log directory and files
sudo mkdir -p /var/log/rag-bot
sudo chown www-data:www-data /var/log/rag-bot
sudo touch /var/log/rag-bot/output.log /var/log/rag-bot/error.log
sudo chown www-data:www-data /var/log/rag-bot/output.log /var/log/rag-bot/error.log

# Install and start systemd service with auto-restart wrapper
echo "Installing FastAPI bot service with auto-restart..."
sudo cp "$PROJECT_DIR/deployment/rag-bot.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable rag-bot
sudo systemctl restart rag-bot

echo ""
echo "========================================="
echo "Deployment Complete!"
echo "========================================="
echo ""
echo "Services Status:"
pm2 status rag-backend
sudo systemctl status rag-bot --no-pager
echo ""
echo "Check logs:"
echo "  Backend: pm2 logs rag-backend"
echo "  Bot (journal): sudo journalctl -u rag-bot -f"
echo "  Bot (output): sudo tail -f /var/log/rag-bot/output.log"
echo "  Bot (errors): sudo tail -f /var/log/rag-bot/error.log"

#!/bin/bash

# Quick setup script for production deployment
# Run this on your production server

set -e

echo "============================================"
echo "RAG Chatbot - Quick Production Setup"
echo "============================================"
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
    echo "⚠️  Please do not run as root. Run as regular user with sudo access."
    exit 1
fi

# Check if project directory exists
if [ ! -d "deployment" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

echo "This script will help you set up the RAG Chatbot for production."
echo ""
read -p "Have you updated the .env file with production values? (yes/no): " env_updated

if [ "$env_updated" != "yes" ]; then
    echo ""
    echo "⚠️  Please update .env file first with:"
    echo "   - NODE_ENV=production"
    echo "   - Production MongoDB URI"
    echo "   - New JWT_SECRET and FASTAPI_SHARED_SECRET"
    echo "   - New GOOGLE_API_KEY"
    echo "   - Your domain URLs"
    echo ""
    exit 1
fi

echo ""
echo "Step 1: Installing system dependencies..."
read -p "Install Node.js, Python, Nginx, and PM2? (yes/no): " install_deps

if [ "$install_deps" = "yes" ]; then
    echo "Installing dependencies..."
    
    # Node.js
    if ! command -v node &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt install -y nodejs
    fi
    
    # Python
    sudo apt install -y python3 python3-pip python3-venv
    
    # Nginx
    sudo apt install -y nginx
    
    # PM2
    sudo npm install -g pm2
    
    # Certbot
    sudo apt install -y certbot python3-certbot-nginx
    
    echo "✅ Dependencies installed"
fi

echo ""
echo "Step 2: Building frontend..."
cd admin-frontend
npm install
npm run build
cd ..
echo "✅ Frontend built"

echo ""
echo "Step 3: Installing backend dependencies..."
cd admin-backend
npm install --production
cd ..
echo "✅ Backend dependencies installed"

echo ""
echo "Step 4: Setting up Python environment..."
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install -r requirements-production.txt
echo "✅ Python environment ready"

echo ""
echo "Step 5: Starting backend with PM2..."
cd admin-backend
pm2 delete rag-backend 2>/dev/null || true
pm2 start server.js --name rag-backend
pm2 save
cd ..
echo "✅ Backend started"

echo ""
echo "Step 6: Setting up FastAPI bot service with auto-restart..."
sudo mkdir -p /var/log/rag-bot
sudo chown www-data:www-data /var/log/rag-bot
sudo touch /var/log/rag-bot/output.log /var/log/rag-bot/error.log
sudo chown www-data:www-data /var/log/rag-bot/output.log /var/log/rag-bot/error.log
sudo cp deployment/rag-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable rag-bot
sudo systemctl start rag-bot
echo "✅ Bot service started with auto-restart capability"

echo ""
echo "Step 7: Configuring Nginx..."
read -p "Enter your domain name (e.g., example.com): " domain

if [ -n "$domain" ]; then
    # Update domain in nginx config
    sed "s/yourdomain.com/$domain/g" deployment/nginx.conf > /tmp/rag-nginx.conf
    sudo cp /tmp/rag-nginx.conf /etc/nginx/sites-available/rag-chatbot
    sudo ln -sf /etc/nginx/sites-available/rag-chatbot /etc/nginx/sites-enabled/
    sudo nginx -t && sudo systemctl reload nginx
    echo "✅ Nginx configured"
    
    echo ""
    read -p "Setup SSL with Let's Encrypt? (yes/no): " setup_ssl
    if [ "$setup_ssl" = "yes" ]; then
        sudo certbot --nginx -d $domain
        echo "✅ SSL configured"
    fi
else
    echo "⚠️  Skipping Nginx configuration. Configure manually later."
fi

echo ""
echo "============================================"
echo "✅ Setup Complete!"
echo "============================================"
echo ""
echo "Services Status:"
echo "----------------"
pm2 status
echo ""
sudo systemctl status rag-bot --no-pager | head -5
echo ""
echo "Next Steps:"
echo "1. Configure firewall: sudo ufw allow 80 && sudo ufw allow 443"
echo "2. Access your site at: https://$domain"
echo "3. Monitor logs:"
echo "   - Backend: pm2 logs rag-backend"
echo "   - Bot (journal): sudo journalctl -u rag-bot -f"
echo "   - Bot (output): sudo tail -f /var/log/rag-bot/output.log"
echo "   - Bot (errors): sudo tail -f /var/log/rag-bot/error.log"
echo ""
echo "Deployment guide: See DEPLOYMENT.md for detailed information"
echo ""

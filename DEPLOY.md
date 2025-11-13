# 🚀 RAG Chatbot Deployment Guide

## Step-by-Step Deployment Instructions

### 1. After logging in to your Ubuntu server, run:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install git curl python3 python3-pip python3-venv nginx mongodb certbot python3-certbot-nginx -y
```

### 2. Install Node.js 18:
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

### 3. Install PM2 globally:
```bash
sudo npm install -g pm2
```

### 4. Check versions:
```bash
node -v
npm -v
python3 --version
```

### 5. Clone your repository:

```

### 6. Create Python virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### 7. Install Playwright browsers:
```bash
playwright install
playwright install-deps
```

### 8. Generate secret keys:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
**Run this command TWICE - save both outputs!**

### 9. Create `.env` file in root directory:
```bash
nano .env
```

**Paste this and update YOUR values:**
```env
# PRODUCTION CONFIGURATION
NODE_ENV=production

# MongoDB (replace with YOUR connection string)
MONGODB_URI=mongodb+srv://spidermanwebs007_db_user:XCfObctJyDVJQfdb@cluster0.jkw4zcf.mongodb.net/?appName=Cluster0
MONGO_URI=mongodb+srv://spidermanwebs007_db_user:XCfObctJyDVJQfdb@cluster0.jkw4zcf.mongodb.net/?appName=Cluster0

# Security (paste the TWO secret keys you generated in step 8)
JWT_SECRET=PASTE_FIRST_SECRET_HERE
FASTAPI_SHARED_SECRET=PASTE_SECOND_SECRET_HERE

# Google API Key (get from https://makersuite.google.com/app/apikey)
GOOGLE_API_KEY=YOUR_GOOGLE_API_KEY_HERE

# Your Domain (replace yourdomain.com with YOUR actual domain)
FASTAPI_BOT_URL=https://yourdomain.com/bot
DEFAULT_BOT_BASE_URL=https://yourdomain.com/bot
CORS_ORIGIN=https://yourdomain.com

# Backend Configuration
PORT=5000
FASTAPI_PORT=8000
DEFAULT_VECTOR_BASE_PATH=./tenant-vector-stores
CHROMA_DB_PATH=/var/www/rag-chatbot/BOT/chroma_db

# Admin User (change these!)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme123

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

**Save and exit:** Press `CTRL+X`, then `Y`, then `ENTER`

### 10. Install backend dependencies:
```bash
cd /var/www/rag-chatbot/admin-backend
npm install
```

### 11. Install frontend dependencies and build:
```bash
cd /var/www/rag-chatbot/admin-frontend
npm install
```

### 12. Create frontend `.env.production` file:
```bash
nano .env.production
```

**Paste this (replace yourdomain.com with YOUR domain):**
```env
REACT_APP_API_BASE=https://yourdomain.com/api
```

**Save and exit:** Press `CTRL+X`, then `Y`, then `ENTER`

### 13. Build frontend:
```bash
npm run build
```

### 14. Set up Nginx configuration:
```bash
sudo nano /etc/nginx/sites-available/rag-chatbot
```

**Paste this (replace yourdomain.com with YOUR domain everywhere):**
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    client_max_body_size 10M;

    # Frontend (React build)
    root /var/www/rag-chatbot/admin-frontend/build;
    index index.html;

    # Serve static files
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Widget script
    location /ragChatWidget.js {
        alias /var/www/rag-chatbot/admin-frontend/public/ragChatWidget.js;
        add_header Content-Type application/javascript;
        add_header Cache-Control "public, max-age=3600";
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
        proxy_connect_timeout 60s;
    }

    # FastAPI Bot
    location /bot/ {
        proxy_pass http://localhost:8000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
        proxy_connect_timeout 120s;
    }
}
```

**Save and exit:** Press `CTRL+X`, then `Y`, then `ENTER`

### 15. Enable Nginx site:
```bash
sudo ln -s /etc/nginx/sites-available/rag-chatbot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 16. Create systemd service for the bot:
```bash
sudo nano /etc/systemd/system/rag-bot.service
```

**Paste this:**
```ini
[Unit]
Description=RAG Chatbot FastAPI Service
After=network.target

[Service]
Type=notify
User=www-data
Group=www-data
WorkingDirectory=/var/www/rag-chatbot/BOT
Environment="PATH=/var/www/rag-chatbot/venv/bin"
EnvironmentFile=/var/www/rag-chatbot/.env
ExecStart=/var/www/rag-chatbot/venv/bin/gunicorn app_20:app \
    -w 4 \
    -k uvicorn.workers.UvicornWorker \
    --bind 0.0.0.0:8000 \
    --timeout 120 \
    --access-logfile /var/log/rag-bot-access.log \
    --error-logfile /var/log/rag-bot-error.log
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Save and exit:** Press `CTRL+X`, then `Y`, then `ENTER`

### 17. Set correct permissions and start bot service:
```bash
sudo chown -R www-data:www-data /var/www/rag-chatbot
sudo chmod -R 755 /var/www/rag-chatbot
sudo systemctl daemon-reload
sudo systemctl enable rag-bot.service
sudo systemctl start rag-bot.service
sudo systemctl status rag-bot.service
```

### 18. Start backend with PM2:
```bash
cd /var/www/rag-chatbot/admin-backend
pm2 start server.js --name rag-backend
pm2 save
pm2 startup
```
**Run the command that PM2 outputs!**

### 19. Set up SSL certificate:
```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```
**Follow the prompts. Choose option 2 (redirect HTTP to HTTPS).**

### 20. Check if everything is running:
```bash
pm2 status
sudo systemctl status rag-bot.service
sudo systemctl status nginx
```

---

## ✅ Your RAG Chatbot is now LIVE!

### Access your application:
- **Admin Dashboard:** https://yourdomain.com
- **API Health Check:** https://yourdomain.com/api/health
- **Bot Health Check:** https://yourdomain.com/bot/health

### Default login:
- **Username:** admin
- **Password:** changeme123

**⚠️ IMPORTANT: Change the admin password immediately after first login!**

---

## 🔧 Useful Commands

### View logs:
```bash
pm2 logs rag-backend
sudo journalctl -u rag-bot.service -f
sudo tail -f /var/log/nginx/error.log
```

### Restart services:
```bash
pm2 restart rag-backend
sudo systemctl restart rag-bot.service
sudo systemctl restart nginx
```

### Update code:
```bash
cd /var/www/rag-chatbot
git pull
cd admin-frontend
npm run build
pm2 restart rag-backend
sudo systemctl restart rag-bot.service
```

---

## 🆘 Troubleshooting

### If backend won't start:
```bash
cd /var/www/rag-chatbot/admin-backend
pm2 logs rag-backend
```

### If bot won't start:
```bash
sudo journalctl -u rag-bot.service -n 50
```

### If Nginx shows errors:
```bash
sudo nginx -t
sudo tail -f /var/log/nginx/error.log
```

### Check port usage:
```bash
sudo netstat -tulpn | grep :5000
sudo netstat -tulpn | grep :8000
sudo netstat -tulpn | grep :80
```

---

## 📝 What You Need Before Starting:

1. ✅ Ubuntu 20.04 or 22.04 server
2. ✅ Domain name pointing to your server IP
3. ✅ MongoDB connection string (you have this: mongodb+srv://spidermanwebs007_db_user:XCfObctJyDVJQfdb@cluster0.jkw4zcf.mongodb.net/)
4. ✅ Google API Key (get from: https://makersuite.google.com/app/apikey)
5. ✅ SSH access to your server

---

**That's it! Your RAG chatbot is deployed! 🎉**

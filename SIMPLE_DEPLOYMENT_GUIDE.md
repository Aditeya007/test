# 🚀 Simple Server Deployment Guide

**RAG Chatbot System - Step by Step Instructions**

This guide will help you deploy your AI chatbot on a live server. Follow each step carefully.

---

## 📦 What You Need Before Starting

1. **A Linux Server** (Ubuntu 20.04 or newer recommended)
   - Minimum 4GB RAM, 2 CPU cores
   - 20GB free disk space
   - Root or sudo access

2. **A Domain Name** (e.g., mychatbot.com)
   - Point your domain's DNS A record to your server's IP address
   - Wait 5-10 minutes for DNS to propagate

3. **Google Gemini API Key**
   - Get free API key from: https://makersuite.google.com/app/apikey
   - Keep this key safe - you'll need it later

4. **MongoDB Atlas Account** (Optional but recommended for production)
   - Sign up free at: https://www.mongodb.com/cloud/atlas
   - Create a free cluster and get connection string
   - Alternative: Use local MongoDB (we'll install it)

---

## 🔧 Step 1: Connect to Your Server

Open your terminal and connect to your server:

```bash
ssh username@your-server-ip
```

Replace `username` with your server username and `your-server-ip` with your server's IP address.

---

## 📥 Step 2: Download the Project

Clone the project from GitHub:

```bash
cd /var/www
sudo mkdir -p rag-chatbot
sudo chown $USER:$USER rag-chatbot
cd rag-chatbot
git clone https://github.com/excellis-it/excellis_chatbot .
```

---

## ⚙️ Step 3: Install Required Software

Install Node.js, Python, MongoDB, and other tools:

```bash
# Update system packages
sudo apt update
sudo apt upgrade -y

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install Python and pip
sudo apt install -y python3 python3-pip python3-venv

# Install MongoDB (local database)
sudo apt install -y mongodb
sudo systemctl start mongodb
sudo systemctl enable mongodb

# Verify MongoDB is working
mongosh --eval "db.adminCommand('ping')" || mongo --eval "db.adminCommand('ping')"

# Install Nginx (web server)
sudo apt install -y nginx

# Install PM2 (Node.js process manager)
sudo npm install -g pm2

# Install SSL certificate tool
sudo apt install -y certbot python3-certbot-nginx
```

Wait for all installations to complete (this may take 5-10 minutes).

---

## 🔐 Step 4: Configure Environment Variables

Create your environment configuration file:

```bash
cd /var/www/rag-chatbot
cp .env.production .env
nano .env
```

Now edit the `.env` file with your actual values. Press `Ctrl+O` to save, `Enter` to confirm, then `Ctrl+X` to exit.

**Important values to change:**

```bash
# Set to production
NODE_ENV=production

# MongoDB Configuration
# Option A: Use local MongoDB
MONGO_URI=mongodb://localhost:27017/rag_chatbot_prod

# Option B: Use MongoDB Atlas (recommended)
# MONGO_URI=mongodb+srv://your-username:your-password@cluster.mongodb.net/rag_chatbot_prod

# Generate two new secret keys using this command (run it twice):
# You can run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=paste_first_generated_secret_here
FASTAPI_SHARED_SECRET=paste_second_generated_secret_here

# Service secret for scheduler (use SAME value as FASTAPI_SHARED_SECRET)
SERVICE_SECRET=paste_second_generated_secret_here

# Scheduler configuration - URLs for bot notification after scraping
BOT_URL=https://mychatbot.com/bot
ADMIN_BACKEND_URL=https://mychatbot.com/api

# Your Google API Key
GOOGLE_API_KEY=your_google_api_key_here

# Your domain (replace mychatbot.com with YOUR domain)
FASTAPI_BOT_URL=https://mychatbot.com/bot
CORS_ORIGIN=https://mychatbot.com

# Server port
PORT=5000
```

**To generate secret keys**, run this command twice in a separate terminal:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy each output and paste into `JWT_SECRET` and `FASTAPI_SHARED_SECRET`.

**Validate your configuration:**

```bash
# Check if all required environment variables are set correctly
node deployment/validate-env.js
```

Fix any errors before proceeding to the next step.

---

## 🏗️ Step 5: Build the Frontend

Install dependencies and build the React frontend:

```bash
cd /var/www/rag-chatbot/admin-frontend
npm install
npm run build
```

This creates optimized production files in the `build/` folder (takes 2-5 minutes).

---

## 🖥️ Step 6: Install Backend Dependencies

Install Node.js backend packages:

```bash
cd /var/www/rag-chatbot/admin-backend
npm install --production
```

---

## 🐍 Step 7: Setup Python Environment

Create Python virtual environment and install packages:

```bash
cd /var/www/rag-chatbot
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

This will take 5-10 minutes as it downloads AI models and libraries.

**CRITICAL: Install Playwright Browsers (Required for Web Scraping)**

```bash
# Still in the virtual environment, install Playwright browsers
playwright install chromium

# Install system dependencies for Playwright (Ubuntu/Debian)
sudo playwright install-deps chromium

# Verify Playwright installation
playwright --version
```

**Important:** Without Playwright browsers, the web scraping feature will completely fail. This step is mandatory!

---

## 🚀 Step 8: Start the Backend Service

Start Node.js backend with PM2:

```bash
cd /var/www/rag-chatbot/admin-backend
pm2 start server.js --name rag-backend
pm2 save
pm2 startup
```

Copy and run the command that PM2 shows you (it starts with `sudo`).

Check if backend is running:

```bash
pm2 status
```

You should see `rag-backend` with status `online`.

---

## 🤖 Step 9: Start the AI Bot Service

**IMPORTANT:** The bot service now uses `run_bot_with_autorestart.py` which automatically restarts the bot after scrapes complete, ensuring fresh database connections and continuous operation.

### Production with Systemd (Recommended)

Create a system service for the Python bot with auto-restart capability:

```bash
# Create log directory and files with proper permissions
sudo mkdir -p /var/log/rag-bot
sudo chown www-data:www-data /var/log/rag-bot
sudo touch /var/log/rag-bot/output.log /var/log/rag-bot/error.log
sudo chown www-data:www-data /var/log/rag-bot/output.log /var/log/rag-bot/error.log

# Copy the pre-configured service file
sudo cp deployment/rag-bot.service /etc/systemd/system/
```

**What This Does:**
- The systemd service runs `run_bot_with_autorestart.py` instead of directly running the bot
- When the bot exits (e.g., after a scrape), the wrapper automatically restarts it
- The systemd service itself also restarts if the wrapper crashes (double protection)
- The bot continues running even if you disconnect from the server or turn off your PC
- All output is logged to `/var/log/rag-bot/` for monitoring

Start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable rag-bot
sudo systemctl start rag-bot
sudo systemctl status rag-bot
```

You should see `active (running)` in green.

**Monitor the Bot:**

```bash
# View real-time logs
sudo journalctl -u rag-bot -f

# Or view the output log file
sudo tail -f /var/log/rag-bot/output.log

# Check if bot is responding
curl http://localhost:8000/health
```

### Development/Testing (Optional)

For local development without systemd, run directly:

```bash
cd /var/www/rag-chatbot
source venv/bin/activate
python run_bot_with_autorestart.py
```

Press `Ctrl+C` to stop. This is useful for testing changes before deploying.

---

## 🌐 Step 10: Configure Nginx Web Server

Setup Nginx to serve your application:

```bash
sudo nano /etc/nginx/sites-available/rag-chatbot
```

Paste this configuration (replace `mychatbot.com` with YOUR domain):

```nginx
server {
    listen 80;
    server_name mychatbot.com www.mychatbot.com;
    
    client_max_body_size 10M;

    # Serve React Frontend
    location / {
        root /var/www/rag-chatbot/admin-frontend/build;
        try_files $uri $uri/ /index.html;
        
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
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
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # AI Bot API
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
        proxy_connect_timeout 120s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }

    # Widget Script
    location /ragChatWidget.js {
        root /var/www/rag-chatbot/admin-frontend/build;
        add_header Access-Control-Allow-Origin *;
        add_header Cache-Control "public, max-age=3600";
    }
}
```

Enable the site and test configuration:

```bash
sudo ln -s /etc/nginx/sites-available/rag-chatbot /etc/nginx/sites-enabled/
sudo nginx -t
```

If you see "test is successful", reload Nginx:

```bash
sudo systemctl reload nginx
```

---

## 🔒 Step 11: Setup SSL Certificate (HTTPS)

Enable HTTPS with free SSL certificate:

```bash
sudo certbot --nginx -d mychatbot.com -d www.mychatbot.com
```

Replace `mychatbot.com` with YOUR domain. Follow the prompts:
1. Enter your email address
2. Agree to terms of service
3. Choose option 2: "Redirect HTTP to HTTPS"

Certbot will automatically configure HTTPS and renew certificates.

---

## 🔥 Step 12: Configure Firewall

Allow HTTP and HTTPS traffic:

```bash
sudo ufw allow 22/tcp     # SSH (keep this!)
sudo ufw allow 80/tcp     # HTTP
sudo ufw allow 443/tcp    # HTTPS
sudo ufw enable
sudo ufw status
```

---

## ✅ Step 13: Verify Deployment

Check all services are running:

```bash
# Check backend
pm2 status

# Check bot service
sudo systemctl status rag-bot

# Check Nginx
sudo systemctl status nginx

# Check MongoDB
sudo systemctl status mongodb
```

All should show `active (running)` status.

---

## 🎉 Step 14: Access Your Chatbot

Open your browser and go to:

```
https://mychatbot.com
```

(Replace with your actual domain)

You should see the login page.

**Create Your First Admin Account:**

1. Click on "Register" or "Sign Up"
2. Fill in your details (email, password, username)
3. Submit the registration form
4. The first account created automatically gets admin privileges
5. Login with your credentials
6. Access the dashboard to start scraping websites and configuring your chatbot

**Note:** The first registered user becomes the admin. Subsequent registrations will be regular users unless promoted by an admin.

---

## 📊 Monitoring and Logs

**View Backend Logs:**
```bash
pm2 logs rag-backend
```

**View Bot Logs:**
```bash
# View systemd journal (includes both stdout and stderr)
sudo journalctl -u rag-bot -f

# Or view the dedicated log files
sudo tail -f /var/log/rag-bot/output.log
sudo tail -f /var/log/rag-bot/error.log
```

**View Nginx Logs:**
```bash
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

---

## 🔄 Updating Your Chatbot

When you need to update the code:

```bash
cd /var/www/rag-chatbot
git pull origin main

# Rebuild frontend
cd admin-frontend
npm install
npm run build

# Update Python dependencies
cd ..
source venv/bin/activate
pip install -r requirements.txt

# Restart services
pm2 restart rag-backend
sudo systemctl restart rag-bot
```

**Note:** The systemd service automatically uses the auto-restart wrapper, so a simple restart is all you need. The bot will continue running even after you disconnect from the server.

---

## 🛠️ Troubleshooting

### Problem: "502 Bad Gateway" error

**Solution:**
```bash
# Check if services are running
pm2 status
sudo systemctl status rag-bot

# Restart services
pm2 restart rag-backend
sudo systemctl restart rag-bot
```

### Problem: "Cannot connect to MongoDB"

**Solution:**
```bash
# Check MongoDB status
sudo systemctl status mongodb

# Restart MongoDB
sudo systemctl restart mongodb

# Check your MONGO_URI in .env file
nano /var/www/rag-chatbot/.env
```

### Problem: "Bot not responding"

**Solution:**
```bash
# Check bot logs (systemd journal)
sudo journalctl -u rag-bot -n 50

# Or check the output log file
sudo tail -100 /var/log/rag-bot/output.log

# Check error log
sudo tail -50 /var/log/rag-bot/error.log

# Check if port 8000 is listening
sudo netstat -tlnp | grep 8000

# Restart bot (the auto-restart wrapper will also restart)
sudo systemctl restart rag-bot

# Check status
sudo systemctl status rag-bot
```

### Problem: "Permission denied" errors

**Solution:**
```bash
# Fix ownership
cd /var/www
sudo chown -R $USER:$USER rag-chatbot

# Fix permissions
chmod -R 755 rag-chatbot
```

### Problem: Website not loading

**Solution:**
```bash
# Check Nginx configuration
sudo nginx -t

# Check Nginx logs
sudo tail -f /var/log/nginx/error.log

# Restart Nginx
sudo systemctl restart nginx
```

---

## 🎯 What's Next?

After successful deployment:

1. **Create Admin Account** - Register your first admin user
2. **Add Content** - Use the scraper to add website content
3. **Test Chatbot** - Ask questions to verify it's working
4. **Embed Widget** - Add the chat widget to your website using:
   ```html
   <script src="https://mychatbot.com/ragChatWidget.js"></script>
   <script>
     window.RAGWidget.init({
       apiBase: "https://mychatbot.com/api",
       userId: "your-user-id",
       authToken: "your-api-token"
     });
   </script>
   ```

5. **Setup Backups** - Backup MongoDB regularly:
   ```bash
   mongodump --db rag_chatbot_prod --out /backups/mongodb/
   ```

---

## 📞 Need Help?

If you get stuck:
1. Check the logs (see Monitoring section above)
2. Verify all environment variables in `.env` file
3. Make sure your domain DNS is pointing to server IP
4. Ensure all ports (80, 443, 5000, 8000) are accessible
5. Check firewall settings with `sudo ufw status`

---

## 🎊 Congratulations!

You've successfully deployed your AI-powered RAG chatbot system. Your chatbot is now live and ready to answer questions based on your content!

**Remember:**
- Keep your `.env` file secure (contains API keys)
- Regularly update your system: `sudo apt update && sudo apt upgrade`
- Monitor logs for any issues
- Backup your MongoDB database regularly

Happy chatting! 🤖✨

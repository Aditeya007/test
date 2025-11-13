# 🚀 Complete Deployment Guide - RAG Chatbot System

**For Beginners** | **Step-by-Step** | **Production Ready**

This guide will help you deploy your AI-powered chatbot to a live server so it can be accessed from anywhere on the internet. No technical experience required - just follow each step carefully.

---

## 📋 Table of Contents

1. [What You're Deploying](#what-youre-deploying)
2. [What You Need](#what-you-need)
3. [Before You Start](#before-you-start)
4. [Step-by-Step Deployment](#step-by-step-deployment)
5. [After Deployment](#after-deployment)
6. [Troubleshooting](#troubleshooting)
7. [Maintenance](#maintenance)

---

## 🎯 What You're Deploying

Your RAG (Retrieval-Augmented Generation) Chatbot has **3 main components**:

### **1. Admin Dashboard (Frontend)**
- Built with React
- Manages users and chatbot settings
- URL: `https://yourdomain.com`

### **2. Backend API (Node.js)**
- Handles user authentication
- Manages database operations
- Runs on port 5000 (internal)

### **3. AI Chatbot (Python/FastAPI)**
- Powered by Google Gemini AI
- Answers questions using your content
- Runs on port 8000 (internal)

### **Supporting Components:**
- **MongoDB** - Stores user data and conversations
- **Nginx** - Web server that routes traffic
- **ChromaDB** - Vector database for AI embeddings
- **Web Scraper** - Collects content from websites
- **Content Updater** - Keeps chatbot knowledge fresh

---

## 💼 What You Need

### **1. A Server**
You need a Linux server to host your chatbot. Recommended options:

**Option A: DigitalOcean (Easiest for beginners)**
- Go to https://www.digitalocean.com
- Create account
- Create a "Droplet" (their name for a server)
- Cost: $24/month for 4GB RAM

**Option B: Other Providers**
- AWS EC2
- Linode
- Vultr
- Any Ubuntu 20.04/22.04 server

**Minimum Server Requirements:**
- Operating System: Ubuntu 20.04 or 22.04 LTS
- RAM: 4GB minimum (8GB recommended)
- Storage: 20GB SSD
- CPU: 2 cores

### **2. A Domain Name**
- Purchase from GoDaddy, Namecheap, Google Domains, etc.
- Cost: ~$12/year
- Example: `mychatbot.com`

### **3. Google API Key**
- Free (with limits)
- Get from: https://makersuite.google.com/app/apikey
- Used for AI responses

### **4. Time**
- First-time deployment: 2-3 hours
- Future deployments: 30 minutes

### **5. Tools**
- SSH client (built into Windows/Mac/Linux)
- Text editor (Notepad++ or VS Code)

---

## ⚙️ Before You Start

### **STEP 1: Configure Your Environment File**

This is the most important step! Open the `.env.production` file in your project and update it:

#### **A. Change Environment Mode**
```env
NODE_ENV=production
```

#### **B. Update Your Domain**
Replace `yourdomain.com` with YOUR actual domain in these lines:
```env
FASTAPI_BOT_URL=https://mychatbot.com/bot
DEFAULT_BOT_BASE_URL=https://mychatbot.com/bot
CORS_ORIGIN=https://mychatbot.com
```

#### **C. Generate Security Secrets**
Open PowerShell (Windows) or Terminal (Mac/Linux) and run this command **TWICE**:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

You'll get two long random strings. Copy them:
```env
JWT_SECRET=paste_first_secret_here
FASTAPI_SHARED_SECRET=paste_second_secret_here
```

#### **D. Add Your Google API Key**
```env
GOOGLE_API_KEY=your_actual_google_api_key
```

#### **E. Configure Database**
For beginners, use local MongoDB (default):
```env
MONGODB_URI=mongodb://localhost:27017
MONGO_URI=mongodb://localhost:27017/rag_chatbot_prod
```

**Save the file!**

---

### **STEP 2: Build Frontend**

Open PowerShell or Terminal in your project folder:

```powershell
# Navigate to frontend
cd admin-frontend

# Create production config
echo "REACT_APP_API_BASE=https://yourdomain.com/api" > .env.production

# Install dependencies (if not already done)
npm install

# Build for production
npm run build

# Go back to main folder
cd ..
```

This creates an optimized version in `admin-frontend/build/` folder.

---

### **STEP 3: Prepare Domain DNS**

1. Log into your domain registrar (GoDaddy, Namecheap, etc.)
2. Find DNS Settings or Manage DNS
3. Add an **A Record**:
   - **Type:** A
   - **Name:** @ (or leave blank)
   - **Value:** Your server's IP address
   - **TTL:** 3600 or default

4. Optionally add for `www`:
   - **Type:** A
   - **Name:** www
   - **Value:** Same IP address

**Wait 10-60 minutes** for DNS to propagate (you can check at https://dnschecker.org)

---

## 🚀 Step-by-Step Deployment

Now let's deploy to your server!

---

### **PHASE 1: Server Setup**

#### **Step 1: Connect to Your Server**

Open PowerShell (Windows) or Terminal (Mac/Linux):

```bash
ssh root@YOUR_SERVER_IP
```

Replace `YOUR_SERVER_IP` with your server's IP address (e.g., `123.45.67.89`)

Type `yes` when asked about fingerprint, then enter your password.

**You're now inside your server!** 🎉

---

#### **Step 2: Update System**

```bash
apt update && apt upgrade -y
```

This updates all system packages. Takes 2-5 minutes.

---

#### **Step 3: Install Node.js 18**

```bash
# Add Node.js repository
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -

# Install Node.js
apt install -y nodejs

# Verify installation
node --version
npm --version
```

You should see version numbers like `v18.x.x` and `9.x.x`

---

#### **Step 4: Install Python 3**

```bash
# Install Python and pip
apt install -y python3 python3-pip python3-venv

# Verify installation
python3 --version
pip3 --version
```

You should see Python 3.10 or higher.

---

#### **Step 5: Install MongoDB**

```bash
# Import MongoDB GPG key
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | apt-key add -

# Add MongoDB repository (for Ubuntu 22.04)
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/6.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-6.0.list

# For Ubuntu 20.04, use this instead:
# echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-6.0.list

# Update and install
apt update
apt install -y mongodb-org

# Start MongoDB
systemctl start mongod
systemctl enable mongod

# Check status
systemctl status mongod
```

Press `q` to exit the status view. MongoDB is now running!

---

#### **Step 6: Install Nginx**

```bash
# Install Nginx
apt install -y nginx

# Start Nginx
systemctl start nginx
systemctl enable nginx

# Check status
systemctl status nginx
```

Press `q` to exit.

---

#### **Step 7: Install PM2**

PM2 keeps your Node.js backend running continuously.

```bash
# Install PM2 globally
npm install -g pm2

# Verify installation
pm2 --version
```

---

#### **Step 8: Install Certbot (for SSL)**

```bash
# Install Certbot
apt install -y certbot python3-certbot-nginx
```

---

### **PHASE 2: Upload Your Code**

#### **Method A: Using Git (Recommended)**

On your server:

```bash
# Create directory
mkdir -p /var/www
cd /var/www

# Clone your repository
git clone https://github.com/excellis-it/excellis_chatbot.git rag-chatbot

# Navigate to project
cd rag-chatbot
```

---

#### **Method B: Manual Upload (Alternative)**

**On your computer:**

1. Install WinSCP (Windows) or use FileZilla (all platforms)
2. Connect to your server:
   - Protocol: SFTP
   - Host: Your server IP
   - Username: root
   - Password: Your server password
   - Port: 22

3. Upload your entire project folder to `/var/www/rag-chatbot`

**Then on server:**
```bash
cd /var/www/rag-chatbot
```

---

#### **Step 9: Copy Environment File**

```bash
# Copy production environment to .env
cp .env.production .env

# Verify it copied
cat .env
```

Make sure all values are correct!

---

### **PHASE 3: Install Dependencies**

#### **Step 10: Install Backend Dependencies**

```bash
# Navigate to backend
cd /var/www/rag-chatbot/admin-backend

# Install Node.js packages
npm install --production

# Go back to root
cd /var/www/rag-chatbot
```

Takes 2-3 minutes.

---

#### **Step 11: Install Python Dependencies**

```bash
# Create Python virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip

# Install Python packages
pip install -r requirements.txt

# Install Playwright browsers (for web scraping)
playwright install chromium
playwright install-deps chromium

# Deactivate virtual environment
deactivate
```

Takes 5-10 minutes.

---

### **PHASE 4: Start Services**

#### **Step 12: Start Backend with PM2**

```bash
# Navigate to backend
cd /var/www/rag-chatbot/admin-backend

# Start backend server
pm2 start server.js --name rag-backend

# Save PM2 configuration
pm2 save

# Configure PM2 to start on boot
pm2 startup systemd

# Copy and run the command that PM2 outputs
```

PM2 will show you a command like:
```bash
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /root
```

**Copy and run that exact command!**

Check if it's running:
```bash
pm2 status
```

You should see `rag-backend` with status `online`.

---

#### **Step 13: Setup AI Bot Service**

```bash
# Create log directory
mkdir -p /var/log/rag-bot
chown www-data:www-data /var/log/rag-bot

# Copy service file
cp /var/www/rag-chatbot/deployment/rag-bot.service /etc/systemd/system/

# Reload systemd
systemctl daemon-reload

# Enable bot service
systemctl enable rag-bot

# Start bot service
systemctl start rag-bot

# Check status
systemctl status rag-bot
```

Press `q` to exit. Bot should be `active (running)`.

---

### **PHASE 5: Configure Nginx**

#### **Step 14: Update Nginx Configuration**

```bash
# Edit the nginx config file
nano /var/www/rag-chatbot/deployment/nginx.conf
```

**Press `Ctrl+\` to search and replace:**
- Search for: `yourdomain.com`
- Replace with: Your actual domain (e.g., `mychatbot.com`)
- Press `A` to replace all
- Press `Y` to confirm

**Press `Ctrl+X`, then `Y`, then `Enter` to save.**

---

#### **Step 15: Install Nginx Configuration**

```bash
# Copy configuration
cp /var/www/rag-chatbot/deployment/nginx.conf /etc/nginx/sites-available/rag-chatbot

# Enable site
ln -sf /etc/nginx/sites-available/rag-chatbot /etc/nginx/sites-enabled/

# Remove default site
rm -f /etc/nginx/sites-enabled/default

# Test configuration
nginx -t
```

If you see `test is successful`, continue:

```bash
# Reload Nginx
systemctl reload nginx
```

---

#### **Step 16: Setup SSL Certificate (HTTPS)**

Replace `yourdomain.com` with YOUR domain:

```bash
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

**Follow the prompts:**
1. Enter your email address
2. Type `Y` to agree to terms
3. Type `N` for sharing email (optional)
4. Type `2` to redirect HTTP to HTTPS

**SSL is now configured!** 🔒

---

### **PHASE 6: Security & Firewall**

#### **Step 17: Configure Firewall**

```bash
# Install UFW
apt install -y ufw

# Allow SSH (IMPORTANT: Do this first!)
ufw allow 22

# Allow HTTP and HTTPS
ufw allow 80
ufw allow 443

# Enable firewall
ufw --force enable

# Check status
ufw status
```

---

#### **Step 18: Secure Permissions**

```bash
# Set ownership
chown -R www-data:www-data /var/www/rag-chatbot

# Secure .env file
chmod 600 /var/www/rag-chatbot/.env

# Create tenant vector stores directory
mkdir -p /var/www/rag-chatbot/tenant-vector-stores
chown -R www-data:www-data /var/www/rag-chatbot/tenant-vector-stores
```

---

## ✅ Verify Deployment

### **Step 19: Test Everything**

#### **Check Services:**
```bash
# Check all services
pm2 status
systemctl status rag-bot
systemctl status nginx
systemctl status mongod
```

All should show `online` or `active (running)`.

---

#### **Check Logs:**
```bash
# Backend logs
pm2 logs rag-backend --lines 20

# Bot logs
journalctl -u rag-bot -n 50 --no-pager

# Nginx logs
tail -20 /var/log/nginx/error.log
```

Look for any errors. Press `Ctrl+C` to exit log views.

---

#### **Test URLs:**

Open your browser and visit:

1. **Main Website:** `https://yourdomain.com`
   - Should show the admin dashboard
   - Should have a green padlock (SSL working)

2. **API Health Check:** `https://yourdomain.com/api/health`
   - Should return: `{"status":"healthy"}`

3. **Bot Health Check:** `https://yourdomain.com/bot/health`
   - Should return JSON with system info

---

## 🎉 After Deployment

### **Create Admin User**

You need to create your first admin account.

**Method 1: Using MongoDB directly**
```bash
# Connect to MongoDB
mongosh

# Switch to database
use rag_chatbot_prod

# Create admin user (update email, username, password)
db.users.insertOne({
  email: "admin@yourdomain.com",
  username: "admin",
  password: "$2a$10$YourHashedPasswordHere", // You need to hash this
  role: "admin",
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
})

# Exit
exit
```

**Method 2: Use the registration endpoint** (if enabled)
Visit: `https://yourdomain.com` and register

---

### **Add Chatbot to Your Website**

To embed the chatbot on any website, add this code before `</body>`:

```html
<!-- RAG Chatbot Widget -->
<script>
  window.ragChatbotConfig = {
    botUrl: 'https://yourdomain.com/bot',
    theme: {
      primaryColor: '#007bff',
      position: 'bottom-right'
    }
  };
</script>
<script src="https://yourdomain.com/ragChatWidget.js" defer></script>
```

Replace `yourdomain.com` with your actual domain!

---

## 🔄 Maintenance

### **View Logs**

```bash
# Backend logs (real-time)
pm2 logs rag-backend

# Bot logs (real-time)
journalctl -u rag-bot -f

# Nginx access logs
tail -f /var/log/nginx/access.log

# Nginx error logs
tail -f /var/log/nginx/error.log
```

Press `Ctrl+C` to stop viewing logs.

---

### **Restart Services**

```bash
# Restart backend
pm2 restart rag-backend

# Restart bot
systemctl restart rag-bot

# Restart nginx
systemctl restart nginx

# Restart MongoDB
systemctl restart mongod
```

---

### **Update Your Code**

When you make changes to your code:

```bash
# Navigate to project
cd /var/www/rag-chatbot

# Pull latest changes (if using Git)
git pull

# Rebuild frontend if changed
cd admin-frontend
npm run build
cd ..

# Restart services
pm2 restart rag-backend
systemctl restart rag-bot
```

---

### **Check Disk Space**

```bash
# Check disk usage
df -h

# Check largest directories
du -sh /var/www/rag-chatbot/* | sort -h
```

---

### **Backup Database**

```bash
# Create backup directory
mkdir -p /root/backups

# Backup MongoDB
mongodump --out=/root/backups/mongo-$(date +%Y%m%d-%H%M%S)

# List backups
ls -lh /root/backups/
```

---

### **Restore Database**

```bash
# Restore from backup
mongorestore /root/backups/mongo-20241113-120000
```

---

## 🆘 Troubleshooting

### **Problem: Can't Access Website**

**Check DNS:**
```bash
# On your computer, check if DNS is working
nslookup yourdomain.com
```

**Check Nginx:**
```bash
systemctl status nginx
nginx -t
tail -50 /var/log/nginx/error.log
```

**Check Firewall:**
```bash
ufw status
```

Make sure ports 80 and 443 are allowed.

---

### **Problem: 502 Bad Gateway**

This means Nginx can't reach your backend or bot.

**Check Backend:**
```bash
pm2 status
pm2 logs rag-backend --lines 50
```

**Check Bot:**
```bash
systemctl status rag-bot
journalctl -u rag-bot -n 50
```

**Restart Both:**
```bash
pm2 restart rag-backend
systemctl restart rag-bot
sleep 5
systemctl reload nginx
```

---

### **Problem: MongoDB Connection Error**

**Check if MongoDB is running:**
```bash
systemctl status mongod
```

**If not running, start it:**
```bash
systemctl start mongod
systemctl enable mongod
```

**Check MongoDB logs:**
```bash
tail -50 /var/log/mongodb/mongod.log
```

---

### **Problem: Bot Not Responding**

**Check Bot Service:**
```bash
systemctl status rag-bot
```

**Check Bot Logs:**
```bash
journalctl -u rag-bot -n 100 --no-pager
```

**Common Issues:**
- Google API Key not valid or quota exceeded
- Vector store path not accessible
- Python dependencies missing

**Reinstall Dependencies:**
```bash
cd /var/www/rag-chatbot
source venv/bin/activate
pip install --upgrade -r requirements.txt
deactivate
systemctl restart rag-bot
```

---

### **Problem: SSL Certificate Issues**

**Renew Certificate:**
```bash
certbot renew --dry-run
certbot renew
systemctl reload nginx
```

**Check Certificate Expiry:**
```bash
certbot certificates
```

---

### **Problem: High CPU/Memory Usage**

**Check Resource Usage:**
```bash
# Install htop if not available
apt install -y htop

# View processes
htop
```

Press `F10` to exit.

**Check PM2 Monitoring:**
```bash
pm2 monit
```

**Optimize PM2 Workers:**
```bash
# Edit service, reduce workers if needed
nano /etc/systemd/system/rag-bot.service

# Change: -w 4 to -w 2 (in ExecStart line)

# Reload and restart
systemctl daemon-reload
systemctl restart rag-bot
```

---

### **Problem: Port Already in Use**

**Check what's using a port:**
```bash
# Check port 5000
lsof -i :5000

# Check port 8000
lsof -i :8000
```

**Kill the process:**
```bash
# Find process ID (PID) from above command
kill -9 PID_NUMBER
```

---

## 📊 Monitoring & Analytics

### **Setup Log Rotation**

```bash
# Create logrotate config
nano /etc/logrotate.d/rag-chatbot
```

Add this content:
```
/var/log/rag-bot/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
    postrotate
        systemctl reload rag-bot > /dev/null 2>&1 || true
    endscript
}

/var/log/nginx/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data adm
    sharedscripts
    postrotate
        systemctl reload nginx > /dev/null 2>&1 || true
    endscript
}
```

Save with `Ctrl+X`, `Y`, `Enter`.

---

### **Monitor Service Health**

Create a simple health check script:

```bash
nano /root/check-health.sh
```

Add:
```bash
#!/bin/bash
echo "=== Service Health Check ==="
echo "Backend: $(pm2 list | grep rag-backend | grep online > /dev/null && echo 'OK' || echo 'FAIL')"
echo "Bot: $(systemctl is-active rag-bot)"
echo "Nginx: $(systemctl is-active nginx)"
echo "MongoDB: $(systemctl is-active mongod)"
echo ""
echo "Disk Usage:"
df -h /
echo ""
echo "Memory Usage:"
free -h
```

Make it executable:
```bash
chmod +x /root/check-health.sh
```

Run it anytime:
```bash
/root/check-health.sh
```

---

## 🔒 Security Best Practices

### **1. Change Default SSH Port**

```bash
nano /etc/ssh/sshd_config
```

Find line `#Port 22` and change to:
```
Port 2222
```

Save and restart:
```bash
systemctl restart sshd
ufw allow 2222
```

**Now connect with:** `ssh -p 2222 root@YOUR_IP`

---

### **2. Disable Root Login**

Create a new user first:
```bash
adduser deploy
usermod -aG sudo deploy
```

Then disable root:
```bash
nano /etc/ssh/sshd_config
```

Change to:
```
PermitRootLogin no
```

Save and restart:
```bash
systemctl restart sshd
```

---

### **3. Setup Fail2Ban**

```bash
# Install Fail2Ban
apt install -y fail2ban

# Copy default config
cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local

# Edit config
nano /etc/fail2ban/jail.local
```

Enable SSH jail:
```
[sshd]
enabled = true
port = 22
logpath = /var/log/auth.log
maxretry = 5
bantime = 3600
```

Start Fail2Ban:
```bash
systemctl enable fail2ban
systemctl start fail2ban
```

---

### **4. Regular Updates**

Setup automatic updates:
```bash
apt install -y unattended-upgrades

# Configure
dpkg-reconfigure -plow unattended-upgrades
```

---

## 📈 Performance Optimization

### **1. Enable Nginx Gzip Compression**

```bash
nano /etc/nginx/nginx.conf
```

Find `http {` block and add:
```nginx
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_proxied any;
gzip_types
    text/plain
    text/css
    text/xml
    text/javascript
    application/json
    application/javascript
    application/xml+rss
    application/rss+xml
    font/truetype
    font/opentype
    application/vnd.ms-fontobject
    image/svg+xml;
```

Save and reload:
```bash
nginx -t
systemctl reload nginx
```

---

### **2. Optimize MongoDB**

```bash
# Connect to MongoDB
mongosh

# Create indexes for better performance
use rag_chatbot_prod
db.users.createIndex({ email: 1 }, { unique: true })
db.users.createIndex({ username: 1 }, { unique: true })
db.users.createIndex({ resourceId: 1 }, { unique: true })

exit
```

---

### **3. Setup Nginx Caching**

```bash
nano /etc/nginx/sites-available/rag-chatbot
```

Add inside `server` block:
```nginx
# Cache configuration
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=my_cache:10m max_size=1g 
                 inactive=60m use_temp_path=off;
```

---

## 📝 Deployment Checklist

Print this and check off each item:

### **Pre-Deployment:**
- [ ] `.env.production` file configured
- [ ] Domain purchased and DNS configured
- [ ] Google API Key obtained
- [ ] Security secrets generated
- [ ] Frontend built successfully
- [ ] Server purchased (Ubuntu 22.04, 4GB RAM)
- [ ] SSH access to server working

### **Server Setup:**
- [ ] System updated
- [ ] Node.js 18 installed
- [ ] Python 3 installed
- [ ] MongoDB installed and running
- [ ] Nginx installed and running
- [ ] PM2 installed
- [ ] Certbot installed

### **Code Deployment:**
- [ ] Code uploaded to `/var/www/rag-chatbot`
- [ ] `.env` file copied and verified
- [ ] Backend dependencies installed
- [ ] Python dependencies installed
- [ ] Playwright browsers installed

### **Services:**
- [ ] Backend started with PM2
- [ ] PM2 configured for auto-start
- [ ] Bot service created and started
- [ ] Nginx configured with domain
- [ ] SSL certificate obtained
- [ ] Firewall configured

### **Testing:**
- [ ] Website loads at `https://yourdomain.com`
- [ ] API health check returns success
- [ ] Bot health check returns success
- [ ] Admin login works
- [ ] Chatbot responds to questions
- [ ] No SSL certificate warnings
- [ ] All services auto-restart on reboot

### **Security:**
- [ ] Firewall enabled and configured
- [ ] `.env` file permissions set to 600
- [ ] Services running as www-data user
- [ ] Strong passwords set
- [ ] Backups configured

### **Post-Deployment:**
- [ ] Admin user created
- [ ] Test chatbot embedded on website
- [ ] Log rotation configured
- [ ] Monitoring setup
- [ ] Documentation updated with actual domain

---

## 🎓 Understanding Your System

### **Ports Used:**
- **80** - HTTP (redirects to HTTPS)
- **443** - HTTPS (main website)
- **5000** - Backend API (internal only)
- **8000** - AI Bot (internal only)
- **27017** - MongoDB (internal only)
- **9000** - Scheduler (internal only, if used)
- **7000** - Scraper (internal only, if used)

### **Important Directories:**
- `/var/www/rag-chatbot/` - Main application
- `/var/www/rag-chatbot/.env` - Configuration
- `/var/www/rag-chatbot/admin-backend/` - Node.js backend
- `/var/www/rag-chatbot/admin-frontend/build/` - React frontend
- `/var/www/rag-chatbot/BOT/` - Python AI bot
- `/var/www/rag-chatbot/venv/` - Python virtual environment
- `/var/www/rag-chatbot/tenant-vector-stores/` - User data
- `/var/log/rag-bot/` - Bot logs
- `/var/log/nginx/` - Web server logs
- `/etc/nginx/sites-available/` - Nginx configs
- `/etc/systemd/system/` - Service files

### **Important Commands:**

| Task | Command |
|------|---------|
| Check all services | `pm2 status && systemctl status rag-bot nginx mongod` |
| View backend logs | `pm2 logs rag-backend` |
| View bot logs | `journalctl -u rag-bot -f` |
| Restart backend | `pm2 restart rag-backend` |
| Restart bot | `systemctl restart rag-bot` |
| Restart nginx | `systemctl restart nginx` |
| Restart MongoDB | `systemctl restart mongod` |
| Check disk space | `df -h` |
| Check memory | `free -h` |
| Test nginx config | `nginx -t` |
| Renew SSL | `certbot renew` |
| View SSL certs | `certbot certificates` |
| Check firewall | `ufw status` |
| Backup database | `mongodump --out=/root/backups/mongo-$(date +%Y%m%d)` |

---

## 🌐 Multiple Environments

If you want separate staging/production:

### **Staging Server**
- Use subdomain: `staging.yourdomain.com`
- Follow same deployment steps
- Update `.env` with staging values

### **Production Server**
- Use main domain: `yourdomain.com`
- Follow deployment steps with production values

---

## 🔄 CI/CD (Advanced)

For automatic deployments, create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to Server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.SERVER_IP }}
          username: deploy
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd /var/www/rag-chatbot
            git pull
            cd admin-frontend && npm run build && cd ..
            pm2 restart rag-backend
            systemctl restart rag-bot
```

---

## 📞 Getting Help

### **Check Logs First:**
Always check logs when something goes wrong:
```bash
pm2 logs rag-backend --lines 100
journalctl -u rag-bot -n 100
tail -100 /var/log/nginx/error.log
```

### **Common Error Messages:**

| Error | Solution |
|-------|----------|
| "EADDRINUSE: address already in use" | Port conflict - kill process using that port |
| "MongoNetworkError" | MongoDB not running - start mongod service |
| "Permission denied" | Check file ownership and permissions |
| "Cannot find module" | Dependencies not installed - run npm install |
| "Google API Error" | Check API key and quota limits |
| "502 Bad Gateway" | Backend or bot not running - check services |

---

## 🎉 Congratulations!

You've successfully deployed your RAG Chatbot to production!

Your chatbot is now:
- ✅ Live on the internet
- ✅ Secured with SSL/HTTPS
- ✅ Running 24/7 automatically
- ✅ Ready to handle users
- ✅ Embeddable on any website

### **Next Steps:**
1. Test thoroughly with various questions
2. Monitor logs for the first few days
3. Set up regular backups
4. Train your team on using the admin dashboard
5. Add content through web scraping
6. Customize the chatbot responses

### **Support:**
- Review logs when issues occur
- Check this guide's troubleshooting section
- Monitor server resources
- Keep systems updated

---

**🚀 Your AI chatbot is live! Welcome to production! 🤖**

---

*Last Updated: November 13, 2025*  
*Version: 1.0*  
*Project: RAG Chatbot System*

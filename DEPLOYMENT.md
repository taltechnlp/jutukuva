# Deployment Guide for tekstiks.ee/kk

Complete guide for deploying Kirikaja web viewer to `tekstiks.ee/kk` using PM2 and nginx.

## Prerequisites

- Node.js 20+ installed
- PM2 installed globally: `npm install -g pm2`
- Nginx installed and configured
- SSL certificate for tekstiks.ee (Let's Encrypt recommended)
- Server with sudo access

## Quick Start

```bash
# 1. Clone repository
git clone https://github.com/aivo0/kirikaja.git /opt/kirikaja
cd /opt/kirikaja

# 2. Install dependencies
npm install

# 3. Build web viewer
cd packages/web-viewer
npm run build

# 4. Configure environment (create .env if needed)
cd ../yjs-server
# Environment variables are in ecosystem.config.cjs

# 5. Start with PM2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup

# 6. Configure nginx (see nginx section below)
sudo cp /opt/kirikaja/nginx.conf /etc/nginx/sites-available/tekstiks.ee
sudo ln -s /etc/nginx/sites-available/tekstiks.ee /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Detailed Setup

### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2
sudo npm install -g pm2

# Install nginx (if not already installed)
sudo apt install -y nginx

# Install certbot for SSL
sudo apt install -y certbot python3-certbot-nginx
```

### 2. Deploy Application

```bash
# Create application directory
sudo mkdir -p /opt/kirikaja
sudo chown -R $USER:$USER /opt/kirikaja

# Clone repository
git clone https://github.com/aivo0/kirikaja.git /opt/kirikaja
cd /opt/kirikaja

# Install all dependencies (including workspaces)
npm install

# Build web viewer
cd packages/web-viewer
npm run build
cd ..
```

### 3. Configure Environment

Edit `packages/yjs-server/ecosystem.config.cjs`:

```javascript
env: {
	NODE_ENV: 'production',
	PORT: 1234,
	HOST: '127.0.0.1',  // localhost only - nginx will proxy
	VITE_YJS_SERVER_URL: 'wss://tekstiks.ee/kk',
	VITE_WEB_VIEWER_URL: 'https://tekstiks.ee/kk',
	ALLOWED_ORIGINS: '*'  // or specific domains
}
```

### 4. Start with PM2

```bash
cd /opt/kirikaja/packages/yjs-server

# Create logs directory
mkdir -p logs

# Start application
pm2 start ecosystem.config.cjs

# View logs
pm2 logs kirikaja-server

# Check status
pm2 status

# Save PM2 configuration
pm2 save

# Setup PM2 to start on system boot
pm2 startup
# Follow the instructions printed by PM2
```

### 5. Configure Nginx

```bash
# Copy nginx configuration
sudo cp /opt/kirikaja/nginx.conf /etc/nginx/sites-available/tekstiks.ee

# Create symlink
sudo ln -s /etc/nginx/sites-available/tekstiks.ee /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

### 6. Setup SSL Certificate

```bash
# Obtain certificate (if not already done)
sudo certbot --nginx -d tekstiks.ee

# Certbot will automatically update nginx configuration
# Verify auto-renewal
sudo certbot renew --dry-run
```

## URL Structure

After deployment:
- **Landing page**: `https://tekstiks.ee/kk`
- **Session viewer**: `https://tekstiks.ee/kk/ABC123`
- **WebSocket**: `wss://tekstiks.ee/kk` (automatically handled)
- **Health check**: `https://tekstiks.ee/health`
- **Stats**: `https://tekstiks.ee/stats`

## PM2 Commands

```bash
# Start/Stop/Restart
pm2 start ecosystem.config.cjs
pm2 stop kirikaja-server
pm2 restart kirikaja-server

# View logs
pm2 logs kirikaja-server
pm2 logs kirikaja-server --lines 100

# Monitor
pm2 monit

# View status
pm2 status
pm2 list

# Delete from PM2
pm2 delete kirikaja-server

# Update after code changes
cd /opt/kirikaja
git pull
cd packages/web-viewer
npm run build
cd ../yjs-server
pm2 restart kirikaja-server
```

## Nginx Commands

```bash
# Test configuration
sudo nginx -t

# Reload (without downtime)
sudo systemctl reload nginx

# Restart (brief downtime)
sudo systemctl restart nginx

# View logs
sudo tail -f /var/log/nginx/tekstiks.ee-access.log
sudo tail -f /var/log/nginx/tekstiks.ee-error.log
```

## Testing Deployment

### 1. Test Health Endpoint

```bash
curl https://tekstiks.ee/health
# Should return: {"status":"healthy","activeSessions":0,"totalConnections":0}
```

### 2. Test Web Viewer

Open in browser: `https://tekstiks.ee/kk`
- Should show landing page with "Join Session" form

### 3. Test WebSocket Connection

```bash
# From browser console on tekstiks.ee/kk
const ws = new WebSocket('wss://tekstiks.ee/kk');
ws.onopen = () => console.log('WebSocket connected!');
ws.onerror = (e) => console.error('WebSocket error:', e);
```

### 4. Test Full Flow

1. Open desktop app, create session → Get code (e.g., `ABC123`)
2. Open `https://tekstiks.ee/kk/ABC123` in browser
3. Verify real-time sync between desktop and web

## Updating Deployment

```bash
# 1. Pull latest changes
cd /opt/kirikaja
git pull

# 2. Install any new dependencies
npm install

# 3. Rebuild web viewer
cd packages/web-viewer
npm run build

# 4. Restart PM2
cd ../yjs-server
pm2 restart kirikaja-server

# 5. Verify
pm2 logs kirikaja-server --lines 50
curl https://tekstiks.ee/health
```

## Monitoring

### PM2 Monitoring

```bash
# Real-time monitoring
pm2 monit

# Memory/CPU usage
pm2 status

# Application logs
pm2 logs kirikaja-server

# Error logs only
pm2 logs kirikaja-server --err
```

### System Monitoring

```bash
# Check nginx status
sudo systemctl status nginx

# Check port 1234 is listening
sudo netstat -tlnp | grep 1234

# Check disk space
df -h

# Check memory
free -h
```

## Troubleshooting

### Application won't start

```bash
# Check PM2 logs
pm2 logs kirikaja-server --lines 100

# Common issues:
# - Port 1234 already in use: sudo lsof -i :1234
# - Missing dependencies: cd /opt/kirikaja && npm install
# - Web viewer not built: cd packages/web-viewer && npm run build
```

### WebSocket connection fails

```bash
# Check nginx configuration
sudo nginx -t

# Verify proxy_pass is correct in nginx config
grep "proxy_pass" /etc/nginx/sites-available/tekstiks.ee

# Check nginx error logs
sudo tail -f /var/log/nginx/tekstiks.ee-error.log

# Verify WebSocket upgrade headers
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" https://tekstiks.ee/kk
```

### 502 Bad Gateway

```bash
# Backend is down - check PM2
pm2 status

# Restart if needed
pm2 restart kirikaja-server

# Check if port 1234 is listening
sudo netstat -tlnp | grep 1234
```

### High memory usage

```bash
# Check current usage
pm2 status

# Restart to free memory
pm2 restart kirikaja-server

# Adjust max_memory_restart in ecosystem.config.cjs if needed
```

## Security Considerations

### 1. Restrict Stats Endpoint

Edit nginx.conf location `/stats`:

```nginx
location /stats {
    # Restrict to localhost only
    allow 127.0.0.1;
    deny all;

    proxy_pass http://kirikaja_backend/stats;
}
```

### 2. Configure CORS Properly

Edit `ecosystem.config.cjs`:

```javascript
ALLOWED_ORIGINS: 'https://tekstiks.ee'  // Instead of '*'
```

### 3. Firewall Rules

```bash
# Allow only HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Port 1234 should NOT be exposed
# Verify it's not accessible externally
sudo ufw status
```

### 4. Regular Updates

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Update Node.js dependencies
cd /opt/kirikaja
npm update

# Rebuild and restart
cd packages/web-viewer && npm run build
cd ../yjs-server && pm2 restart kirikaja-server
```

## Backup and Recovery

### Backup

```bash
# Backup configuration
sudo cp /etc/nginx/sites-available/tekstiks.ee ~/tekstiks-nginx-backup.conf
cp /opt/kirikaja/packages/yjs-server/ecosystem.config.cjs ~/ecosystem-backup.cjs

# Backup PM2 configuration
pm2 save
cp ~/.pm2/dump.pm2 ~/pm2-backup.json
```

### Recovery

```bash
# Restore nginx config
sudo cp ~/tekstiks-nginx-backup.conf /etc/nginx/sites-available/tekstiks.ee
sudo nginx -t && sudo systemctl reload nginx

# Restore PM2
cp ~/ecosystem-backup.cjs /opt/kirikaja/packages/yjs-server/
pm2 delete all
pm2 start /opt/kirikaja/packages/yjs-server/ecosystem.config.cjs
pm2 save
```

## Performance Tuning

### PM2 Clustering (Optional)

For high traffic, enable clustering:

Edit `ecosystem.config.cjs`:

```javascript
instances: 'max',  // or specific number like 4
exec_mode: 'cluster'
```

### Nginx Caching (Optional)

Add to nginx config for static assets:

```nginx
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

## Support

- **Web Viewer Issues**: Check `packages/web-viewer/README.md`
- **Server Issues**: Check `packages/yjs-server/README.md`
- **Collaboration**: Check `COLLABORATION_SETUP.md`
- **Application Logs**: `pm2 logs kirikaja-server`
- **Nginx Logs**: `/var/log/nginx/tekstiks.ee-*.log`

---

**Deployment checklist:**
- [ ] Node.js 20+ installed
- [ ] PM2 installed globally
- [ ] Repository cloned to /opt/kirikaja
- [ ] Dependencies installed (`npm install`)
- [ ] Web viewer built (`npm run build`)
- [ ] PM2 ecosystem configured
- [ ] Application started with PM2
- [ ] PM2 saved and startup configured
- [ ] Nginx configured and reloaded
- [ ] SSL certificate installed
- [ ] Health endpoint accessible
- [ ] Web viewer loads at /kk
- [ ] WebSocket connections work
- [ ] Desktop app can share to /kk URLs
- [ ] Firewall configured properly

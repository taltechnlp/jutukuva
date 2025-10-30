# Deployment Guide

## Docker Deployment

### Build the image

```bash
docker build -t yjs-server .
```

### Run locally

```bash
docker run -p 1234:1234 yjs-server
```

### Run with environment variables

```bash
docker run -p 8080:8080 \
  -e PORT=8080 \
  -e ALLOWED_ORIGINS=https://yourdomain.com \
  yjs-server
```

## Deploy to Railway

1. Install Railway CLI: `npm i -g @railway/cli`
2. Login: `railway login`
3. Initialize: `railway init`
4. Deploy: `railway up`
5. Set environment variables in Railway dashboard:
   - `PORT` (Railway sets this automatically)
   - `ALLOWED_ORIGINS` (your frontend domain)

## Deploy to Render

1. Create account at https://render.com
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Environment**: Docker
   - **Region**: Choose closest to your users
   - **Instance Type**: Free or Starter
5. Add environment variables:
   - `ALLOWED_ORIGINS` = your frontend domain
6. Deploy!

## Deploy to Fly.io

1. Install flyctl: https://fly.io/docs/hands-on/install-flyctl/
2. Login: `fly auth login`
3. Launch: `fly launch`
4. Set secrets: `fly secrets set ALLOWED_ORIGINS=https://yourdomain.com`
5. Deploy: `fly deploy`

## Health Monitoring

After deployment, monitor your server:

- Health: `https://your-domain.com/health`
- Stats: `https://your-domain.com/stats`

## WebSocket URL

Update your client application with the deployed URL:

```javascript
const provider = new WebsocketProvider(
  'wss://your-domain.com', // Note: wss:// for HTTPS deployments
  roomName,
  ydoc
)
```

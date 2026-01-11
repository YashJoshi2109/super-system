# Vercel Deployment Guide

This guide will help you deploy the Hotel Transport frontend to Vercel.

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **Backend Deployed**: The backend needs to be deployed separately (see Backend Deployment section)
3. **Environment Variables**: Have your backend URL ready

## Frontend Deployment (Vercel)

### Option 1: Deploy via Vercel CLI (Recommended)

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. **Navigate to frontend directory**:
   ```bash
   cd frontend
   ```

3. **Login to Vercel**:
   ```bash
   vercel login
   ```

4. **Deploy to production**:
   ```bash
   vercel --prod
   ```

5. **Follow the prompts**:
   - Link to existing project or create new one
   - Confirm settings (framework detection should pick Vite automatically)
   - Add environment variables (see below)

### Option 2: Deploy via GitHub Integration

1. **Push your code to GitHub** (if not already):
   ```bash
   git add .
   git commit -m "Prepare for Vercel deployment"
   git push
   ```

2. **Go to Vercel Dashboard**:
   - Visit [vercel.com/new](https://vercel.com/new)
   - Import your GitHub repository
   - Select the `frontend` folder as the root directory
   - Or set root to repository root and configure build settings

3. **Configure Build Settings**:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

4. **Add Environment Variables** (see below)

5. **Deploy**

## Environment Variables

Add these environment variables in Vercel Dashboard:

### Required Variables

```
VITE_SOCKET_URL=https://your-backend-url.com
VITE_MAPTILER_KEY=your-maptiler-key
```

### Optional Variables (for development defaults)

```
VITE_DRIVER_PIN=driver123
VITE_ADMIN_PIN=admin123
```

### How to Add Environment Variables in Vercel

1. Go to your project in Vercel Dashboard
2. Click **Settings** → **Environment Variables**
3. Add each variable:
   - **Key**: Variable name (e.g., `VITE_SOCKET_URL`)
   - **Value**: Variable value (e.g., `https://your-backend.com`)
   - **Environment**: Select all (Production, Preview, Development)
4. Click **Save**
5. **Redeploy** your application for changes to take effect

## Backend Deployment

⚠️ **IMPORTANT**: Vercel's serverless functions have limitations for Socket.IO:
- No persistent connections
- Cold starts
- 10-second timeout for free tier
- Not ideal for WebSocket/real-time apps

### Recommended Backend Hosting Options

#### Option 1: Railway (Recommended for Socket.IO)

1. **Sign up** at [railway.app](https://railway.app)
2. **Create new project** → **Deploy from GitHub**
3. Select your repository
4. **Set root directory** to `backend`
5. **Add environment variables** (see backend `.env.example`)
6. **Deploy**

Railway provides:
- Persistent connections (perfect for Socket.IO)
- PostgreSQL addon
- Redis addon
- Custom domains
- Environment variables management

#### Option 2: Render

1. **Sign up** at [render.com](https://render.com)
2. **Create new Web Service**
3. Connect GitHub repository
4. **Settings**:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment: Node
5. Add environment variables
6. **Deploy**

#### Option 3: Fly.io

1. **Install flyctl**: `curl -L https://fly.io/install.sh | sh`
2. **Login**: `flyctl auth login`
3. **Create app**: `flyctl launch`
4. **Deploy**: `flyctl deploy`

#### Option 4: DigitalOcean App Platform

1. **Sign up** at [digitalocean.com](https://digitalocean.com)
2. **Create App** → **GitHub**
3. Select repository
4. Configure build and run settings
5. Add managed PostgreSQL and Redis databases
6. Deploy

### Backend Environment Variables

Your backend will need these environment variables:

```env
# Server
PORT=3001
NODE_ENV=production

# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Redis
REDIS_URL=redis://host:port

# CORS (Important: Add your Vercel frontend URL)
CORS_ORIGINS=https://your-frontend.vercel.app

# JWT
JWT_SECRET=your-generated-jwt-secret
JWT_EXPIRES_IN=24h

# Driver/Admin Credentials
DRIVER_USERNAME=driver
DRIVER_PASSWORD=your-secure-password
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password

# API Keys
FLIGHT_API_KEY=your-flight-api-key
MAPTILER_KEY=your-maptiler-key

# SMS (Optional)
RAPIDAPI_SMS_KEY=your-key
TWILIO_ACCOUNT_SID=your-sid
TWILIO_AUTH_TOKEN=your-token
TWILIO_PHONE_NUMBER=+1234567890

# FlightStats (Optional)
FLIGHTSTATS_APP_ID=your-app-id
FLIGHTSTATS_APP_KEY=your-app-key
WEBHOOK_BASE_URL=https://your-backend-url.com
```

## Post-Deployment Checklist

### Frontend (Vercel)

- [ ] Environment variables added
- [ ] Build successful
- [ ] Frontend URL accessible
- [ ] Socket.IO connection working
- [ ] Maps loading correctly
- [ ] Login working

### Backend

- [ ] Backend URL accessible
- [ ] PostgreSQL database connected
- [ ] Redis connected (optional but recommended)
- [ ] CORS configured with frontend URL
- [ ] Socket.IO connections working
- [ ] Environment variables set
- [ ] Health check endpoint responding

### Testing

1. **Test Guest Flow**:
   - Open frontend URL
   - Submit a ride request
   - Verify request appears in admin panel

2. **Test Driver/Admin Login**:
   - Click "DRIVER" or "ADMIN"
   - Login with credentials
   - Verify dashboard loads

3. **Test Real-time Features**:
   - Open frontend in two browsers
   - Create request in one
   - Verify it appears in the other (as driver/admin)

4. **Test Socket.IO Connection**:
   - Check browser console for connection status
   - Verify real-time updates work

## Troubleshooting

### Frontend Issues

**Issue**: Socket.IO not connecting
- **Solution**: Check `VITE_SOCKET_URL` is correct and backend is accessible
- Verify CORS is configured on backend with your Vercel URL

**Issue**: Build fails
- **Solution**: Check Node version in Vercel settings (use Node 18+)
- Verify all dependencies are in `package.json`

**Issue**: Maps not loading
- **Solution**: Verify `VITE_MAPTILER_KEY` is set correctly

### Backend Issues

**Issue**: Socket.IO connections fail
- **Solution**: Ensure backend supports WebSocket connections (not serverless)
- Check firewall/security settings allow WebSocket traffic

**Issue**: Database connection errors
- **Solution**: Verify `DATABASE_URL` is correct
- Ensure database allows connections from your hosting provider

**Issue**: CORS errors
- **Solution**: Add your Vercel frontend URL to `CORS_ORIGINS`:
  ```
  CORS_ORIGINS=https://your-app.vercel.app,https://your-app-git-main.vercel.app
  ```

## Production Checklist

- [ ] Change default passwords
- [ ] Use strong JWT_SECRET
- [ ] Enable HTTPS (automatic with Vercel)
- [ ] Set up custom domain (optional)
- [ ] Configure database backups
- [ ] Set up monitoring/logging
- [ ] Test all features end-to-end
- [ ] Update documentation with production URLs

## Quick Deploy Commands

```bash
# Frontend (from frontend directory)
vercel --prod

# Or deploy both via GitHub integration in Vercel dashboard
```

## Support

For issues:
1. Check Vercel deployment logs
2. Check backend logs
3. Verify environment variables
4. Test locally first
5. Check browser console for errors

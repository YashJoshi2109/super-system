# Vercel Environment Variables

## Required Environment Variables

These are the environment variables you **MUST** set in Vercel for your frontend to work:

### 1. `VITE_SOCKET_URL` ⚠️ REQUIRED
**Description**: Backend server URL for Socket.IO connections and API calls

**Format**: `https://your-backend-url.com`

**Example**:
```
VITE_SOCKET_URL=https://your-backend.railway.app
```

**Where it's used**:
- Socket.IO client connection
- API calls (login, CSV export, etc.)

**How to get**: This is your deployed backend URL (Railway, Render, etc.)

---

### 2. `VITE_MAPTILER_KEY` ⚠️ REQUIRED
**Description**: MapTiler API key for displaying maps

**Format**: Your MapTiler API key (string)

**Example**:
```
VITE_MAPTILER_KEY=W3NWyX003Hvr2NvOh2fX
```

**Where it's used**: 
- Map component (`LiveMap.jsx`)
- Map rendering and tiles

**How to get**: 
1. Sign up at [maptiler.com](https://maptiler.com)
2. Get your free API key from the dashboard
3. Or use the existing key if you have one

---

## Optional Environment Variables

These are optional and have defaults:

### 3. `VITE_DRIVER_PIN` (Optional - Deprecated)
**Description**: Driver PIN (legacy, now using JWT authentication)

**Default**: `driver123`

**Note**: This is only used as a fallback. JWT authentication is the primary method now.

---

### 4. `VITE_ADMIN_PIN` (Optional - Deprecated)
**Description**: Admin PIN (legacy, now using JWT authentication)

**Default**: `admin123`

**Note**: This is only used as a fallback. JWT authentication is the primary method now.

---

## Complete Vercel Environment Variables Setup

### Step-by-Step in Vercel Dashboard

1. **Go to your project** in Vercel Dashboard
2. **Click Settings** → **Environment Variables**
3. **Add each variable**:

#### For Production Environment:

| Key | Value | Example |
|-----|-------|---------|
| `VITE_SOCKET_URL` | Your backend URL | `https://hotel-backend.railway.app` |
| `VITE_MAPTILER_KEY` | Your MapTiler key | `W3NWyX003Hvr2NvOh2fX` |

#### For Preview/Development (optional):

Same variables, but you might want to use different values:
- Preview: Use staging backend URL
- Development: Use localhost (if testing locally)

---

## Quick Copy-Paste for Vercel

### Minimum Required (Production):

```env
VITE_SOCKET_URL=https://your-backend-url.com
VITE_MAPTILER_KEY=your-maptiler-key-here
```

### Full Configuration (with defaults):

```env
VITE_SOCKET_URL=https://your-backend-url.com
VITE_MAPTILER_KEY=your-maptiler-key-here
VITE_DRIVER_PIN=driver123
VITE_ADMIN_PIN=admin123
```

---

## How to Add in Vercel Dashboard

1. **Navigate**: Project → Settings → Environment Variables
2. **Click**: "Add New"
3. **Enter Key**: `VITE_SOCKET_URL`
4. **Enter Value**: Your backend URL (e.g., `https://your-backend.railway.app`)
5. **Select Environments**: 
   - ✅ Production
   - ✅ Preview
   - ✅ Development (optional)
6. **Click**: "Save"
7. **Repeat** for `VITE_MAPTILER_KEY`

---

## Important Notes

### ⚠️ Security
- **Never commit** these values to Git (they're in `.gitignore`)
- **Never share** your MapTiler key publicly
- Use **different backend URLs** for production vs development

### 🔄 After Adding Variables
- **Redeploy** your application for changes to take effect
- Vercel will automatically trigger a new deployment
- Or manually trigger: Deployments → "Redeploy"

### 🌐 Environment-Specific Values

You can set different values for different environments:

- **Production**: Use production backend URL
- **Preview**: Use staging/test backend URL  
- **Development**: Use localhost or test URL

---

## Verification

After deployment, verify your environment variables are working:

1. **Check browser console** (F12) for any connection errors
2. **Test Socket.IO connection** - should show "connected" status
3. **Test maps** - should load map tiles without errors
4. **Check Network tab** - API calls should go to correct backend URL

---

## Troubleshooting

### Maps not loading?
- ✅ Check `VITE_MAPTILER_KEY` is correct
- ✅ Verify key is active in MapTiler dashboard
- ✅ Check browser console for API errors

### Socket.IO not connecting?
- ✅ Check `VITE_SOCKET_URL` is correct
- ✅ Verify backend is running and accessible
- ✅ Check CORS settings on backend
- ✅ Verify backend URL starts with `https://` (not `http://`)

### Variables not working after deployment?
- ✅ Make sure you clicked "Save" in Vercel
- ✅ Trigger a new deployment (settings changes don't auto-redeploy)
- ✅ Clear browser cache and hard refresh (Ctrl+Shift+R)

---

## Example Configuration

Here's what your Vercel environment variables should look like:

```
Production Environment:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Key: VITE_SOCKET_URL
Value: https://hotel-transport-api.railway.app
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Key: VITE_MAPTILER_KEY  
Value: W3NWyX003Hvr2NvOh2fX
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Quick Checklist

Before deploying, make sure you have:

- [ ] Backend deployed and URL ready
- [ ] MapTiler API key obtained
- [ ] `VITE_SOCKET_URL` set to backend URL
- [ ] `VITE_MAPTILER_KEY` set
- [ ] Environment variables saved in Vercel
- [ ] Triggered new deployment after adding variables

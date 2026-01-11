# JWT Authentication for Driver and Admin

## Overview

JWT (JSON Web Token) authentication has been implemented for driver and admin roles to replace the simple PIN-based authentication. This provides secure, token-based authentication that persists across sessions.

## Features

- ✅ Secure JWT token-based authentication
- ✅ Login modal for driver and admin
- ✅ Token persistence in localStorage
- ✅ Automatic login on role switch if token exists
- ✅ Logout functionality
- ✅ Admin has full privileges (can update status, view all requests)

## Backend Changes

### New Files

1. **`backend/src/services/auth.js`**
   - JWT token generation and verification
   - Password hashing with bcrypt
   - User authentication logic
   - Supports both plain passwords (development) and hashed passwords (production)

2. **`backend/src/middleware/auth.js`**
   - Express middleware for token verification
   - Role-based authorization middleware

### API Endpoints

- **`POST /api/auth/login`**
  - Request body: `{ username, password, role }`
  - Response: `{ success: true, token: "...", user: {...} }`
  - Returns JWT token and user information

- **`GET /api/auth/verify`**
  - Requires Authorization header: `Bearer <token>`
  - Returns: `{ valid: true, user: {...} }`

### Environment Variables

Add to your `.env` file:

```env
# JWT Authentication
# Generate a secure secret using: node scripts/generate-jwt-secret.js
# Or use: openssl rand -hex 32
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=24h

## Generating JWT Secret

The JWT secret is a random string that you generate yourself. It's used to sign and verify JWT tokens. Here are several ways to generate a secure JWT secret:

### Method 1: Using the included script (Recommended)

```bash
cd backend
node scripts/generate-jwt-secret.js
```

This will generate a secure 64-character hexadecimal secret.

### Method 2: Using OpenSSL (Command line)

```bash
openssl rand -hex 32
# or for longer secret
openssl rand -hex 64
```

### Method 3: Using Node.js directly

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Method 4: Using Online Generators (Not recommended for production)

- Visit: https://generate-secret.vercel.app/64
- Or: https://www.random.org/strings/

**⚠️ Warning**: Don't use online generators for production secrets as they could be intercepted.

### What Makes a Good JWT Secret?

- **Length**: At least 32-64 characters (longer is better)
- **Randomness**: Use cryptographically secure random generation
- **Uniqueness**: Each environment (dev/staging/prod) should have a different secret
- **Secrecy**: Never commit secrets to version control (use `.env` files in `.gitignore`)

### Best Practices

1. **Never share secrets**: Don't commit JWT secrets to Git
2. **Use different secrets**: Dev, staging, and production should have different secrets
3. **Rotate regularly**: Change secrets periodically (every 6-12 months)
4. **Use environment variables**: Always store secrets in `.env` files, never in code
5. **Keep backups**: Store production secrets securely (password manager, secrets manager)

### Setting Up Your JWT Secret

1. Generate a secret using one of the methods above
2. Copy the generated secret
3. Add it to your `.env` file:
   ```env
   JWT_SECRET=your-generated-secret-here
   ```
4. Restart your server to apply the changes

## Frontend Changes

### New Component

1. **`frontend/src/components/LoginModal.jsx`**
   - Modal dialog for driver/admin login
   - Form with username and password fields
   - Error handling and loading states
   - Shows default credentials for development

### Updated Components

1. **`frontend/src/App.jsx`**
   - Added authentication state management
   - Updated RoleSwitcher to use JWT authentication
   - Login modal integration
   - Token persistence and auto-login
   - Protected driver/admin panels (require authentication)

## Usage

### Default Credentials (Development)

- **Driver**: username: `driver`, password: `driver123`
- **Admin**: username: `admin`, password: `admin123`

### Production Setup

1. **Change JWT Secret**: Set a strong, random `JWT_SECRET` in production
2. **Hash Passwords**: Generate bcrypt hashes for passwords:
   ```javascript
   const bcrypt = require('bcryptjs');
   const hash = await bcrypt.hash('your-password', 10);
   console.log(hash); // Use this in DRIVER_PASSWORD_HASH or ADMIN_PASSWORD_HASH
   ```
3. **Set Environment Variables**: Update `.env` with production credentials
4. **Remove Default Credentials**: Don't use default passwords in production

## Authentication Flow

1. User clicks on "DRIVER" or "ADMIN" button
2. If no token exists for that role, login modal appears
3. User enters username and password
4. Frontend sends request to `/api/auth/login`
5. Backend validates credentials and returns JWT token
6. Token is stored in localStorage (`auth_token_driver` or `auth_token_admin`)
7. User information is stored in localStorage (`auth_user_driver` or `auth_user_admin`)
8. User can now access driver/admin panels
9. Token persists across page refreshes
10. User can logout by clicking "Logout" or switching to "GUEST"

## Security Notes

- Tokens expire after 24 hours (configurable via `JWT_EXPIRES_IN`)
- Passwords are hashed using bcrypt in production
- Tokens are stored in localStorage (consider httpOnly cookies for enhanced security)
- Always use HTTPS in production
- Change default credentials before deploying

## Request Synchronization

When a driver or admin connects:
- All active requests are immediately sent to the newly connected client
- This ensures they see all requests even if they connect after requests were created
- Requests sync in real-time via Socket.IO events

## Admin Privileges

Admin users have full privileges:
- ✅ View all requests (grouped by terminal)
- ✅ Update request status (pending → accepted → picked_up → completed/cancelled)
- ✅ View driver location
- ✅ Export CSV data
- ✅ See all request details (courtesy pickup, seats, etc.)
- ✅ All driver capabilities

## Database Fixes

- Fixed `courtesy_pickup` field display in admin panel (added to SELECT query)
- `airline_code` was already being saved correctly
- Status updates now work properly in admin panel

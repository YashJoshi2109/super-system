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
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=24h

# Driver Credentials (default: driver/driver123)
DRIVER_USERNAME=driver
DRIVER_PASSWORD=driver123
# For production, use hashed password: DRIVER_PASSWORD_HASH=$2a$10$... (use bcrypt)

# Admin Credentials (default: admin/admin123)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
# For production, use hashed password: ADMIN_PASSWORD_HASH=$2a$10$... (use bcrypt)
```

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

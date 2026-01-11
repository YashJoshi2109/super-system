import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// In-memory user store (in production, use database)
// For now, we'll use environment variables for credentials
const users = {
  driver: {
    id: 'driver',
    role: 'driver',
    username: process.env.DRIVER_USERNAME || 'driver',
    passwordHash: process.env.DRIVER_PASSWORD_HASH || null, // If not set, will use plain password from env
    password: process.env.DRIVER_PASSWORD || 'driver123' // Fallback plain password
  },
  admin: {
    id: 'admin',
    role: 'admin',
    username: process.env.ADMIN_USERNAME || 'admin',
    passwordHash: process.env.ADMIN_PASSWORD_HASH || null,
    password: process.env.ADMIN_PASSWORD || 'admin123' // Fallback plain password
  }
};

/**
 * Generate JWT token for a user
 */
export function generateToken(userId, role) {
  return jwt.sign(
    { userId, role, iat: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Verify JWT token
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

/**
 * Hash password
 */
export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

/**
 * Compare password with hash
 */
export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Authenticate user (login)
 */
export async function authenticateUser(username, password, role) {
  const user = users[role];
  if (!user || user.username !== username) {
    return { success: false, error: 'Invalid credentials' };
  }

  // Check password
  let passwordValid = false;
  if (user.passwordHash) {
    // Use hashed password
    passwordValid = await comparePassword(password, user.passwordHash);
  } else {
    // Use plain password (fallback for development)
    passwordValid = password === user.password;
  }

  if (!passwordValid) {
    return { success: false, error: 'Invalid credentials' };
  }

  // Generate token
  const token = generateToken(user.id, user.role);
  return {
    success: true,
    token,
    user: {
      id: user.id,
      role: user.role,
      username: user.username
    }
  };
}

/**
 * Get user by role (for quick lookup)
 */
export function getUserByRole(role) {
  return users[role] || null;
}

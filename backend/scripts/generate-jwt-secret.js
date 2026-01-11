#!/usr/bin/env node
/**
 * Script to generate a secure JWT secret
 * Run: node scripts/generate-jwt-secret.js
 */

import crypto from 'crypto';

// Generate a secure random secret
const generateSecret = (length = 64) => {
  return crypto.randomBytes(length).toString('hex');
};

const secret = generateSecret(64);
console.log('\n✅ Generated JWT Secret:');
console.log('='.repeat(70));
console.log(secret);
console.log('='.repeat(70));
console.log('\n📝 Copy this value to your .env file:');
console.log(`JWT_SECRET=${secret}\n`);
console.log('⚠️  IMPORTANT: Keep this secret safe and never commit it to version control!\n');

#!/usr/bin/env node

// Health Check Script - Run this to verify production setup
// Usage: npm run health

import { pool } from '../src/db.js';
import http from 'http';

const PORT = process.env.PORT || 3001;
const BASE_URL = process.env.HEALTH_CHECK_URL || `http://localhost:${PORT}`;

async function checkDatabase() {
  try {
    const result = await pool.query('SELECT NOW() as current_time, version() as pg_version');
    console.log('✅ Database: Connected');
    console.log('   Time:', result.rows[0].current_time);
    console.log('   Version:', result.rows[0].pg_version.split(',')[0]);
    return true;
  } catch (err) {
    console.error('❌ Database: Connection failed');
    console.error('   Error:', err.message);
    return false;
  }
}

async function checkHealthEndpoint() {
  return new Promise((resolve) => {
    const url = new URL(`${BASE_URL}/health`);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.ok && json.database === 'connected') {
            console.log('✅ Health Endpoint: OK');
            console.log('   Uptime:', Math.floor(json.uptime / 60), 'minutes');
            console.log('   Memory:', Math.round(json.memory.heapUsed / 1024 / 1024), 'MB used');
            console.log('   Database:', json.database);
            resolve(true);
          } else {
            console.error('❌ Health Endpoint: Unhealthy');
            resolve(false);
          }
        } catch (err) {
          console.error('❌ Health Endpoint: Invalid response');
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      console.error('❌ Health Endpoint: Not reachable');
      console.error('   Error:', err.message);
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      console.error('❌ Health Endpoint: Timeout');
      resolve(false);
    });

    req.end();
  });
}

async function checkEnvironment() {
  const required = ['DATABASE_URL', 'PORT'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Environment: Missing required variables');
    console.error('   Missing:', missing.join(', '));
    return false;
  }
  
  console.log('✅ Environment: All required variables set');
  console.log('   NODE_ENV:', process.env.NODE_ENV || 'development');
  console.log('   PORT:', process.env.PORT);
  return true;
}

async function main() {
  console.log('\n🔍 Health Check - Production Readiness\n');
  console.log('=' .repeat(50));
  
  const results = {
    environment: await checkEnvironment(),
    database: await checkDatabase(),
    health: await checkHealthEndpoint()
  };
  
  console.log('=' .repeat(50));
  
  const allPassed = Object.values(results).every(r => r === true);
  
  if (allPassed) {
    console.log('\n✅ All checks passed! System is healthy.\n');
    process.exit(0);
  } else {
    console.log('\n❌ Some checks failed. Please review the errors above.\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Health check failed:', err);
  process.exit(1);
});
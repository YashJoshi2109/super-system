// PM2 Ecosystem Configuration for Production
// Usage: pm2 start ecosystem.config.js --env production

module.exports = {
  apps: [{
    name: 'hotel-shuttle-api',
    script: './src/server.js',
    instances: 1, // Single instance (increase with Redis adapter for multi-instance)
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'development',
      PORT: 3001
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    // Process management
    autorestart: true,
    watch: false,
    max_memory_restart: '500M', // Restart if memory exceeds 500MB
    // Logging
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    // Advanced
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000,
    shutdown_with_message: true,
    // Health check
    health_check_grace_period: 3000,
    // Monitoring
    pmx: true,
    // Restart on crash
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
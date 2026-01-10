import { createClient } from 'redis';

let client = null;

export async function connectRedis() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.log('REDIS_URL not set, skipping Redis init');
    return;
  }

  try {
    // Try using URL first (handles both redis:// and rediss://)
    if (redisUrl.startsWith('redis://') || redisUrl.startsWith('rediss://')) {
      client = createClient({ url: redisUrl });
    } else {
      // Fallback: parse host/port from URL or use explicit config
      const url = new URL(redisUrl);
      const isTLS = url.protocol === 'rediss:';
      client = createClient({
        username: url.username || 'default',
        password: url.password,
        socket: {
          host: url.hostname,
          port: parseInt(url.port) || 6379,
          tls: isTLS
        }
      });
    }

    client.on('error', (err) => console.error('Redis Client Error', err));
    client.on('connect', () => console.log('Redis connected'));
    client.on('ready', () => console.log('Redis ready'));

    await client.connect();
    console.log('Redis client connected successfully');
    return client;
  } catch (err) {
    console.error('Failed to connect to Redis:', err.message);
    client = null;
    throw err;
  }
}

export function getRedisClient() {
  return client;
}

import Redis from 'ioredis';


/**
 * Redis Service for Caching and Session Management.
 * Implements a Singleton pattern.
 */
class RedisService {
    private client: Redis | null = null;
    private isConnected = false;

    constructor() {
        this.connect();
    }

    private connect() {
        // In a real scenario, use env.REDIS_URL.
        // For this project, we default to localhost:6379 or mock if fails.
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

        // We can add lazy connection or retry strategy
        this.client = new Redis(redisUrl, {
            lazyConnect: true,
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
        });

        this.client.on('connect', () => {
            console.log('Redis connected successfully.');
            this.isConnected = true;
        });

        this.client.on('error', (err) => {
            console.error('Redis connection error:', err.message);
            this.isConnected = false;
        });
    }

    public getClient(): Redis {
        if (!this.client) {
            this.connect();
        }
        return this.client!;
    }

    public async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
        try {
            if (ttlSeconds) {
                await this.client?.set(key, value, 'EX', ttlSeconds);
            } else {
                await this.client?.set(key, value);
            }
        } catch (e) {
            console.warn('Redis Set Error (Cache miss will occur):', e);
        }
    }

    public async get(key: string): Promise<string | null> {
        try {
            return await this.client?.get(key) || null;
        } catch (e) {
            console.warn('Redis Get Error:', e);
            return null; // Fail safe
        }
    }

    public async del(key: string): Promise<void> {
        try {
            await this.client?.del(key);
        } catch (e) {
            console.warn('Redis Del Error:', e);
        }
    }
}

export const redisService = new RedisService();


import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(__dirname, '../../../.env.local');
console.log('Loading env from:', envPath);
dotenv.config({ path: envPath });

async function run() {
    const client = new Client({
        connectionString: process.env.LMS_DB_URL,
        ssl: process.env.LMS_DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
    });

    try {
        await client.connect();

        console.log('--- USERS ---');
        const res = await client.query('SELECT id, username, email, role, created_at FROM users');
        // Simple console log for clearer output than table if wide
        res.rows.forEach(r => console.log(`${r.username} | ${r.email} | ${r.role} | ${r.id}`));

        console.log('\n--- 2FA ---');
        // Try simple select
        const res2fa = await client.query('SELECT * FROM user_2fa');
        res2fa.rows.forEach(r => console.log(`User: ${r.user_id} | Enabled: ${r.enabled}`));

    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

run();

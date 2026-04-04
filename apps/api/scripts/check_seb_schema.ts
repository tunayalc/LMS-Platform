
import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(__dirname, '../../../.env.local');
dotenv.config({ path: envPath });

async function run() {
    const client = new Client({
        connectionString: process.env.LMS_DB_URL,
        ssl: process.env.LMS_DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
    });

    try {
        await client.connect();
        console.log('Connected to DB');

        // Check columns in exams table
        const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'exams'
    `);

        console.log('Columns in "exams" table:');
        res.rows.forEach(r => console.log(` - ${r.column_name} (${r.data_type})`));

        const hasSeb = res.rows.some(r => r.column_name === 'seb_browser_key');
        console.log(`\nHas seb_browser_key: ${hasSeb}`);

    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

run();

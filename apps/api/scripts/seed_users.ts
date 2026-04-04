
import { Pool } from "pg";
import { config } from "dotenv";
import crypto from "crypto";
import path from "path";
import fs from "fs";

// Load Environment
const repoRoot = path.resolve(__dirname, "..", "..", "..");
// Try to find .env.local first, then fall back
const envFile = path.join(repoRoot, ".env.local");
if (fs.existsSync(envFile)) {
    config({ path: envFile });
    console.log(`Loaded env from ${envFile}`);
} else {
    console.log("No .env.local found, checking process.env...");
}

const dbUrl = process.env.LMS_DB_URL;
if (!dbUrl) {
    console.error("Error: LMS_DB_URL is not set.");
    process.exit(1);
}

const pool = new Pool({
    connectionString: dbUrl,
    ssl: process.env.LMS_DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

const hashPassword = (password: string) => {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
};

const users = [
    { username: "admin", role: "SuperAdmin", pass: "1234" },
    // User requested 0 Admins, so 'manager' is removed
    { username: "teacher", role: "Instructor", pass: "1234" },
    { username: "hoca", role: "Instructor", pass: "Deneme123." },
    { username: "assistant", role: "Assistant", pass: "1234" },
    { username: "student", role: "Student", pass: "1234" },
    { username: "guest", role: "Guest", pass: "1234" },
];

async function seed() {
    try {
        console.log("Connecting to DB...");
        const client = await pool.connect();
        console.log("Connected.");

        try {
            // 1. Cleanup unwanted users (Admins)
            console.log("Cleaning up unwanted 'manager' user...");
            await client.query("DELETE FROM users WHERE username = 'manager'");

            // 2. Upsert desired users
            for (const u of users) {
                const hash = hashPassword(u.pass);
                const now = new Date().toISOString();

                // Upsert based on username
                // Note: ID generation is random UUID if not exists
                await client.query(`
          INSERT INTO users (id, username, role, password_hash, created_at, updated_at)
          VALUES (
            gen_random_uuid(), 
            $1, 
            $2, 
            $3, 
            $4, 
            $5
          )
          ON CONFLICT (lower(username)) 
          DO UPDATE SET 
            role = EXCLUDED.role,
            password_hash = EXCLUDED.password_hash,
            updated_at = EXCLUDED.updated_at
        `, [u.username, u.role, hash, now, now]);

                console.log(`✅ User ensured: ${u.username} (${u.role})`);
            }

            // 3. Seed Courses & Enrollments
            // Get IDs
            const teacherRes = await client.query("SELECT id FROM users WHERE username = 'teacher'");
            const studentRes = await client.query("SELECT id FROM users WHERE username = 'student'");

            if (teacherRes.rows[0] && studentRes.rows[0]) {
                const teacherId = teacherRes.rows[0].id;
                const studentId = studentRes.rows[0].id;

                // Create Course for Teacher
                const courseRes = await client.query(`
          INSERT INTO courses (id, title, description, instructor_id, created_at, updated_at)
          VALUES (gen_random_uuid(), 'Introduction to LMS', 'Basic concepts of our system', $1, NOW(), NOW())
          ON CONFLICT DO NOTHING
          RETURNING id
        `, [teacherId]);

                if (courseRes.rows[0]) {
                    const courseId = courseRes.rows[0].id;
                    console.log(`✅ Course created for teacher: ${courseId}`);

                    // Enroll Student
                    await client.query(`
             INSERT INTO course_enrollments (id, user_id, course_id, enrolled_at)
             VALUES (gen_random_uuid(), $1, $2, NOW())
             ON CONFLICT DO NOTHING
           `, [studentId, courseId]);
                    console.log(`✅ Student enrolled to course`);
                }
            }
        } finally {
            client.release();
        }
    } catch (err) {
        console.error("Seeding failed:", err);
    } finally {
        await pool.end();
    }
}

seed();

import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { query } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";

const newId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

const router = Router();

// Schema for Course Create/Update
const courseSchema = z.object({
    title: z.string().min(1),
    description: z.string().optional()
});

// GET /api/courses - List courses
// Default behavior:
// - Students: See courses they are enrolled in + public/browseable courses
// - Instructors/Admins: See all courses (or filtered)
router.get("/", requireAuth, async (req, res) => {
    const { role, id: userId } = req.user!;
    try {
        let sql = "";
        let params: any[] = [];

        if (role === "Student" || role === "Guest") {
            // For now, simplify: show all courses so they can "enroll" or see them
            // In a real app, you'd join with enrollments
            sql = "SELECT * FROM courses ORDER BY created_at DESC";
        } else {
            // Admins/Instructors see all
            sql = "SELECT * FROM courses ORDER BY created_at DESC";
        }

        const result = await query(sql, params);
        res.json({ courses: result.rows });
    } catch (err) {
        console.error("Failed to list courses:", err);
        res.status(500).json({ error: "database_error" });
    }
});

// GET /api/courses/:id - Get single course
router.get("/:id", requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await query("SELECT * FROM courses WHERE id = $1", [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "not_found" });
        }
        res.json({ course: result.rows[0] });
    } catch (err) {
        console.error("Failed to get course:", err);
        res.status(500).json({ error: "database_error" });
    }
});

// POST /api/courses/:id/duplicate - Duplicate a course with its modules/content/exams/questions
router.post(
    "/:id/duplicate",
    requireAuth,
    requireRole(["Admin", "SuperAdmin", "Instructor", "Assistant"]),
    async (req, res) => {
        const sourceCourseId = req.params.id;
        const actor = req.user!;
        const timestamp = nowIso();

        try {
            const { rows: courseRows } = await query<any>("SELECT * FROM courses WHERE id = $1", [sourceCourseId]);
            if (courseRows.length === 0) {
                return res.status(404).json({ error: "not_found" });
            }
            const sourceCourse = courseRows[0];

            if (actor.role === "Instructor" && sourceCourse.instructor_id !== actor.id) {
                return res.status(403).json({ error: "forbidden" });
            }

            const newCourseId = newId();
            const newTitle: string = typeof req.body?.title === "string" && req.body.title.trim()
                ? req.body.title.trim()
                : `Copy of ${sourceCourse.title}`;
            const newInstructorId = actor.role === "Instructor" ? actor.id : sourceCourse.instructor_id;

            await query(
                `INSERT INTO courses (id, title, description, instructor_id, mattermost_webhook_url, mattermost_channel_url, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    newCourseId,
                    newTitle,
                    sourceCourse.description ?? "",
                    newInstructorId,
                    sourceCourse.mattermost_webhook_url ?? null,
                    sourceCourse.mattermost_channel_url ?? null,
                    timestamp,
                    timestamp
                ]
            );

            // 1) Clone modules (keep hierarchy)
            const moduleIdMap = new Map<string, string>();
            const { rows: moduleRows } = await query<any>(
                `SELECT * FROM course_modules WHERE course_id = $1 ORDER BY sort_order`,
                [sourceCourseId]
            );

            for (const mod of moduleRows) {
                const newModuleId = newId();
                moduleIdMap.set(mod.id, newModuleId);
                await query(
                    `INSERT INTO course_modules (id, course_id, parent_module_id, title, description, sort_order, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [newModuleId, newCourseId, null, mod.title, mod.description ?? null, mod.sort_order ?? 0, timestamp, timestamp]
                );
            }

            for (const mod of moduleRows) {
                if (!mod.parent_module_id) continue;
                const newChildId = moduleIdMap.get(mod.id);
                const newParentId = moduleIdMap.get(mod.parent_module_id);
                if (!newChildId || !newParentId) continue;
                await query(`UPDATE course_modules SET parent_module_id = $1 WHERE id = $2`, [newParentId, newChildId]);
            }

            // 2) Clone content items
            const contentIdMap = new Map<string, string>();
            const { rows: contentRows } = await query<any>(
                `SELECT * FROM content_items WHERE course_id = $1`,
                [sourceCourseId]
            );

            for (const item of contentRows) {
                const newContentId = newId();
                contentIdMap.set(item.id, newContentId);
                const newModuleId = item.module_id ? moduleIdMap.get(item.module_id) : null;

                await query(
                    `INSERT INTO content_items (id, type, title, source, meeting_url, course_id, module_id, sort_order, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                    [
                        newContentId,
                        item.type,
                        item.title,
                        item.source ?? null,
                        item.meeting_url ?? null,
                        newCourseId,
                        newModuleId ?? null,
                        item.sort_order ?? 0,
                        timestamp,
                        timestamp
                    ]
                );
            }

            // 3) Clone prerequisites (only within course content)
            if (contentRows.length) {
                const oldContentIds = contentRows.map((r: any) => r.id);
                const { rows: prereqRows } = await query<any>(
                    `SELECT * FROM prerequisites WHERE content_id = ANY($1::uuid[])`,
                    [oldContentIds]
                );

                for (const pr of prereqRows) {
                    const newContentId = contentIdMap.get(pr.content_id);
                    const newPrereqContentId = contentIdMap.get(pr.prerequisite_content_id);
                    if (!newContentId || !newPrereqContentId) continue;
                    await query(
                        `INSERT INTO prerequisites (id, content_id, prerequisite_content_id, created_at)
                         VALUES ($1, $2, $3, $4)
                         ON CONFLICT (content_id, prerequisite_content_id) DO NOTHING`,
                        [newId(), newContentId, newPrereqContentId, timestamp]
                    );
                }
            }

            // 4) Clone exams + questions
            const examIdMap: Record<string, string> = {};
            const { rows: examRows } = await query<any>(`SELECT * FROM exams WHERE course_id = $1`, [sourceCourseId]);
            for (const exam of examRows) {
                const newExamId = newId();
                examIdMap[exam.id] = newExamId;
                await query(
                    `INSERT INTO exams (id, title, course_id, duration_minutes, pass_threshold,
                                        start_date, end_date, max_attempts, is_draft, results_visible_at, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                    [
                        newExamId,
                        `${exam.title} (Copy)`,
                        newCourseId,
                        exam.duration_minutes ?? null,
                        exam.pass_threshold ?? null,
                        exam.start_date ?? null,
                        exam.end_date ?? null,
                        exam.max_attempts ?? 1,
                        true,
                        exam.results_visible_at ?? null,
                        timestamp,
                        timestamp
                    ]
                );
            }

            for (const [oldExamId, newExamId] of Object.entries(examIdMap)) {
                const { rows: questionRows } = await query<any>(`SELECT * FROM questions WHERE exam_id = $1`, [oldExamId]);
                for (const q of questionRows) {
                    await query(
                        `INSERT INTO questions (id, exam_id, prompt, type, options, answer, meta, points, created_at)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                        [
                            newId(),
                            newExamId,
                            q.prompt,
                            q.type,
                            q.options ?? null,
                            q.answer ?? null,
                            q.meta ?? null,
                            q.points ?? null,
                            timestamp
                        ]
                    );
                }
            }

            const { rows: newCourseRows } = await query<any>("SELECT * FROM courses WHERE id = $1", [newCourseId]);
            res.json({ success: true, course: newCourseRows[0] });
        } catch (err) {
            console.error("Course duplicate failed:", err);
            res.status(500).json({ error: "duplicate_failed" });
        }
    }
);

// POST /api/courses - Create course
router.post("/", requireAuth, requireRole(["Admin", "SuperAdmin", "Instructor"]), async (req, res) => {
    // Manually extract extra fields
    const { title, description, mattermostWebhookUrl, mattermostChannelUrl } = req.body;

    if (!title) {
        return res.status(400).json({ error: "validation_error", details: "Title is required" });
    }

    const courseId = newId();
    const timestamp = nowIso();

    try {
        const result = await query(
            `INSERT INTO courses (id, title, description, instructor_id, mattermost_webhook_url, mattermost_channel_url, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
            [courseId, title, description ?? "", req.user!.id, mattermostWebhookUrl, mattermostChannelUrl, timestamp, timestamp]
        );
        res.status(201).json({ course: result.rows[0] });
    } catch (err) {
        console.error("Failed to create course:", err);
        res.status(500).json({ error: "database_error" });
    }
});

// PUT /api/courses/:id - Update course (Full update)
router.put("/:id", requireAuth, requireRole(["Admin", "SuperAdmin", "Instructor"]), async (req, res) => {
    const { id } = req.params;
    const parsed = courseSchema.partial().safeParse(req.body); // Allow partial for PUT? strict PUT usually requires full. But keeping loose for now.
    if (!parsed.success) {
        return res.status(400).json({ error: "validation_error", details: parsed.error });
    }

    try {
        const { title, description, mattermostWebhookUrl, mattermostChannelUrl } = parsed.data as any; // Cast to any to include extra fields not in base schema yet
        const result = await query(
            `UPDATE courses 
       SET title = COALESCE($1, title), 
           description = COALESCE($2, description),
           mattermost_webhook_url = COALESCE($3, mattermost_webhook_url),
           mattermost_channel_url = COALESCE($4, mattermost_channel_url),
           updated_at = $5
       WHERE id = $6
       RETURNING *`,
            [title, description, mattermostWebhookUrl, mattermostChannelUrl, nowIso(), id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "not_found" });
        }
        res.json({ course: result.rows[0] });
    } catch (err) {
        console.error("Failed to update course:", err);
        res.status(500).json({ error: "database_error" });
    }
});

// PATCH /api/courses/:id - Update course (Partial update)
router.patch("/:id", requireAuth, requireRole(["Admin", "SuperAdmin", "Instructor"]), async (req, res) => {
    const { id } = req.params;
    // Allow extra fields manually for now since Zod schema might need update
    const { title, description, mattermostWebhookUrl, mattermostChannelUrl } = req.body;

    try {
        const result = await query(
            `UPDATE courses 
       SET title = COALESCE($1, title), 
           description = COALESCE($2, description),
           mattermost_webhook_url = COALESCE($3, mattermost_webhook_url),
           mattermost_channel_url = COALESCE($4, mattermost_channel_url),
           updated_at = $5
       WHERE id = $6
       RETURNING *`,
            [title, description, mattermostWebhookUrl, mattermostChannelUrl, nowIso(), id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "not_found" });
        }
        res.json({ course: result.rows[0] });
    } catch (err) {
        console.error("Failed to patch course:", err);
        res.status(500).json({ error: "database_error" });
    }
});

// DELETE /api/courses/:id - Delete course
router.delete("/:id", requireAuth, requireRole(["Admin", "SuperAdmin"]), async (req, res) => {
    const { id } = req.params;
    try {
        const result = await query("DELETE FROM courses WHERE id = $1", [id]);
        if ((result.rowCount ?? 0) === 0) {
            return res.status(404).json({ error: "not_found" });
        }
        res.json({ message: "deleted" });
    } catch (err) {
        console.error("Failed to delete course:", err);
        res.status(500).json({ error: "database_error" });
    }
});

export default router;

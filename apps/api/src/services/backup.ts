
import fs from 'fs';
import path from 'path';
import { query } from '../db';
import { MattermostService } from './mattermost';

export const BackupService = {
    /**
     * Run a full backup of critical data
     */
    runFullBackup: async () => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(process.cwd(), 'backups', timestamp);

        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const report = {
            timestamp,
            tables: [] as string[],
            files: [] as string[],
            errors: [] as string[]
        };

        // 1. Dump Database Tables
        const tables = ['users', 'courses', 'exams', 'questions', 'exam_submissions', 'content_items', 'grades', 'audit_logs', 'proctoring_logs'];

        for (const table of tables) {
            try {
                const { rows } = await query(`SELECT * FROM ${table}`);
                const filePath = path.join(backupDir, `${table}.json`);
                fs.writeFileSync(filePath, JSON.stringify(rows, null, 2));
                report.tables.push(`${table} (${rows.length} rows)`);
            } catch (err: any) {
                console.error(`Backup failed for table ${table}:`, err);
                report.errors.push(`Table ${table}: ${err.message}`);
            }
        }

        // 2. Dump Mattermost Channel Metadata (if linked)
        try {
            const { rows: courses } = await query('SELECT id, title, mattermost_channel_id FROM courses WHERE mattermost_channel_id IS NOT NULL');
            const mmData = [];
            for (const course of courses) {
                try {
                    const channel = await MattermostService.getChannel(course.mattermost_channel_id);
                    mmData.push({ course: course.title, channel });
                } catch (e) {
                    mmData.push({ course: course.title, error: 'Channel not found or accessible' });
                }
            }
            fs.writeFileSync(path.join(backupDir, 'mattermost_meta.json'), JSON.stringify(mmData, null, 2));
            report.files.push('mattermost_meta.json');
        } catch (err: any) {
            report.errors.push(`Mattermost metadata: ${err.message}`);
        }

        // 3. Save Report
        fs.writeFileSync(path.join(backupDir, 'backup_report.json'), JSON.stringify(report, null, 2));

        return { backupPath: backupDir, report };
    }
};

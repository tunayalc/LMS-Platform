/**
 * Download Manager for Electron Desktop App
 * Handles large file downloads with progress, pause/resume, and queue management
 */

import { ipcMain, BrowserWindow, DownloadItem } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

interface DownloadTask {
    id: string;
    url: string;
    filename: string;
    savePath: string;
    size: number;
    downloaded: number;
    status: 'pending' | 'downloading' | 'paused' | 'completed' | 'failed' | 'cancelled';
    speed: number;  // bytes per second
    item?: DownloadItem;
    error?: string;
    startedAt?: number;
    completedAt?: number;
}

class DownloadManager {
    private downloads: Map<string, DownloadTask> = new Map();
    private queue: string[] = [];
    private maxConcurrent: number = 3;
    private activeCount: number = 0;
    private downloadDir: string;

    constructor(downloadDir: string) {
        this.downloadDir = downloadDir;

        // Ensure download directory exists
        if (!fs.existsSync(downloadDir)) {
            fs.mkdirSync(downloadDir, { recursive: true });
        }
    }

    /**
     * Add download to queue
     */
    addDownload(id: string, url: string, filename: string): DownloadTask {
        const task: DownloadTask = {
            id,
            url,
            filename,
            savePath: path.join(this.downloadDir, filename),
            size: 0,
            downloaded: 0,
            status: 'pending',
            speed: 0,
        };

        this.downloads.set(id, task);
        this.queue.push(id);
        this.processQueue();

        return task;
    }

    /**
     * Start download
     */
    startDownload(mainWindow: BrowserWindow, task: DownloadTask): void {
        if (this.activeCount >= this.maxConcurrent) {
            return;
        }

        this.activeCount++;
        task.status = 'downloading';
        task.startedAt = Date.now();

        // Use session to download
        mainWindow.webContents.session.on('will-download', (event, item, webContents) => {
            // Only handle this specific download
            if (!item.getURL().includes(task.url)) return;

            task.item = item;
            task.size = item.getTotalBytes();

            item.setSavePath(task.savePath);

            let lastBytes = 0;
            let lastTime = Date.now();

            item.on('updated', (event, state) => {
                if (state === 'interrupted') {
                    task.status = 'paused';
                } else if (state === 'progressing') {
                    if (!item.isPaused()) {
                        task.downloaded = item.getReceivedBytes();

                        // Calculate speed
                        const now = Date.now();
                        const timeDiff = (now - lastTime) / 1000;
                        if (timeDiff > 0.5) {
                            task.speed = (task.downloaded - lastBytes) / timeDiff;
                            lastBytes = task.downloaded;
                            lastTime = now;
                        }

                        this.sendProgress(mainWindow, task);
                    }
                }
            });

            item.once('done', (event, state) => {
                this.activeCount--;

                if (state === 'completed') {
                    task.status = 'completed';
                    task.completedAt = Date.now();
                } else {
                    task.status = 'failed';
                    task.error = `Download failed: ${state}`;
                }

                this.sendProgress(mainWindow, task);
                this.processQueue();
            });
        });

        // Trigger download
        mainWindow.webContents.downloadURL(task.url);
    }

    /**
     * Process download queue
     */
    processQueue(): void {
        while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
            const id = this.queue.shift();
            if (id) {
                const task = this.downloads.get(id);
                if (task && task.status === 'pending') {
                    // Need to get mainWindow reference
                    const windows = BrowserWindow.getAllWindows();
                    if (windows.length > 0) {
                        this.startDownload(windows[0], task);
                    }
                }
            }
        }
    }

    /**
     * Pause download
     */
    pauseDownload(id: string): boolean {
        const task = this.downloads.get(id);
        if (task?.item && task.status === 'downloading') {
            task.item.pause();
            task.status = 'paused';
            return true;
        }
        return false;
    }

    /**
     * Resume download
     */
    resumeDownload(id: string): boolean {
        const task = this.downloads.get(id);
        if (task?.item && task.status === 'paused') {
            task.item.resume();
            task.status = 'downloading';
            return true;
        }
        return false;
    }

    /**
     * Cancel download
     */
    cancelDownload(id: string): boolean {
        const task = this.downloads.get(id);
        if (task?.item) {
            task.item.cancel();
            task.status = 'cancelled';
            return true;
        }

        // Remove from queue if pending
        const queueIdx = this.queue.indexOf(id);
        if (queueIdx !== -1) {
            this.queue.splice(queueIdx, 1);
            this.downloads.delete(id);
            return true;
        }

        return false;
    }

    /**
     * Get all downloads
     */
    getAllDownloads(): DownloadTask[] {
        return Array.from(this.downloads.values());
    }

    /**
     * Get download by ID
     */
    getDownload(id: string): DownloadTask | undefined {
        return this.downloads.get(id);
    }

    /**
     * Clear completed downloads
     */
    clearCompleted(): void {
        for (const [id, task] of this.downloads.entries()) {
            if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
                this.downloads.delete(id);
            }
        }
    }

    /**
     * Send progress to renderer
     */
    private sendProgress(window: BrowserWindow, task: DownloadTask): void {
        window.webContents.send('download-progress', {
            id: task.id,
            filename: task.filename,
            size: task.size,
            downloaded: task.downloaded,
            status: task.status,
            speed: task.speed,
            error: task.error,
        });
    }
}

let downloadManager: DownloadManager | null = null;

/**
 * Setup download manager IPC handlers
 */
export function setupDownloadManager(downloadDir: string): void {
    downloadManager = new DownloadManager(downloadDir);

    // IPC handlers
    ipcMain.handle('download-start', async (event, id: string, url: string, filename: string) => {
        return downloadManager?.addDownload(id, url, filename);
    });

    ipcMain.handle('download-pause', async (event, id: string) => {
        return downloadManager?.pauseDownload(id);
    });

    ipcMain.handle('download-resume', async (event, id: string) => {
        return downloadManager?.resumeDownload(id);
    });

    ipcMain.handle('download-cancel', async (event, id: string) => {
        return downloadManager?.cancelDownload(id);
    });

    ipcMain.handle('download-list', async () => {
        return downloadManager?.getAllDownloads();
    });

    ipcMain.handle('download-clear', async () => {
        downloadManager?.clearCompleted();
        return true;
    });
}

export { DownloadManager, DownloadTask };
export default setupDownloadManager;

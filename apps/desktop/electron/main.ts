
import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { autoUpdater } from "electron-updater"
import { setupOfflineSyncHandlers } from './offlineSync'

// @ts-ignore
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let tray: Tray | null = null

// ===== Download Manager =====
interface DownloadItem {
    id: string
    url: string
    filename: string
    savePath: string
    progress: number
    status: 'pending' | 'downloading' | 'paused' | 'completed' | 'failed'
    bytesReceived: number
    totalBytes: number
}

const downloads: Map<string, DownloadItem> = new Map()
const downloadQueue: string[] = []
const downloadControllers: Map<string, AbortController> = new Map()

function generateDownloadId(): string {
    return `dl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// ===== System Tray =====
function createTray() {
    // Create a simple icon (in production, use a proper icon file)
    const iconPath = path.join(process.env.VITE_PUBLIC || '', 'tray-icon.png')
    const icon = fs.existsSync(iconPath)
        ? nativeImage.createFromPath(iconPath)
        : nativeImage.createEmpty()

    // Resize for tray (16x16 recommended)
    const trayIcon = icon.isEmpty() ? icon : icon.resize({ width: 16, height: 16 })

    tray = new Tray(trayIcon.isEmpty() ? nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==') : trayIcon)

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'LMS Platformu Aç',
            click: () => {
                if (win) {
                    win.show()
                    win.focus()
                } else {
                    createWindow()
                }
            }
        },
        {
            label: 'Durum: Hazır',
            enabled: false
        },
        { type: 'separator' },
        {
            label: 'İndirmeler',
            submenu: [
                {
                    label: 'Aktif İndirmeler',
                    click: () => {
                        const activeDownloads = Array.from(downloads.values())
                            .filter(d => d.status === 'downloading' || d.status === 'paused')
                        win?.webContents.send('downloads-list', activeDownloads)
                    }
                },
                {
                    label: 'Tümünü Duraklat',
                    click: () => {
                        downloads.forEach((dl, id) => {
                            if (dl.status === 'downloading') {
                                dl.status = 'paused'
                                downloads.set(id, dl)
                            }
                        })
                        win?.webContents.send('downloads-paused-all')
                    }
                },
                {
                    label: 'Tümünü Devam Ettir',
                    click: () => {
                        downloads.forEach((dl, id) => {
                            if (dl.status === 'paused') {
                                dl.status = 'downloading'
                                downloads.set(id, dl)
                            }
                        })
                        processDownloadQueue()
                    }
                }
            ]
        },
        { type: 'separator' },
        {
            label: 'Başlangıçta Çalıştır',
            type: 'checkbox',
            checked: app.getLoginItemSettings().openAtLogin,
            click: (menuItem) => {
                app.setLoginItemSettings({ openAtLogin: menuItem.checked });
            }
        },
        {
            label: 'Güncellemeleri Kontrol Et',
            click: () => autoUpdater.checkForUpdatesAndNotify()
        },
        { type: 'separator' },
        {
            label: 'Çıkış',
            click: () => {
                app.quit()
            }
        }
    ])

    tray.setToolTip('LMS Platform')
    tray.setContextMenu(contextMenu)

    // Click on tray icon shows/hides window
    tray.on('click', () => {
        if (win) {
            if (win.isVisible()) {
                win.hide()
            } else {
                win.show()
                win.focus()
            }
        }
    })
}

// ===== Download Manager IPC Handlers =====
function setupDownloadHandlers() {
    // Start a new download
    ipcMain.handle('download-start', async (_event, url: string, filename?: string) => {
        const id = generateDownloadId()
        const defaultFilename = filename || path.basename(new URL(url).pathname) || 'download'

        const { filePath, canceled } = await dialog.showSaveDialog(win!, {
            defaultPath: path.join(app.getPath('downloads'), defaultFilename),
            title: 'Dosyayı Kaydet'
        })

        if (canceled || !filePath) {
            return null
        }

        const downloadItem: DownloadItem = {
            id,
            url,
            filename: path.basename(filePath),
            savePath: filePath,
            progress: 0,
            status: 'pending',
            bytesReceived: 0,
            totalBytes: 0
        }

        downloads.set(id, downloadItem)
        downloadQueue.push(id)
        processDownloadQueue()

        return id
    })

    // Pause a download
    ipcMain.handle('download-pause', (_event, id: string) => {
        const dl = downloads.get(id)
        if (dl && dl.status === 'downloading') {
            dl.status = 'paused'
            downloads.set(id, dl)
            downloadControllers.get(id)?.abort()
            downloadControllers.delete(id)
            return true
        }
        return false
    })

    // Resume a download
    ipcMain.handle('download-resume', (_event, id: string) => {
        const dl = downloads.get(id)
        if (dl && dl.status === 'paused') {
            dl.status = 'pending'
            downloadQueue.push(id)
            processDownloadQueue()
            return true
        }
        return false
    })

    // Cancel a download
    ipcMain.handle('download-cancel', (_event, id: string) => {
        const dl = downloads.get(id)
        if (dl) {
            dl.status = 'failed'
            downloads.set(id, dl)
            downloadControllers.get(id)?.abort()
            downloadControllers.delete(id)
            // Remove from queue
            const queueIndex = downloadQueue.indexOf(id)
            if (queueIndex > -1) downloadQueue.splice(queueIndex, 1)
            win?.webContents.send('download-failed', { id, error: 'canceled' })
            return true
        }
        return false
    })

    // Get all downloads
    ipcMain.handle('download-list', () => {
        return Array.from(downloads.values())
    })
}

async function processDownloadQueue() {
    if (downloadQueue.length === 0) return

    const id = downloadQueue.shift()!
    const dl = downloads.get(id)

    if (!dl || dl.status !== 'pending') {
        processDownloadQueue()
        return
    }

    dl.status = 'downloading'
    downloads.set(id, dl)

    try {
        const startOffset = (dl.bytesReceived > 0 && fs.existsSync(dl.savePath)) ? dl.bytesReceived : 0
        if (dl.bytesReceived > 0 && startOffset === 0) {
            dl.bytesReceived = 0
        }

        const controller = new AbortController()
        downloadControllers.set(id, controller)

        const headers: Record<string, string> = {}
        if (startOffset > 0) {
            headers.Range = `bytes=${startOffset}-`
        }

        // Stream download to disk (supports resume via Range when server allows)
        const response = await fetch(dl.url, { headers, signal: controller.signal })

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
        }

        // If server ignored Range (200) but we had partial file, restart from scratch
        if (startOffset > 0 && response.status === 200) {
            dl.bytesReceived = 0
            dl.progress = 0
            downloads.set(id, dl)
            downloadControllers.get(id)?.abort()
            downloadControllers.delete(id)
            // re-queue as fresh download
            dl.status = 'pending'
            downloads.set(id, dl)
            downloadQueue.unshift(id)
            processDownloadQueue()
            return
        }

        let totalBytes = 0
        const contentRange = response.headers.get('content-range')
        if (contentRange) {
            const match = contentRange.match(/\/(\d+)$/)
            if (match) totalBytes = parseInt(match[1], 10)
        }
        if (!totalBytes) {
            const contentLength = parseInt(response.headers.get('content-length') || '0', 10)
            totalBytes = startOffset > 0 ? (startOffset + contentLength) : contentLength
        }
        dl.totalBytes = totalBytes

        const reader = response.body?.getReader()
        if (!reader) throw new Error('No reader')

        const stream = fs.createWriteStream(dl.savePath, { flags: startOffset > 0 ? 'a' : 'w' })
        let receivedLength = startOffset

        while (true) {
            const currentDl = downloads.get(id)
            if (currentDl?.status === 'paused') break
            if (currentDl?.status === 'failed') break

            const { done, value } = await reader.read()
            if (done) break

            if (value) {
                stream.write(value)
                receivedLength += value.length
            }

            dl.bytesReceived = receivedLength
            dl.progress = dl.totalBytes > 0 ? Math.round((receivedLength / dl.totalBytes) * 100) : 0
            downloads.set(id, dl)

            // Send progress to renderer
            win?.webContents.send('download-progress', { id, progress: dl.progress, bytesReceived: receivedLength, totalBytes: dl.totalBytes })
        }

        stream.end()

        // Complete if still downloading
        const currentDl = downloads.get(id)
        if (currentDl?.status === 'downloading') {
            dl.status = 'completed'
            dl.progress = 100
            downloads.set(id, dl)

            win?.webContents.send('download-complete', { id, path: dl.savePath })
        }
    } catch (error: any) {
        const current = downloads.get(id)
        const isAborted = error?.name === 'AbortError'
        if (isAborted && (current?.status === 'paused' || current?.status === 'failed')) {
            // Pause/cancel aborts are expected; keep existing status.
        } else {
            dl.status = 'failed'
            downloads.set(id, dl)
            win?.webContents.send('download-failed', { id, error: String(error) })
        }
    } finally {
        downloadControllers.delete(id)
    }

    // Process next in queue
    processDownloadQueue()
}

function createWindow() {
    win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: false,
        },
    })

    win.webContents.on('did-finish-load', () => {
        win?.webContents.send('main-process-message', (new Date).toLocaleString())
    })

    // Minimize to tray instead of closing
    win.on('close', (event) => {
        if (!(app as any).isQuitting) {
            event.preventDefault()
            win?.hide()
        }
    })

    // --- WEB WRAPPER MODE (Requested by User) ---
    // Instead of internal renderer, load the Next.js Web App
    // Make sure 'npm run dev:web' is running!
    const WEB_URL = process.env.LMS_WEB_URL || 'http://localhost:3000';
    win.loadURL(WEB_URL);

    // Original Code (Disabled):
    /*
    if (VITE_DEV_SERVER_URL) {
        win.loadURL(VITE_DEV_SERVER_URL)
    } else {
        win.loadFile(path.join(RENDERER_DIST, 'index.html'))
    }
    */
}

// Prevent default quit behavior
app.on('before-quit', () => {
    (app as any).isQuitting = true
})

app.on('window-all-closed', () => {
    // Don't quit on macOS
    if (process.platform !== 'darwin') {
        // Keep running in tray
    }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})

app.whenReady().then(() => {
    createWindow()
    createTray()
    setupDownloadHandlers()
    setupMediaHandlers()
    // Offline sync expects API routes under `/api` (e.g. POST /api/sync)
    const rawApiBaseUrl = process.env.LMS_API_BASE_URL || 'http://localhost:4000';
    const normalizedBaseUrl = rawApiBaseUrl.replace(/\/$/, '');
    const apiBaseUrl = normalizedBaseUrl.endsWith('/api') ? normalizedBaseUrl : `${normalizedBaseUrl}/api`;
    setupOfflineSyncHandlers(apiBaseUrl);
    autoUpdater.checkForUpdatesAndNotify()
})

// ===== Media (Webcam/Mic) Permission Handler =====
function setupMediaHandlers() {
    // Handle Permission Requests (Chromium)
    // This is crucial for Electron to allow media access in Renderer
    app.on('web-contents-created', (_event, webContents) => {
        webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
            const allowedPermissions = ['media', 'audioCapture', 'videoCapture', 'pointerLock', 'fullscreen'];
            if (allowedPermissions.includes(permission)) {
                callback(true);
            } else {
                callback(false);
            }
        });

        webContents.session.setPermissionCheckHandler((webContents, permission) => {
            const allowedPermissions = ['media', 'audioCapture', 'videoCapture', 'pointerLock', 'fullscreen'];
            return allowedPermissions.includes(permission);
        });
    });

    // IPC for checking media status
    ipcMain.handle('check-media-permission', async () => {
        // In Electron, `navigator.mediaDevices.getUserMedia` should work after session setup above.
        // We return a simple "supported" signal. Actual device enumeration happens in renderer.
        return { supported: true };
    });

    // IPC for requesting media devices list (optional, for UI)
    ipcMain.handle('get-media-devices', async () => {
        // Electron doesn't have direct API for enumerating from main, renderer uses web standard.
        // This is a pass-through placeholder.
        return { message: 'Call navigator.mediaDevices.enumerateDevices() in renderer.' };
    });
}

autoUpdater.on('update-available', () => {
    win?.webContents.send('update_available')
})

autoUpdater.on('update-downloaded', () => {
    win?.webContents.send('update_downloaded')
})

// IPC to trigger update install from Renderer
ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall();
});

// Allow renderer to trigger update checks
ipcMain.on('check-updates', () => {
    autoUpdater.checkForUpdatesAndNotify();
});


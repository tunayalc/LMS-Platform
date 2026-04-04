/**
 * System Tray Support for Electron Desktop App
 */

import { app, Tray, Menu, nativeImage, BrowserWindow } from 'electron';
import * as path from 'path';

let tray: Tray | null = null;

interface TrayOptions {
    mainWindow: BrowserWindow;
    onShowWindow?: () => void;
    onQuit?: () => void;
}

/**
 * Setup system tray with menu
 */
export function setupSystemTray({ mainWindow, onShowWindow, onQuit }: TrayOptions): Tray {
    // Create tray icon
    const iconPath = path.join(__dirname, '../assets/tray-icon.png');

    // Create a 16x16 icon (or use nativeImage.createFromPath)
    let icon: nativeImage;
    try {
        icon = nativeImage.createFromPath(iconPath);
        if (icon.isEmpty()) {
            // Fallback: create a simple colored icon
            icon = createDefaultIcon();
        }
    } catch {
        icon = createDefaultIcon();
    }

    // Resize for different platforms
    if (process.platform === 'darwin') {
        icon = icon.resize({ width: 16, height: 16 });
    } else {
        icon = icon.resize({ width: 16, height: 16 });
    }

    tray = new Tray(icon);
    tray.setToolTip('LMS - Öğrenme Yönetim Sistemi');

    // Context menu
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Uygulamayı Aç',
            click: () => {
                mainWindow.show();
                mainWindow.focus();
                onShowWindow?.();
            },
        },
        {
            label: 'Sınav Modu',
            submenu: [
                { label: 'Aktif Sınav Yok', enabled: false },
            ],
        },
        { type: 'separator' },
        {
            label: 'Bildirimler',
            type: 'checkbox',
            checked: true,
            click: (menuItem) => {
                // Toggle notifications
                console.log('Notifications:', menuItem.checked);
            },
        },
        {
            label: 'Başlangıçta Çalıştır',
            type: 'checkbox',
            checked: app.getLoginItemSettings().openAtLogin,
            click: (menuItem) => {
                app.setLoginItemSettings({ openAtLogin: menuItem.checked });
            },
        },
        { type: 'separator' },
        {
            label: 'Güncelleme Kontrolü',
            click: () => {
                mainWindow.webContents.send('check-updates');
            },
        },
        { type: 'separator' },
        {
            label: 'Çıkış',
            click: () => {
                onQuit?.();
                app.quit();
            },
        },
    ]);

    tray.setContextMenu(contextMenu);

    // Click behavior
    tray.on('click', () => {
        if (mainWindow.isVisible()) {
            if (mainWindow.isMinimized()) {
                mainWindow.restore();
            }
            mainWindow.focus();
        } else {
            mainWindow.show();
        }
    });

    // Double-click behavior (Windows)
    tray.on('double-click', () => {
        mainWindow.show();
        mainWindow.focus();
    });

    return tray;
}

/**
 * Create default icon when asset not found
 */
function createDefaultIcon(): nativeImage {
    // Create a simple 16x16 blue square icon
    const size = 16;
    const canvas = Buffer.alloc(size * size * 4);

    for (let i = 0; i < size * size; i++) {
        canvas[i * 4] = 59;      // R
        canvas[i * 4 + 1] = 130; // G
        canvas[i * 4 + 2] = 246; // B
        canvas[i * 4 + 3] = 255; // A
    }

    return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

/**
 * Update tray menu for active exam
 */
export function updateTrayExamStatus(examTitle: string | null): void {
    if (!tray) return;

    const menu = Menu.buildFromTemplate([
        {
            label: 'Uygulamayı Aç',
            click: () => {
                // Get focused window
                BrowserWindow.getAllWindows()[0]?.show();
            },
        },
        {
            label: 'Sınav Modu',
            submenu: examTitle
                ? [
                    { label: `📝 ${examTitle}`, enabled: false },
                    { type: 'separator' },
                    { label: 'Sınav devam ediyor...', enabled: false },
                ]
                : [{ label: 'Aktif Sınav Yok', enabled: false }],
        },
        { type: 'separator' },
        {
            label: examTitle ? 'Çıkış (Sınav nedeniyle devre dışı)' : 'Çıkış',
            enabled: !examTitle,
            click: () => app.quit(),
        },
    ]);

    tray.setContextMenu(menu);

    // Update tooltip
    tray.setToolTip(examTitle ? `LMS - Sınav: ${examTitle}` : 'LMS - Öğrenme Yönetim Sistemi');
}

/**
 * Show notification balloon (Windows)
 */
export function showTrayNotification(title: string, content: string): void {
    if (!tray) return;
    tray.displayBalloon({ title, content });
}

/**
 * Destroy tray
 */
export function destroyTray(): void {
    if (tray) {
        tray.destroy();
        tray = null;
    }
}

export default {
    setupSystemTray,
    updateTrayExamStatus,
    showTrayNotification,
    destroyTray,
};

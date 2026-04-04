/**
 * Desktop Offline Sync Manager
 * using electron-store for local persistence
 */
import Store from 'electron-store';
import { ipcMain } from 'electron';

interface QueuedAction {
    id: string;
    type: string;
    payload: any;
    timestamp: string;
}

const store = new Store<{
    offlineQueue: QueuedAction[];
    cachedData: Record<string, any>;
    lastSyncTime: string | null;
}>();

export function setupOfflineSyncHandlers(apiBaseUrl: string) {
    // Add item to queue
    ipcMain.handle('offline-queue-add', (_event, action: Omit<QueuedAction, 'id' | 'timestamp'>) => {
        const queue = store.get('offlineQueue', []);
        const newAction: QueuedAction = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            ...action,
            timestamp: new Date().toISOString()
        };
        queue.push(newAction);
        store.set('offlineQueue', queue);
        return newAction.id;
    });

    // Get queue
    ipcMain.handle('offline-queue-get', () => {
        return store.get('offlineQueue', []);
    });

    // Clear queue
    ipcMain.handle('offline-queue-clear', () => {
        store.set('offlineQueue', []);
        return true;
    });

    // Sync queue with server
    ipcMain.handle('offline-queue-sync', async (_event, authToken?: string) => {
        const queue = store.get('offlineQueue', []);
        if (queue.length === 0) return { success: true, synced: 0 };

        const remainingQueue: QueuedAction[] = [];
        let syncedCount = 0;

        for (const item of queue) {
            try {
                const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                if (authToken) {
                    headers.Authorization = `Bearer ${authToken}`;
                }

                const response = await fetch(`${apiBaseUrl}/sync`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ actions: [item] })
                });
                if (response.ok) {
                    syncedCount++;
                } else if (response.status >= 400 && response.status < 500) {
                    // Client error, discard
                    console.warn('Discarding invalid item:', item.id);
                } else {
                    // Server error, keep in queue
                    remainingQueue.push(item);
                }
            } catch (e) {
                // Network error, stop trying
                remainingQueue.push(item);
                break;
            }
        }

        store.set('offlineQueue', remainingQueue);
        store.set('lastSyncTime', new Date().toISOString());
        return { success: remainingQueue.length === 0, synced: syncedCount, remaining: remainingQueue.length };
    });

    // Cache data for offline use
    ipcMain.handle('offline-cache-set', (_event, key: string, data: any) => {
        const cachedData = store.get('cachedData', {});
        cachedData[key] = data;
        store.set('cachedData', cachedData);
        return true;
    });

    // Get cached data
    ipcMain.handle('offline-cache-get', (_event, key: string) => {
        const cachedData = store.get('cachedData', {});
        return cachedData[key] || null;
    });

    // Get last sync time
    ipcMain.handle('offline-last-sync', () => {
        return store.get('lastSyncTime', null);
    });
}

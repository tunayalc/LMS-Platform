
import * as Network from 'expo-network';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

const OFFLINE_CONTENT_KEY = 'offline_downloads';
const OFFLINE_QUEUE_KEY = 'offline_queue';

export interface DownloadedContent {
    id: string;
    type: 'pdf' | 'video';
    localUri: string;
    remoteUrl: string;
    title: string;
    downloadedAt: string;
    size: number;
}

export const OfflineManager = {
    // İnternet var mı?
    checkConnection: async (): Promise<boolean> => {
        try {
            const status = await Network.getNetworkStateAsync();
            return status.isConnected ?? false;
        } catch (e) {
            console.warn("Offline check failed", e);
            return true; // Hata durumunda online varsay
        }
    },

    // İçerik İndir
    downloadContent: async (
        id: string,
        url: string,
        title: string,
        type: 'pdf' | 'video',
        headers?: Record<string, string>
    ): Promise<DownloadedContent> => {
        try {
            // Force cast to any because TS sometimes claims documentDirectory doesn't exist on the type in certain RN versions
            const docDir = (FileSystem as any).documentDirectory;
            if (!docDir) {
                // If null, we can't save files.
                throw new Error("Device storage not available (documentDirectory is null)");
            }

            const fileName = `${id}.${type === 'pdf' ? 'pdf' : 'mp4'}`;
            const fileDir = `${docDir}downloads/`;

            // Dizin kontrolü
            const dirInfo = await FileSystem.getInfoAsync(fileDir);
            if (!dirInfo.exists) {
                await FileSystem.makeDirectoryAsync(fileDir, { intermediates: true });
            }

            const fileUri = fileDir + fileName;

            // İndir (header destekli)
            const resumable = FileSystem.createDownloadResumable(url, fileUri, { headers: headers || undefined });
            const downloadRes = await resumable.downloadAsync();
            if (!downloadRes || downloadRes.status !== 200) {
                throw new Error(`Download failed (status ${downloadRes?.status ?? 'unknown'})`);
            }

            // Metadata sakla
            const info = await FileSystem.getInfoAsync(fileUri);
            let fileSize = 0;
            if (info.exists) {
                fileSize = info.size;
            }

            const newItem: DownloadedContent = {
                id,
                type,
                localUri: fileUri,
                remoteUrl: url,
                title,
                downloadedAt: new Date().toISOString(),
                size: fileSize
            };

            const existing = await OfflineManager.getAllDownloads();
            const updated = [...existing.filter(i => i.id !== id), newItem];
            await AsyncStorage.setItem(OFFLINE_CONTENT_KEY, JSON.stringify(updated));

            return newItem;
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            console.error("Download failed", message, e);
            throw new Error(message);
        }
    },

    // Tüm indirmeleri getir
    getAllDownloads: async (): Promise<DownloadedContent[]> => {
        try {
            const data = await AsyncStorage.getItem(OFFLINE_CONTENT_KEY);
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    },

    // Yerel URI getir (varsa)
    getLocalUri: async (id: string): Promise<string | null> => {
        const downloads = await OfflineManager.getAllDownloads();
        const found = downloads.find(d => d.id === id);
        if (found) {
            const info = await FileSystem.getInfoAsync(found.localUri);
            if (info.exists) return found.localUri;
        }
        return null;
    },

    // Sil
    removeDownload: async (id: string) => {
        const downloads = await OfflineManager.getAllDownloads();
        const found = downloads.find(d => d.id === id);
        if (found) {
            await FileSystem.deleteAsync(found.localUri, { idempotent: true });
            const updated = downloads.filter(d => d.id !== id);
            await AsyncStorage.setItem(OFFLINE_CONTENT_KEY, JSON.stringify(updated));
        }
    },

    // Veriyi yerel sakla (Cache)
    saveData: async (key: string, data: any) => {
        try {
            await AsyncStorage.setItem(`cache_${key}`, JSON.stringify(data));
            await AsyncStorage.setItem(`cache_time_${key}`, new Date().toISOString());
        } catch (e) {
            console.warn("Save cache failed", key, e);
        }
    },

    // Yerel veriyi oku
    getData: async <T>(key: string): Promise<T | null> => {
        try {
            const data = await AsyncStorage.getItem(`cache_${key}`);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            return null;
        }
    },

    // Kuyruk yönetimi
    addToQueue: async (action: string, payload: any) => {
        try {
            const current = await OfflineManager.getData<any[]>(OFFLINE_QUEUE_KEY) || [];
            // crypto.randomUUID not available in RN without polyfill, use Math.random fallback
            const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
            current.push({ id, type: action, payload, timestamp: new Date().toISOString() });
            await AsyncStorage.setItem(`cache_${OFFLINE_QUEUE_KEY}`, JSON.stringify(current));
        } catch (e) {
            console.warn("Queue add failed", e);
        }
    },

    // Kuyruğu sunucuya gönder (Sync)
    syncQueue: async (apiClient: any) => {
        try {
            const queue = await OfflineManager.getData<any[]>(OFFLINE_QUEUE_KEY) || [];
            if (queue.length === 0) return;

            const isConnected = await OfflineManager.checkConnection();
            if (!isConnected) return;

            // Process items sequentially to ensure strict order
            const remainingQueue = [...queue];
            const failedItems: any[] = [];

            // We iterate a copy to modify the original queue safeley
            for (const item of queue) {
                try {
                    // Assuming generic endpoint for now, or dispatch based on item.type
                    // Ideally: apiClient.post('/sync/single', item)
                    // For legacy support we might need to adapt. 
                    // Let's assume the previous '/sync' endpoint can handle single item or we keep using it?
                    // The previous code sent `{ actions: queue }`.
                    // If backend expects array, we can send array of [item].
                    await apiClient.post('/sync', { actions: [item] });

                    // Success: Remove from queue
                    remainingQueue.shift();
                } catch (e: any) {
                    console.error("Sync item failed", item.id, e);
                    // If specific error (e.g. 400 Bad Request), maybe discard?
                    if (e.response && e.response.status >= 400 && e.response.status < 500) {
                        // Client error (validation), discard to unblock queue
                        console.warn("Discarding invalid queue item", item);
                        remainingQueue.shift();
                        failedItems.push({ ...item, error: e.message });
                    } else {
                        // Server/Network error, stop syncing and keep item in queue
                        break;
                    }
                }
            }

            // Update queue with remaining items
            await AsyncStorage.setItem(`cache_${OFFLINE_QUEUE_KEY}`, JSON.stringify(remainingQueue));

            // Optionally save failed items to a separate log
            if (failedItems.length > 0) {
                const oldFailed = await OfflineManager.getData<any[]>('sync_failed_log') || [];
                await AsyncStorage.setItem('cache_sync_failed_log', JSON.stringify([...oldFailed, ...failedItems]));
            }

        } catch (e) {
            console.error("Sync process crashed", e);
        }
    }
};

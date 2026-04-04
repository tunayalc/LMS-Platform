/**
 * Progress Tracker for Mobile App
 * Tracks video/PDF progress and syncs with API
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { OfflineManager } from './offline';

const PROGRESS_KEY = 'content_progress';

export interface ContentProgress {
    contentId: string;
    type: 'video' | 'pdf';
    progress: number; // For video: seconds watched, for PDF: current page
    total: number; // For video: total duration, for PDF: total pages
    percentage: number; // 0-100
    lastUpdated: string;
}

export const ProgressTracker = {
    /**
     * Save progress locally
     */
    saveProgress: async (progress: ContentProgress): Promise<void> => {
        try {
            const existing = await ProgressTracker.getAllProgress();
            const updated = {
                ...existing,
                [progress.contentId]: {
                    ...progress,
                    lastUpdated: new Date().toISOString()
                }
            };
            await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(updated));
        } catch (e) {
            console.error('[ProgressTracker] Save failed:', e);
        }
    },

    /**
     * Get progress for specific content
     */
    getProgress: async (contentId: string): Promise<ContentProgress | null> => {
        try {
            const all = await ProgressTracker.getAllProgress();
            return all[contentId] || null;
        } catch {
            return null;
        }
    },

    /**
     * Get all progress records
     */
    getAllProgress: async (): Promise<Record<string, ContentProgress>> => {
        try {
            const data = await AsyncStorage.getItem(PROGRESS_KEY);
            return data ? JSON.parse(data) : {};
        } catch {
            return {};
        }
    },

    /**
     * Sync progress to API
     */
    syncToApi: async (
        apiClient: { put: (url: string, data: any) => Promise<any> },
        contentId: string,
        progress: ContentProgress
    ): Promise<boolean> => {
        try {
            const isConnected = await OfflineManager.checkConnection();
            
            if (!isConnected) {
                // Queue for later sync
                await OfflineManager.addToQueue('content_progress', {
                    contentId,
                    progress: progress.progress,
                    total: progress.total,
                    type: progress.type
                });
                console.log('[ProgressTracker] Offline - queued for sync');
                return false;
            }

            await apiClient.put(`/contents/${contentId}/progress`, {
                progress: progress.progress,
                total: progress.total,
                type: progress.type,
                percentage: progress.percentage
            });
            
            console.log('[ProgressTracker] Synced to API:', contentId);
            return true;
        } catch (e) {
            console.error('[ProgressTracker] API sync failed:', e);
            // Queue for retry
            await OfflineManager.addToQueue('content_progress', {
                contentId,
                progress: progress.progress,
                total: progress.total,
                type: progress.type
            });
            return false;
        }
    },

    /**
     * Track video progress
     */
    trackVideo: async (
        apiClient: any,
        contentId: string,
        currentSeconds: number,
        totalSeconds: number
    ): Promise<void> => {
        const percentage = totalSeconds > 0 ? Math.round((currentSeconds / totalSeconds) * 100) : 0;
        
        const progress: ContentProgress = {
            contentId,
            type: 'video',
            progress: currentSeconds,
            total: totalSeconds,
            percentage,
            lastUpdated: new Date().toISOString()
        };

        await ProgressTracker.saveProgress(progress);
        
        // Sync every 10% or when completed
        if (percentage % 10 === 0 || percentage >= 95) {
            await ProgressTracker.syncToApi(apiClient, contentId, progress);
        }
    },

    /**
     * Track video progress locally (no API sync)
     */
    trackVideoLocal: async (
        contentId: string,
        currentSeconds: number,
        totalSeconds: number
    ): Promise<void> => {
        const percentage = totalSeconds > 0 ? Math.round((currentSeconds / totalSeconds) * 100) : 0;

        const progress: ContentProgress = {
            contentId,
            type: 'video',
            progress: currentSeconds,
            total: totalSeconds,
            percentage,
            lastUpdated: new Date().toISOString()
        };

        await ProgressTracker.saveProgress(progress);
    },

    /**
     * Track PDF progress
     */
    trackPdf: async (
        apiClient: any,
        contentId: string,
        currentPage: number,
        totalPages: number
    ): Promise<void> => {
        const percentage = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;
        
        const progress: ContentProgress = {
            contentId,
            type: 'pdf',
            progress: currentPage,
            total: totalPages,
            percentage,
            lastUpdated: new Date().toISOString()
        };

        await ProgressTracker.saveProgress(progress);
        
        // Sync on page change (debounced by caller ideally)
        await ProgressTracker.syncToApi(apiClient, contentId, progress);
    },

    /**
     * Track PDF progress locally (no API sync)
     */
    trackPdfLocal: async (
        contentId: string,
        currentPage: number,
        totalPages: number
    ): Promise<void> => {
        const percentage = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;

        const progress: ContentProgress = {
            contentId,
            type: 'pdf',
            progress: currentPage,
            total: totalPages,
            percentage,
            lastUpdated: new Date().toISOString()
        };

        await ProgressTracker.saveProgress(progress);
    },

    /**
     * Clear progress for content
     */
    clearProgress: async (contentId: string): Promise<void> => {
        try {
            const all = await ProgressTracker.getAllProgress();
            delete all[contentId];
            await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
        } catch (e) {
            console.error('[ProgressTracker] Clear failed:', e);
        }
    }
};

export default ProgressTracker;

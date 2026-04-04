/**
 * Anti-Cheat utilities for exam mode
 * Includes screen capture prevention and background detection
 */

import { Platform, AppState, AppStateStatus } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';

interface AntiCheatCallbacks {
    onBackgroundDetected?: () => void;
    onScreenCaptureAttempt?: () => void;
}

export class AntiCheatManager {
    private static appStateSubscription: { remove: () => void } | null = null;
    private static screenCaptureSubscription: { remove: () => void } | null = null;
    private static callbacks: AntiCheatCallbacks = {};

    /**
     * Enable anti-cheat protections
     */
    static async enable(callbacks: AntiCheatCallbacks = {}) {
        this.callbacks = callbacks;

        // 1. Prevent screen capture (screenshots/recording)
        try {
            await ScreenCapture.preventScreenCaptureAsync();
            console.log('[AntiCheat] Screen capture prevention enabled');
        } catch (err) {
            console.warn('[AntiCheat] Failed to enable screen capture prevention:', err);
        }

        // 2. Listen for screen capture attempts
        this.screenCaptureSubscription = ScreenCapture.addScreenshotListener(() => {
            console.warn('[AntiCheat] Screenshot attempt detected!');
            callbacks.onScreenCaptureAttempt?.();
        });

        // 3. Listen for app going to background
        this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
    }

    /**
     * Disable anti-cheat protections
     */
    static async disable() {
        // Allow screen capture again
        try {
            await ScreenCapture.allowScreenCaptureAsync();
            console.log('[AntiCheat] Screen capture prevention disabled');
        } catch (err) {
            console.warn('[AntiCheat] Failed to disable screen capture prevention:', err);
        }

        // Remove listeners
        if (this.screenCaptureSubscription) {
            this.screenCaptureSubscription.remove();
            this.screenCaptureSubscription = null;
        }

        if (this.appStateSubscription) {
            this.appStateSubscription.remove();
            this.appStateSubscription = null;
        }

        this.callbacks = {};
    }

    private static handleAppStateChange = (state: AppStateStatus) => {
        if (state === 'background' || state === 'inactive') {
            console.warn('[AntiCheat] App went to background!');
            this.callbacks.onBackgroundDetected?.();
        }
    };

    /**
     * Check if running in secure mode (no debugger, not rooted, etc.)
     * This is a basic check - production apps should use more robust solutions
     */
    static async checkSecurityStatus(): Promise<{
        isSecure: boolean;
        warnings: string[];
    }> {
        const warnings: string[] = [];

        // Check if running in development mode
        if (__DEV__) {
            warnings.push('Uygulama geliştirme modunda çalışıyor');
        }

        // On Android, could check for root/emulator
        // On iOS, could check for jailbreak
        // These require native modules like react-native-device-info

        return {
            isSecure: warnings.length === 0,
            warnings,
        };
    }

    /**
     * Log security event (for audit purposes)
     */
    static logSecurityEvent(event: {
        type: 'screenshot_attempt' | 'background_switch' | 'security_warning';
        details?: string;
        timestamp?: string;
    }) {
        const logEntry = {
            ...event,
            timestamp: event.timestamp || new Date().toISOString(),
            platform: Platform.OS,
        };

        console.log('[AntiCheat] Security event:', logEntry);

        // In production, send this to backend for audit
        // await fetch(`${apiBase}/security/log`, { ... });

        return logEntry;
    }
}

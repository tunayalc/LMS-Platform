import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Stub for when notifications aren't available
const notificationsStub = {
    setNotificationHandler: (_handler: any) => { },
    setNotificationChannelAsync: async (_id: string, _channel: any) => { },
    getPermissionsAsync: async () => ({ status: 'denied' }),
    requestPermissionsAsync: async () => ({ status: 'denied' }),
    getExpoPushTokenAsync: async (_options?: any) => ({ data: '' }),
    addNotificationReceivedListener: (_callback: any) => ({ remove: () => { } }),
    addNotificationResponseReceivedListener: (_callback: any) => ({ remove: () => { } }),
    AndroidImportance: { MAX: 4 }
};

// Try to use real notifications, fall back to stub
let Notifications: typeof notificationsStub;
export const isExpoGo =
    (Constants as any)?.executionEnvironment === 'storeClient' ||
    (Constants as any)?.appOwnership === 'expo' ||
    (Constants as any)?.appOwnership === 'guest';

export const supportsRemotePush = !isExpoGo;

if (isExpoGo) {
    // Expo Go (SDK 53+) removed remote push support on Android; keep UI usable by stubbing.
    console.log('[Notifications] Expo Go detected - using stub notifications.');
    Notifications = notificationsStub;
} else {
    try {
        // @ts-ignore - dynamic import for Expo Go compatibility
        Notifications = require('expo-notifications');
    } catch {
        console.log('[Notifications] Using stub - expo-notifications not available');
        Notifications = notificationsStub;
    }
}

// Only set handler if real module is available
if (Notifications !== notificationsStub) {
    try {
        Notifications.setNotificationHandler({
            handleNotification: async () => ({
                shouldShowAlert: true,
                shouldPlaySound: false,
                shouldSetBadge: false,
            }),
        });
    } catch (e) {
        console.log('[Notifications] Handler setup failed:', e);
    }
}

export class NotificationManager {
    static async registerForPushNotificationsAsync(): Promise<string | undefined> {
        try {
            if (isExpoGo) {
                // Expo Go (SDK 53+) does not support remote push on Android.
                return undefined;
            }

            if (Platform.OS === 'android') {
                await Notifications.setNotificationChannelAsync('default', {
                    name: 'default',
                    importance: Notifications.AndroidImportance?.MAX ?? 4,
                    vibrationPattern: [0, 250, 250, 250],
                    lightColor: '#FF231F7C',
                });
            }

            if (!Device.isDevice) {
                console.log('[Notifications] Must use physical device');
                return undefined;
            }

            const { status: existingStatus } = await Notifications.getPermissionsAsync();
            let finalStatus = existingStatus;

            if (existingStatus !== 'granted') {
                const { status } = await Notifications.requestPermissionsAsync();
                finalStatus = status;
            }

            if (finalStatus !== 'granted') {
                console.log('[Notifications] Permission not granted');
                return undefined;
            }

            const projectId =
                Constants?.expoConfig?.extra?.eas?.projectId ??
                (Constants as any)?.easConfig?.projectId;

            const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
            return tokenData.data;
        } catch (error) {
            console.log('[Notifications] registerForPushNotificationsAsync error:', error);
            return undefined;
        }
    }

    static addNotificationlistener(callback: (notification: any) => void) {
        try {
            return Notifications.addNotificationReceivedListener(callback);
        } catch {
            return { remove: () => { } };
        }
    }

    static addResponseListener(callback: (response: any) => void) {
        try {
            return Notifications.addNotificationResponseReceivedListener(callback);
        } catch {
            return { remove: () => { } };
        }
    }
}

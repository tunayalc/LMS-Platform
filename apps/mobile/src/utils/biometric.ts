
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

export const BiometricManager = {
    // Cihazın donanım desteği var mı?
    checkHardware: async (): Promise<boolean> => {
        return await LocalAuthentication.hasHardwareAsync();
    },

    // Biyometrik kayıt var mı?
    checkEnrollment: async (): Promise<boolean> => {
        return await LocalAuthentication.isEnrolledAsync();
    },

    // Kimlik doğrulama iste
    authenticate: async (): Promise<boolean> => {
        try {
            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'LMS Giriş',
                fallbackLabel: 'Şifre Kullan',
                cancelLabel: 'İptal'
            });
            return result.success;
        } catch (e) {
            console.warn("Biometric auth failed", e);
            return false;
        }
    },

    saveCredentials: async (username: string, pass: string) => {
        if (await LocalAuthentication.isEnrolledAsync()) {
            await SecureStore.setItemAsync('lms_user', username);
            await SecureStore.setItemAsync('lms_pass', pass);
        }
    },

    getCredentials: async () => {
        const username = await SecureStore.getItemAsync('lms_user');
        const password = await SecureStore.getItemAsync('lms_pass');
        if (username && password) {
            return { username, password };
        }
        return null;
    }
};

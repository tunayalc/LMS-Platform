import React, { useCallback, useEffect, useState } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { AuthStackParamList } from './types';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import TwoFactorScreen from '../screens/TwoFactorScreen';
import KvkkScreen from '../screens/KvkkScreen';
import { apiClient, apiBaseUrl } from '../api/client';
import { BiometricManager } from '../utils/biometric';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from './types';
import { Alert } from 'react-native';

const Stack = createStackNavigator<AuthStackParamList>();

interface AuthNavigatorProps {
    onLoginSuccess: (user: any, token: string) => void;
}

export default function AuthNavigator({ onLoginSuccess }: AuthNavigatorProps) {
    const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
    const [biometricAvailable, setBiometricAvailable] = useState(false);

    useEffect(() => {
        const checkBiometric = async () => {
            try {
                const hasHardware = await BiometricManager.checkHardware();
                const enrolled = await BiometricManager.checkEnrollment();
                setBiometricAvailable(Boolean(hasHardware && enrolled));
            } catch (_e) {
                setBiometricAvailable(false);
            }
        };
        checkBiometric();
    }, []);

    const handleLogin = useCallback(async (username: string, password: string) => {
        const response = await apiClient.post('/auth/login', { username, password }) as any;
        const data = response;

        if (data.requires2FA) {
            return { requires2FA: true, tempToken: data.tempToken };
        }

        await BiometricManager.saveCredentials(username, password);
        onLoginSuccess(data.user, data.accessToken || data.token);
        return {};
    }, [onLoginSuccess]);

    const handleBiometricLogin = useCallback(async () => {
        const ok = await BiometricManager.authenticate();
        if (!ok) {
            return;
        }

        const creds = await BiometricManager.getCredentials();
        if (!creds) {
            Alert.alert('Biyometrik Giri\u015F', 'Kaydedilmi\u015F giri\u015F bilgisi bulunamad\u0131. \u00D6nce normal giri\u015F yap\u0131n.');
            return;
        }

        const result = await handleLogin(creds.username, creds.password);
        if (result?.requires2FA) {
            Alert.alert('Biyometrik Giri\u015F', 'Bu hesap i\u00E7in 2FA gerekli. L\u00FCtfen normal giri\u015F yap\u0131n.');
        }
    }, [handleLogin]);

    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Login">
                {(props) => (
                    <LoginScreen
                        apiBaseUrl={apiBaseUrl}
                        onLogin={handleLogin}
                        onVerify2FA={async (code, tempToken) => {
                            // Handled in TwoFactor screen strictly, but LoginScreen handles inline 2FA too?
                            // LoginScreen has onVerify2FA prop.
                            const response = await apiClient.post('/auth/2fa/verify', { code, tempToken }) as any;
                            const data = response;
                            onLoginSuccess(data.user, data.accessToken || data.token);
                        }}
                        onBiometricLogin={handleBiometricLogin}
                        biometricAvailable={biometricAvailable}
                        onNavigateRegister={() => props.navigation.navigate('Register')}
                        onNavigateForgotPassword={() => props.navigation.navigate('ForgotPassword')}
                        onNavigateKvkk={() => props.navigation.navigate('Kvkk')}
                        loading={false}
                    />
                )}
            </Stack.Screen>

            <Stack.Screen name="Register">
                {(props) => (
                    <RegisterScreen
                        onRegister={async (data) => {
                            await apiClient.post('/auth/register', data);
                            // navigate back to login or auto login?
                            // Typically back to login with success message
                            props.navigation.navigate('Login');
                        }}
                        onBack={() => props.navigation.goBack()}
                        onGoToLogin={() => props.navigation.navigate('Login')}
                        onGoToKvkk={() => props.navigation.navigate('Kvkk')}
                    />
                )}
            </Stack.Screen>

            <Stack.Screen name="ForgotPassword">
                {(props) => (
                    <ForgotPasswordScreen
                        onSubmit={async (email) => {
                            await apiClient.post('/auth/forgot-password', { email });
                        }}
                        onBack={() => props.navigation.goBack()}
                        onGoToLogin={() => props.navigation.navigate('Login')}
                    />
                )}
            </Stack.Screen>

            <Stack.Screen name="Kvkk">
                {(props) => (
                    <KvkkScreen
                        onBack={() => props.navigation.goBack()}
                    />
                )}
            </Stack.Screen>

            {/* TwoFactor might be navigated to from Login internally or as a separate screen? 
          LoginScreen handles it inline with state usually. 
          But if we want a separate screen:
      */}
        </Stack.Navigator>
    );
}

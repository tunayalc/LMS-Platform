import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Linking,
    Platform,
    KeyboardAvoidingView,
    ScrollView
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import ScreenLayout from '../components/ui/ScreenLayout';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Ionicons } from '@expo/vector-icons';
import ThemeToggle from '../components/ThemeToggle';
import LanguageSwitcher from '../components/LanguageSwitcher';

interface LoginScreenProps {
    apiBaseUrl: string;
    onLogin: (username: string, password: string) => Promise<{ requires2FA?: boolean; tempToken?: string }>;
    onVerify2FA: (code: string, tempToken: string) => Promise<void>;
    onBiometricLogin?: () => Promise<void>;
    biometricAvailable?: boolean;
    loading?: boolean;
    error?: string | null;
    onNavigateRegister: () => void;
    onNavigateForgotPassword: () => void;
    onNavigateKvkk: () => void;
}

export default function LoginScreen({
    apiBaseUrl,
    onLogin,
    onVerify2FA,
    onBiometricLogin,
    biometricAvailable = false,
    loading = false,
    error = null,
    onNavigateRegister,
    onNavigateForgotPassword,
    onNavigateKvkk
}: LoginScreenProps) {
    const { t } = useTranslation();
    const { colors } = useTheme();

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [requires2FA, setRequires2FA] = useState(false);
    const [tempToken, setTempToken] = useState<string | null>(null);
    const [twoFactorCode, setTwoFactorCode] = useState('');
    const [localLoading, setLocalLoading] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);

    const isLoading = loading || localLoading;
    const displayError = error || localError;

    const handleSubmit = async () => {
        setLocalError(null);
        if (!username.trim() || !password.trim()) {
            setLocalError(t('username_password_required'));
            return;
        }
        setLocalLoading(true);
        try {
            const result = await onLogin(username, password);
            if (result?.requires2FA && result?.tempToken) {
                setRequires2FA(true);
                setTempToken(result.tempToken);
            }
        } catch (err: any) {
            const errorKey = err?.response?.data?.error || err?.message || 'login_failed';
            setLocalError(t(errorKey) || errorKey);
        } finally {
            setLocalLoading(false);
        }
    };

    const handle2FAVerify = async () => {
        setLocalError(null);
        if (!twoFactorCode.trim() || twoFactorCode.length !== 6) {
            setLocalError(t('2fa_code_required'));
            return;
        }
        if (!tempToken) {
            setLocalError(t('session_expired'));
            setRequires2FA(false);
            return;
        }
        setLocalLoading(true);
        try {
            await onVerify2FA(twoFactorCode, tempToken);
        } catch (err: any) {
            const errorKey = err?.response?.data?.error || err?.message || '2fa_failed';
            if (errorKey === 'invalid_or_expired_token') {
                setRequires2FA(false);
                setTempToken(null);
                setTwoFactorCode('');
            }
            setLocalError(t(errorKey) || errorKey);
        } finally {
            setLocalLoading(false);
        }
    };

    const handleGuestLogin = () => {
        setUsername('guest');
        setPassword('Guest123!');
    };

    const handleGoogleLogin = () => Linking.openURL(`${apiBaseUrl}/auth/google`);
    const handleMicrosoftLogin = () => Linking.openURL(`${apiBaseUrl}/auth/microsoft`);

    const cancel2FA = () => {
        setRequires2FA(false);
        setTempToken(null);
        setTwoFactorCode('');
        setLocalError(null);
    };

    return (
        <ScreenLayout>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                    {/* Top Actions */}
                    <View style={styles.headerActions}>
                        <ThemeToggle />
                        <LanguageSwitcher compact />
                    </View>

                    {/* Logo Area */}
                    <View style={styles.logoContainer}>
                        <View style={[styles.logoCircle, { backgroundColor: colors.primary + '20' }]}>
                            <Text style={styles.logoEmoji}>🎓</Text>
                        </View>
                        <Text style={[styles.appName, { color: colors.text }]}>LMS Mobile</Text>
                        <Text style={[styles.appSubtitle, { color: colors.textSecondary }]}>{t('subtitle')}</Text>
                    </View>

                    {/* Main Card */}
                    <Card style={styles.authCard}>
                        {requires2FA ? (
                            <View>
                                <View style={styles.centerHeader}>
                                    <View style={[styles.iconBadge, { backgroundColor: colors.primary + '15' }]}>
                                        <Ionicons name="shield-checkmark" size={32} color={colors.primary} />
                                    </View>
                                    <Text style={[styles.cardTitle, { color: colors.text }]}>{t('mobile_2fa_title')}</Text>
                                    <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>{t('mobile_enter_code')}</Text>
                                </View>

                                <Input
                                    label={t('verification_code')}
                                    placeholder="000000"
                                    value={twoFactorCode}
                                    onChangeText={(t) => setTwoFactorCode(t.replace(/\D/g, '').slice(0, 6))}
                                    keyboardType="number-pad"
                                    maxLength={6}
                                    style={{ textAlign: 'center', letterSpacing: 8, fontSize: 20, fontWeight: '700' }}
                                />

                                {displayError && <Text style={[styles.errorText, { color: colors.error }]}>{displayError}</Text>}

                                <Button
                                    label={t('verify')}
                                    onPress={handle2FAVerify}
                                    loading={isLoading}
                                    disabled={twoFactorCode.length !== 6}
                                    style={styles.marginTop}
                                />
                                <Button
                                    label={t('cancel')}
                                    variant="ghost"
                                    onPress={cancel2FA}
                                    style={styles.marginTopSmall}
                                />
                            </View>
                        ) : (
                            <View>
                                <Input
                                    label={t('username_label')}
                                    placeholder={t('username_placeholder') || 'Username'}
                                    value={username}
                                    onChangeText={setUsername}
                                    autoCapitalize="none"
                                    icon="person-outline"
                                />
                                <Input
                                    label={t('password_label')}
                                    placeholder={t('password_placeholder') || 'Password'}
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry={!showPassword}
                                    icon="lock-closed-outline"
                                    rightIcon={showPassword ? "eye-off-outline" : "eye-outline"}
                                    onRightIconPress={() => setShowPassword(!showPassword)}
                                />

                                <TouchableOpacity style={styles.forgotPassContainer} onPress={onNavigateForgotPassword}>
                                    <Text style={[styles.forgotPassText, { color: colors.primary }]}>{t('forgot_password')}</Text>
                                </TouchableOpacity>

                                {displayError && <Text style={[styles.errorText, { color: colors.error }]}>{displayError}</Text>}

                                <Button
                                    label={t('login_button')}
                                    onPress={handleSubmit}
                                    loading={isLoading}
                                    style={styles.marginTop}
                                />

                                {biometricAvailable && onBiometricLogin && (
                                    <Button
                                        label={t('biometric_login') || 'Biyometrik Giriş'}
                                        variant="outline"
                                        onPress={onBiometricLogin}
                                        icon="lock"
                                        disabled={isLoading}
                                        style={styles.marginTopSmall}
                                    />
                                )}

                                <View style={styles.dividerContainer}>
                                    <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                                    <Text style={[styles.dividerText, { color: colors.textSecondary }]}>{t('or_divider')}</Text>
                                    <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                                </View>

                                <View style={styles.socialRow}>
                                    <TouchableOpacity style={[styles.socialBtn, { backgroundColor: '#DB4437' }]} onPress={handleGoogleLogin}>
                                        <Ionicons name="logo-google" size={20} color="#fff" />
                                        <Text style={styles.socialBtnText}>Google</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.socialBtn, { backgroundColor: '#0078d4' }]} onPress={handleMicrosoftLogin}>
                                        <Ionicons name="logo-microsoft" size={20} color="#fff" />
                                        <Text style={styles.socialBtnText}>Microsoft</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                    </Card>

                    {!requires2FA && (
                        <View style={styles.footer}>
                            <View style={styles.registerRow}>
                                <Text style={{ color: colors.textSecondary }}>{t('no_account')} </Text>
                                <TouchableOpacity onPress={onNavigateRegister}>
                                    <Text style={[styles.registerLink, { color: colors.primary }]}>{t('register_new')}</Text>
                                </TouchableOpacity>
                            </View>

                            <TouchableOpacity onPress={handleGuestLogin} style={styles.guestButton}>
                                <Text style={[styles.guestText, { color: colors.textSecondary }]}>{t('guest_login')}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity onPress={onNavigateKvkk} style={styles.kvkkButton}>
                                <Text style={[styles.kvkkText, { color: colors.textSecondary }]}>{t('kvkk_link')}</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </ScreenLayout>
    );
}

const styles = StyleSheet.create({
    scrollContent: {
        padding: 24,
        flexGrow: 1,
        justifyContent: 'center',
    },
    headerActions: {
        position: 'absolute',
        top: 60,
        right: 24,
        flexDirection: 'row',
        gap: 12,
        zIndex: 10,
    },
    logoContainer: {
        alignItems: 'center',
        marginBottom: 32,
        marginTop: 40,
    },
    logoCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    logoEmoji: {
        fontSize: 40,
    },
    appName: {
        fontSize: 28,
        fontWeight: '800',
        marginBottom: 4,
    },
    appSubtitle: {
        fontSize: 16,
    },
    authCard: {
        marginBottom: 24,
    },
    centerHeader: {
        alignItems: 'center',
        marginBottom: 24,
    },
    iconBadge: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    cardTitle: {
        fontSize: 20,
        fontWeight: '700',
        marginBottom: 4,
    },
    cardSubtitle: {
        fontSize: 14,
        textAlign: 'center',
    },
    forgotPassContainer: {
        alignSelf: 'flex-end',
        marginBottom: 24,
    },
    forgotPassText: {
        fontSize: 14,
        fontWeight: '600',
    },
    errorText: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 16,
    },
    marginTop: {
        marginTop: 8,
    },
    marginTopSmall: {
        marginTop: 12,
    },
    dividerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 24,
    },
    dividerLine: {
        flex: 1,
        height: 1,
    },
    dividerText: {
        paddingHorizontal: 12,
        fontSize: 14,
    },
    socialRow: {
        flexDirection: 'row',
        gap: 12,
    },
    socialBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 48,
        borderRadius: 12,
        gap: 8,
    },
    socialBtnText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 15,
    },
    footer: {
        alignItems: 'center',
        gap: 16,
    },
    registerRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    registerLink: {
        fontWeight: '700',
    },
    guestButton: {
        padding: 8,
    },
    guestText: {
        textDecorationLine: 'underline',
        fontSize: 14,
    },
    kvkkButton: {
        marginTop: 8,
    },
    kvkkText: {
        fontSize: 12,
    },
});


import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    Alert
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import ScreenLayout from '../components/ui/ScreenLayout';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Ionicons } from '@expo/vector-icons';

interface RegisterScreenProps {
    onRegister: (data: { username: string; fullName: string; email: string; password: string }) => Promise<void>;
    onBack: () => void;
    onGoToLogin: () => void;
    onGoToKvkk: () => void;
}

export default function RegisterScreen({
    onRegister,
    onBack,
    onGoToLogin,
    onGoToKvkk
}: RegisterScreenProps) {
    const { t } = useTranslation();
    const { colors } = useTheme();

    const [username, setUsername] = useState('');
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const validateForm = () => {
        const newErrors: Record<string, string> = {};

        if (!username.trim()) {
            newErrors.username = t('username_required') || 'Kullanıcı adı gerekli';
        } else if (username.length < 3) {
            newErrors.username = t('username_min_length') || 'En az 3 karakter olmalı';
        }

        if (!email.trim()) {
            newErrors.email = t('email_required') || 'E-posta gerekli';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            newErrors.email = t('email_invalid') || 'Geçerli bir e-posta girin';
        }

        if (!password) {
            newErrors.password = t('password_required') || 'Şifre gerekli';
        } else if (password.length < 8) {
            newErrors.password = t('password_min_length') || 'En az 8 karakter olmalı';
        }

        if (password !== confirmPassword) {
            newErrors.confirmPassword = t('passwords_not_match') || 'Şifreler eşleşmiyor';
        }

        if (!acceptedTerms) {
            newErrors.terms = t('accept_terms_required') || 'Kullanım koşullarını kabul etmelisiniz';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const getPasswordStrength = () => {
        if (!password) return { level: 0, label: '', color: colors.textSecondary };

        let score = 0;
        if (password.length >= 8) score++;
        if (password.length >= 12) score++;
        if (/[A-Z]/.test(password)) score++;
        if (/[a-z]/.test(password)) score++;
        if (/[0-9]/.test(password)) score++;
        if (/[^A-Za-z0-9]/.test(password)) score++;

        if (score <= 2) return { level: 1, label: t('weak') || 'Zayıf', color: colors.error };
        if (score <= 4) return { level: 2, label: t('medium') || 'Orta', color: colors.warning };
        return { level: 3, label: t('strong') || 'Güçlü', color: colors.success };
    };

    const handleRegister = async () => {
        if (!validateForm()) return;

        setLoading(true);
        try {
            await onRegister({ username, fullName, email, password });
        } catch (err: any) {
            Alert.alert(
                t('error') || 'Hata',
                err.message || t('register_failed') || 'Kayıt başarısız'
            );
        } finally {
            setLoading(false);
        }
    };

    const strength = getPasswordStrength();

    return (
        <ScreenLayout>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={onBack} style={[styles.backButton, { backgroundColor: colors.border }]}>
                            <Ionicons name="arrow-back" size={24} color={colors.text} />
                        </TouchableOpacity>
                        <View style={styles.headerTextContainer}>
                            <Text style={[styles.title, { color: colors.text }]}>{t('register') || 'Kayıt Ol'}</Text>
                            <Text style={{ color: colors.textSecondary }}>{t('register_subtitle') || 'Yeni hesap oluşturun'}</Text>
                        </View>
                    </View>

                    <Card style={styles.card}>
                        <Input
                            label={t('username') || 'Kullanıcı Adı'}
                            placeholder={t('username_placeholder') || 'kullanici_adi'}
                            value={username}
                            onChangeText={setUsername}
                            autoCapitalize="none"
                            error={errors.username}
                            icon="person-outline"
                        />

                        <Input
                            label={t('fullname') || 'Ad Soyad'}
                            placeholder={t('fullname_placeholder') || 'Ad Soyad'}
                            value={fullName}
                            onChangeText={setFullName}
                            autoCapitalize="words"
                            error={errors.fullName}
                            icon="person-circle-outline"
                        />

                        <Input
                            label={t('email') || 'E-posta'}
                            placeholder="ornek@email.com"
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            error={errors.email}
                            icon="mail-outline"
                        />

                        <Input
                            label={t('password') || 'Şifre'}
                            placeholder="••••••••"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry={!showPassword}
                            error={errors.password}
                            icon="lock-closed-outline"
                            rightIcon={showPassword ? "eye-off-outline" : "eye-outline"}
                            onRightIconPress={() => setShowPassword(!showPassword)}
                        />

                        {/* Password Strength */}
                        {password.length > 0 && (
                            <View style={styles.strengthContainer}>
                                <View style={styles.strengthBars}>
                                    {[1, 2, 3].map((level) => (
                                        <View
                                            key={level}
                                            style={[
                                                styles.strengthBar,
                                                {
                                                    backgroundColor: level <= strength.level
                                                        ? strength.color
                                                        : colors.border
                                                }
                                            ]}
                                        />
                                    ))}
                                </View>
                                <Text style={[styles.strengthLabel, { color: strength.color }]}>
                                    {strength.label}
                                </Text>
                            </View>
                        )}

                        <Input
                            label={t('confirm_password') || 'Şifre Tekrar'}
                            placeholder="••••••••"
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            secureTextEntry={!showConfirmPassword}
                            error={errors.confirmPassword}
                            icon="lock-closed-outline"
                            rightIcon={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                            onRightIconPress={() => setShowConfirmPassword(!showConfirmPassword)}
                        />

                        {/* Terms Checkbox */}
                        <TouchableOpacity
                            style={styles.termsRow}
                            onPress={() => setAcceptedTerms(!acceptedTerms)}
                        >
                            <View style={[
                                styles.checkbox,
                                { borderColor: errors.terms ? colors.error : colors.border },
                                acceptedTerms && { backgroundColor: colors.primary, borderColor: colors.primary }
                            ]}>
                                {acceptedTerms && <Ionicons name="checkmark" size={16} color="#fff" />}
                            </View>
                            <Text style={[styles.termsText, { color: colors.textSecondary }]}>
                                <Text onPress={onGoToKvkk} style={{ color: colors.primary, fontWeight: '600' }}>
                                    {t('kvkk_link') || 'KVKK Aydınlatma Metni'}
                                </Text>
                                {t('terms_suffix') || "'ni okudum ve kabul ediyorum"}
                            </Text>
                        </TouchableOpacity>

                        {errors.terms && (
                            <Text style={[styles.errorText, { color: colors.error }]}>{errors.terms}</Text>
                        )}

                        <Button
                            label={t('register') || 'Kayıt Ol'}
                            onPress={handleRegister}
                            loading={loading}
                            style={styles.marginTop}
                        />
                    </Card>

                    <View style={styles.footer}>
                        <Text style={{ color: colors.textSecondary }}>{t('already_have_account') || 'Zaten hesabınız var mı?'} </Text>
                        <TouchableOpacity onPress={onGoToLogin}>
                            <Text style={[styles.loginLink, { color: colors.primary }]}>{t('login') || 'Giriş Yap'}</Text>
                        </TouchableOpacity>
                    </View>

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
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 32,
        marginTop: 20,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    headerTextContainer: {
        flex: 1,
    },
    title: {
        fontSize: 24,
        fontWeight: '800',
        marginBottom: 4,
    },
    card: {
        padding: 24,
    },
    strengthContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        marginTop: -8,
        paddingLeft: 4,
    },
    strengthBars: {
        flexDirection: 'row',
        flex: 1,
        gap: 4,
    },
    strengthBar: {
        flex: 1,
        height: 4,
        borderRadius: 2,
    },
    strengthLabel: {
        fontSize: 12,
        fontWeight: '600',
        marginLeft: 12,
    },
    termsRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 16,
        marginTop: 8,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderWidth: 2,
        borderRadius: 8,
        marginRight: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    termsText: {
        flex: 1,
        fontSize: 13,
        lineHeight: 20,
    },
    errorText: {
        fontSize: 12,
        marginTop: -8,
        marginBottom: 16,
        marginLeft: 4,
    },
    marginTop: {
        marginTop: 8,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 24,
        alignItems: 'center',
    },
    loginLink: {
        fontWeight: '700',
    },
});


import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Alert
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';

interface ForgotPasswordScreenProps {
    onSubmit: (email: string) => Promise<void>;
    onBack: () => void;
    onGoToLogin: () => void;
}

export default function ForgotPasswordScreen({
    onSubmit,
    onBack,
    onGoToLogin
}: ForgotPasswordScreenProps) {
    const { t } = useTranslation();
    const { colors } = useTheme();

    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState('');

    const validateEmail = () => {
        if (!email.trim()) {
            setError(t('email_required') || 'E-posta gerekli');
            return false;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setError(t('email_invalid') || 'Geçerli bir e-posta girin');
            return false;
        }
        setError('');
        return true;
    };

    const handleSubmit = async () => {
        if (!validateEmail()) return;

        setLoading(true);
        try {
            await onSubmit(email);
            setSent(true);
        } catch (err: any) {
            Alert.alert(
                t('error') || 'Hata',
                err.message || t('reset_failed') || 'İstek başarısız'
            );
        } finally {
            setLoading(false);
        }
    };

    const themedStyles = {
        container: { backgroundColor: colors.background },
        card: { backgroundColor: colors.card },
        title: { color: colors.text },
        text: { color: colors.textSecondary },
        input: {
            backgroundColor: colors.inputBackground,
            borderColor: error ? colors.error : colors.border,
            color: colors.text,
        },
        error: { color: colors.error },
        button: { backgroundColor: colors.primary },
        buttonDisabled: { backgroundColor: colors.disabled },
        link: { color: colors.primary },
        successCard: {
            backgroundColor: colors.success + '15',
            borderColor: colors.success,
        },
        successText: { color: colors.success },
    };

    if (sent) {
        return (
            <View style={[styles.container, themedStyles.container]}>
                <View style={[styles.card, themedStyles.card]}>
                    <Text style={styles.icon}>✉️</Text>
                    <Text style={[styles.title, themedStyles.title]}>
                        {t('email_sent') || 'E-posta Gönderildi!'}
                    </Text>
                    <Text style={[styles.subtitle, themedStyles.text]}>
                        {t('reset_email_message') || `Şifre sıfırlama bağlantısı ${email} adresine gönderildi. Lütfen gelen kutunuzu kontrol edin.`}
                    </Text>

                    <View style={[styles.successCard, themedStyles.successCard]}>
                        <Text style={[styles.successText, themedStyles.successText]}>
                            💡 {t('check_spam') || 'E-postayı göremiyorsanız spam/gereksiz klasörünü kontrol edin.'}
                        </Text>
                    </View>

                    <TouchableOpacity
                        style={[styles.submitButton, themedStyles.button]}
                        onPress={onGoToLogin}
                    >
                        <Text style={styles.submitButtonText}>
                            {t('back_to_login') || 'Giriş Sayfasına Dön'}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.resendButton}
                        onPress={() => setSent(false)}
                    >
                        <Text style={[styles.resendText, themedStyles.link]}>
                            {t('resend_email') || 'Tekrar Gönder'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={[styles.container, themedStyles.container]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <View style={[styles.card, themedStyles.card]}>
                {/* Back Button */}
                <TouchableOpacity onPress={onBack} style={styles.backButton}>
                    <Text style={[styles.backButtonText, themedStyles.link]}>
                        ← {t('back') || 'Geri'}
                    </Text>
                </TouchableOpacity>

                {/* Header */}
                <Text style={styles.icon}>🔑</Text>
                <Text style={[styles.title, themedStyles.title]}>
                    {t('forgot_password') || 'Şifremi Unuttum'}
                </Text>
                <Text style={[styles.subtitle, themedStyles.text]}>
                    {t('forgot_password_subtitle') || 'E-posta adresinizi girin, size şifre sıfırlama bağlantısı gönderelim.'}
                </Text>

                {/* Email Input */}
                <View style={styles.inputGroup}>
                    <Text style={[styles.label, themedStyles.text]}>
                        {t('email') || 'E-posta'}
                    </Text>
                    <TextInput
                        style={[styles.input, themedStyles.input]}
                        value={email}
                        onChangeText={(text) => {
                            setEmail(text);
                            setError('');
                        }}
                        placeholder="ornek@email.com"
                        placeholderTextColor={colors.textSecondary}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoFocus
                    />
                    {error ? (
                        <Text style={[styles.errorText, themedStyles.error]}>{error}</Text>
                    ) : null}
                </View>

                {/* Submit Button */}
                <TouchableOpacity
                    style={[
                        styles.submitButton,
                        loading ? themedStyles.buttonDisabled : themedStyles.button
                    ]}
                    onPress={handleSubmit}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.submitButtonText}>
                            {t('send_reset_link') || 'Sıfırlama Bağlantısı Gönder'}
                        </Text>
                    )}
                </TouchableOpacity>

                {/* Back to Login */}
                <TouchableOpacity style={styles.loginButton} onPress={onGoToLogin}>
                    <Text style={[styles.loginText, themedStyles.text]}>
                        {t('remember_password') || 'Şifrenizi hatırladınız mı?'}
                        <Text style={themedStyles.link}> {t('login') || 'Giriş Yap'}</Text>
                    </Text>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        padding: 20,
    },
    card: {
        borderRadius: 16,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 5,
    },
    backButton: {
        marginBottom: 16,
    },
    backButtonText: {
        fontSize: 16,
        fontWeight: '600',
    },
    icon: {
        fontSize: 48,
        textAlign: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 20,
    },
    inputGroup: {
        marginBottom: 16,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 6,
    },
    input: {
        height: 48,
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 16,
        fontSize: 16,
    },
    errorText: {
        fontSize: 12,
        marginTop: 4,
    },
    submitButton: {
        height: 52,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 8,
    },
    submitButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    loginButton: {
        marginTop: 20,
        alignItems: 'center',
    },
    loginText: {
        fontSize: 14,
    },
    successCard: {
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 24,
    },
    successText: {
        fontSize: 14,
        lineHeight: 20,
    },
    resendButton: {
        marginTop: 16,
        alignItems: 'center',
    },
    resendText: {
        fontSize: 14,
        fontWeight: '600',
    },
});

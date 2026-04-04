import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Alert
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';

interface TwoFactorScreenProps {
    tempToken: string;
    onVerify: (code: string, tempToken: string) => Promise<void>;
    onCancel: () => void;
    onUseBackupCode?: () => void;
}

export default function TwoFactorScreen({
    tempToken,
    onVerify,
    onCancel,
    onUseBackupCode
}: TwoFactorScreenProps) {
    const { t } = useTranslation();
    const { colors } = useTheme();

    const [code, setCode] = useState(['', '', '', '', '', '']);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [countdown, setCountdown] = useState(300); // 5 minutes

    const inputRefs = useRef<(TextInput | null)[]>([]);

    // Countdown timer
    useEffect(() => {
        const timer = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleCodeChange = (value: string, index: number) => {
        if (value.length > 1) {
            // Handle paste
            const digits = value.replace(/\D/g, '').slice(0, 6).split('');
            const newCode = [...code];
            digits.forEach((digit, i) => {
                if (index + i < 6) {
                    newCode[index + i] = digit;
                }
            });
            setCode(newCode);
            const nextIndex = Math.min(index + digits.length, 5);
            inputRefs.current[nextIndex]?.focus();
        } else {
            const newCode = [...code];
            newCode[index] = value.replace(/\D/g, '');
            setCode(newCode);

            if (value && index < 5) {
                inputRefs.current[index + 1]?.focus();
            }
        }
        setError('');
    };

    const handleKeyPress = (e: any, index: number) => {
        if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    const handleVerify = async () => {
        const fullCode = code.join('');
        if (fullCode.length !== 6) {
            setError(t('2fa_code_required') || '6 haneli kodu girin');
            return;
        }

        if (countdown === 0) {
            setError(t('2fa_expired') || 'Süre doldu, tekrar giriş yapın');
            return;
        }

        setLoading(true);
        setError('');

        try {
            await onVerify(fullCode, tempToken);
        } catch (err: any) {
            setError(err.message || t('2fa_invalid') || 'Geçersiz kod');
            setCode(['', '', '', '', '', '']);
            inputRefs.current[0]?.focus();
        } finally {
            setLoading(false);
        }
    };

    const themedStyles = {
        container: {
            backgroundColor: colors.background,
        },
        card: {
            backgroundColor: colors.card,
            shadowColor: colors.text,
        },
        title: {
            color: colors.text,
        },
        subtitle: {
            color: colors.textSecondary,
        },
        input: {
            backgroundColor: colors.inputBackground,
            borderColor: error ? colors.error : colors.border,
            color: colors.text,
        },
        timer: {
            color: countdown < 60 ? colors.error : colors.success,
        },
        error: {
            color: colors.error,
        },
        button: {
            backgroundColor: colors.primary,
        },
        buttonDisabled: {
            backgroundColor: colors.disabled,
        },
        cancelButton: {
            borderColor: colors.border,
        },
        cancelText: {
            color: colors.textSecondary,
        },
        linkText: {
            color: colors.primary,
        }
    };

    return (
        <KeyboardAvoidingView
            style={[styles.container, themedStyles.container]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <View style={[styles.card, themedStyles.card]}>
                {/* Icon */}
                <View style={styles.iconContainer}>
                    <Text style={styles.icon}>🔐</Text>
                </View>

                {/* Title */}
                <Text style={[styles.title, themedStyles.title]}>
                    {t('2fa_title') || 'İki Faktörlü Doğrulama'}
                </Text>

                <Text style={[styles.subtitle, themedStyles.subtitle]}>
                    {t('2fa_subtitle') || 'Authenticator uygulamanızdaki 6 haneli kodu girin'}
                </Text>

                {/* Timer */}
                <View style={styles.timerContainer}>
                    <Text style={[styles.timerLabel, themedStyles.subtitle]}>
                        {t('time_remaining') || 'Kalan süre'}:
                    </Text>
                    <Text style={[styles.timerValue, themedStyles.timer]}>
                        {formatTime(countdown)}
                    </Text>
                </View>

                {/* Code Input */}
                <View style={styles.codeContainer}>
                    {code.map((digit, index) => (
                        <TextInput
                            key={index}
                            ref={(ref) => { inputRefs.current[index] = ref; }}
                            style={[styles.codeInput, themedStyles.input]}
                            value={digit}
                            onChangeText={(value) => handleCodeChange(value, index)}
                            onKeyPress={(e) => handleKeyPress(e, index)}
                            keyboardType="number-pad"
                            maxLength={6}
                            selectTextOnFocus
                            autoFocus={index === 0}
                        />
                    ))}
                </View>

                {/* Error */}
                {error ? (
                    <Text style={[styles.errorText, themedStyles.error]}>{error}</Text>
                ) : null}

                {/* Verify Button */}
                <TouchableOpacity
                    style={[
                        styles.verifyButton,
                        loading || countdown === 0 ? themedStyles.buttonDisabled : themedStyles.button
                    ]}
                    onPress={handleVerify}
                    disabled={loading || countdown === 0}
                >
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.verifyButtonText}>
                            {t('verify') || 'Doğrula'}
                        </Text>
                    )}
                </TouchableOpacity>

                {/* Backup Code Link */}
                {onUseBackupCode && (
                    <TouchableOpacity style={styles.linkButton} onPress={onUseBackupCode}>
                        <Text style={[styles.linkText, themedStyles.linkText]}>
                            {t('use_backup_code') || 'Yedek kod kullan'}
                        </Text>
                    </TouchableOpacity>
                )}

                {/* Cancel Button */}
                <TouchableOpacity
                    style={[styles.cancelButton, themedStyles.cancelButton]}
                    onPress={onCancel}
                >
                    <Text style={[styles.cancelText, themedStyles.cancelText]}>
                        {t('cancel') || 'İptal'}
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
        alignItems: 'center',
        padding: 20,
    },
    card: {
        width: '100%',
        maxWidth: 400,
        borderRadius: 16,
        padding: 24,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 5,
    },
    iconContainer: {
        alignItems: 'center',
        marginBottom: 16,
    },
    icon: {
        fontSize: 48,
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
        marginBottom: 20,
        lineHeight: 20,
    },
    timerContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
        gap: 8,
    },
    timerLabel: {
        fontSize: 14,
    },
    timerValue: {
        fontSize: 18,
        fontWeight: '700',
        fontVariant: ['tabular-nums'],
    },
    codeContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 16,
    },
    codeInput: {
        width: 48,
        height: 56,
        borderWidth: 2,
        borderRadius: 12,
        fontSize: 24,
        fontWeight: '700',
        textAlign: 'center',
    },
    errorText: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 16,
    },
    verifyButton: {
        height: 52,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    verifyButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    linkButton: {
        alignItems: 'center',
        marginBottom: 12,
        padding: 8,
    },
    linkText: {
        fontSize: 14,
        fontWeight: '600',
    },
    cancelButton: {
        height: 48,
        borderRadius: 12,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cancelText: {
        fontSize: 16,
        fontWeight: '600',
    },
});

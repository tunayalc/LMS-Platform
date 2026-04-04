import React, { useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
} from 'react-native';
import { Exam, Question } from '../shared';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';

interface ExamTakingScreenProps {
    exam: Exam;
    questions: Question[];
    token: string;
    apiBase: string;
    onComplete: (score: number, total: number) => void;
    onCancel: () => void;
}

export default function ExamTakingScreen({
    onCancel,
}: ExamTakingScreenProps) {
    const { colors, isDark } = useTheme();
    const { t } = useTranslation();
    const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

    return (
        <View style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.icon}>🛡️</Text>
                <Text style={styles.title}>{t('exam_mobile_blocked_title')}</Text>
                <Text style={styles.message}>
                    {t('exam_mobile_blocked_message')}
                </Text>
                <View style={styles.warningBox}>
                    <Text style={styles.warningText}>
                        {t('exam_mobile_blocked_hint')}
                    </Text>
                </View>

                <Pressable style={styles.button} onPress={onCancel}>
                    <Text style={styles.buttonText}>{t('back')}</Text>
                </Pressable>
            </View>
        </View>
    );
}

type ThemeColors = ReturnType<typeof useTheme>['colors'];

const createStyles = (colors: ThemeColors, isDark: boolean) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.background,
            justifyContent: 'center',
            padding: 20
        },
        content: {
            backgroundColor: colors.card,
            borderRadius: 20,
            padding: 30,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: isDark ? 0.35 : 0.1,
            shadowRadius: 10,
            elevation: 5
        },
        icon: {
            fontSize: 60,
            marginBottom: 20
        },
        title: {
            fontSize: 24,
            fontWeight: 'bold',
            color: colors.text,
            marginBottom: 16
        },
        message: {
            fontSize: 16,
            color: colors.textSecondary,
            textAlign: 'center',
            marginBottom: 24,
            lineHeight: 24
        },
        warningBox: {
            backgroundColor: isDark ? 'rgba(248, 113, 113, 0.18)' : 'rgba(220, 38, 38, 0.12)',
            borderColor: isDark ? 'rgba(248, 113, 113, 0.45)' : 'rgba(220, 38, 38, 0.25)',
            borderWidth: 1,
            padding: 16,
            borderRadius: 12,
            marginBottom: 30,
            width: '100%'
        },
        warningText: {
            color: colors.error,
            textAlign: 'center',
            fontSize: 15
        },
        button: {
            backgroundColor: colors.primary,
            paddingVertical: 16,
            paddingHorizontal: 32,
            borderRadius: 12,
            width: '100%'
        },
        buttonText: {
            color: colors.primaryText,
            fontWeight: 'bold',
            fontSize: 16,
            textAlign: 'center'
        }
    });

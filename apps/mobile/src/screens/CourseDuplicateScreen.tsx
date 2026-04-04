import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    TextInput,
    StyleSheet,
    ActivityIndicator,
    Alert
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';

interface CourseDuplicateScreenProps {
    apiClient: any;
    token: string;
    courseId: string;
    courseTitle: string;
    onBack: () => void;
    onSuccess?: (newCourse: any) => void;
}

export default function CourseDuplicateScreen({
    apiClient,
    token,
    courseId,
    courseTitle,
    onBack,
    onSuccess
}: CourseDuplicateScreenProps) {
    const { t } = useTranslation();
    const { colors } = useTheme();
    const [newTitle, setNewTitle] = useState(`${courseTitle} (${t('copy')})`);
    const [duplicating, setDuplicating] = useState(false);

    const handleDuplicate = async () => {
        if (!newTitle.trim()) {
            Alert.alert(t('error'), t('course_title_required'));
            return;
        }

        setDuplicating(true);
        try {
            const response = await apiClient.post(`/courses/${courseId}/duplicate`, {
                title: newTitle
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            Alert.alert(
                t('success'),
                t('course_duplicated_success', {
                    content: response.duplicatedContent || 0,
                    exams: response.duplicatedExams || 0
                }),
                [
                    {
                        text: t('ok'),
                        onPress: () => {
                            onSuccess?.(response.newCourse);
                            onBack();
                        }
                    }
                ]
            );
        } catch (error) {
            console.error('Duplicate error:', error);
            Alert.alert(t('error'), t('duplicate_failed'));
        } finally {
            setDuplicating(false);
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={onBack} style={styles.backButton}>
                    <Text style={{ color: colors.primary, fontSize: 16 }}>← {t('cancel')}</Text>
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors.text }]}>{t('duplicate_course')}</Text>
                <View style={{ width: 60 }} />
            </View>

            <View style={styles.content}>
                {/* Original Course Info */}
                <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{t('original_course')}</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>{courseTitle}</Text>
                </View>

                {/* New Title Input */}
                <View style={styles.field}>
                    <Text style={[styles.label, { color: colors.text }]}>{t('new_course_title')}</Text>
                    <TextInput
                        style={[styles.input, {
                            backgroundColor: colors.inputBackground,
                            borderColor: colors.border,
                            color: colors.text
                        }]}
                        placeholder={t('enter_new_title')}
                        placeholderTextColor={colors.textSecondary}
                        value={newTitle}
                        onChangeText={setNewTitle}
                    />
                </View>

                {/* What Will Be Copied */}
                <View style={[styles.helpCard, { backgroundColor: colors.primaryLight || '#f0f9ff' }]}>
                    <Text style={[styles.helpTitle, { color: colors.primary }]}>{t('what_will_be_copied')}</Text>
                    <Text style={[styles.helpItem, { color: colors.text }]}>• {t('all_content')}</Text>
                    <Text style={[styles.helpItem, { color: colors.text }]}>• {t('all_exams_questions')}</Text>
                    <Text style={[styles.helpItem, { color: colors.text }]}>• {t('course_settings')}</Text>
                </View>

                {/* Duplicate Button */}
                <TouchableOpacity
                    style={[styles.duplicateButton, { backgroundColor: colors.primary }]}
                    onPress={handleDuplicate}
                    disabled={duplicating}
                >
                    {duplicating ? (
                        <View style={styles.duplicatingRow}>
                            <ActivityIndicator size="small" color="#fff" />
                            <Text style={styles.duplicateButtonText}>{t('duplicating')}</Text>
                        </View>
                    ) : (
                        <Text style={styles.duplicateButtonText}>📋 {t('duplicate_course')}</Text>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    backButton: {
        width: 60,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
    },
    content: {
        padding: 16,
    },
    infoCard: {
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 20,
    },
    infoLabel: {
        fontSize: 12,
        marginBottom: 4,
    },
    infoValue: {
        fontSize: 17,
        fontWeight: '600',
    },
    field: {
        marginBottom: 20,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 8,
    },
    input: {
        height: 50,
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 16,
        fontSize: 16,
    },
    helpCard: {
        padding: 16,
        borderRadius: 12,
        marginBottom: 24,
    },
    helpTitle: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 10,
    },
    helpItem: {
        fontSize: 14,
        marginBottom: 4,
    },
    duplicateButton: {
        height: 54,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    duplicatingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    duplicateButtonText: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '600',
    },
});

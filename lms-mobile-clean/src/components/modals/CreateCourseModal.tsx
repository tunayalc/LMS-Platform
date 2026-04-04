import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Modal, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { apiClient } from '../../api/client';
import { useTheme } from '../../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';

interface CreateCourseModalProps {
    visible: boolean;
    onClose: () => void;
    token: string;
    onSuccess: (course: any) => void;
}

export default function CreateCourseModal({ visible, onClose, token, onSuccess }: CreateCourseModalProps) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);

    const { colors, isDark } = useTheme();
    const { t } = useTranslation();
    const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

    const handleCreate = async () => {
        if (!title.trim()) {
            Alert.alert(t('error'), t('course_title_required'));
            return;
        }

        setLoading(true);
        try {
            // Assuming existing backend structure: POST /courses
            const response = await apiClient.post<any>('/courses', {
                title,
                description: description || undefined
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            // API might return { course: ... } or just the course object
            const newCourse = response.course || response;

            Alert.alert(t('success'), t('course_created'));
            onSuccess(newCourse);
            onClose();
            setTitle('');
            setDescription('');
        } catch (error: any) {
            console.error(error);
            Alert.alert(t('error'), t('course_create_failed'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.card}>
                    <View style={styles.header}>
                        <Text style={styles.title}>{t('create_course')}</Text>
                        <Pressable onPress={onClose}><Text style={styles.closeText}>✕</Text></Pressable>
                    </View>

                    <View style={styles.form}>
                        <Text style={styles.label}>{t('course_title')}</Text>
                        <TextInput
                            style={styles.input}
                            value={title}
                            onChangeText={setTitle}
                            placeholder={t('course_title_placeholder')}
                            placeholderTextColor={colors.textSecondary}
                        />

                        <Text style={styles.label}>{t('description')}</Text>
                        <TextInput
                            style={[styles.input, styles.textArea]}
                            value={description}
                            onChangeText={setDescription}
                            multiline
                            numberOfLines={3}
                            placeholder={t('course_description_placeholder')}
                            placeholderTextColor={colors.textSecondary}
                        />

                        <Pressable style={styles.createButton} onPress={handleCreate} disabled={loading}>
                            {loading ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.createButtonText}>{t('create_course')}</Text>}
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

type ThemeColors = ReturnType<typeof useTheme>['colors'];

const createStyles = (colors: ThemeColors, isDark: boolean) =>
    StyleSheet.create({
        overlay: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            padding: 20
        },
        card: {
            backgroundColor: colors.card,
            borderRadius: 20,
            padding: 24,
            borderWidth: 1,
            borderColor: colors.border,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: isDark ? 0.35 : 0.25,
            shadowRadius: 6,
            elevation: 5
        },
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20
        },
        title: {
            fontSize: 20,
            fontWeight: 'bold',
            color: colors.text
        },
        closeText: {
            fontSize: 24,
            color: colors.textSecondary
        },
        form: {
            gap: 12
        },
        label: {
            fontSize: 14,
            fontWeight: '600',
            color: colors.textSecondary,
            marginBottom: 4
        },
        input: {
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            padding: 12,
            fontSize: 16,
            color: colors.text,
            backgroundColor: colors.surface
        },
        textArea: {
            minHeight: 80,
            textAlignVertical: 'top'
        },
        createButton: {
            backgroundColor: colors.primary,
            borderRadius: 12,
            padding: 16,
            alignItems: 'center',
            marginTop: 10
        },
        createButtonText: {
            color: colors.primaryText,
            fontWeight: 'bold',
            fontSize: 16
        }
    });

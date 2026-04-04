import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Modal, Pressable, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { apiClient } from '../../api/client';
import { useTheme } from '../../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';

interface CreateExamModalProps {
    visible: boolean;
    onClose: () => void;
    token: string;
    onSuccess: (exam: any) => void;
}

export default function CreateExamModal({ visible, onClose, token, onSuccess }: CreateExamModalProps) {
    const [courses, setCourses] = useState<any[]>([]);
    const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
    const [title, setTitle] = useState('');
    const [duration, setDuration] = useState('30');
    const [passThreshold, setPassThreshold] = useState('50');
    const [loading, setLoading] = useState(false);
    const [loadingCourses, setLoadingCourses] = useState(false);

    const { colors, isDark } = useTheme();
    const { t } = useTranslation();
    const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

    useEffect(() => {
        if (visible) {
            fetchCourses();
        }
    }, [visible]);

    const fetchCourses = async () => {
        setLoadingCourses(true);
        try {
            // Assuming instructor can only see their courses or all courses
            const response = await apiClient.get<any[]>('/courses', {
                headers: { Authorization: `Bearer ${token}` }
            });
            // Handle response structure (array or { courses: [] })
            const courseList = Array.isArray(response) ? response : (response as any).courses || [];
            setCourses(courseList);
        } catch (error) {
            console.error('Failed to fetch courses', error);
            Alert.alert(t('error'), t('courses_load_failed'));
        } finally {
            setLoadingCourses(false);
        }
    };

    const handleCreate = async () => {
        if (!selectedCourseId) {
            Alert.alert(t('error'), t('select_course_required'));
            return;
        }
        if (!title.trim()) {
            Alert.alert(t('error'), t('exam_title_required'));
            return;
        }

        setLoading(true);
        try {
            const response = await apiClient.post<any>('/exams', {
                courseId: selectedCourseId,
                title,
                durationMinutes: parseInt(duration) || 30,
                passThreshold: parseInt(passThreshold) || 50
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const newExam = response.exam || response;
            Alert.alert(t('success'), t('exam_created'));
            onSuccess(newExam);
            onClose();
            // Reset form
            setTitle('');
            setDuration('30');
            setSelectedCourseId(null);
        } catch (error: any) {
            console.error(error);
            Alert.alert(t('error'), t('exam_create_failed'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.card}>
                    <View style={styles.header}>
                        <Text style={styles.title}>{t('create_exam')}</Text>
                        <Pressable onPress={onClose}><Text style={styles.closeText}>✕</Text></Pressable>
                    </View>

                    <ScrollView style={styles.form}>
                        <Text style={styles.label}>{t('select_course')}</Text>
                        {loadingCourses ? (
                            <ActivityIndicator color={colors.textSecondary} />
                        ) : (
                            <ScrollView horizontal style={styles.courseScroll} showsHorizontalScrollIndicator={false}>
                                {courses.map(course => (
                                    <Pressable
                                        key={course.id}
                                        style={[styles.courseChip, selectedCourseId === course.id && styles.courseChipActive]}
                                        onPress={() => setSelectedCourseId(course.id)}
                                    >
                                        <Text style={[styles.courseChipText, selectedCourseId === course.id && styles.courseChipTextActive]}>
                                            {course.title}
                                        </Text>
                                    </Pressable>
                                ))}
                            </ScrollView>
                        )}

                        <Text style={styles.label}>{t('exam_title')}</Text>
                        <TextInput
                            style={styles.input}
                            value={title}
                            onChangeText={setTitle}
                            placeholder={t('exam_title_placeholder')}
                            placeholderTextColor={colors.textSecondary}
                        />

                        <View style={styles.row}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.label}>{t('duration_minutes')}</Text>
                                <TextInput
                                    style={styles.input}
                                    value={duration}
                                    onChangeText={setDuration}
                                    keyboardType="numeric"
                                />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.label}>{t('pass_threshold')}</Text>
                                <TextInput
                                    style={styles.input}
                                    value={passThreshold}
                                    onChangeText={setPassThreshold}
                                    keyboardType="numeric"
                                />
                            </View>
                        </View>

                        <Pressable style={styles.createButton} onPress={handleCreate} disabled={loading}>
                            {loading ? (
                                <ActivityIndicator color={colors.primaryText} />
                            ) : (
                                <Text style={styles.createButtonText}>{t('create_exam')}</Text>
                            )}
                        </Pressable>
                    </ScrollView>
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
            elevation: 5,
            maxHeight: '80%'
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
            marginBottom: 4,
            marginTop: 8
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
        row: {
            flexDirection: 'row',
            gap: 12
        },
        createButton: {
            backgroundColor: colors.primary,
            borderRadius: 12,
            padding: 16,
            alignItems: 'center',
            marginTop: 20
        },
        createButtonText: {
            color: colors.primaryText,
            fontWeight: 'bold',
            fontSize: 16
        },
        courseScroll: {
            flexDirection: 'row',
            marginBottom: 8,
            height: 50
        },
        courseChip: {
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderRadius: 20,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            marginRight: 8,
            height: 42
        },
        courseChipActive: {
            backgroundColor: isDark ? 'rgba(20, 184, 166, 0.18)' : 'rgba(13, 148, 136, 0.10)',
            borderColor: colors.primary
        },
        courseChipText: {
            color: colors.textSecondary,
            fontWeight: '500'
        },
        courseChipTextActive: {
            color: colors.primary,
            fontWeight: '700'
        }
    });

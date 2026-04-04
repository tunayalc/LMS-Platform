import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    TextInput,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';

interface ExamFormScreenProps {
    examId?: string; // If provided, we're editing
    courseId: string;
    onBack: () => void;
    onSuccess: () => void;
    onNavigateToQuestions?: (examId: string) => void;
}

interface Question {
    id: string;
    type: string;
    points?: number;
    prompt?: string;
}

interface ExamFormData {
    title: string;
    isPublished: boolean;
    startDate: string;
    endDate: string;
    durationMinutes: string;
    passThreshold: string;
}

export default function ExamFormScreen({
    examId,
    courseId,
    onBack,
    onSuccess,
    onNavigateToQuestions
}: ExamFormScreenProps) {
    const { t } = useTranslation();
    const { colors, isDark } = useTheme();

    const isEditing = !!examId;
    const [loading, setLoading] = useState(isEditing);
    const [saving, setSaving] = useState(false);
    const [questions, setQuestions] = useState<Question[]>([]);

    const [formData, setFormData] = useState<ExamFormData>({
        title: '',
        isPublished: false,
        startDate: '',
        endDate: '',
        durationMinutes: '60',
        passThreshold: '60',
    });

    const fetchExam = useCallback(async () => {
        if (!examId) return;

        try {
            const token = await AsyncStorage.getItem('auth_token');
            const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
            const response = await apiClient.get(`/exams/${examId}`, { headers }) as any;
            const exam = response?.exam ?? response;

            setFormData({
                title: exam?.title || '',
                isPublished: exam?.isDraft === false,
                startDate: exam?.startDate || '',
                endDate: exam?.endDate || '',
                durationMinutes: String(exam?.durationMinutes ?? 60),
                passThreshold: String(exam?.passThreshold ?? 60),
            });

            // Fetch questions
            try {
                const questionsRes = await apiClient.get(`/questions`, { headers, params: { examId, limit: 500, offset: 0 } } as any) as any;
                setQuestions(Array.isArray(questionsRes) ? questionsRes : (questionsRes?.questions || []));
            } catch (e) {
                setQuestions([]);
            }
        } catch (error) {
            console.error('Failed to fetch exam:', error);
            Alert.alert(t('error'), t('connection_error'));
        } finally {
            setLoading(false);
        }
    }, [examId, t]);

    useEffect(() => {
        if (isEditing) {
            fetchExam();
        }
    }, [isEditing, fetchExam]);

    const handleSubmit = async () => {
        // Validation
        if (!formData.title.trim()) {
            Alert.alert(t('error'), t('validation_error_title'));
            return;
        }

        setSaving(true);
        try {
            const token = await AsyncStorage.getItem('auth_token');
            const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
            const payload = {
                title: formData.title.trim(),
                courseId,
                durationMinutes: parseInt(formData.durationMinutes) || 60,
                passThreshold: parseInt(formData.passThreshold) || 60,
                isDraft: !formData.isPublished,
                startDate: formData.startDate || undefined,
                endDate: formData.endDate || undefined,
            };

            if (isEditing) {
                await apiClient.patch(`/exams/${examId}`, payload, { headers });
                Alert.alert(t('success'), t('exam_update_success'));
            } else {
                await apiClient.post('/exams', payload, { headers });
                Alert.alert(t('success'), t('exam_create_success'));
            }

            onSuccess();
        } catch (error) {
            console.error('Failed to save exam:', error);
            Alert.alert(t('error'), t('exam_create_error'));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!isEditing) return;

        Alert.alert(
            t('delete'),
            t('exam_delete_confirm'),
            [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: t('delete'),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const token = await AsyncStorage.getItem('auth_token');
                            const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
                            await apiClient.del(`/exams/${examId}`, { headers });
                            Alert.alert(t('success'), t('delete_success'));
                            onSuccess();
                        } catch (error) {
                            Alert.alert(t('error'), t('delete_error'));
                        }
                    }
                }
            ]
        );
    };

    const renderToggle = (
        label: string,
        hint: string,
        value: boolean,
        onToggle: () => void
    ) => (
        <TouchableOpacity
            style={[styles.toggleRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={onToggle}
        >
            <View style={styles.toggleInfo}>
                <Text style={[styles.toggleLabel, { color: colors.text }]}>{label}</Text>
                <Text style={[styles.toggleHint, { color: colors.textSecondary }]}>{hint}</Text>
            </View>
            <View style={[
                styles.toggle,
                { backgroundColor: value ? colors.success : colors.border }
            ]}>
                <View style={[
                    styles.toggleKnob,
                    { transform: [{ translateX: value ? 20 : 0 }] }
                ]} />
            </View>
        </TouchableOpacity>
    );

    if (loading) {
        return (
            <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={[styles.container, { backgroundColor: colors.background }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            {/* Header */}
            <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={onBack} style={styles.backBtn}>
                    <Feather name="x" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>
                    {isEditing ? t('edit_exam') : t('create_exam')}
                </Text>
                {isEditing && (
                    <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn}>
                        <Feather name="trash-2" size={20} color={colors.error} />
                    </TouchableOpacity>
                )}
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
            >
                {/* Title Input */}
                <View style={styles.formGroup}>
                    <Text style={[styles.label, { color: colors.text }]}>{t('title', { defaultValue: 'Başlık' })} *</Text>
                    <TextInput
                        style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
                        value={formData.title}
                        onChangeText={(text) => setFormData(prev => ({ ...prev, title: text }))}
                        placeholder={t('exam_title_placeholder', { defaultValue: 'Sınav başlığı' })}
                        placeholderTextColor={colors.textSecondary}
                    />
                </View>

                {/* Duration & Passing Score Row */}
                <View style={styles.row}>
                    <View style={[styles.formGroup, { flex: 1, marginRight: 8 }]}>
                        <Text style={[styles.label, { color: colors.text }]}>{t('duration_min', { defaultValue: 'Süre (dk)' })}</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
                            value={formData.durationMinutes}
                            onChangeText={(text) => setFormData(prev => ({ ...prev, durationMinutes: text.replace(/[^0-9]/g, '') }))}
                            placeholder="60"
                            placeholderTextColor={colors.textSecondary}
                            keyboardType="number-pad"
                        />
                    </View>
                    <View style={[styles.formGroup, { flex: 1, marginLeft: 8 }]}>
                        <Text style={[styles.label, { color: colors.text }]}>{t('pass_grade', { defaultValue: 'Geçme' })}</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
                            value={formData.passThreshold}
                            onChangeText={(text) => setFormData(prev => ({ ...prev, passThreshold: text.replace(/[^0-9]/g, '') }))}
                            placeholder="60"
                            placeholderTextColor={colors.textSecondary}
                            keyboardType="number-pad"
                        />
                    </View>
                </View>

                {/* Questions Section */}
                {isEditing && (
                    <View style={[styles.questionsSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <View style={styles.questionsSectionHeader}>
                            <Text style={[styles.sectionTitle, { color: colors.text }]}>
                                {t('questions')} ({questions.length})
                            </Text>
                            <TouchableOpacity
                                style={[styles.addQuestionBtn, { backgroundColor: colors.primary }]}
                                onPress={() => onNavigateToQuestions?.(examId!)}
                            >
                                <Feather name="plus" size={16} color="#fff" />
                                <Text style={styles.addQuestionBtnText}>{t('add')}</Text>
                            </TouchableOpacity>
                        </View>

                        {questions.length === 0 ? (
                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                {t('no_questions')}
                            </Text>
                        ) : (
                            questions.slice(0, 5).map((question, index) => (
                                <View key={question.id} style={[styles.questionItem, { borderTopColor: colors.border }]}>
                                    <Text style={[styles.questionNumber, { color: colors.textSecondary }]}>
                                        {index + 1}.
                                    </Text>
                                    <Text style={[styles.questionText, { color: colors.text }]} numberOfLines={1}>
                                        {question.prompt || ''}
                                    </Text>
                                    <Text style={[styles.questionPoints, { color: colors.primary }]}>
                                        {question.points || 1} pts
                                    </Text>
                                </View>
                            ))
                        )}

                        {questions.length > 5 && (
                            <Text style={[styles.moreText, { color: colors.primary }]}>
                                +{questions.length - 5} {t('more')}
                            </Text>
                        )}
                    </View>
                )}

                {/* Toggles */}
                <Text style={[styles.sectionHeader, { color: colors.text }]}>{t('settings', { defaultValue: 'Ayarlar' })}</Text>

                {renderToggle(
                    t('publish'),
                    t('publish_tooltip'),
                    formData.isPublished,
                    () => setFormData(prev => ({ ...prev, isPublished: !prev.isPublished }))
                )}

                {/* Submit Button */}
                <TouchableOpacity
                    style={[styles.submitBtn, { backgroundColor: colors.primary }, saving && styles.submitBtnDisabled]}
                    onPress={handleSubmit}
                    disabled={saving}
                >
                    {saving ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <>
                            <Feather name={isEditing ? 'save' : 'plus'} size={20} color="#fff" />
                            <Text style={styles.submitBtnText}>
                                {isEditing ? t('save') : t('create_exam')}
                            </Text>
                        </>
                    )}
                </TouchableOpacity>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        paddingTop: 48,
        borderBottomWidth: 1,
    },
    backBtn: { padding: 4 },
    headerTitle: { flex: 1, fontSize: 18, fontWeight: '600', marginLeft: 12 },
    deleteBtn: { padding: 4 },
    scrollView: { flex: 1 },
    scrollContent: { padding: 16 },
    formGroup: { marginBottom: 16 },
    label: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
    input: { height: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, fontSize: 16 },
    textArea: { minHeight: 80, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16 },
    row: { flexDirection: 'row' },
    questionsSection: { borderRadius: 12, borderWidth: 1, padding: 16, marginBottom: 20 },
    questionsSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    sectionTitle: { fontSize: 16, fontWeight: '600' },
    sectionHeader: { fontSize: 16, fontWeight: '600', marginTop: 8, marginBottom: 12 },
    addQuestionBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
    addQuestionBtnText: { color: '#fff', marginLeft: 4, fontWeight: '600' },
    emptyText: { textAlign: 'center', paddingVertical: 20, fontSize: 14 },
    questionItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1 },
    questionNumber: { fontSize: 14, width: 24 },
    questionText: { flex: 1, fontSize: 14 },
    questionPoints: { fontSize: 12, fontWeight: '600' },
    moreText: { textAlign: 'center', paddingTop: 10, fontSize: 14, fontWeight: '500' },
    toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
    toggleInfo: { flex: 1 },
    toggleLabel: { fontSize: 16, fontWeight: '500' },
    toggleHint: { fontSize: 13, marginTop: 2 },
    toggle: { width: 48, height: 28, borderRadius: 14, padding: 2, justifyContent: 'center' },
    toggleKnob: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' },
    submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 52, borderRadius: 12, marginTop: 16, marginBottom: 32 },
    submitBtnDisabled: { opacity: 0.6 },
    submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '600', marginLeft: 8 },
});

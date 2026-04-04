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

type QuestionType = 'multiple_choice' | 'multiple_select' | 'true_false' | 'short_answer' | 'long_answer' | 'fill_blank';

interface QuestionFormScreenProps {
    questionId?: string;
    examId: string;
    onBack: () => void;
    onSuccess: () => void;
}

interface QuestionFormData {
    prompt: string;
    type: QuestionType;
    options: string[];
    correctAnswer: string;
    points: string;
    explanation: string;
}

const questionTypes: { value: QuestionType; label: string; icon: keyof typeof Feather.glyphMap }[] = [
    { value: 'multiple_choice', label: 'Multiple Choice', icon: 'check-circle' },
    { value: 'multiple_select', label: 'Multiple Select', icon: 'check-square' },
    { value: 'true_false', label: 'True/False', icon: 'toggle-left' },
    { value: 'short_answer', label: 'Short Answer', icon: 'type' },
    { value: 'long_answer', label: 'Long Answer', icon: 'file-text' },
    { value: 'fill_blank', label: 'Fill in Blank', icon: 'edit-2' },
];

export default function QuestionFormScreen({
    questionId,
    examId,
    onBack,
    onSuccess
}: QuestionFormScreenProps) {
    const { t } = useTranslation();
    const { colors, isDark } = useTheme();

    const isEditing = !!questionId;
    const [loading, setLoading] = useState(isEditing);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState<QuestionFormData>({
        prompt: '',
        type: 'multiple_choice',
        options: ['', '', '', ''],
        correctAnswer: '',
        points: '1',
        explanation: '',
    });

    const fetchQuestion = useCallback(async () => {
        if (!questionId) return;

        try {
            const token = await AsyncStorage.getItem('auth_token');
            const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
            const response = await apiClient.get(`/questions/${questionId}`, { headers }) as any;
            const question = response?.question ?? response;

            setFormData({
                prompt: question?.prompt || '',
                type: question?.type || 'multiple_choice',
                options: Array.isArray(question?.options) && question.options.length ? question.options : ['', '', '', ''],
                correctAnswer: Array.isArray(question?.answer)
                    ? (question.answer[0] ?? '')
                    : typeof question?.answer === 'boolean'
                        ? String(question.answer)
                        : String(question?.answer ?? ''),
                points: String(question?.points ?? 1),
                explanation: String(question?.meta?.explanation ?? ''),
            });
        } catch (error) {
            console.error('Failed to fetch question:', error);
            Alert.alert(t('error'), t('connection_error'));
        } finally {
            setLoading(false);
        }
    }, [questionId, t]);

    useEffect(() => {
        if (isEditing) {
            fetchQuestion();
        }
    }, [isEditing, fetchQuestion]);

    const handleOptionChange = (index: number, value: string) => {
        setFormData(prev => {
            const newOptions = [...prev.options];
            newOptions[index] = value;
            return { ...prev, options: newOptions };
        });
    };

    const addOption = () => {
        setFormData(prev => ({
            ...prev,
            options: [...prev.options, '']
        }));
    };

    const removeOption = (index: number) => {
        if (formData.options.length <= 2) return;
        setFormData(prev => ({
            ...prev,
            options: prev.options.filter((_, i) => i !== index)
        }));
    };

    const handleSubmit = async () => {
        if (!formData.prompt.trim()) {
            Alert.alert(t('error'), t('validation_error_question'));
            return;
        }

        setSaving(true);
        try {
            const token = await AsyncStorage.getItem('auth_token');
            const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

            let answer: any = formData.correctAnswer;
            if (formData.type === 'true_false') {
                answer = formData.correctAnswer === 'true';
            } else if (formData.type === 'multiple_select') {
                answer = formData.correctAnswer.split(',').map(s => s.trim());
            }

            const options = formData.type === 'multiple_choice' || formData.type === 'multiple_select'
                ? formData.options.filter(o => o.trim())
                : formData.type === 'true_false'
                    ? ['True', 'False']
                    : undefined;

            const payload = {
                prompt: formData.prompt.trim(),
                type: formData.type,
                examId,
                options,
                answer,
                points: parseInt(formData.points) || 1,
                meta: formData.explanation.trim() ? { explanation: formData.explanation.trim() } : undefined,
            };

            if (isEditing) {
                await apiClient.patch(`/questions/${questionId}`, payload, { headers });
                Alert.alert(t('success'), t('question_update_success'));
            } else {
                await apiClient.post('/questions', payload, { headers });
                Alert.alert(t('success'), t('question_create_success'));
            }

            onSuccess();
        } catch (error) {
            console.error('Failed to save question:', error);
            Alert.alert(t('error'), t('question_create_error'));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!isEditing) return;

        Alert.alert(
            t('delete'),
            t('question_delete_confirm'),
            [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: t('delete'),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const token = await AsyncStorage.getItem('auth_token');
                            const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
                            await apiClient.del(`/questions/${questionId}`, { headers });
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

    const showOptions = formData.type === 'multiple_choice' || formData.type === 'multiple_select';
    const showTrueFalse = formData.type === 'true_false';

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
                    {isEditing ? t('edit_question') : t('add_question')}
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
                {/* Question Type */}
                <View style={styles.formGroup}>
                    <Text style={[styles.label, { color: colors.text }]}>{t('question_type')} *</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={styles.typeRow}>
                            {questionTypes.map(type => (
                                <TouchableOpacity
                                    key={type.value}
                                    style={[
                                        styles.typeChip,
                                        {
                                            backgroundColor: formData.type === type.value ? colors.primary : colors.card,
                                            borderColor: formData.type === type.value ? colors.primary : colors.border,
                                        }
                                    ]}
                                    onPress={() => setFormData(prev => ({ ...prev, type: type.value }))}
                                >
                                    <Feather
                                        name={type.icon}
                                        size={16}
                                        color={formData.type === type.value ? '#fff' : colors.textSecondary}
                                    />
                                    <Text style={[
                                        styles.typeChipLabel,
                                        { color: formData.type === type.value ? '#fff' : colors.text }
                                    ]}>
                                        {type.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </ScrollView>
                </View>

                {/* Question Text */}
                <View style={styles.formGroup}>
                    <Text style={[styles.label, { color: colors.text }]}>{t('question_text')} *</Text>
                    <TextInput
                        style={[styles.textArea, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
                        value={formData.prompt}
                        onChangeText={(prompt) => setFormData(prev => ({ ...prev, prompt }))}
                        placeholder={t('question_placeholder')}
                        placeholderTextColor={colors.textSecondary}
                        multiline
                        numberOfLines={3}
                        textAlignVertical="top"
                    />
                </View>

                {/* Options (for multiple choice) */}
                {showOptions && (
                    <View style={styles.formGroup}>
                        <Text style={[styles.label, { color: colors.text }]}>{t('options')} *</Text>
                        {formData.options.map((option, index) => (
                            <View key={index} style={styles.optionRow}>
                                <TouchableOpacity
                                    style={[
                                        styles.optionRadio,
                                        { borderColor: formData.correctAnswer === option && option ? colors.success : colors.border }
                                    ]}
                                    onPress={() => option && setFormData(prev => ({ ...prev, correctAnswer: option }))}
                                >
                                    {formData.correctAnswer === option && option && (
                                        <View style={[styles.optionRadioInner, { backgroundColor: colors.success }]} />
                                    )}
                                </TouchableOpacity>
                                <TextInput
                                    style={[styles.optionInput, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
                                    value={option}
                                    onChangeText={(text) => handleOptionChange(index, text)}
                                    placeholder={`${t('option')} ${index + 1}`}
                                    placeholderTextColor={colors.textSecondary}
                                />
                                {formData.options.length > 2 && (
                                    <TouchableOpacity onPress={() => removeOption(index)} style={styles.removeBtn}>
                                        <Feather name="x" size={18} color={colors.error} />
                                    </TouchableOpacity>
                                )}
                            </View>
                        ))}
                        <TouchableOpacity
                            style={[styles.addOptionBtn, { borderColor: colors.border }]}
                            onPress={addOption}
                        >
                            <Feather name="plus" size={18} color={colors.primary} />
                            <Text style={[styles.addOptionText, { color: colors.primary }]}>{t('add_option')}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* True/False Answer */}
                {showTrueFalse && (
                    <View style={styles.formGroup}>
                        <Text style={[styles.label, { color: colors.text }]}>{t('correct_answer')} *</Text>
                        <View style={styles.trueFalseRow}>
                            <TouchableOpacity
                                style={[
                                    styles.trueFalseBtn,
                                    {
                                        backgroundColor: formData.correctAnswer === 'true' ? colors.success + '20' : colors.card,
                                        borderColor: formData.correctAnswer === 'true' ? colors.success : colors.border
                                    }
                                ]}
                                onPress={() => setFormData(prev => ({ ...prev, correctAnswer: 'true' }))}
                            >
                                <Feather name="check" size={20} color={formData.correctAnswer === 'true' ? colors.success : colors.textSecondary} />
                                <Text style={[styles.trueFalseBtnText, { color: formData.correctAnswer === 'true' ? colors.success : colors.text }]}>
                                    {t('true')}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.trueFalseBtn,
                                    {
                                        backgroundColor: formData.correctAnswer === 'false' ? colors.error + '20' : colors.card,
                                        borderColor: formData.correctAnswer === 'false' ? colors.error : colors.border
                                    }
                                ]}
                                onPress={() => setFormData(prev => ({ ...prev, correctAnswer: 'false' }))}
                            >
                                <Feather name="x" size={20} color={formData.correctAnswer === 'false' ? colors.error : colors.textSecondary} />
                                <Text style={[styles.trueFalseBtnText, { color: formData.correctAnswer === 'false' ? colors.error : colors.text }]}>
                                    {t('false')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {/* Points */}
                <View style={styles.formGroup}>
                    <Text style={[styles.label, { color: colors.text }]}>{t('points')}</Text>
                    <TextInput
                        style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text, width: 100 }]}
                        value={formData.points}
                        onChangeText={(text) => setFormData(prev => ({ ...prev, points: text.replace(/[^0-9]/g, '') }))}
                        placeholder="1"
                        placeholderTextColor={colors.textSecondary}
                        keyboardType="number-pad"
                    />
                </View>

                {/* Explanation */}
                <View style={styles.formGroup}>
                    <Text style={[styles.label, { color: colors.text }]}>{t('explanation')}</Text>
                    <TextInput
                        style={[styles.textArea, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
                        value={formData.explanation}
                        onChangeText={(text) => setFormData(prev => ({ ...prev, explanation: text }))}
                        placeholder={t('explanation_placeholder')}
                        placeholderTextColor={colors.textSecondary}
                        multiline
                        numberOfLines={2}
                        textAlignVertical="top"
                    />
                </View>

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
                                {isEditing ? t('save') : t('add_question')}
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
    header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 48, borderBottomWidth: 1 },
    backBtn: { padding: 4 },
    headerTitle: { flex: 1, fontSize: 18, fontWeight: '600', marginLeft: 12 },
    deleteBtn: { padding: 4 },
    scrollView: { flex: 1 },
    scrollContent: { padding: 16 },
    formGroup: { marginBottom: 20 },
    label: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
    input: { height: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, fontSize: 16 },
    textArea: { minHeight: 80, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16 },
    typeRow: { flexDirection: 'row', paddingRight: 16 },
    typeChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderWidth: 1, marginRight: 8 },
    typeChipLabel: { marginLeft: 6, fontSize: 13, fontWeight: '500' },
    optionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    optionRadio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
    optionRadioInner: { width: 12, height: 12, borderRadius: 6 },
    optionInput: { flex: 1, height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, fontSize: 15 },
    removeBtn: { padding: 8, marginLeft: 6 },
    addOptionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderWidth: 1, borderRadius: 10, borderStyle: 'dashed', marginTop: 4 },
    addOptionText: { marginLeft: 6, fontWeight: '500' },
    trueFalseRow: { flexDirection: 'row', gap: 12 },
    trueFalseBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, borderWidth: 1.5 },
    trueFalseBtnText: { marginLeft: 8, fontSize: 16, fontWeight: '600' },
    submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 52, borderRadius: 12, marginTop: 8, marginBottom: 32 },
    submitBtnDisabled: { opacity: 0.6 },
    submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '600', marginLeft: 8 },
});

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
import Button from '../components/ui/Button';

interface CourseFormScreenProps {
    courseId?: string; // If provided, we're editing
    onBack: () => void;
    onSuccess: () => void;
}

interface CourseFormData {
    title: string;
    description: string;
    thumbnail: string;
    isPublished: boolean;
}

export default function CourseFormScreen({
    courseId,
    onBack,
    onSuccess
}: CourseFormScreenProps) {
    const { t } = useTranslation();
    const { colors, isDark } = useTheme();

    const isEditing = !!courseId;
    const [loading, setLoading] = useState(isEditing);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState<CourseFormData>({
        title: '',
        description: '',
        thumbnail: '',
        isPublished: false,
    });

    const fetchCourse = useCallback(async () => {
        if (!courseId) return;

        try {
            const token = await AsyncStorage.getItem('auth_token');
            const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
            const response = await apiClient.get(`/courses/${courseId}`, { headers }) as any;

            setFormData({
                title: response.title || '',
                description: response.description || '',
                thumbnail: response.thumbnail || '',
                isPublished: response.isPublished || false,
            });
        } catch (error) {
            console.error('Failed to fetch course:', error);
            Alert.alert(t('error'), t('connection_error'));
        } finally {
            setLoading(false);
        }
    }, [courseId, t]);

    useEffect(() => {
        if (isEditing) {
            fetchCourse();
        }
    }, [isEditing, fetchCourse]);

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
                description: formData.description.trim(),
                thumbnail: formData.thumbnail.trim() || undefined,
                isPublished: formData.isPublished,
            };

            if (isEditing) {
                await apiClient.patch(`/courses/${courseId}`, payload, { headers });
                Alert.alert(t('success'), t('course_update_success'));
            } else {
                await apiClient.post('/courses', payload, { headers });
                Alert.alert(t('success'), t('course_create_success'));
            }

            onSuccess();
        } catch (error) {
            console.error('Failed to save course:', error);
            Alert.alert(t('error'), t('course_create_error'));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!isEditing) return;

        Alert.alert(
            t('delete'),
            t('course_delete_confirm'),
            [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: t('delete'),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const token = await AsyncStorage.getItem('auth_token');
                            const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
                            await apiClient.del(`/courses/${courseId}`, { headers });
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
                    {isEditing ? t('edit') : t('create_course')}
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
                    <Text style={[styles.label, { color: colors.text }]}>{t('title')} *</Text>
                    <TextInput
                        style={[
                            styles.input,
                            {
                                backgroundColor: colors.inputBackground,
                                borderColor: colors.border,
                                color: colors.text
                            }
                        ]}
                        value={formData.title}
                        onChangeText={(text) => setFormData(prev => ({ ...prev, title: text }))}
                        placeholder={t('course_title_placeholder')}
                        placeholderTextColor={colors.textSecondary}
                    />
                </View>

                {/* Description Input */}
                <View style={styles.formGroup}>
                    <Text style={[styles.label, { color: colors.text }]}>{t('description')}</Text>
                    <TextInput
                        style={[
                            styles.textArea,
                            {
                                backgroundColor: colors.inputBackground,
                                borderColor: colors.border,
                                color: colors.text
                            }
                        ]}
                        value={formData.description}
                        onChangeText={(text) => setFormData(prev => ({ ...prev, description: text }))}
                        placeholder={t('description_optional')}
                        placeholderTextColor={colors.textSecondary}
                        multiline
                        numberOfLines={4}
                        textAlignVertical="top"
                    />
                </View>

                {/* Thumbnail URL Input */}
                <View style={styles.formGroup}>
                    <Text style={[styles.label, { color: colors.text }]}>{t('thumbnail')}</Text>
                    <TextInput
                        style={[
                            styles.input,
                            {
                                backgroundColor: colors.inputBackground,
                                borderColor: colors.border,
                                color: colors.text
                            }
                        ]}
                        value={formData.thumbnail}
                        onChangeText={(text) => setFormData(prev => ({ ...prev, thumbnail: text }))}
                        placeholder="https://example.com/image.jpg"
                        placeholderTextColor={colors.textSecondary}
                        autoCapitalize="none"
                        keyboardType="url"
                    />
                </View>

                {/* Published Toggle */}
                <TouchableOpacity
                    style={[styles.toggleRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => setFormData(prev => ({ ...prev, isPublished: !prev.isPublished }))}
                >
                    <View style={styles.toggleInfo}>
                        <Text style={[styles.toggleLabel, { color: colors.text }]}>{t('publish')}</Text>
                        <Text style={[styles.toggleHint, { color: colors.textSecondary }]}>
                            {t('publish_tooltip')}
                        </Text>
                    </View>
                    <View style={[
                        styles.toggle,
                        { backgroundColor: formData.isPublished ? colors.success : colors.border }
                    ]}>
                        <View style={[
                            styles.toggleKnob,
                            { transform: [{ translateX: formData.isPublished ? 20 : 0 }] }
                        ]} />
                    </View>
                </TouchableOpacity>

                {/* Submit Button */}
                <TouchableOpacity
                    style={[
                        styles.submitBtn,
                        { backgroundColor: colors.primary },
                        saving && styles.submitBtnDisabled
                    ]}
                    onPress={handleSubmit}
                    disabled={saving}
                >
                    {saving ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <>
                            <Feather name={isEditing ? 'save' : 'plus'} size={20} color="#fff" />
                            <Text style={styles.submitBtnText}>
                                {isEditing ? t('save') : t('create_course')}
                            </Text>
                        </>
                    )}
                </TouchableOpacity>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        paddingTop: 48,
        borderBottomWidth: 1,
    },
    backBtn: {
        padding: 4,
    },
    headerTitle: {
        flex: 1,
        fontSize: 18,
        fontWeight: '600',
        marginLeft: 12,
    },
    deleteBtn: {
        padding: 4,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
    },
    formGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 8,
    },
    input: {
        height: 48,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 16,
        fontSize: 16,
    },
    textArea: {
        minHeight: 120,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 16,
    },
    toggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 24,
    },
    toggleInfo: {
        flex: 1,
    },
    toggleLabel: {
        fontSize: 16,
        fontWeight: '500',
    },
    toggleHint: {
        fontSize: 13,
        marginTop: 2,
    },
    toggle: {
        width: 48,
        height: 28,
        borderRadius: 14,
        padding: 2,
        justifyContent: 'center',
    },
    toggleKnob: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#fff',
    },
    submitBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 52,
        borderRadius: 12,
        marginTop: 8,
    },
    submitBtnDisabled: {
        opacity: 0.6,
    },
    submitBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        marginLeft: 8,
    },
});

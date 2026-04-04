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
    Platform,
    Modal
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiBaseUrl, apiClient } from '../api/client';
import { normalizeContentSourceToUrl } from '../utils/contentUrl';

type ContentType = 'video' | 'pdf' | 'scorm' | 'h5p' | 'live_class';

interface ContentFormScreenProps {
    contentId?: string; // If provided, we're editing
    courseId: string;
    moduleId?: string;
    onBack: () => void;
    onSuccess: () => void;
    onPreview?: (args: { type: ContentType; url: string; title?: string; contentId?: string }) => void;
}

interface ContentFormData {
    title: string;
    type: ContentType;
    sourceUrl: string;
    duration: string; // legacy UI (unused by backend)
    description: string; // legacy UI (unused by backend)
    isPublished: boolean; // legacy UI (unused by backend)
}

type ContentListItem = { id: string; title: string };
type PrerequisiteRow = { id: string; prerequisiteContentId: string; prerequisiteTitle?: string };

const contentTypes: { value: ContentType; label: string; icon: keyof typeof Feather.glyphMap }[] = [
    { value: 'video', label: 'Video', icon: 'play-circle' },
    { value: 'pdf', label: 'PDF', icon: 'file-text' },
    { value: 'scorm', label: 'SCORM', icon: 'package' },
    { value: 'h5p', label: 'H5P', icon: 'box' },
    { value: 'live_class', label: 'Live Class', icon: 'video' },
];

export default function ContentFormScreen({
    contentId,
    courseId,
    moduleId,
    onBack,
    onSuccess,
    onPreview
}: ContentFormScreenProps) {
    const { t } = useTranslation();
    const { colors, isDark } = useTheme();

    const isEditing = !!contentId;
    const [loading, setLoading] = useState(isEditing);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState<ContentFormData>({
        title: '',
        type: 'video',
        sourceUrl: '',
        duration: '',
        description: '',
        isPublished: false,
    });

    const [availableContent, setAvailableContent] = useState<ContentListItem[]>([]);
    const [selectedPrereqs, setSelectedPrereqs] = useState<ContentListItem[]>([]);
    const [initialPrereqIds, setInitialPrereqIds] = useState<Set<string>>(new Set());
    const [prereqPickerOpen, setPrereqPickerOpen] = useState(false);
    const [prereqSearch, setPrereqSearch] = useState('');

    const fetchContent = useCallback(async () => {
        if (!contentId) return;

        try {
            const token = await AsyncStorage.getItem('auth_token');
            const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
            const response = await apiClient.get(`/content/${contentId}`, { headers }) as any;
            const content = response?.content ?? response;

            setFormData({
                title: content?.title || '',
                type: content?.type || 'video',
                sourceUrl: (content?.meetingUrl || content?.source || '') as string,
                duration: String(response.duration || ''),
                description: response.description || '',
                isPublished: response.isPublished || false,
            });
        } catch (error) {
            console.error('Failed to fetch content:', error);
            Alert.alert(t('error'), t('connection_error'));
        } finally {
            setLoading(false);
        }
    }, [contentId, t]);

    useEffect(() => {
        if (isEditing) {
            fetchContent();
        }
    }, [isEditing, fetchContent]);

    const fetchPrereqData = useCallback(async () => {
        try {
            const token = await AsyncStorage.getItem('auth_token');
            const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

            const contentRes = await apiClient.get('/content', { headers, params: { courseId, limit: 500, offset: 0 } } as any) as any;
            const items = (Array.isArray(contentRes) ? contentRes : contentRes?.content || []) as any[];
            setAvailableContent(items.map((c) => ({ id: c.id, title: c.title })).filter((c) => c.id !== contentId));

            if (contentId) {
                const prereqRes = await apiClient.get(`/api/modules/prerequisite/${contentId}`, { headers } as any) as any;
                const rows: PrerequisiteRow[] = Array.isArray(prereqRes) ? prereqRes : prereqRes?.prerequisites || [];
                const selected = rows.map((r) => ({ id: r.prerequisiteContentId, title: r.prerequisiteTitle || r.prerequisiteContentId }));
                setSelectedPrereqs(selected);
                setInitialPrereqIds(new Set(selected.map((x) => x.id)));
            } else {
                setSelectedPrereqs([]);
                setInitialPrereqIds(new Set());
            }
        } catch (e) {
            console.error('Prereq load error:', e);
        }
    }, [courseId, contentId]);

    useEffect(() => {
        void fetchPrereqData();
    }, [fetchPrereqData]);

    const handleSubmit = async () => {
        if (!formData.title.trim()) {
            Alert.alert(t('error'), t('validation_error_title'));
            return;
        }

        if (!formData.sourceUrl.trim() && formData.type !== 'live_class') {
            Alert.alert(t('error'), t('validation_error_url'));
            return;
        }

        setSaving(true);
        try {
            const token = await AsyncStorage.getItem('auth_token');
            const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
            const payload = {
                title: formData.title.trim(),
                type: formData.type,
                courseId,
                moduleId: moduleId || undefined,
                source: formData.type === 'live_class' ? undefined : (formData.sourceUrl.trim() || undefined),
                meetingUrl: formData.type === 'live_class' ? (formData.sourceUrl.trim() || undefined) : undefined,
            };

            if (isEditing) {
                await apiClient.patch(`/content/${contentId}`, payload, { headers });

                // Sync prerequisites (diff)
                const nextIds = new Set(selectedPrereqs.map((p) => p.id));
                const toAdd = [...nextIds].filter((id) => !initialPrereqIds.has(id));
                const toRemove = [...initialPrereqIds].filter((id) => !nextIds.has(id));

                for (const pid of toAdd) {
                    await apiClient.post('/api/modules/prerequisite', { contentId, prerequisiteContentId: pid }, { headers });
                }
                for (const pid of toRemove) {
                    await apiClient.del('/api/modules/prerequisite', { headers, body: { contentId, prerequisiteContentId: pid } } as any);
                }

                Alert.alert(t('success'), t('content_update_success'));
            } else {
                const created = await apiClient.post('/content', payload, { headers }) as any;
                const createdId = created?.content?.id ?? created?.id;
                if (createdId) {
                    for (const p of selectedPrereqs) {
                        await apiClient.post('/api/modules/prerequisite', { contentId: createdId, prerequisiteContentId: p.id }, { headers });
                    }
                }
                Alert.alert(t('success'), t('content_create_success'));
            }

            onSuccess();
        } catch (error) {
            console.error('Failed to save content:', error);
            Alert.alert(t('error'), t('content_create_error'));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!isEditing) return;

        Alert.alert(
            t('delete'),
            t('content_delete_confirm'),
            [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: t('delete'),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const token = await AsyncStorage.getItem('auth_token');
                            const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
                            await apiClient.del(`/content/${contentId}`, { headers });
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

    const canPreview = Boolean(
        onPreview &&
        formData.type !== 'live_class' &&
        (formData.type === 'pdf' || formData.type === 'video') &&
        formData.sourceUrl.trim()
    );

    const handlePreview = () => {
        if (!onPreview) return;
        const url = normalizeContentSourceToUrl(apiBaseUrl, formData.sourceUrl.trim());
        if (!url) {
            Alert.alert(t('error'), t('validation_error_url'));
            return;
        }
        onPreview({ type: formData.type, url, title: formData.title?.trim() || undefined, contentId });
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
                    {isEditing ? t('edit_content') : t('create_content')}
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
                {/* Content Type Selector */}
                <View style={styles.formGroup}>
                    <Text style={[styles.label, { color: colors.text }]}>{t('content_type')} *</Text>
                    <View style={styles.typeGrid}>
                        {contentTypes.map(type => (
                            <TouchableOpacity
                                key={type.value}
                                style={[
                                    styles.typeCard,
                                    {
                                        backgroundColor: formData.type === type.value ? colors.primary + '15' : colors.card,
                                        borderColor: formData.type === type.value ? colors.primary : colors.border,
                                    }
                                ]}
                                onPress={() => setFormData(prev => ({ ...prev, type: type.value }))}
                            >
                                <Feather
                                    name={type.icon}
                                    size={24}
                                    color={formData.type === type.value ? colors.primary : colors.textSecondary}
                                />
                                <Text style={[
                                    styles.typeLabel,
                                    { color: formData.type === type.value ? colors.primary : colors.text }
                                ]}>
                                    {type.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Title Input */}
                <View style={styles.formGroup}>
                    <Text style={[styles.label, { color: colors.text }]}>{t('title')} *</Text>
                    <TextInput
                        style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
                        value={formData.title}
                        onChangeText={(text) => setFormData(prev => ({ ...prev, title: text }))}
                        placeholder={t('content_title_placeholder')}
                        placeholderTextColor={colors.textSecondary}
                    />
                </View>

                {/* Source URL */}
                {formData.type !== 'live_class' && (
                    <View style={styles.formGroup}>
                        <Text style={[styles.label, { color: colors.text }]}>
                            {formData.type === 'video' ? t('video_url') : t('source_url')} *
                        </Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
                            value={formData.sourceUrl}
                            onChangeText={(text) => setFormData(prev => ({ ...prev, sourceUrl: text }))}
                            placeholder={formData.type === 'video' ? 'https://youtube.com/watch?v=...' : 'https://example.com/file.pdf'}
                            placeholderTextColor={colors.textSecondary}
                            autoCapitalize="none"
                            keyboardType="url"
                        />
                        <Text style={[styles.hint, { color: colors.textSecondary }]}>
                            {formData.type === 'video' ? t('video_url_hint') : t('file_url_hint')}
                        </Text>
                        {canPreview && (
                            <TouchableOpacity
                                style={[styles.previewBtn, { backgroundColor: colors.primary }]}
                                onPress={handlePreview}
                            >
                                <Feather
                                    name={formData.type === 'pdf' ? 'file-text' : 'play-circle'}
                                    size={18}
                                    color="#fff"
                                />
                                <Text style={styles.previewBtnText}>
                                    {formData.type === 'pdf'
                                        ? t('open_pdf', { defaultValue: 'PDF Aç' })
                                        : t('play_video', { defaultValue: 'Videoyu Oynat' })}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* Duration (for video) */}
                {formData.type === 'video' && (
                    <View style={styles.formGroup}>
                        <Text style={[styles.label, { color: colors.text }]}>{t('duration_label')} (min)</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
                            value={formData.duration}
                            onChangeText={(text) => setFormData(prev => ({ ...prev, duration: text.replace(/[^0-9]/g, '') }))}
                            placeholder="10"
                            placeholderTextColor={colors.textSecondary}
                            keyboardType="number-pad"
                        />
                    </View>
                )}

                {/* Description */}
                <View style={styles.formGroup}>
                    <Text style={[styles.label, { color: colors.text }]}>{t('description')}</Text>
                    <TextInput
                        style={[styles.textArea, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
                        value={formData.description}
                        onChangeText={(text) => setFormData(prev => ({ ...prev, description: text }))}
                        placeholder={t('description_optional')}
                        placeholderTextColor={colors.textSecondary}
                        multiline
                        numberOfLines={3}
                        textAlignVertical="top"
                    />
                </View>

                {/* Prerequisites */}
                <View style={[styles.formGroup, { marginBottom: 12 }]}>
                    <Text style={[styles.label, { color: colors.text }]}>{t('prerequisites', { defaultValue: 'Ön Koşullar' })}</Text>
                    <Text style={[styles.hint, { color: colors.textSecondary }]}>
                        {t('prereq_desc', { defaultValue: 'Bu içerik açılmadan önce tamamlanması gereken içerikleri seçin.' })}
                    </Text>

                    {selectedPrereqs.length > 0 && (
                        <View style={styles.prereqChips}>
                            {selectedPrereqs.map((p) => (
                                <View key={p.id} style={[styles.prereqChip, { backgroundColor: colors.card, borderColor: colors.border }]}>
                                    <Text style={{ color: colors.text, flex: 1 }} numberOfLines={1}>
                                        {p.title}
                                    </Text>
                                    <TouchableOpacity
                                        onPress={() => setSelectedPrereqs((prev) => prev.filter((x) => x.id !== p.id))}
                                        style={{ padding: 4, marginLeft: 6 }}
                                    >
                                        <Feather name="x" size={16} color={colors.error} />
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </View>
                    )}

                    <TouchableOpacity
                        onPress={() => setPrereqPickerOpen(true)}
                        style={[styles.prereqAddBtn, { borderColor: colors.primary }]}
                    >
                        <Feather name="plus" size={16} color={colors.primary} />
                        <Text style={{ color: colors.primary, fontWeight: '700', marginLeft: 8 }}>
                            {t('add_prerequisite', { defaultValue: 'Ön Koşul Ekle' })}
                        </Text>
                    </TouchableOpacity>
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
                                {isEditing ? t('save') : t('create_content')}
                            </Text>
                        </>
                    )}
                </TouchableOpacity>
            </ScrollView>

            <Modal visible={prereqPickerOpen} animationType="slide" onRequestClose={() => setPrereqPickerOpen(false)}>
                <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
                    <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                        <TouchableOpacity onPress={() => setPrereqPickerOpen(false)} style={styles.modalHeaderBtn}>
                            <Feather name="arrow-left" size={20} color={colors.primary} />
                        </TouchableOpacity>
                        <Text style={[styles.modalTitle, { color: colors.text }]}>
                            {t('add_prerequisite', { defaultValue: 'Ön Koşul Ekle' })}
                        </Text>
                        <View style={styles.modalHeaderBtn} />
                    </View>

                    <View style={{ padding: 16 }}>
                        <TextInput
                            value={prereqSearch}
                            onChangeText={setPrereqSearch}
                            placeholder={t('search', { defaultValue: 'Ara...' })}
                            placeholderTextColor={colors.textSecondary}
                            style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
                        />
                    </View>

                    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}>
                        {availableContent
                            .filter((c) => !selectedPrereqs.some((p) => p.id === c.id))
                            .filter((c) => (prereqSearch ? c.title.toLowerCase().includes(prereqSearch.toLowerCase()) : true))
                            .map((c) => (
                                <TouchableOpacity
                                    key={c.id}
                                    onPress={() => setSelectedPrereqs((prev) => [...prev, c])}
                                    style={[styles.prereqOption, { backgroundColor: colors.card, borderColor: colors.border }]}
                                >
                                    <Text style={{ color: colors.text, flex: 1 }} numberOfLines={2}>
                                        {c.title}
                                    </Text>
                                    <Feather name="plus" size={16} color={colors.primary} />
                                </TouchableOpacity>
                            ))}
                    </ScrollView>
                </View>
            </Modal>
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
    formGroup: { marginBottom: 20 },
    label: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
    input: { height: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, fontSize: 16 },
    textArea: { minHeight: 80, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16 },
    hint: { fontSize: 12, marginTop: 6 },
    previewBtn: {
        marginTop: 10,
        paddingVertical: 12,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    previewBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    typeGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
    typeCard: {
        width: '31%',
        aspectRatio: 1,
        margin: '1%',
        borderRadius: 12,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    typeLabel: { fontSize: 12, fontWeight: '500', marginTop: 8 },
    toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 20 },
    toggleInfo: { flex: 1 },
    toggleLabel: { fontSize: 16, fontWeight: '500' },
    toggleHint: { fontSize: 13, marginTop: 2 },
    toggle: { width: 48, height: 28, borderRadius: 14, padding: 2, justifyContent: 'center' },
    toggleKnob: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' },
    submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 52, borderRadius: 12, marginTop: 8, marginBottom: 32 },
    submitBtnDisabled: { opacity: 0.6 },
    submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '600', marginLeft: 8 },
    prereqChips: { gap: 10, marginTop: 8 },
    prereqChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
    prereqAddBtn: { marginTop: 10, height: 44, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
    modalContainer: { flex: 1 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 48, paddingBottom: 12, borderBottomWidth: 1 },
    modalHeaderBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    modalTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800' },
    prereqOption: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
});

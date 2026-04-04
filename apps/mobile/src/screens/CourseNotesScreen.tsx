import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { apiClient } from '../api/client';
import { useTheme } from '../contexts/ThemeContext';

type Note = {
    id: string;
    contentId: string;
    contentType: string;
    text: string;
    timestamp?: number | null;
    pageNumber?: number | null;
    color?: string | null;
    createdAt: string;
    updatedAt?: string | null;
    contentTitle?: string;
};

type Content = { id: string; title: string; type: string };

export default function CourseNotesScreen({ courseId, onBack }: { courseId: string; onBack: () => void }) {
    const { t } = useTranslation();
    const { colors } = useTheme();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);

    const [notes, setNotes] = useState<Note[]>([]);
    const [contents, setContents] = useState<Content[]>([]);

    const [composerOpen, setComposerOpen] = useState(false);
    const [contentPickerOpen, setContentPickerOpen] = useState(false);
    const [contentSearch, setContentSearch] = useState('');

    const [selectedContent, setSelectedContent] = useState<Content | null>(null);
    const [text, setText] = useState('');

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');

    const headersPromise = useMemo(
        () => (async () => {
            const token = await AsyncStorage.getItem('auth_token');
            return token ? { Authorization: `Bearer ${token}` } : undefined;
        })(),
        []
    );

    const load = useCallback(async () => {
        const headers = await headersPromise;
        const [notesRes, contentRes] = await Promise.allSettled([
            apiClient.get(`/api/notes/course/${courseId}`, { headers } as any),
            apiClient.get(`/content`, { headers, params: { courseId } } as any)
        ]);

        if (notesRes.status === 'fulfilled') {
            setNotes(Array.isArray(notesRes.value) ? (notesRes.value as any) : []);
        } else {
            setNotes([]);
        }

        if (contentRes.status === 'fulfilled') {
            const value: any = contentRes.value;
            const items: any[] = Array.isArray(value) ? value : value?.content || [];
            setContents(items.map((c) => ({ id: c.id, title: c.title, type: c.type })));
        } else {
            setContents([]);
        }
    }, [courseId, headersPromise]);

    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                await load();
            } catch (e: any) {
                console.log('[Notes] load failed', e?.message || e);
            } finally {
                setLoading(false);
            }
        })();
    }, [load]);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await load();
        } finally {
            setRefreshing(false);
        }
    }, [load]);

    const handleCreate = useCallback(async () => {
        if (!selectedContent) {
            Alert.alert(t('notes') || 'Notlar', t('select_content_first') || 'Önce bir içerik seçin.');
            return;
        }
        if (!text.trim()) return;

        setSaving(true);
        try {
            const headers = await headersPromise;
            await apiClient.post(
                `/api/notes`,
                {
                    contentId: selectedContent.id,
                    contentType: String(selectedContent.type || 'lesson'),
                    text
                },
                { headers } as any
            );

            setComposerOpen(false);
            setText('');
            await load();
        } catch (e: any) {
            console.log('[Notes] create failed', e?.message || e);
            Alert.alert(t('error') || 'Hata', t('save_failed') || 'Kaydedilemedi.');
        } finally {
            setSaving(false);
        }
    }, [headersPromise, load, selectedContent, t, text]);

    const handleUpdate = useCallback(async () => {
        if (!editingId) return;
        if (!editText.trim()) return;

        try {
            const headers = await headersPromise;
            await apiClient.put(`/api/notes/${editingId}`, { text: editText }, { headers } as any);
            setEditingId(null);
            setEditText('');
            await load();
        } catch (e: any) {
            console.log('[Notes] update failed', e?.message || e);
            Alert.alert(t('error') || 'Hata', t('update_failed') || 'Güncellenemedi.');
        }
    }, [editText, editingId, headersPromise, load, t]);

    const handleDelete = useCallback(
        (id: string) => {
            Alert.alert(t('confirm') || 'Onay', t('delete_note_confirm') || 'Not silinsin mi?', [
                { text: t('cancel') || 'İptal', style: 'cancel' },
                {
                    text: t('delete') || 'Sil',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const headers = await headersPromise;
                            await apiClient.delete(`/api/notes/${id}`, { headers } as any);
                            await load();
                        } catch (e: any) {
                            console.log('[Notes] delete failed', e?.message || e);
                            Alert.alert(t('error') || 'Hata', t('delete_failed') || 'Silinemedi.');
                        }
                    }
                }
            ]);
        },
        [headersPromise, load, t]
    );

    const filteredContents = useMemo(() => {
        const q = contentSearch.trim().toLowerCase();
        if (!q) return contents;
        return contents.filter((c) => c.title.toLowerCase().includes(q));
    }, [contentSearch, contents]);

    if (loading) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={onBack} style={styles.backBtn}>
                    <Feather name="arrow-left" size={22} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>{t('notes') || 'Notlar'}</Text>
                <TouchableOpacity onPress={() => setComposerOpen(true)} style={[styles.addBtn, { backgroundColor: colors.primary }]}>
                    <Feather name="plus" size={18} color="#fff" />
                </TouchableOpacity>
            </View>

            <FlatList
                data={notes}
                keyExtractor={(n) => n.id}
                refreshing={refreshing}
                onRefresh={handleRefresh}
                contentContainerStyle={{ padding: 16 }}
                ListEmptyComponent={
                    <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 20 }}>
                        {t('no_notes') || 'Henüz not yok.'}
                    </Text>
                }
                renderItem={({ item }) => {
                    const isEditing = editingId === item.id;
                    const title = item.contentTitle || contents.find((c) => c.id === item.contentId)?.title || item.contentId;
                    const when = new Date(item.updatedAt || item.createdAt);
                    return (
                        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                            <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={1}>
                                {title}
                            </Text>
                            <Text style={{ color: colors.textSecondary, marginTop: 2, marginBottom: 10 }}>
                                {when.toLocaleDateString()} {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>

                            {isEditing ? (
                                <>
                                    <TextInput
                                        value={editText}
                                        onChangeText={setEditText}
                                        multiline
                                        style={[
                                            styles.input,
                                            { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }
                                        ]}
                                    />
                                    <View style={styles.actionsRow}>
                                        <TouchableOpacity onPress={handleUpdate} style={[styles.actionBtn, { backgroundColor: colors.primary }]}>
                                            <Text style={styles.actionText}>{t('save') || 'Kaydet'}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => {
                                                setEditingId(null);
                                                setEditText('');
                                            }}
                                            style={[styles.actionBtn, { borderColor: colors.border, borderWidth: 1 }]}
                                        >
                                            <Text style={[styles.actionText, { color: colors.text }]}>{t('cancel') || 'İptal'}</Text>
                                        </TouchableOpacity>
                                    </View>
                                </>
                            ) : (
                                <>
                                    <Text style={{ color: colors.text }}>{item.text}</Text>
                                    <View style={styles.noteFooter}>
                                        <View style={{ flex: 1 }} />
                                        <TouchableOpacity
                                            onPress={() => {
                                                setEditingId(item.id);
                                                setEditText(item.text);
                                            }}
                                            style={styles.iconBtn}
                                        >
                                            <Feather name="edit-2" size={16} color={colors.primary} />
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.iconBtn}>
                                            <Feather name="trash-2" size={16} color={colors.error} />
                                        </TouchableOpacity>
                                    </View>
                                </>
                            )}
                        </View>
                    );
                }}
            />

            <Modal visible={composerOpen} animationType="slide" onRequestClose={() => setComposerOpen(false)}>
                <View style={[styles.modal, { backgroundColor: colors.background }]}>
                    <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                        <TouchableOpacity onPress={() => setComposerOpen(false)} style={styles.backBtn}>
                            <Feather name="x" size={22} color={colors.text} />
                        </TouchableOpacity>
                        <Text style={[styles.modalTitle, { color: colors.text }]}>{t('add_note') || 'Not Ekle'}</Text>
                        <View style={{ width: 40 }} />
                    </View>

                    <TouchableOpacity
                        onPress={() => setContentPickerOpen(true)}
                        style={[styles.picker, { backgroundColor: colors.card, borderColor: colors.border }]}
                    >
                        <Feather name="link" size={16} color={colors.textSecondary} />
                        <Text style={{ color: colors.text, marginLeft: 10, flex: 1 }} numberOfLines={1}>
                            {selectedContent?.title || (t('select_content') || 'İçerik Seç')}
                        </Text>
                        <Feather name="chevron-right" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>

                    <TextInput
                        value={text}
                        onChangeText={setText}
                        placeholder={t('write_note') || 'Not yaz...'}
                        placeholderTextColor={colors.textSecondary}
                        multiline
                        style={[
                            styles.textarea,
                            { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }
                        ]}
                    />

                    <TouchableOpacity
                        onPress={handleCreate}
                        disabled={saving || !text.trim()}
                        style={[styles.primaryBtn, { backgroundColor: saving ? colors.border : colors.primary }]}
                    >
                        <Text style={styles.primaryText}>{saving ? (t('saving') || '...') : (t('save') || 'Kaydet')}</Text>
                    </TouchableOpacity>

                    <Modal visible={contentPickerOpen} animationType="slide" onRequestClose={() => setContentPickerOpen(false)}>
                        <View style={[styles.modal, { backgroundColor: colors.background }]}>
                            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                                <TouchableOpacity onPress={() => setContentPickerOpen(false)} style={styles.backBtn}>
                                    <Feather name="arrow-left" size={22} color={colors.text} />
                                </TouchableOpacity>
                                <Text style={[styles.modalTitle, { color: colors.text }]}>{t('select_content') || 'İçerik Seç'}</Text>
                                <View style={{ width: 40 }} />
                            </View>
                            <View style={{ padding: 16 }}>
                                <TextInput
                                    value={contentSearch}
                                    onChangeText={setContentSearch}
                                    placeholder={t('search') || 'Ara...'}
                                    placeholderTextColor={colors.textSecondary}
                                    style={[
                                        styles.input,
                                        { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }
                                    ]}
                                />
                                <FlatList
                                    data={filteredContents}
                                    keyExtractor={(c) => c.id}
                                    renderItem={({ item }) => (
                                        <TouchableOpacity
                                            onPress={() => {
                                                setSelectedContent(item);
                                                setContentPickerOpen(false);
                                            }}
                                            style={[styles.contentOption, { backgroundColor: colors.card, borderColor: colors.border }]}
                                        >
                                            <Text style={{ color: colors.text, fontWeight: '600' }} numberOfLines={1}>
                                                {item.title}
                                            </Text>
                                            <Text style={{ color: colors.textSecondary }}>{String(item.type).toUpperCase()}</Text>
                                        </TouchableOpacity>
                                    )}
                                    ListEmptyComponent={
                                        <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 20 }}>
                                            {t('no_content_yet') || 'İçerik yok.'}
                                        </Text>
                                    }
                                />
                            </View>
                        </View>
                    </Modal>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        paddingTop: 48,
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        flexDirection: 'row',
        alignItems: 'center'
    },
    backBtn: { padding: 6, marginRight: 10 },
    headerTitle: { flex: 1, fontSize: 18, fontWeight: '800' },
    addBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
    noteFooter: { flexDirection: 'row', marginTop: 10, alignItems: 'center' },
    iconBtn: { padding: 8 },
    modal: { flex: 1 },
    modalHeader: {
        paddingTop: 48,
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        flexDirection: 'row',
        alignItems: 'center'
    },
    modalTitle: { flex: 1, fontSize: 18, fontWeight: '800' },
    picker: {
        margin: 16,
        borderWidth: 1,
        borderRadius: 14,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center'
    },
    textarea: { marginHorizontal: 16, borderWidth: 1, borderRadius: 14, padding: 14, minHeight: 140, textAlignVertical: 'top' },
    primaryBtn: { margin: 16, borderRadius: 14, height: 48, alignItems: 'center', justifyContent: 'center' },
    primaryText: { color: '#fff', fontWeight: '800' },
    input: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12 },
    contentOption: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
    actionsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    actionBtn: { flex: 1, borderRadius: 12, height: 44, alignItems: 'center', justifyContent: 'center' },
    actionText: { color: '#fff', fontWeight: '800' }
});


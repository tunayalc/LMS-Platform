import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, Alert, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';

interface Note {
    id: string;
    contentId: string;
    text: string;
    timestamp?: number;
    position?: number;
    createdAt: string;
}

interface MobileNotesPanelProps {
    contentId: string;
    contentTitle?: string;
    currentPosition?: number;
    visible: boolean;
    onClose: () => void;
}

const NOTES_KEY = 'mobile_notes';

export default function MobileNotesPanel({
    contentId,
    contentTitle,
    currentPosition,
    visible,
    onClose
}: MobileNotesPanelProps) {
    const [notes, setNotes] = useState<Note[]>([]);
    const [newNote, setNewNote] = useState('');
    const [loading, setLoading] = useState(false);

    const { colors, isDark } = useTheme();
    const { t, i18n } = useTranslation();
    const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

    // Load notes from AsyncStorage
    const loadNotes = useCallback(async () => {
        try {
            const stored = await AsyncStorage.getItem(NOTES_KEY);
            if (stored) {
                const allNotes: Note[] = JSON.parse(stored);
                const contentNotes = allNotes.filter(n => n.contentId === contentId);
                setNotes(contentNotes.sort((a, b) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                ));
            }
        } catch (err) {
            console.error('Load notes error:', err);
        }
    }, [contentId]);

    useEffect(() => {
        if (visible) {
            loadNotes();
        }
    }, [visible, loadNotes]);

    // Add new note
    const handleAddNote = async () => {
        if (!newNote.trim()) {
            Alert.alert(t('error'), t('note_text_required'));
            return;
        }

        setLoading(true);
        try {
            const note: Note = {
                id: Date.now().toString(),
                contentId,
                text: newNote.trim(),
                timestamp: currentPosition,
                createdAt: new Date().toISOString()
            };

            // Get existing notes and add new one
            const stored = await AsyncStorage.getItem(NOTES_KEY);
            const allNotes: Note[] = stored ? JSON.parse(stored) : [];
            allNotes.push(note);
            await AsyncStorage.setItem(NOTES_KEY, JSON.stringify(allNotes));

            setNewNote('');
            loadNotes();
        } catch (err) {
            Alert.alert(t('error'), t('note_save_failed'));
        } finally {
            setLoading(false);
        }
    };

    // Delete note
    const handleDeleteNote = async (noteId: string) => {
        Alert.alert(
            t('delete_note'),
            t('delete_note_confirm'),
            [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: t('delete'),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const stored = await AsyncStorage.getItem(NOTES_KEY);
                            if (stored) {
                                const allNotes: Note[] = JSON.parse(stored);
                                const filtered = allNotes.filter(n => n.id !== noteId);
                                await AsyncStorage.setItem(NOTES_KEY, JSON.stringify(filtered));
                                loadNotes();
                            }
                        } catch (err) {
                            Alert.alert(t('error'), t('note_delete_failed'));
                        }
                    }
                }
            ]
        );
    };

    const formatTimestamp = (seconds?: number) => {
        if (!seconds) return null;
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const dateLocale = useMemo(() => {
        switch (i18n.language) {
            case 'tr':
                return 'tr-TR';
            case 'de':
                return 'de-DE';
            case 'fr':
                return 'fr-FR';
            default:
                return 'en-US';
        }
    }, [i18n.language]);

    const renderNote = ({ item }: { item: Note }) => (
        <View style={styles.noteItem}>
            <View style={styles.noteHeader}>
                {item.timestamp && (
                    <Text style={styles.timestamp}>⏱ {formatTimestamp(item.timestamp)}</Text>
                )}
                <Text style={styles.date}>
                    {new Date(item.createdAt).toLocaleDateString(dateLocale)}
                </Text>
            </View>
            <Text style={styles.noteText}>{item.text}</Text>
            <Pressable
                style={styles.deleteBtn}
                onPress={() => handleDeleteNote(item.id)}
            >
                <Text style={styles.deleteBtnText}>🗑</Text>
            </Pressable>
        </View>
    );

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={onClose}
        >
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>{t('notes')}</Text>
                    <Pressable onPress={onClose} style={styles.closeBtn}>
                        <Text style={styles.closeBtnText}>✕</Text>
                    </Pressable>
                </View>

                {contentTitle && (
                    <Text style={styles.contentTitle} numberOfLines={1}>
                        {contentTitle}
                    </Text>
                )}

                {/* Add Note Input */}
                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.input}
                        placeholder={t('add_note_placeholder')}
                        placeholderTextColor={colors.textSecondary}
                        value={newNote}
                        onChangeText={setNewNote}
                        multiline
                        maxLength={500}
                    />
                    <Pressable
                        style={[styles.addBtn, loading && styles.addBtnDisabled]}
                        onPress={handleAddNote}
                        disabled={loading}
                    >
                        <Text style={styles.addBtnText}>
                            {loading ? '...' : `+ ${t('add')}`}
                        </Text>
                    </Pressable>
                </View>

                {currentPosition ? (
                    <Text style={styles.positionHint}>
                        {t('note_saved_at', { time: formatTimestamp(currentPosition) })}
                    </Text>
                ) : null}

                {/* Notes List */}
                {notes.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyText}>{t('no_notes')}</Text>
                        <Text style={styles.emptyHint}>{t('no_notes_hint')}</Text>
                    </View>
                ) : (
                    <FlatList
                        data={notes}
                        renderItem={renderNote}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={styles.listContent}
                    />
                )}
            </View>
        </Modal>
    );
}

type ThemeColors = ReturnType<typeof useTheme>['colors'];

const createStyles = (colors: ThemeColors, isDark: boolean) =>
    StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: colors.card,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.text,
    },
    closeBtn: {
        padding: 8,
    },
    closeBtnText: {
        fontSize: 20,
        color: colors.textSecondary,
    },
    contentTitle: {
        fontSize: 14,
        color: colors.textSecondary,
        paddingHorizontal: 20,
        paddingTop: 12,
    },
    inputContainer: {
        flexDirection: 'row',
        padding: 16,
        backgroundColor: colors.card,
        gap: 12,
        alignItems: 'flex-end',
    },
    input: {
        flex: 1,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        padding: 12,
        fontSize: 15,
        color: colors.text,
        minHeight: 44,
        maxHeight: 100,
        backgroundColor: colors.surface,
    },
    addBtn: {
        backgroundColor: colors.primary,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 8,
    },
    addBtnDisabled: {
        backgroundColor: isDark ? 'rgba(148, 163, 184, 0.35)' : colors.border,
    },
    addBtnText: {
        color: colors.primaryText,
        fontWeight: '600',
    },
    positionHint: {
        fontSize: 12,
        color: colors.textSecondary,
        paddingHorizontal: 20,
        paddingBottom: 8,
    },
    listContent: {
        padding: 16,
    },
    noteItem: {
        backgroundColor: colors.card,
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: isDark ? 0.25 : 0.05,
        shadowRadius: 3,
        elevation: 2,
        position: 'relative',
    },
    noteHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    timestamp: {
        fontSize: 12,
        color: colors.primary,
        fontWeight: '600',
    },
    date: {
        fontSize: 12,
        color: colors.textSecondary,
    },
    noteText: {
        fontSize: 15,
        color: colors.text,
        lineHeight: 22,
    },
    deleteBtn: {
        position: 'absolute',
        bottom: 12,
        right: 12,
        padding: 4,
    },
    deleteBtnText: {
        fontSize: 16,
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    emptyText: {
        fontSize: 16,
        color: colors.textSecondary,
        marginBottom: 8,
    },
    emptyHint: {
        fontSize: 14,
        color: colors.textSecondary,
        textAlign: 'center',
    },
});

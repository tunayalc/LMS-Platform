import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    TextInput,
    StyleSheet,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';

interface Note {
    id: string;
    content: string;
    createdAt: string;
    updatedAt: string;
}

interface NotesPanelScreenProps {
    apiClient: any;
    token: string;
    courseId?: string;
    onBack: () => void;
}

export default function NotesPanelScreen({
    apiClient,
    token,
    courseId,
    onBack
}: NotesPanelScreenProps) {
    const { t } = useTranslation();
    const { colors } = useTheme();
    const [notes, setNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);
    const [newNote, setNewNote] = useState('');
    const [saving, setSaving] = useState(false);
    const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');

    useEffect(() => {
        loadNotes();
    }, [courseId]);

    const loadNotes = async () => {
        setLoading(true);
        try {
            const endpoint = courseId ? `/notes/course/${courseId}` : '/notes';
            const response = await apiClient.get(endpoint, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setNotes(response.notes || response || []);
        } catch (error) {
            console.error('Notes load error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddNote = async () => {
        if (!newNote.trim()) return;

        setSaving(true);
        try {
            const response = await apiClient.post('/notes', {
                content: newNote,
                courseId
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setNotes([response.note || response, ...notes]);
            setNewNote('');
        } catch (error) {
            console.error('Note create error:', error);
            Alert.alert(t('error'), t('save_failed'));
        } finally {
            setSaving(false);
        }
    };

    const handleUpdateNote = async (noteId: string) => {
        if (!editContent.trim()) return;

        try {
            await apiClient.put(`/notes/${noteId}`, {
                content: editContent
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setNotes(notes.map(n =>
                n.id === noteId ? { ...n, content: editContent, updatedAt: new Date().toISOString() } : n
            ));
            setEditingNoteId(null);
            setEditContent('');
        } catch (error) {
            console.error('Note update error:', error);
            Alert.alert(t('error'), t('update_failed'));
        }
    };

    const handleDeleteNote = async (noteId: string) => {
        Alert.alert(
            t('confirm'),
            t('delete_note_confirm'),
            [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: t('delete'),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await apiClient.delete(`/notes/${noteId}`, {
                                headers: { Authorization: `Bearer ${token}` }
                            });
                            setNotes(notes.filter(n => n.id !== noteId));
                        } catch (error) {
                            console.error('Note delete error:', error);
                            Alert.alert(t('error'), t('delete_failed'));
                        }
                    }
                }
            ]
        );
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const renderNote = ({ item }: { item: Note }) => {
        const isEditing = editingNoteId === item.id;

        return (
            <View style={[styles.noteCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {isEditing ? (
                    <View>
                        <TextInput
                            style={[styles.editInput, {
                                backgroundColor: colors.inputBackground,
                                borderColor: colors.border,
                                color: colors.text
                            }]}
                            value={editContent}
                            onChangeText={setEditContent}
                            multiline
                            autoFocus
                        />
                        <View style={styles.editActions}>
                            <TouchableOpacity
                                style={[styles.actionButton, { backgroundColor: colors.primary }]}
                                onPress={() => handleUpdateNote(item.id)}
                            >
                                <Text style={{ color: '#fff' }}>{t('save')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.actionButton, { borderColor: colors.border, borderWidth: 1 }]}
                                onPress={() => { setEditingNoteId(null); setEditContent(''); }}
                            >
                                <Text style={{ color: colors.text }}>{t('cancel')}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    <View>
                        <Text style={[styles.noteContent, { color: colors.text }]}>{item.content}</Text>
                        <View style={styles.noteFooter}>
                            <Text style={[styles.noteDate, { color: colors.textSecondary }]}>
                                {formatDate(item.updatedAt || item.createdAt)}
                            </Text>
                            <View style={styles.noteActions}>
                                <TouchableOpacity
                                    onPress={() => { setEditingNoteId(item.id); setEditContent(item.content); }}
                                    style={styles.iconButton}
                                >
                                    <Text style={{ color: colors.primary }}>✏️</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => handleDeleteNote(item.id)}
                                    style={styles.iconButton}
                                >
                                    <Text style={{ color: colors.error }}>🗑️</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                )}
            </View>
        );
    };

    return (
        <KeyboardAvoidingView
            style={[styles.container, { backgroundColor: colors.background }]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={onBack} style={styles.backButton}>
                    <Text style={{ color: colors.primary, fontSize: 16 }}>← {t('back')}</Text>
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors.text }]}>{t('notes')}</Text>
                <View style={{ width: 60 }} />
            </View>

            {/* New Note Input */}
            <View style={[styles.newNoteContainer, { borderBottomColor: colors.border }]}>
                <TextInput
                    style={[styles.newNoteInput, {
                        backgroundColor: colors.inputBackground,
                        borderColor: colors.border,
                        color: colors.text
                    }]}
                    placeholder={t('add_note')}
                    placeholderTextColor={colors.textSecondary}
                    value={newNote}
                    onChangeText={setNewNote}
                    multiline
                />
                <TouchableOpacity
                    style={[styles.addButton, { backgroundColor: colors.primary }]}
                    onPress={handleAddNote}
                    disabled={saving || !newNote.trim()}
                >
                    {saving ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <Text style={{ color: '#fff', fontWeight: '600' }}>+</Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* Notes List */}
            {loading ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={notes}
                    renderItem={renderNote}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.centered}>
                            <Text style={{ color: colors.textSecondary }}>📝 {t('no_notes')}</Text>
                        </View>
                    }
                />
            )}
        </KeyboardAvoidingView>
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
    newNoteContainer: {
        flexDirection: 'row',
        padding: 12,
        gap: 10,
        borderBottomWidth: 1,
    },
    newNoteInput: {
        flex: 1,
        minHeight: 44,
        maxHeight: 100,
        borderRadius: 10,
        borderWidth: 1,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 15,
    },
    addButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
    listContent: {
        padding: 16,
    },
    noteCard: {
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 12,
    },
    noteContent: {
        fontSize: 15,
        lineHeight: 22,
    },
    noteFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 10,
    },
    noteDate: {
        fontSize: 12,
    },
    noteActions: {
        flexDirection: 'row',
        gap: 8,
    },
    iconButton: {
        padding: 4,
    },
    editInput: {
        minHeight: 80,
        borderRadius: 10,
        borderWidth: 1,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 15,
        textAlignVertical: 'top',
    },
    editActions: {
        flexDirection: 'row',
        marginTop: 10,
        gap: 10,
    },
    actionButton: {
        flex: 1,
        height: 40,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 40,
    },
});

import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Alert
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';

interface Template {
    id: string;
    title: string;
    description: string;
    category: string;
    usage_count: number;
}

interface TemplateSelectorScreenProps {
    apiClient: any;
    token: string;
    onSelect: (templateId: string) => void;
    onCancel: () => void;
}

export default function TemplateSelectorScreen({
    apiClient,
    token,
    onSelect,
    onCancel
}: TemplateSelectorScreenProps) {
    const { t } = useTranslation();
    const { colors } = useTheme();
    const [templates, setTemplates] = useState<Template[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadTemplates();
    }, []);

    const loadTemplates = async () => {
        try {
            const response = await apiClient.get('/templates', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setTemplates(Array.isArray(response) ? response : response.templates || []);
        } catch (error) {
            console.error('Load templates error:', error);
            Alert.alert(t('error'), t('templates_load_failed'));
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = (templateId: string) => {
        onSelect(templateId);
    };

    const renderTemplate = ({ item }: { item: Template }) => (
        <TouchableOpacity
            style={[styles.templateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => handleSelect(item.id)}
        >
            <Text style={[styles.templateTitle, { color: colors.text }]}>{item.title}</Text>
            {item.description && (
                <Text style={[styles.templateDesc, { color: colors.textSecondary }]} numberOfLines={2}>
                    {item.description}
                </Text>
            )}
            <View style={styles.templateMeta}>
                <Text style={[styles.categoryBadge, { backgroundColor: colors.primaryLight, color: colors.primary }]}>
                    {item.category || t('general')}
                </Text>
                <Text style={[styles.usageText, { color: colors.textSecondary }]}>
                    {t('used_times', { count: item.usage_count || 0 })}
                </Text>
            </View>
        </TouchableOpacity>
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={onCancel} style={styles.backButton}>
                    <Text style={{ color: colors.primary, fontSize: 16 }}>← {t('cancel')}</Text>
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors.text }]}>{t('create_from_template')}</Text>
                <View style={{ width: 60 }} />
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={{ color: colors.textSecondary, marginTop: 12 }}>{t('templates_loading')}</Text>
                </View>
            ) : (
                <FlatList
                    data={[{ id: 'empty', title: t('empty_course'), description: t('empty_course_desc'), category: '', usage_count: 0 }, ...templates]}
                    renderItem={renderTemplate}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                            {t('no_templates_yet')}
                        </Text>
                    }
                />
            )}
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
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContent: {
        padding: 16,
    },
    templateCard: {
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 12,
    },
    templateTitle: {
        fontSize: 17,
        fontWeight: '600',
        marginBottom: 4,
    },
    templateDesc: {
        fontSize: 14,
        marginBottom: 10,
    },
    templateMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    categoryBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        fontSize: 12,
        fontWeight: '500',
    },
    usageText: {
        fontSize: 12,
    },
    emptyText: {
        textAlign: 'center',
        marginTop: 40,
        fontSize: 15,
    },
});

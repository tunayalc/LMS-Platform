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
    ScrollView
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';

interface RubricItem {
    id?: string;
    criteria: string;
    points: number;
    description: string;
}

interface Rubric {
    id: string;
    name: string;
    items: RubricItem[];
}

interface RubricEditorScreenProps {
    apiClient: any;
    token: string;
    examId?: string;
    onBack: () => void;
    onSave?: (rubric: Rubric) => void;
}

export default function RubricEditorScreen({
    apiClient,
    token,
    examId,
    onBack,
    onSave
}: RubricEditorScreenProps) {
    const { t } = useTranslation();
    const { colors } = useTheme();
    const [rubricName, setRubricName] = useState('');
    const [items, setItems] = useState<RubricItem[]>([
        { criteria: '', points: 0, description: '' }
    ]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const addItem = () => {
        setItems([...items, { criteria: '', points: 0, description: '' }]);
    };

    const removeItem = (index: number) => {
        if (items.length > 1) {
            setItems(items.filter((_, i) => i !== index));
        }
    };

    const updateItem = (index: number, field: keyof RubricItem, value: string | number) => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], [field]: value };
        setItems(newItems);
    };

    const handleSave = async () => {
        if (!rubricName.trim()) {
            Alert.alert(t('error'), t('rubric_name_required'));
            return;
        }

        const validItems = items.filter(item => item.criteria.trim());
        if (validItems.length === 0) {
            Alert.alert(t('error'), t('rubric_criteria_required'));
            return;
        }

        setSaving(true);
        try {
            const response = await apiClient.post('/rubrics', {
                name: rubricName,
                examId,
                items: validItems
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            onSave?.(response.rubric || response);
            Alert.alert(t('success'), t('rubric_saved'));
            onBack();
        } catch (error) {
            console.error('Rubric save error:', error);
            Alert.alert(t('error'), t('save_failed'));
        } finally {
            setSaving(false);
        }
    };

    const totalPoints = items.reduce((sum, item) => sum + (Number(item.points) || 0), 0);

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={onBack} style={styles.backButton}>
                    <Text style={{ color: colors.primary, fontSize: 16 }}>← {t('back')}</Text>
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors.text }]}>{t('rubric_editor')}</Text>
                <TouchableOpacity onPress={handleSave} disabled={saving}>
                    {saving ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                        <Text style={{ color: colors.primary, fontWeight: '600' }}>{t('save')}</Text>
                    )}
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {/* Rubric Name */}
                <View style={styles.field}>
                    <Text style={[styles.label, { color: colors.text }]}>{t('rubric_name')}</Text>
                    <TextInput
                        style={[styles.input, {
                            backgroundColor: colors.inputBackground,
                            borderColor: colors.border,
                            color: colors.text
                        }]}
                        placeholder={t('enter_rubric_name')}
                        placeholderTextColor={colors.textSecondary}
                        value={rubricName}
                        onChangeText={setRubricName}
                    />
                </View>

                {/* Rubric Items */}
                <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('criteria')}</Text>

                {items.map((item, index) => (
                    <View
                        key={index}
                        style={[styles.itemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    >
                        <View style={styles.itemHeader}>
                            <Text style={[styles.itemNumber, { color: colors.primary }]}>#{index + 1}</Text>
                            {items.length > 1 && (
                                <TouchableOpacity onPress={() => removeItem(index)}>
                                    <Text style={{ color: colors.error }}>✕</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        <TextInput
                            style={[styles.input, {
                                backgroundColor: colors.inputBackground,
                                borderColor: colors.border,
                                color: colors.text
                            }]}
                            placeholder={t('criteria_name')}
                            placeholderTextColor={colors.textSecondary}
                            value={item.criteria}
                            onChangeText={(v) => updateItem(index, 'criteria', v)}
                        />

                        <View style={styles.row}>
                            <View style={[styles.pointsField]}>
                                <Text style={[styles.smallLabel, { color: colors.textSecondary }]}>{t('points')}</Text>
                                <TextInput
                                    style={[styles.pointsInput, {
                                        backgroundColor: colors.inputBackground,
                                        borderColor: colors.border,
                                        color: colors.text
                                    }]}
                                    keyboardType="numeric"
                                    value={String(item.points || '')}
                                    onChangeText={(v) => updateItem(index, 'points', Number(v) || 0)}
                                />
                            </View>
                        </View>

                        <TextInput
                            style={[styles.input, styles.descInput, {
                                backgroundColor: colors.inputBackground,
                                borderColor: colors.border,
                                color: colors.text
                            }]}
                            placeholder={t('description')}
                            placeholderTextColor={colors.textSecondary}
                            value={item.description}
                            onChangeText={(v) => updateItem(index, 'description', v)}
                            multiline
                            numberOfLines={2}
                        />
                    </View>
                ))}

                <TouchableOpacity
                    style={[styles.addButton, { borderColor: colors.primary }]}
                    onPress={addItem}
                >
                    <Text style={{ color: colors.primary, fontWeight: '600' }}>+ {t('add_criteria')}</Text>
                </TouchableOpacity>

                {/* Total */}
                <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
                    <Text style={[styles.totalLabel, { color: colors.text }]}>{t('total_points')}</Text>
                    <Text style={[styles.totalValue, { color: colors.primary }]}>{totalPoints}</Text>
                </View>
            </ScrollView>
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
    content: {
        padding: 16,
    },
    field: {
        marginBottom: 16,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 6,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        marginTop: 8,
        marginBottom: 12,
    },
    input: {
        height: 44,
        borderRadius: 10,
        borderWidth: 1,
        paddingHorizontal: 14,
        fontSize: 15,
    },
    itemCard: {
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 12,
    },
    itemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    itemNumber: {
        fontWeight: '700',
        fontSize: 14,
    },
    row: {
        flexDirection: 'row',
        marginTop: 10,
        gap: 12,
    },
    pointsField: {
        flex: 1,
    },
    smallLabel: {
        fontSize: 12,
        marginBottom: 4,
    },
    pointsInput: {
        height: 40,
        borderRadius: 8,
        borderWidth: 1,
        paddingHorizontal: 12,
        fontSize: 15,
        textAlign: 'center',
    },
    descInput: {
        marginTop: 10,
        height: 60,
        textAlignVertical: 'top',
        paddingTop: 10,
    },
    addButton: {
        height: 44,
        borderRadius: 10,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingTop: 16,
        borderTopWidth: 1,
        marginTop: 8,
    },
    totalLabel: {
        fontSize: 16,
        fontWeight: '600',
    },
    totalValue: {
        fontSize: 20,
        fontWeight: '700',
    },
});

import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Alert,
    ScrollView
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';

interface PlagiarismMatch {
    source: string;
    similarity: number;
    text: string;
}

interface PlagiarismResult {
    isClean: boolean;
    maxSimilarity: number;
    matches: PlagiarismMatch[];
}

interface PlagiarismScreenProps {
    apiClient: any;
    token: string;
    contentId: string;
    contentTitle: string;
    onBack: () => void;
}

export default function PlagiarismScreen({
    apiClient,
    token,
    contentId,
    contentTitle,
    onBack
}: PlagiarismScreenProps) {
    const { t } = useTranslation();
    const { colors } = useTheme();
    const [checking, setChecking] = useState(false);
    const [result, setResult] = useState<PlagiarismResult | null>(null);

    const runCheck = async () => {
        setChecking(true);
        try {
            const response = await apiClient.post('/plagiarism/check', {
                contentId
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setResult(response);
        } catch (error) {
            console.error('Plagiarism check error:', error);
            Alert.alert(t('error'), t('plagiarism_check_error'));
        } finally {
            setChecking(false);
        }
    };

    const getSimilarityColor = (similarity: number) => {
        if (similarity < 20) return colors.success || '#22c55e';
        if (similarity < 50) return colors.warning || '#f59e0b';
        return colors.error || '#ef4444';
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={onBack} style={styles.backButton}>
                    <Text style={{ color: colors.primary, fontSize: 16 }}>← {t('back')}</Text>
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors.text }]}>{t('plagiarism')}</Text>
                <View style={{ width: 60 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {/* Content Info */}
                <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.contentTitle, { color: colors.text }]}>{contentTitle}</Text>
                    <Text style={[styles.contentId, { color: colors.textSecondary }]}>ID: {contentId}</Text>
                </View>

                {/* Check Button */}
                {!result && (
                    <TouchableOpacity
                        style={[styles.checkButton, { backgroundColor: colors.primary }]}
                        onPress={runCheck}
                        disabled={checking}
                    >
                        {checking ? (
                            <View style={styles.checkingRow}>
                                <ActivityIndicator size="small" color="#fff" />
                                <Text style={styles.checkButtonText}>{t('checking')}</Text>
                            </View>
                        ) : (
                            <Text style={styles.checkButtonText}>{t('check_plagiarism')}</Text>
                        )}
                    </TouchableOpacity>
                )}

                {/* Results */}
                {result && (
                    <View style={styles.resultSection}>
                        {/* Summary */}
                        <View style={[styles.summaryCard, {
                            backgroundColor: result.isClean ? (colors.successLight || '#dcfce7') : (colors.errorLight || '#fef2f2'),
                            borderColor: result.isClean ? (colors.success || '#22c55e') : (colors.error || '#ef4444')
                        }]}>
                            <Text style={[styles.summaryIcon]}>
                                {result.isClean ? '✓' : '⚠'}
                            </Text>
                            <Text style={[styles.summaryText, {
                                color: result.isClean ? (colors.success || '#22c55e') : (colors.error || '#ef4444')
                            }]}>
                                {result.isClean ? t('plagiarism_clean') : t('plagiarism_found')}
                            </Text>
                            <Text style={[styles.similarityValue, { color: getSimilarityColor(result.maxSimilarity) }]}>
                                {result.maxSimilarity}% {t('max_similarity')}
                            </Text>
                        </View>

                        {/* Matches */}
                        {result.matches && result.matches.length > 0 && (
                            <View style={styles.matchesSection}>
                                <Text style={[styles.matchesTitle, { color: colors.text }]}>
                                    {t('total_matches_found', { count: result.matches.length })}
                                </Text>
                                {result.matches.map((match, index) => (
                                    <View key={index} style={[styles.matchCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                        <View style={styles.matchHeader}>
                                            <Text style={[styles.matchSource, { color: colors.text }]}>{match.source}</Text>
                                            <Text style={[styles.matchSimilarity, { color: getSimilarityColor(match.similarity) }]}>
                                                {match.similarity}%
                                            </Text>
                                        </View>
                                        {match.text && (
                                            <Text style={[styles.matchText, { color: colors.textSecondary }]} numberOfLines={3}>
                                                "{match.text}"
                                            </Text>
                                        )}
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* Check Again Button */}
                        <TouchableOpacity
                            style={[styles.checkAgainButton, { borderColor: colors.primary }]}
                            onPress={() => setResult(null)}
                        >
                            <Text style={{ color: colors.primary, fontWeight: '600' }}>{t('check_again')}</Text>
                        </TouchableOpacity>
                    </View>
                )}
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
    infoCard: {
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 20,
    },
    contentTitle: {
        fontSize: 17,
        fontWeight: '600',
        marginBottom: 4,
    },
    contentId: {
        fontSize: 12,
    },
    checkButton: {
        height: 50,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    checkButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    resultSection: {
        marginTop: 20,
    },
    summaryCard: {
        padding: 20,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        marginBottom: 20,
    },
    summaryIcon: {
        fontSize: 36,
        marginBottom: 8,
    },
    summaryText: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 8,
    },
    similarityValue: {
        fontSize: 20,
        fontWeight: '700',
    },
    matchesSection: {
        marginBottom: 20,
    },
    matchesTitle: {
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 12,
    },
    matchCard: {
        padding: 14,
        borderRadius: 10,
        borderWidth: 1,
        marginBottom: 10,
    },
    matchHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    matchSource: {
        fontSize: 14,
        fontWeight: '500',
        flex: 1,
    },
    matchSimilarity: {
        fontSize: 16,
        fontWeight: '700',
    },
    matchText: {
        fontSize: 13,
        fontStyle: 'italic',
    },
    checkAgainButton: {
        height: 46,
        borderRadius: 10,
        borderWidth: 1.5,
        justifyContent: 'center',
        alignItems: 'center',
    },
});

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

interface Submission {
    id: string;
    userId: string;
    username: string;
    score: number;
    passed: boolean;
    submittedAt: string;
    answers?: Record<string, any>;
}

interface ExamSubmissionsScreenProps {
    apiClient: any;
    token: string;
    examId: string;
    examTitle?: string;
    onBack: () => void;
    onViewSubmission?: (submission: Submission) => void;
}

export default function ExamSubmissionsScreen({
    apiClient,
    token,
    examId,
    examTitle,
    onBack,
    onViewSubmission
}: ExamSubmissionsScreenProps) {
    const { t } = useTranslation();
    const { colors } = useTheme();
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ average: 0, passRate: 0, total: 0 });

    useEffect(() => {
        loadSubmissions();
    }, [examId]);

    const loadSubmissions = async () => {
        setLoading(true);
        try {
            const response = await apiClient.get(`/exams/${examId}/submissions`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const subs = response.submissions || response || [];
            setSubmissions(subs);

            // Calculate stats
            if (subs.length > 0) {
                const totalScore = subs.reduce((sum: number, s: Submission) => sum + s.score, 0);
                const passedCount = subs.filter((s: Submission) => s.passed).length;
                setStats({
                    average: Math.round(totalScore / subs.length),
                    passRate: Math.round((passedCount / subs.length) * 100),
                    total: subs.length
                });
            }
        } catch (error) {
            console.error('Submissions load error:', error);
            Alert.alert(t('error'), t('load_failed'));
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const renderSubmission = ({ item }: { item: Submission }) => (
        <TouchableOpacity
            style={[styles.submissionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => onViewSubmission?.(item)}
        >
            <View style={styles.submissionHeader}>
                <Text style={[styles.username, { color: colors.text }]}>👤 {item.username}</Text>
                <View style={[
                    styles.statusBadge,
                    { backgroundColor: item.passed ? colors.success + '20' : colors.error + '20' }
                ]}>
                    <Text style={{ color: item.passed ? colors.success : colors.error, fontSize: 12, fontWeight: '600' }}>
                        {item.passed ? t('passed') : t('failed')}
                    </Text>
                </View>
            </View>

            <View style={styles.submissionDetails}>
                <View style={styles.scoreContainer}>
                    <Text style={[styles.scoreLabel, { color: colors.textSecondary }]}>{t('score')}</Text>
                    <Text style={[styles.scoreValue, { color: item.passed ? colors.success : colors.error }]}>
                        {item.score}%
                    </Text>
                </View>
                <Text style={[styles.submittedAt, { color: colors.textSecondary }]}>
                    {formatDate(item.submittedAt)}
                </Text>
            </View>
        </TouchableOpacity>
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={onBack} style={styles.backButton}>
                    <Text style={{ color: colors.primary, fontSize: 16 }}>← {t('back')}</Text>
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors.text }]}>{t('submissions')}</Text>
                <View style={{ width: 60 }} />
            </View>

            {examTitle && (
                <View style={[styles.examHeader, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.examTitle, { color: colors.text }]}>📝 {examTitle}</Text>
                </View>
            )}

            {/* Stats */}
            {!loading && submissions.length > 0 && (
                <View style={[styles.statsRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                    <View style={styles.statItem}>
                        <Text style={[styles.statValue, { color: colors.primary }]}>{stats.total}</Text>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('total')}</Text>
                    </View>
                    <View style={styles.statItem}>
                        <Text style={[styles.statValue, { color: colors.text }]}>{stats.average}%</Text>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('average')}</Text>
                    </View>
                    <View style={styles.statItem}>
                        <Text style={[styles.statValue, { color: colors.success }]}>{stats.passRate}%</Text>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('pass_rate')}</Text>
                    </View>
                </View>
            )}

            {/* Submissions List */}
            {loading ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={submissions}
                    renderItem={renderSubmission}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.centered}>
                            <Text style={{ color: colors.textSecondary, fontSize: 48, marginBottom: 12 }}>📋</Text>
                            <Text style={{ color: colors.textSecondary }}>{t('no_submissions')}</Text>
                        </View>
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
    examHeader: {
        padding: 16,
    },
    examTitle: {
        fontSize: 16,
        fontWeight: '600',
    },
    statsRow: {
        flexDirection: 'row',
        paddingVertical: 16,
        borderBottomWidth: 1,
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    statValue: {
        fontSize: 24,
        fontWeight: '700',
    },
    statLabel: {
        fontSize: 12,
        marginTop: 4,
    },
    listContent: {
        padding: 16,
    },
    submissionCard: {
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 12,
    },
    submissionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    username: {
        fontSize: 15,
        fontWeight: '600',
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 10,
    },
    submissionDetails: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    scoreContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    scoreLabel: {
        fontSize: 13,
    },
    scoreValue: {
        fontSize: 18,
        fontWeight: '700',
    },
    submittedAt: {
        fontSize: 12,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 60,
    },
});

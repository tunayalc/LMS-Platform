import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import ScreenLayout from '../components/ui/ScreenLayout';
import Header from '../components/ui/Header';
import Card from '../components/ui/Card';
import { Feather } from '@expo/vector-icons';

interface Exam {
    id: string;
    title: string;
    courseId?: string;
    courseTitle?: string;
    durationMinutes?: number | null;
    passThreshold?: number | null;
    startDate?: string;
    endDate?: string;
    isDraft?: boolean;
}

interface ExamsListScreenProps {
    exams: Exam[];
    onExamPress: (exam: Exam) => void;
    onRefresh?: () => Promise<void>;
    onBack?: () => void;
}

export default function ExamsListScreen({
    exams,
    onExamPress,
    onRefresh,
    onBack
}: ExamsListScreenProps) {
    const { t } = useTranslation();
    const { colors } = useTheme();

    const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'completed'>('all');
    const [refreshing, setRefreshing] = useState(false);

    const handleRefresh = async () => {
        if (!onRefresh) return;
        setRefreshing(true);
        try {
            await onRefresh();
        } finally {
            setRefreshing(false);
        }
    };

    const getExamStatus = (exam: Exam): 'draft' | 'pending' | 'in_progress' | 'expired' => {
        if (exam.isDraft) return 'draft';
        const now = Date.now();
        const start = exam.startDate ? Date.parse(exam.startDate) : NaN;
        const end = exam.endDate ? Date.parse(exam.endDate) : NaN;
        if (!Number.isNaN(end) && now > end) return 'expired';
        if (!Number.isNaN(start) && now < start) return 'pending';
        return 'in_progress';
    };

    const getStatusInfo = (status?: string) => {
        switch (status) {
            case 'draft':
                return { text: t('draft', { defaultValue: 'Taslak' }), color: colors.warning, icon: 'file-text' };
            case 'completed':
                return { text: t('completed') || 'Tamamlandı', color: colors.success, icon: 'check-circle' };
            case 'in_progress':
                return { text: t('in_progress') || 'Devam Ediyor', color: colors.warning, icon: 'clock' };
            case 'expired':
                return { text: t('expired') || 'Süresi Doldu', color: colors.error, icon: 'x-circle' };
            default:
                return { text: t('pending') || 'Bekliyor', color: colors.primary, icon: 'calendar' };
        }
    };

    const filteredExams = exams.filter(exam => {
        const status = getExamStatus(exam);
        if (activeTab === 'pending') return status !== 'expired';
        if (activeTab === 'completed') return status === 'expired';
        return true;
    });

    const pendingCount = exams.filter(e => getExamStatus(e) !== 'expired').length;
    const completedCount = exams.filter(e => getExamStatus(e) === 'expired').length;

    const ExamCard = ({ exam }: { exam: Exam }) => {
        const statusInfo = getStatusInfo(getExamStatus(exam));
        const IconName = statusInfo.icon as keyof typeof Feather.glyphMap;

        return (
            <Card onPress={() => onExamPress(exam)} style={styles.examCard}>
                <View style={styles.cardHeader}>
                    <View style={styles.headerLeft}>
                        {exam.courseTitle && (
                            <View style={styles.courseBadge}>
                                <Feather name="book" size={10} color={colors.textSecondary} />
                                <Text style={[styles.courseTitle, { color: colors.textSecondary }]}>
                                    {exam.courseTitle}
                                </Text>
                            </View>
                        )}
                        <Text style={[styles.examTitle, { color: colors.text }]} numberOfLines={2}>
                            {exam.title}
                        </Text>
                    </View>

                    <View style={[styles.statusIcon, { backgroundColor: statusInfo.color + '15' }]}>
                        <Feather name={IconName} size={18} color={statusInfo.color} />
                    </View>
                </View>

                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                <View style={styles.cardFooter}>
                    <View style={styles.metaInfo}>
                        <View style={styles.metaItem}>
                            <Feather name="clock" size={14} color={colors.textSecondary} />
                            <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                                {exam.durationMinutes ? `${exam.durationMinutes} ${t('minutes_short') || 'dk'}` : '-'}
                            </Text>
                        </View>
                        <View style={styles.metaItem}>
                            <Feather name="target" size={14} color={colors.textSecondary} />
                            <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                                {typeof exam.passThreshold === 'number'
                                    ? `${t('pass_grade', { defaultValue: 'Geçme' })}: ${exam.passThreshold}`
                                    : '-'}
                            </Text>
                        </View>
                    </View>
                    <Text style={[styles.statusText, { color: statusInfo.color }]}>
                        {statusInfo.text}
                    </Text>
                </View>
            </Card>
        );
    };

    return (
        <ScreenLayout
            header={
                <Header
                    title={t('exams') || 'Sınavlar'}
                    showBack={!!onBack}
                />
            }
        >
            {/* Filter Tabs */}
            <View style={[styles.tabContainer, { backgroundColor: colors.inputBackground }]}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'all' && { backgroundColor: colors.card, shadowColor: '#000', shadowOpacity: 0.1, elevation: 2 }]}
                    onPress={() => setActiveTab('all')}
                >
                    <Text style={[styles.tabText, { color: activeTab === 'all' ? colors.primary : colors.textSecondary }]}>
                        {t('all')}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'pending' && { backgroundColor: colors.card, shadowColor: '#000', shadowOpacity: 0.1, elevation: 2 }]}
                    onPress={() => setActiveTab('pending')}
                >
                    <Text style={[styles.tabText, { color: activeTab === 'pending' ? colors.warning : colors.textSecondary }]}>
                        {t('pending')} ({pendingCount})
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'completed' && { backgroundColor: colors.card, shadowColor: '#000', shadowOpacity: 0.1, elevation: 2 }]}
                    onPress={() => setActiveTab('completed')}
                >
                    <Text style={[styles.tabText, { color: activeTab === 'completed' ? colors.success : colors.textSecondary }]}>
                        {t('completed')} ({completedCount})
                    </Text>
                </TouchableOpacity>
            </View>

            {/* SEB Notice */}
            <View style={[styles.sebBanner, { backgroundColor: colors.warning + '10', borderColor: colors.warning + '30' }]}>
                <Feather name="shield" size={20} color={colors.warning} />
                <Text style={[styles.sebText, { color: colors.text }]}>
                    {t('seb_notice') || 'Sınavlar için Safe Exam Browser gereklidir.'}
                </Text>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
                }
            >
                {filteredExams.length > 0 ? (
                    filteredExams.map(exam => (
                        <ExamCard key={exam.id} exam={exam} />
                    ))
                ) : (
                    <View style={styles.emptyState}>
                        <Feather name="file-text" size={48} color={colors.border} />
                        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                            {t('no_exams_found') || 'Sınav bulunamadı'}
                        </Text>
                    </View>
                )}
            </ScrollView>
        </ScreenLayout>
    );
}

const styles = StyleSheet.create({
    tabContainer: {
        flexDirection: 'row',
        padding: 4,
        borderRadius: 12,
        marginBottom: 16,
    },
    tab: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: 10,
    },
    tabText: {
        fontSize: 13,
        fontWeight: '600',
    },
    sebBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 16,
        gap: 12,
    },
    sebText: {
        flex: 1,
        fontSize: 13,
    },
    listContent: {
        paddingBottom: 40,
    },
    examCard: {
        marginBottom: 12,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    headerLeft: {
        flex: 1,
        marginRight: 12,
    },
    courseBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
        gap: 4,
    },
    courseTitle: {
        fontSize: 12,
        fontWeight: '500',
    },
    examTitle: {
        fontSize: 16,
        fontWeight: '700',
    },
    statusIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scoreBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    scoreText: {
        fontWeight: '700',
        fontSize: 14,
    },
    divider: {
        height: 1,
        marginVertical: 12,
        opacity: 0.5,
    },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    metaInfo: {
        flexDirection: 'row',
        gap: 16,
    },
    metaItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    metaText: {
        fontSize: 13,
    },
    statusText: {
        fontSize: 13,
        fontWeight: '600',
    },
    emptyState: {
        alignItems: 'center',
        marginTop: 40,
        gap: 12,
    },
    emptyText: {
        fontSize: 16,
    }
});

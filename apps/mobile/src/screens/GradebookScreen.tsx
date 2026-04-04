import React, { useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    TextInput,
    RefreshControl
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { Exam } from '../shared';

interface GradeEntry {
    id: string;
    studentId: string;
    studentName: string;
    examId: string;
    // examTitle might come from the grade object or mapped from exams list
    examTitle: string;
    score: number;
    passingScore: number;
    passed: boolean;
    submittedAt: string;
}

interface GradebookScreenProps {
    grades: GradeEntry[];
    exams: Exam[];
    onBack: () => void;
    onRefresh?: () => Promise<void>;
    onExportGrades?: () => void;
    onStudentPress?: (studentId: string) => void;
}

export default function GradebookScreen({
    grades,
    exams,
    onBack,
    onRefresh,
    onExportGrades,
    onStudentPress
}: GradebookScreenProps) {
    const { t } = useTranslation();
    const { colors } = useTheme();

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedExam, setSelectedExam] = useState<string>('all');
    const [refreshing, setRefreshing] = useState(false);
    const [sortBy, setSortBy] = useState<'name' | 'score' | 'date'>('name');

    const handleRefresh = async () => {
        if (!onRefresh) return;
        setRefreshing(true);
        try {
            await onRefresh();
        } finally {
            setRefreshing(false);
        }
    };

    const filteredGrades = grades
        .filter(grade =>
            grade.studentName.toLowerCase().includes(searchQuery.toLowerCase()) &&
            (selectedExam === 'all' || grade.examId === selectedExam)
        )
        .sort((a, b) => {
            if (sortBy === 'name') return a.studentName.localeCompare(b.studentName);
            if (sortBy === 'score') return b.score - a.score;
            return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
        });

    // Statistics
    const totalCount = filteredGrades.length;
    const passedCount = filteredGrades.filter(g => g.passed).length;
    const failedCount = filteredGrades.filter(g => !g.passed).length;
    const averageScore = totalCount > 0
        ? Math.round(filteredGrades.reduce((sum, g) => sum + g.score, 0) / totalCount)
        : 0;

    const themedStyles = {
        container: { backgroundColor: colors.background },
        card: { backgroundColor: colors.card, borderColor: colors.border },
        textTitle: { color: colors.text },
        textBody: { color: colors.textSecondary },
        input: {
            backgroundColor: colors.inputBackground,
            borderColor: colors.border,
            color: colors.text,
        },
    };

    const renderProgressBar = (score: number, passed: boolean) => {
        return (
            <View style={styles.progressContainer}>
                <View
                    style={[
                        styles.progressBar,
                        {
                            width: `${Math.min(Math.max(score, 0), 100)}%`,
                            backgroundColor: passed ? colors.success : colors.error
                        }
                    ]}
                />
            </View>
        );
    };

    return (
        <View style={[styles.container, themedStyles.container]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onBack} style={styles.backButton}>
                    <Text style={[styles.backText, { color: colors.primary }]}>
                        ← {t('back')}
                    </Text>
                </TouchableOpacity>
                <Text style={[styles.headerTitle, themedStyles.textTitle]}>
                    {t('gradebook') || 'Not Defteri'}
                </Text>
                {onExportGrades && (
                    <TouchableOpacity onPress={onExportGrades} style={styles.iconButton}>
                        <Text style={{ fontSize: 20 }}>📥</Text>
                        {/* Fallback icon if no suitable text key exists for 'Export' */}
                    </TouchableOpacity>
                )}
            </View>

            {/* Stats Cards (Premium Grid) */}
            <View style={styles.statsGrid}>
                <View style={[styles.statCard, { backgroundColor: colors.primary + '10' }]}>
                    <Text style={[styles.statValue, { color: colors.primary }]}>{totalCount}</Text>
                    <Text style={[styles.statLabel, themedStyles.textBody]}>{t('all') || 'Tümü'}</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: colors.success + '10' }]}>
                    <Text style={[styles.statValue, { color: colors.success }]}>{passedCount}</Text>
                    <Text style={[styles.statLabel, themedStyles.textBody]}>{t('pass') || 'Geçti'}</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: colors.error + '10' }]}>
                    <Text style={[styles.statValue, { color: colors.error }]}>{failedCount}</Text>
                    <Text style={[styles.statLabel, themedStyles.textBody]}>{t('fail') || 'Kaldı'}</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: colors.warning + '10' }]}>
                    <Text style={[styles.statValue, { color: colors.warning }]}>%{averageScore}</Text>
                    <Text style={[styles.statLabel, themedStyles.textBody]}>{t('score') || 'Puan'}</Text>
                </View>
            </View>

            {/* Search */}
            <View style={styles.searchSection}>
                <TextInput
                    style={[styles.searchInput, themedStyles.input]}
                    placeholder={t('search') || 'Ara...'}
                    placeholderTextColor={colors.textSecondary}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
            </View>

            {/* Filter Tabs */}
            <View style={styles.filterSection}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filterScroll}
                >
                    <TouchableOpacity
                        style={[
                            styles.filterChip,
                            selectedExam === 'all'
                                ? { backgroundColor: colors.primary }
                                : { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border }
                        ]}
                        onPress={() => setSelectedExam('all')}
                    >
                        <Text style={[
                            styles.filterText,
                            { color: selectedExam === 'all' ? '#fff' : colors.textSecondary }
                        ]}>
                            {t('all') || 'Tümü'}
                        </Text>
                    </TouchableOpacity>
                    {exams.map(exam => (
                        <TouchableOpacity
                            key={exam.id}
                            style={[
                                styles.filterChip,
                                selectedExam === exam.id
                                    ? { backgroundColor: colors.primary }
                                    : { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border }
                            ]}
                            onPress={() => setSelectedExam(exam.id)}
                        >
                            <Text style={[
                                styles.filterText,
                                { color: selectedExam === exam.id ? '#fff' : colors.textSecondary }
                            ]}>
                                {exam.title}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {/* Sort Helper */}
            <View style={styles.sortSection}>
                <Text style={[styles.sortLabel, { color: colors.textSecondary }]}>{t('sort')}:</Text>
                <View style={styles.sortOptions}>
                    <TouchableOpacity onPress={() => setSortBy('name')}>
                        <Text style={[
                            styles.sortOption,
                            sortBy === 'name' && { color: colors.primary, fontWeight: '700' },
                            { color: sortBy !== 'name' ? colors.textSecondary : colors.primary }
                        ]}>
                            {t('username_label') || 'İsim'}
                        </Text>
                    </TouchableOpacity>
                    <Text style={{ color: colors.border }}>•</Text>
                    <TouchableOpacity onPress={() => setSortBy('score')}>
                        <Text style={[
                            styles.sortOption,
                            sortBy === 'score' && { color: colors.primary, fontWeight: '700' },
                            { color: sortBy !== 'score' ? colors.textSecondary : colors.primary }
                        ]}>
                            {t('score') || 'Puan'}
                        </Text>
                    </TouchableOpacity>
                    <Text style={{ color: colors.border }}>•</Text>
                    <TouchableOpacity onPress={() => setSortBy('date')}>
                        <Text style={[
                            styles.sortOption,
                            sortBy === 'date' && { color: colors.primary, fontWeight: '700' },
                            { color: sortBy !== 'date' ? colors.textSecondary : colors.primary }
                        ]}>
                            {t('start_date') || 'Tarih'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Content List */}
            <ScrollView
                style={styles.contentList}
                contentContainerStyle={styles.listContent}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        colors={[colors.primary]}
                        tintColor={colors.primary}
                    />
                }
            >
                {filteredGrades.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Text style={{ fontSize: 48, marginBottom: 16 }}>📉</Text>
                        <Text style={{ color: colors.textSecondary }}>
                            {t('no_grades') || 'Not bulunamadı'}
                        </Text>
                    </View>
                ) : (
                    filteredGrades.map(grade => (
                        <TouchableOpacity
                            key={grade.id}
                            style={[styles.gradeCard, themedStyles.card]}
                            onPress={() => onStudentPress?.(grade.studentId)}
                            activeOpacity={0.8}
                        >
                            <View style={styles.cardHeader}>
                                <View style={[styles.avatarCircle, { backgroundColor: colors.primary + '15' }]}>
                                    <Text style={[styles.avatarLetter, { color: colors.primary }]}>
                                        {grade.studentName.charAt(0).toUpperCase()}
                                    </Text>
                                </View>
                                <View style={styles.headerInfo}>
                                    <Text style={[styles.studentName, themedStyles.textTitle]}>
                                        {grade.studentName}
                                    </Text>
                                    <Text style={[styles.examTitle, themedStyles.textBody]}>
                                        {grade.examTitle}
                                    </Text>
                                </View>
                                <View style={[
                                    styles.scoreBadge,
                                    { backgroundColor: grade.passed ? colors.success + '15' : colors.error + '15' }
                                ]}>
                                    <Text style={[
                                        styles.scoreText,
                                        { color: grade.passed ? colors.success : colors.error }
                                    ]}>
                                        {grade.score}
                                    </Text>
                                </View>
                            </View>

                            {/* Progress Bar Visual */}
                            {renderProgressBar(grade.score, grade.passed)}

                            <View style={styles.cardFooter}>
                                <Text style={[styles.dateText, { color: colors.textSecondary }]}>
                                    {new Date(grade.submittedAt).toLocaleDateString()}
                                </Text>
                                <Text style={[
                                    styles.statusText,
                                    { color: grade.passed ? colors.success : colors.error }
                                ]}>
                                    {grade.passed ? (t('pass') || 'Geçti') : (t('fail') || 'Kaldı')}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    ))
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
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 10,
    },
    backButton: {
        paddingVertical: 8,
        paddingRight: 12,
    },
    backText: {
        fontSize: 16,
        fontWeight: '600',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '800',
        letterSpacing: -0.5,
    },
    iconButton: {
        padding: 8,
    },
    statsGrid: {
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: 20,
        marginBottom: 20,
    },
    statCard: {
        flex: 1,
        borderRadius: 16,
        padding: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    statValue: {
        fontSize: 18,
        fontWeight: '800',
        marginBottom: 4,
    },
    statLabel: {
        fontSize: 11,
        fontWeight: '600',
        opacity: 0.8,
    },
    searchSection: {
        paddingHorizontal: 20,
        marginBottom: 12,
    },
    searchInput: {
        height: 46,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 16,
        fontSize: 15,
    },
    filterSection: {
        marginBottom: 16,
    },
    filterScroll: {
        paddingHorizontal: 20,
        gap: 8,
    },
    filterChip: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
    },
    filterText: {
        fontSize: 13,
        fontWeight: '600',
    },
    sortSection: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginBottom: 12,
        gap: 12,
    },
    sortLabel: {
        fontSize: 13,
        fontWeight: '500',
    },
    sortOptions: {
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
    },
    sortOption: {
        fontSize: 13,
    },
    contentList: {
        flex: 1,
    },
    listContent: {
        paddingHorizontal: 20,
        paddingBottom: 40,
        gap: 16,
    },
    gradeCard: {
        borderRadius: 20,
        padding: 16,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    avatarCircle: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    avatarLetter: {
        fontSize: 20,
        fontWeight: '700',
    },
    headerInfo: {
        flex: 1,
    },
    studentName: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 2,
    },
    examTitle: {
        fontSize: 13,
        opacity: 0.8,
    },
    scoreBadge: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
    },
    scoreText: {
        fontWeight: '800',
        fontSize: 16,
    },
    progressContainer: {
        height: 6,
        backgroundColor: '#E2E8F0',
        borderRadius: 3,
        marginBottom: 12,
        overflow: 'hidden',
    },
    progressBar: {
        height: '100%',
        borderRadius: 3,
    },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    dateText: {
        fontSize: 12,
    },
    statusText: {
        fontSize: 13,
        fontWeight: '700',
    },
    emptyContainer: {
        alignItems: 'center',
        paddingTop: 60,
    },
});

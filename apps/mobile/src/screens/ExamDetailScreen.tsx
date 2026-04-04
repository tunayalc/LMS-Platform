import React from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Linking,
    Alert,
    Dimensions
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';

interface Exam {
    id: string;
    title: string;
    description?: string;
    courseId?: string;
    courseTitle?: string;
    duration?: number; // minutes
    questionCount?: number;
    passingScore?: number;
    startDate?: string;
    endDate?: string;
    maxAttempts?: number;
    attemptsUsed?: number;
    lastScore?: number;
    status?: 'pending' | 'in_progress' | 'completed' | 'expired';
    requiresSEB?: boolean;
}

interface ExamDetailScreenProps {
    exam: Exam;
    onBack: () => void;
    onStartExam?: (examId: string) => void;
    onViewResults?: (examId: string) => void;
    isStudent?: boolean;
}

export default function ExamDetailScreen({
    exam,
    onBack,
    onStartExam,
    onViewResults,
    isStudent = true
}: ExamDetailScreenProps) {
    const { t } = useTranslation();
    const { colors } = useTheme();

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString('tr-TR', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const isOpen = () => {
        if (exam.status === 'completed' && exam.maxAttempts && exam.attemptsUsed && exam.attemptsUsed >= exam.maxAttempts) return false;
        if (exam.status === 'expired') return false;
        const now = new Date();
        if (exam.startDate && new Date(exam.startDate) > now) return false;
        if (exam.endDate && new Date(exam.endDate) < now) return false;
        return true;
    };

    const handleStartExam = () => {
        if (isStudent && exam.requiresSEB !== false) {
            Alert.alert(
                t('seb_required') || 'Safe Exam Browser Gerekli',
                t('seb_notice') || 'Sınavlara sadece bilgisayarınızda SEB tarayıcısı ile katılabilirsiniz.',
                [
                    { text: t('ok') || 'Tamam', style: 'default' },
                    {
                        text: t('download_seb') || 'SEB İndir',
                        onPress: () => Linking.openURL('https://safeexambrowser.org/download_en.html')
                    }
                ]
            );
            return;
        }
        if (onStartExam) {
            onStartExam(exam.id);
        }
    };

    const themedStyles = {
        container: { backgroundColor: colors.background },
        card: { backgroundColor: colors.card, borderColor: colors.border },
        textTitle: { color: colors.text },
        textBody: { color: colors.textSecondary },
    };

    return (
        <View style={[styles.container, themedStyles.container]}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Hero Header */}
                <View style={[styles.heroHeader, { backgroundColor: colors.primary }]}>
                    <TouchableOpacity onPress={onBack} style={styles.backButtonAbsolute}>
                        <Text style={styles.backTextWhite}>←</Text>
                    </TouchableOpacity>

                    <View style={styles.heroContent}>
                        <Text style={styles.heroSubTitle}>{exam.courseTitle || 'Course Assessment'}</Text>
                        <Text style={styles.heroTitle}>{exam.title}</Text>

                        <View style={styles.heroBadgeRow}>
                            <View style={styles.heroBadge}>
                                <Text style={styles.heroBadgeText}>{exam.duration ? `${exam.duration} ${t('minutes_short') || 'dk'}` : '-'}</Text>
                            </View>
                            <View style={styles.heroBadge}>
                                <Text style={styles.heroBadgeText}>{exam.questionCount} {t('questions')}</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Description */}
                {exam.description && (
                    <View style={[styles.section, { backgroundColor: colors.card }]}>
                        <Text style={[styles.descriptionText, themedStyles.textBody]}>
                            {exam.description}
                        </Text>
                    </View>
                )}

                {/* Info Grid (2x2) */}
                <View style={styles.gridContainer}>
                    <View style={[styles.gridItem, themedStyles.card]}>
                        <Text style={[styles.gridLabel, themedStyles.textBody]}>{t('start_date')}</Text>
                        <Text style={[styles.gridValue, themedStyles.textTitle]}>{formatDate(exam.startDate)}</Text>
                    </View>
                    <View style={[styles.gridItem, themedStyles.card]}>
                        <Text style={[styles.gridLabel, themedStyles.textBody]}>{t('end_date')}</Text>
                        <Text style={[styles.gridValue, themedStyles.textTitle]}>{formatDate(exam.endDate)}</Text>
                    </View>
                    <View style={[styles.gridItem, themedStyles.card]}>
                        <Text style={[styles.gridLabel, themedStyles.textBody]}>{t('pass_grade')}</Text>
                        <Text style={[styles.gridValue, themedStyles.textTitle]}>%{exam.passingScore || 50}</Text>
                    </View>
                    <View style={[styles.gridItem, themedStyles.card]}>
                        <Text style={[styles.gridLabel, themedStyles.textBody]}>{t('attempts') || 'Hakkınız'}</Text>
                        <Text style={[styles.gridValue, themedStyles.textTitle]}>{exam.attemptsUsed ?? 0} / {exam.maxAttempts ?? '∞'}</Text>
                    </View>
                </View>

                {/* Last Score Section */}
                {exam.lastScore !== undefined && (
                    <View style={[styles.scoreCard, { backgroundColor: exam.lastScore >= (exam.passingScore || 50) ? colors.success + '15' : colors.error + '15' }]}>
                        <View>
                            <Text style={[styles.scoreLabel, { color: exam.lastScore >= (exam.passingScore || 50) ? colors.success : colors.error }]}>
                                {t('last_score') || 'Son Puan'}
                            </Text>
                            <Text style={[styles.scoreBig, { color: exam.lastScore >= (exam.passingScore || 50) ? colors.success : colors.error }]}>
                                %{exam.lastScore}
                            </Text>
                        </View>
                        {onViewResults && (
                            <TouchableOpacity onPress={() => onViewResults(exam.id)} style={[styles.resultBtn, { backgroundColor: colors.card }]}>
                                <Text style={{ color: colors.primary, fontWeight: '700' }}>{t('details')}</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* SEB Notice (If Student) */}
                {isStudent && exam.requiresSEB !== false && (
                    <View style={[styles.sebCard, { borderColor: colors.warning, backgroundColor: colors.warning + '10' }]}>
                        <Text style={{ fontSize: 24, marginRight: 12 }}>🔒</Text>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.sebTitle, { color: colors.text }]}>{t('seb_required')}</Text>
                            <Text style={[styles.sebDesc, { color: colors.textSecondary }]}>{t('seb_notice')}</Text>
                        </View>
                    </View>
                )}

            </ScrollView>

            {/* Sticky Footer */}
            {!isStudent && isOpen() && (
                <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
                    <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                        onPress={handleStartExam}
                    >
                        <Text style={styles.actionBtnText}>{t('start_exam')}</Text>
                    </TouchableOpacity>
                </View>
            )}

            {isStudent && (
                <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
                    <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: colors.primary, opacity: isOpen() ? 1 : 0.5 }]}
                        onPress={handleStartExam}
                        disabled={!isOpen()}
                    >
                        <Text style={styles.actionBtnText}>
                            {isOpen() ? t('start_exam') : (t('loading') || 'Müsait Değil')}
                        </Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 100,
    },
    heroHeader: {
        paddingTop: 60, // Safe Area approx
        paddingBottom: 30,
        paddingHorizontal: 24,
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
        marginBottom: 20,
    },
    backButtonAbsolute: {
        position: 'absolute',
        top: 50,
        left: 20,
        zIndex: 10,
        padding: 8,
    },
    backTextWhite: {
        color: '#fff',
        fontSize: 24,
        fontWeight: 'bold',
    },
    heroContent: {
        alignItems: 'center',
    },
    heroSubTitle: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 8,
    },
    heroTitle: {
        color: '#fff',
        fontSize: 28,
        fontWeight: '800',
        textAlign: 'center',
        marginBottom: 20,
        lineHeight: 34,
    },
    heroBadgeRow: {
        flexDirection: 'row',
        gap: 12,
    },
    heroBadge: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    heroBadgeText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
    },
    section: {
        marginHorizontal: 20,
        padding: 20,
        borderRadius: 20,
        marginBottom: 20,
    },
    descriptionText: {
        fontSize: 15,
        lineHeight: 24,
    },
    gridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        paddingHorizontal: 20,
        marginBottom: 24,
    },
    gridItem: {
        width: '48%', // Approx half
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
    },
    gridLabel: {
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 6,
        opacity: 0.7,
    },
    gridValue: {
        fontSize: 16,
        fontWeight: '700',
    },
    scoreCard: {
        marginHorizontal: 20,
        padding: 20,
        borderRadius: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 24,
    },
    scoreLabel: {
        fontWeight: '600',
        fontSize: 13,
        marginBottom: 4,
    },
    scoreBig: {
        fontSize: 32,
        fontWeight: '800',
    },
    resultBtn: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
    },
    sebCard: {
        flexDirection: 'row',
        marginHorizontal: 20,
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        alignItems: 'flex-start',
    },
    sebTitle: {
        fontWeight: '700',
        marginBottom: 4,
    },
    sebDesc: {
        fontSize: 13,
        lineHeight: 18,
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 20,
        paddingBottom: 30,
        borderTopWidth: 1,
        elevation: 20,
    },
    actionBtn: {
        height: 56,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    actionBtnText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
    },
});

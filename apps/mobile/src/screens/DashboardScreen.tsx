import React from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    RefreshControl,
    Dimensions,
    Platform
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { Feather } from '@expo/vector-icons';

interface DashboardScreenProps {
    user: {
        username: string;
        role: string;
    };
    onNavigate: (screen: string, params?: any) => void;
    onSettings: () => void;
    onRefresh?: () => Promise<void>;
    stats?: {
        totalCourses?: number;
        enrolledCourses?: number;
        pendingExams?: number;
        completedExams?: number;
        averageScore?: number;
        totalUsers?: number;
        totalQuestions?: number;
    };
    recentActivity?: {
        type: 'course' | 'exam' | 'content';
        title: string;
        date: string;
        status?: string;
    }[];
}

export default function DashboardScreen({
    user,
    onNavigate,
    onSettings,
    onRefresh,
    stats = {},
    recentActivity = []
}: DashboardScreenProps) {
    const { t } = useTranslation();
    const { colors, isDark } = useTheme();
    const [refreshing, setRefreshing] = React.useState(false);

    const isAdmin = ['superadmin', 'admin'].includes(user.role.toLowerCase());
    const isInstructor = ['instructor', 'assistant'].includes(user.role.toLowerCase());
    const isStudent = user.role.toLowerCase() === 'student';

    const handleRefresh = async () => {
        if (!onRefresh) return;
        setRefreshing(true);
        try {
            await onRefresh();
        } finally {
            setRefreshing(false);
        }
    };

    const StatCard = ({ icon, value, label, color }: { icon: keyof typeof Feather.glyphMap; value: number | string; label: string; color: string }) => (
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: color }]}>
            <View style={[styles.statIconCircle, { backgroundColor: color + '15' }]}>
                <Feather name={icon} size={20} color={color} />
            </View>
            <View>
                <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
            </View>
        </View>
    );

    const ActionCard = ({ icon, label, onPress, badge }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; badge?: number }) => (
        <TouchableOpacity
            style={[
                styles.actionCard,
                {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    shadowColor: isDark ? '#000' : '#ccc'
                }
            ]}
            onPress={onPress}
            activeOpacity={0.7}
        >
            <View style={[
                styles.actionIconCircle,
                { backgroundColor: isDark ? colors.primary + '20' : colors.primary + '10' }
            ]}>
                <Feather name={icon} size={24} color={colors.primary} />
            </View>
            <Text style={[styles.actionLabel, { color: colors.text }]}>{label}</Text>
            {badge !== undefined && badge > 0 && (
                <View style={[styles.badge, { backgroundColor: colors.error, borderColor: colors.card }]}>
                    <Text style={styles.badgeText}>{badge}</Text>
                </View>
            )}
        </TouchableOpacity>
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        colors={[colors.primary]}
                        tintColor={colors.primary}
                    />
                }
            >
                {/* Hero Greeting */}
                <View style={[
                    styles.heroSection,
                    {
                        backgroundColor: colors.card,
                        borderBottomColor: colors.border,
                        shadowColor: isDark ? '#000' : '#aaa'
                    }
                ]}>
                    <View style={styles.heroHeader}>
                        <View>
                            <Text style={[styles.greeting, { color: colors.textSecondary }]}>
                                {t('welcome')}
                            </Text>
                            <Text style={[styles.username, { color: colors.primary }]}>
                                {user.username}
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={onSettings}
                            style={[styles.settingsBtn, { backgroundColor: isDark ? colors.background : '#f1f5f9' }]}
                        >
                            <Feather name="settings" size={20} color={colors.text} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.roleContainer}>
                        <View style={[
                            styles.roleBadge,
                            { backgroundColor: startCase(user.role) === 'Admin' ? '#ef444415' : colors.primary + '15' }
                        ]}>
                            <Feather
                                name={getRoleIcon(user.role)}
                                size={12}
                                color={startCase(user.role) === 'Admin' ? '#ef4444' : colors.primary}
                                style={{ marginRight: 6 }}
                            />
                            <Text style={[
                                styles.roleText,
                                { color: startCase(user.role) === 'Admin' ? '#ef4444' : colors.primary }
                            ]}>
                                {user.role.toUpperCase()}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Stats Grid */}
                <View style={styles.sectionContainer}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('dashboard')}</Text>
                    <View style={styles.statsGrid}>
                        {isStudent && (
                            <>
                                <StatCard
                                    icon="book"
                                    value={stats.enrolledCourses ?? 0}
                                    label={t('my_courses')}
                                    color="#3b82f6"
                                />
                                <StatCard
                                    icon="edit-3"
                                    value={stats.pendingExams ?? 0}
                                    label={t('exams')}
                                    color="#f59e0b"
                                />
                                <StatCard
                                    icon="check-circle"
                                    value={stats.completedExams ?? 0}
                                    label={t('completed')}
                                    color="#22c55e"
                                />
                                <StatCard
                                    icon="bar-chart-2"
                                    value={stats.averageScore ? `%${stats.averageScore}` : '-'}
                                    label={t('score')}
                                    color="#8b5cf6"
                                />
                            </>
                        )}
                        {(isAdmin || isInstructor) && (
                            <>
                                <StatCard
                                    icon="book"
                                    value={stats.totalCourses ?? 0}
                                    label={t('courses')}
                                    color="#3b82f6"
                                />
                                <StatCard
                                    icon="users"
                                    value={stats.totalUsers ?? 0}
                                    label={t('users')}
                                    color="#10b981"
                                />
                            </>
                        )}
                    </View>
                </View>

                {/* Quick Actions Grid */}
                <View style={styles.sectionContainer}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('menu_title')}</Text>
                    <View style={styles.actionGrid}>
                        <ActionCard
                            icon="book-open"
                            label={t('courses')}
                            onPress={() => onNavigate('courses')}
                        />
                        <ActionCard
                            icon="edit-3"
                            label={t('exams')}
                            onPress={() => onNavigate('exams')}
                            badge={stats.pendingExams}
                        />
                        {(isAdmin || isInstructor) && (
                            <>
                                <ActionCard
                                    icon="camera"
                                    label={t('omr_scan_title')}
                                    onPress={() => onNavigate('omr')}
                                />
                                <ActionCard
                                    icon="help-circle"
                                    label={t('question_bank')}
                                    onPress={() => onNavigate('questions')}
                                />
                            </>
                        )}
                        {isAdmin && (
                            <>
                                <ActionCard
                                    icon="users"
                                    label={t('users')}
                                    onPress={() => onNavigate('users')}
                                />
                                <ActionCard
                                    icon="settings"
                                    label={t('settings')}
                                    onPress={() => onNavigate('settings')}
                                />
                            </>
                        )}
                        <ActionCard
                            icon="bar-chart-2"
                            label={t('gradebook')}
                            onPress={() => onNavigate('gradebook')}
                        />
                    </View>
                </View>

                {/* Recent Activity List */}
                {recentActivity.length > 0 && (
                    <View style={styles.sectionContainer}>
                        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('content')}</Text>
                        <View style={[styles.activityCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                            {recentActivity.slice(0, 5).map((activity, index) => (
                                <View
                                    key={index}
                                    style={[
                                        styles.activityItem,
                                        index < recentActivity.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }
                                    ]}
                                >
                                    <View style={[styles.activityIconCircle, { backgroundColor: isDark ? '#ffffff10' : '#00000005' }]}>
                                        <Feather
                                            name={activity.type === 'course' ? 'book' : activity.type === 'exam' ? 'edit-3' : 'file-text'}
                                            size={16}
                                            color={colors.textSecondary}
                                        />
                                    </View>
                                    <View style={styles.activityContent}>
                                        <Text style={[styles.activityTitle, { color: colors.text }]} numberOfLines={1}>
                                            {activity.title}
                                        </Text>
                                        <Text style={[styles.activityDate, { color: colors.textSecondary }]}>
                                            {activity.date}
                                        </Text>
                                    </View>
                                    {activity.status && (
                                        <View style={[styles.statusBadge, {
                                            backgroundColor: activity.status === 'completed' ? '#22c55e15' : '#f59e0b15'
                                        }]}>
                                            <Feather
                                                name={activity.status === 'completed' ? 'check' : 'clock'}
                                                size={10}
                                                color={activity.status === 'completed' ? '#22c55e' : '#f59e0b'}
                                            />
                                        </View>
                                    )}
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* SEB Notice (Student Only) */}
                {isStudent && (
                    <View style={[styles.sebNotice, { backgroundColor: isDark ? '#451a03' : '#fffbeb', borderColor: isDark ? '#92400e' : '#fcd34d' }]}>
                        <Feather name="lock" size={24} color="#d97706" style={{ marginRight: 16 }} />
                        <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: isDark ? '#fbbf24' : '#92400e', marginBottom: 4 }}>
                                {t('seb_required')}
                            </Text>
                            <Text style={{ fontSize: 12, color: isDark ? '#fcd34d' : '#b45309', lineHeight: 18 }}>
                                {t('seb_desc') || 'Safe Exam Browser required for exams.'}
                            </Text>
                        </View>
                    </View>
                )}

            </ScrollView>
        </View>
    );
}

// Helpers
function getRoleIcon(role: string): any {
    const r = role.toLowerCase();
    if (r.includes('admin')) return 'shield';
    if (r.includes('instructor')) return 'briefcase';
    return 'user';
}

function startCase(str: string) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 100, // Extra padding for floating tab bar
    },
    heroSection: {
        padding: 24,
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
        marginBottom: 24,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 5,
        borderBottomWidth: 1,
    },
    heroHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 20,
    },
    greeting: {
        fontSize: 14,
        fontWeight: '500',
        marginBottom: 4,
        opacity: 0.8,
    },
    username: {
        fontSize: 26,
        fontWeight: '800',
        letterSpacing: -0.5,
    },
    settingsBtn: {
        padding: 10,
        borderRadius: 14,
    },
    roleContainer: {
        flexDirection: 'row',
    },
    roleBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    roleText: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    sectionContainer: {
        paddingHorizontal: 20,
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 16,
        marginLeft: 4,
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    statCard: {
        width: '48%',
        padding: 16,
        borderRadius: 20,
        borderLeftWidth: 4,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        // Slight shadow
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.02,
        shadowRadius: 8,
        elevation: 2,
    },
    statIconCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    statValue: {
        fontSize: 17,
        fontWeight: '700',
    },
    statLabel: {
        fontSize: 11,
        fontWeight: '500',
    },
    actionGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    actionCard: {
        width: '31%', // 3 columns
        aspectRatio: 1,
        borderRadius: 20,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 8,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 3,
    },
    actionIconCircle: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10,
    },
    actionLabel: {
        fontSize: 11,
        fontWeight: '600',
        textAlign: 'center',
    },
    badge: {
        position: 'absolute',
        top: 6,
        right: 6,
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
    },
    badgeText: {
        color: '#fff',
        fontSize: 9,
        fontWeight: '800',
    },
    activityCard: {
        borderRadius: 24,
        borderWidth: 1,
        overflow: 'hidden',
    },
    activityItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
    },
    activityIconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    activityContent: {
        flex: 1,
    },
    activityTitle: {
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 2,
    },
    activityDate: {
        fontSize: 11,
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sebNotice: {
        marginHorizontal: 20,
        marginBottom: 30,
        padding: 20,
        borderRadius: 24,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
    },
});

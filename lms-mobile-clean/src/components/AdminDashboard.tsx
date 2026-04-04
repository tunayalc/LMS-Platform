import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
// Import Modals
import CreateCourseModal from './modals/CreateCourseModal';
import CreateExamModal from './modals/CreateExamModal';
import CreateUserModal from './modals/CreateUserModal';

interface AdminDashboardProps {
    user: any;
    token: string;
    onRefresh: () => void;
}

export default function AdminDashboard({ user, token, onRefresh }: AdminDashboardProps) {
    const { colors, isDark } = useTheme();
    const { t } = useTranslation();
    const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

    // Modal States
    const [showCreateCourse, setShowCreateCourse] = useState(false);
    const [showCreateExam, setShowCreateExam] = useState(false);
    const [showCreateUser, setShowCreateUser] = useState(false);

    const role = user?.role?.toLowerCase() || 'student';

    const isAdmin = ['admin', 'superadmin'].includes(role);
    const isInstructor = ['instructor', 'teacher', 'admin', 'superadmin'].includes(role);

    const statsPalette = useMemo(
        () => ({
            users: colors.primary,
            courses: colors.success,
            exams: '#f59e0b',
        }),
        [colors.primary, colors.success]
    );

    // Stats Card Component
    const StatsCard = ({ title, value, icon, color }: any) => (
        <View style={[styles.statsCard, { borderLeftColor: color }]}>
            <Text style={styles.statsIcon}>{icon}</Text>
            <View>
                <Text style={styles.statsValue}>{value}</Text>
                <Text style={styles.statsTitle}>{title}</Text>
            </View>
        </View>
    );

    // Action Button Component
    const ActionButton = ({ title, icon, onPress, primary = false }: any) => (
        <Pressable
            style={[styles.actionButton, primary ? styles.primaryBtn : styles.secondaryBtn]}
            onPress={onPress}
        >
            <Text style={styles.actionIcon}>{icon}</Text>
            <Text style={[styles.actionText, primary && { color: colors.primaryText }]}>{title}</Text>
        </Pressable>
    );

    return (
        <View style={styles.container}>
            <Text style={styles.headerTitle}>{t('admin_panel')}</Text>

            {/* 1. STATS SECTION */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsRow}>
                {isAdmin && <StatsCard title={t('users')} value="-" icon="👥" color={statsPalette.users} />}
                {isInstructor && <StatsCard title={t('active_courses')} value="-" icon="📚" color={statsPalette.courses} />}
                {isInstructor && <StatsCard title={t('exams')} value="-" icon="📝" color={statsPalette.exams} />}
            </ScrollView>

            {/* 2. ADMIN ACTIONS (User & System) */}
            {isAdmin && (
                <View style={styles.section}>
                    <Text style={styles.sectionHeader}>{t('system_management')}</Text>
                    <View style={styles.grid}>
                        <ActionButton
                            title={t('create_user')}
                            icon="👤"
                            primary
                            onPress={() => setShowCreateUser(true)}
                        />
                        <ActionButton
                            title={t('system_settings')}
                            icon="⚙️"
                            onPress={() => Alert.alert(t('info'), t('system_settings_web_only'))}
                        />
                    </View>
                </View>
            )}

            {/* 3. INSTRUCTOR ACTIONS (Content) */}
            {isInstructor && (
                <View style={styles.section}>
                    <Text style={styles.sectionHeader}>{t('education_management')}</Text>
                    <View style={styles.grid}>
                        <ActionButton
                            title={t('create_course')}
                            icon="➕"
                            primary
                            onPress={() => setShowCreateCourse(true)}
                        />
                        <ActionButton
                            title={t('create_exam')}
                            icon="📝"
                            primary
                            onPress={() => setShowCreateExam(true)}
                        />
                        <ActionButton
                            title={t('upload_content')}
                            icon="📂"
                            onPress={() => Alert.alert(t('info'), t('content_upload_coming_soon'))}
                        />
                    </View>
                </View>
            )}

            {/* MODALS */}
            <CreateUserModal
                visible={showCreateUser}
                onClose={() => setShowCreateUser(false)}
                token={token}
                onSuccess={() => { onRefresh(); }}
            />

            <CreateCourseModal
                visible={showCreateCourse}
                onClose={() => setShowCreateCourse(false)}
                token={token}
                onSuccess={() => { onRefresh(); }}
            />

            <CreateExamModal
                visible={showCreateExam}
                onClose={() => setShowCreateExam(false)}
                token={token}
                onSuccess={() => { onRefresh(); }}
            />
        </View>
    );
}

type ThemeColors = ReturnType<typeof useTheme>['colors'];

const createStyles = (colors: ThemeColors, isDark: boolean) =>
    StyleSheet.create({
        container: {
            paddingBottom: 20
        },
        headerTitle: {
            fontSize: 22,
            fontWeight: 'bold',
            color: colors.text,
            marginBottom: 16,
            marginLeft: 4
        },
        statsRow: {
            flexDirection: 'row',
            marginBottom: 24
        },
        statsCard: {
            backgroundColor: colors.card,
            width: 160,
            padding: 16,
            borderRadius: 16,
            marginRight: 12,
            borderLeftWidth: 4,
            borderWidth: 1,
            borderColor: colors.border,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: isDark ? 0.22 : 0.08,
            shadowRadius: 4,
            elevation: 2,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12
        },
        statsIcon: {
            fontSize: 24
        },
        statsValue: {
            fontSize: 20,
            fontWeight: 'bold',
            color: colors.text
        },
        statsTitle: {
            fontSize: 12,
            color: colors.textSecondary,
            fontWeight: '600'
        },
        section: {
            marginBottom: 24
        },
        sectionHeader: {
            fontSize: 14,
            fontWeight: '700',
            color: colors.textSecondary,
            marginBottom: 10,
            marginLeft: 4,
            textTransform: 'uppercase',
            letterSpacing: 0.5
        },
        grid: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 12
        },
        actionButton: {
            width: '48%', // 2 columns
            padding: 16,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface
        },
        primaryBtn: {
            backgroundColor: colors.primary,
            borderColor: colors.primary
        },
        secondaryBtn: {
            backgroundColor: colors.surface,
            borderColor: colors.border
        },
        actionIcon: {
            fontSize: 28
        },
        actionText: {
            fontWeight: '600',
            color: colors.text,
            fontSize: 14,
            textAlign: 'center'
        }
    });

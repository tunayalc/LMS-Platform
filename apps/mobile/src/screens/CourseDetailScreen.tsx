import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    RefreshControl,
    ActivityIndicator,
    Alert,
    Dimensions,
    TextInput
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';
import Card from '../components/ui/Card';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface CourseDetailScreenProps {
    courseId: string;
    onBack: () => void;
    onNavigateToExam?: (examId: string) => void;
    onNavigateToContent?: (contentId: string) => void;
    onOpenContent?: (content: Content) => void | Promise<void>;
    onEditModules?: () => void;
    onOpenRubrics?: () => void;
    onOpenQuestionBank?: () => void;
    onOpenGradebook?: () => void;
    onOpenNotes?: () => void;
    onCreateExam?: () => void;
    onCreateContent?: () => void;
}

type TabType = 'overview' | 'modules' | 'content' | 'exams' | 'participants' | 'grades' | 'rubrics' | 'prerequisites';

interface Module {
    id: string;
    title: string;
    description?: string;
    sortOrder?: number;
    children?: Module[];
    contentItems?: Content[];
}

interface Content {
    id: string;
    title: string;
    type: 'video' | 'pdf' | 'scorm' | 'h5p' | 'live_class';
    source?: string;
    meetingUrl?: string;
    moduleId?: string;
}

interface Exam {
    id: string;
    title: string;
    courseId?: string;
    durationMinutes?: number | null;
    passThreshold?: number | null;
    startDate?: string | null;
    endDate?: string | null;
    maxAttempts?: number | null;
    isDraft?: boolean;
}

interface Participant {
    id: string;
    username: string;
    email?: string;
    role: string;
    enrolledAt?: string;
}

interface Course {
    id: string;
    title: string;
    description?: string;
    instructor?: string;
    thumbnail?: string;
    enrolledCount?: number;
    contentCount?: number;
}

export default function CourseDetailScreen({
    courseId,
    onBack,
    onNavigateToExam,
    onNavigateToContent,
    onOpenContent,
    onEditModules,
    onOpenRubrics,
    onOpenQuestionBank,
    onOpenGradebook,
    onOpenNotes,
    onCreateExam,
    onCreateContent
}: CourseDetailScreenProps) {
    const { t } = useTranslation();
    const { colors, isDark } = useTheme();

    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [course, setCourse] = useState<Course | null>(null);
    const [modules, setModules] = useState<Module[]>([]);
    const [contents, setContents] = useState<Content[]>([]);
    const [exams, setExams] = useState<Exam[]>([]);
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
    const [userRole, setUserRole] = useState<string | null>(null);
    const [pushTitle, setPushTitle] = useState('');
    const [pushBody, setPushBody] = useState('');
    const [sendingPush, setSendingPush] = useState(false);

    const canViewMembers = userRole
        ? ['superadmin', 'admin', 'assistant', 'instructor'].includes(userRole.toLowerCase())
        : false;

    const canManageCourse = canViewMembers;

    const fetchCourseData = useCallback(async () => {
        try {
            const token = await AsyncStorage.getItem('auth_token');
            const storedRole = await AsyncStorage.getItem('user_role');
            setUserRole(storedRole);
            const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

            // Fetch course details
            const courseRes = await apiClient.get(`/courses/${courseId}`, { headers }) as any;
            setCourse(courseRes?.course ?? courseRes);

            // Fetch modules
            try {
                const modulesRes = await apiClient.get(`/courses/${courseId}/modules`, { headers }) as any;
                setModules(Array.isArray(modulesRes) ? modulesRes : (modulesRes?.modules || []));
            } catch (e) {
                setModules([]);
            }

            // Fetch content
            try {
                const contentRes = await apiClient.get(`/content`, { headers, params: { courseId } }) as any;
                const items = Array.isArray(contentRes) ? contentRes : (contentRes?.content || []);
                setContents(items);
            } catch (e) {
                setContents([]);
            }

            // Fetch exams
            try {
                const examsRes = await apiClient.get(`/exams`, { headers, params: { courseId } }) as any;
                setExams(Array.isArray(examsRes) ? examsRes : (examsRes?.exams || []));
            } catch (e) {
                setExams([]);
            }

            // Fetch participants
            if (storedRole && ['superadmin', 'admin', 'assistant', 'instructor'].includes(storedRole.toLowerCase())) {
                try {
                    const membersRes = await apiClient.get(`/courses/${courseId}/members`, { headers }) as any;
                    const members = Array.isArray(membersRes) ? membersRes : (membersRes?.members || []);
                    setParticipants(members);
                } catch (e) {
                    setParticipants([]);
                }
            } else {
                setParticipants([]);
            }

        } catch (error) {
            console.error('Failed to fetch course data:', error);
            Alert.alert(t('error'), t('connection_error'));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [courseId, t]);

    useEffect(() => {
        fetchCourseData();
    }, [fetchCourseData]);

    useEffect(() => {
        if (!canViewMembers && activeTab === 'participants') {
            setActiveTab('overview');
        }
    }, [canViewMembers, activeTab]);

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchCourseData();
    };

    const handleContentPress = async (content: Content) => {
        if (userRole?.toLowerCase() === 'student') {
            try {
                const token = await AsyncStorage.getItem('auth_token');
                if (!token) {
                    Alert.alert(t('error'), t('session_expired'));
                    return;
                }
                const access = await apiClient.get(`/content/${content.id}/access`, {
                    headers: { Authorization: `Bearer ${token}` }
                }) as any;
                if (access && access.canAccess === false) {
                    const missing = Array.isArray(access.missingPrerequisites)
                        ? access.missingPrerequisites.map((x: any) => x.title).filter(Boolean)
                        : [];
                    Alert.alert(
                        t('prerequisites') || 'Ön Koşullar',
                        missing.length
                            ? `${t('missing_prerequisites') || 'Eksik ön koşullar'}:\n- ${missing.join('\n- ')}`
                            : (t('access_denied') || 'Erişim reddedildi')
                    );
                    return;
                }

                if (content.type === 'scorm' && content.source && !content.source.startsWith('http')) {
                    try {
                        const launch = await apiClient.get(`/scorm/${content.source}/launch`, {
                            headers: { Authorization: `Bearer ${token}` }
                        }) as any;
                        const launchUrl = launch?.url as string | undefined;
                        if (launchUrl) {
                            await onOpenContent?.({ ...content, source: launchUrl });
                            return;
                        }
                    } catch (_e) {
                        // fall through to default open behavior
                    }
                }
            } catch (e) {
                Alert.alert(t('error'), t('connection_error'));
                return;
            }
            await onOpenContent?.(content);
            return;
        }

        if (onNavigateToContent) {
            onNavigateToContent(content.id);
            return;
        }
        await onOpenContent?.(content);
    };

    const handleSendPush = async () => {
        if (!canViewMembers) return;
        if (!pushTitle.trim() || !pushBody.trim()) {
            Alert.alert(t('error'), t('required_fields') || 'Zorunlu alanlar eksik');
            return;
        }

        setSendingPush(true);
        try {
            const token = await AsyncStorage.getItem('auth_token');
            if (!token) {
                Alert.alert(t('error'), t('session_expired'));
                return;
            }

            await apiClient.post(`/push/course/${courseId}`, {
                title: pushTitle.trim(),
                body: pushBody.trim()
            }, { headers: { Authorization: `Bearer ${token}` } });

            setPushTitle('');
            setPushBody('');
            Alert.alert(t('success') || 'OK', t('notification_sent') || 'Bildirim gönderildi');
        } catch (e: any) {
            Alert.alert(t('error'), e?.message || t('connection_error'));
        } finally {
            setSendingPush(false);
        }
    };

    const toggleModule = (moduleId: string) => {
        setExpandedModules(prev => {
            const next = new Set(prev);
            if (next.has(moduleId)) {
                next.delete(moduleId);
            } else {
                next.add(moduleId);
            }
            return next;
        });
    };

    const getContentIcon = (type: string): keyof typeof Feather.glyphMap => {
        switch (type) {
            case 'video': return 'play-circle';
            case 'pdf': return 'file-text';
            case 'scorm': return 'package';
            case 'h5p': return 'box';
            case 'live_class': return 'video';
            default: return 'file';
        }
    };

    const tabs: { key: TabType; label: string; icon: keyof typeof Feather.glyphMap }[] = [
        { key: 'overview', label: t('overview', { defaultValue: 'Genel' }), icon: 'info' },
        { key: 'modules', label: t('modules'), icon: 'layers' },
        { key: 'content', label: t('content'), icon: 'folder' },
        { key: 'exams', label: t('exams'), icon: 'edit-3' },
        ...(canViewMembers ? [{ key: 'participants' as const, label: t('participants'), icon: 'users' as const }] : []),
        { key: 'grades', label: t('grades'), icon: 'bar-chart-2' },
        ...(canViewMembers ? [{ key: 'rubrics' as const, label: t('rubrics'), icon: 'clipboard' as const }] : []),
        ...(canViewMembers ? [{ key: 'prerequisites' as const, label: t('prerequisites'), icon: 'link' as const }] : []),
    ];

    // Render Tab Bar
    const renderTabBar = () => (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
            contentContainerStyle={styles.tabBarContent}
        >
            {tabs.map(tab => (
                <TouchableOpacity
                    key={tab.key}
                    style={[
                        styles.tab,
                        activeTab === tab.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }
                    ]}
                    onPress={() => setActiveTab(tab.key)}
                >
                    <Feather
                        name={tab.icon}
                        size={18}
                        color={activeTab === tab.key ? colors.primary : colors.textSecondary}
                    />
                    <Text style={[
                        styles.tabLabel,
                        { color: activeTab === tab.key ? colors.primary : colors.textSecondary }
                    ]}>
                        {tab.label}
                    </Text>
                </TouchableOpacity>
            ))}
        </ScrollView>
    );

    // Render Overview Tab
    const renderOverview = () => (
        <View style={styles.tabContent}>
            <Card>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>{course?.title}</Text>
                <Text style={[styles.description, { color: colors.textSecondary }]}>
                    {course?.description || t('description_optional')}
                </Text>

                <View style={styles.statsRow}>
                    {canViewMembers && (
                        <View style={styles.statItem}>
                            <Feather name="users" size={16} color={colors.primary} />
                            <Text style={[styles.statValue, { color: colors.text }]}>
                                {participants.length} {t('participants')}
                            </Text>
                        </View>
                    )}
                    <View style={styles.statItem}>
                        <Feather name="folder" size={16} color={colors.primary} />
                        <Text style={[styles.statValue, { color: colors.text }]}>
                            {contents.length} {t('content')}
                        </Text>
                    </View>
                    <View style={styles.statItem}>
                        <Feather name="edit-3" size={16} color={colors.primary} />
                        <Text style={[styles.statValue, { color: colors.text }]}>
                            {exams.length} {t('exams')}
                        </Text>
                    </View>
                </View>
            </Card>

            {canManageCourse && (
                <Card style={{ marginTop: 16 }}>
                    <Text style={[styles.sectionHeader, { color: colors.text, marginTop: 0 }]}>
                        {t('management', { defaultValue: 'Yönetim' })}
                    </Text>
                    <View style={styles.managementGrid}>
                        <TouchableOpacity
                            onPress={onEditModules}
                            style={[styles.managementBtn, { backgroundColor: colors.primary }]}
                        >
                            <Feather name="layers" size={16} color="#fff" />
                            <Text style={styles.managementBtnText}>
                                {t('edit_modules_title', { defaultValue: 'Modülleri Düzenle' })}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={onCreateContent}
                            style={[styles.managementBtn, { backgroundColor: colors.primary }]}
                        >
                            <Feather name="plus-square" size={16} color="#fff" />
                            <Text style={styles.managementBtnText}>
                                {t('create_content', { defaultValue: 'İçerik Ekle' })}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={onCreateExam}
                            style={[styles.managementBtn, { backgroundColor: colors.primary }]}
                        >
                            <Feather name="plus-circle" size={16} color="#fff" />
                            <Text style={styles.managementBtnText}>
                                {t('create_exam', { defaultValue: 'Sınav Oluştur' })}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={onOpenQuestionBank}
                            style={[styles.managementBtn, { backgroundColor: colors.primary }]}
                        >
                            <Feather name="help-circle" size={16} color="#fff" />
                            <Text style={styles.managementBtnText}>
                                {t('question_bank', { defaultValue: 'Soru Bankası' })}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={onOpenRubrics}
                            style={[styles.managementBtn, { backgroundColor: colors.primary }]}
                        >
                            <Feather name="clipboard" size={16} color="#fff" />
                            <Text style={styles.managementBtnText}>
                                {t('rubrics', { defaultValue: 'Rubrikler' })}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </Card>
            )}

            {/* Quick Actions */}
            <Text style={[styles.sectionHeader, { color: colors.text }]}>{t('menu_title')}</Text>
            <View style={styles.quickActions}>
                <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => setActiveTab('modules')}
                >
                    <Feather name="layers" size={24} color={colors.primary} />
                    <Text style={[styles.actionLabel, { color: colors.text }]}>{t('modules')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => setActiveTab('exams')}
                >
                    <Feather name="edit-3" size={24} color={colors.primary} />
                    <Text style={[styles.actionLabel, { color: colors.text }]}>{t('exams')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => setActiveTab('content')}
                >
                    <Feather name="folder" size={24} color={colors.primary} />
                    <Text style={[styles.actionLabel, { color: colors.text }]}>{t('content')}</Text>
                </TouchableOpacity>
                {!!onOpenGradebook && (
                    <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                        onPress={onOpenGradebook}
                    >
                        <Feather name="book-open" size={24} color={colors.primary} />
                        <Text style={[styles.actionLabel, { color: colors.text }]}>{t('gradebook')}</Text>
                    </TouchableOpacity>
                )}
                {!!onOpenNotes && (
                    <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                        onPress={onOpenNotes}
                    >
                        <Feather name="file-text" size={24} color={colors.primary} />
                        <Text style={[styles.actionLabel, { color: colors.text }]}>{t('notes')}</Text>
                    </TouchableOpacity>
                )}
            </View>

            {canViewMembers && (
                <Card style={{ marginTop: 16 }}>
                    <Text style={[styles.sectionHeader, { color: colors.text, marginTop: 0 }]}>
                        {t('push_notifications', { defaultValue: 'Bildirim Gönder' })}
                    </Text>
                    <TextInput
                        value={pushTitle}
                        onChangeText={setPushTitle}
                        placeholder={t('notification_title', { defaultValue: 'Başlık' })}
                        placeholderTextColor={colors.textSecondary}
                        style={[styles.pushInput, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
                    />
                    <TextInput
                        value={pushBody}
                        onChangeText={setPushBody}
                        placeholder={t('notification_body', { defaultValue: 'Mesaj' })}
                        placeholderTextColor={colors.textSecondary}
                        multiline
                        style={[styles.pushTextarea, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
                    />
                    <TouchableOpacity
                        onPress={handleSendPush}
                        disabled={sendingPush || !pushTitle.trim() || !pushBody.trim()}
                        style={[styles.pushButton, { backgroundColor: sendingPush ? colors.border : colors.primary }]}
                    >
                        <Text style={styles.pushButtonText}>
                            {sendingPush ? t('sending', { defaultValue: '...' }) : t('send', { defaultValue: 'Gönder' })}
                        </Text>
                    </TouchableOpacity>
                </Card>
            )}
        </View>
    );

    // Render Modules Tab
    const renderModules = () => (
        <View style={styles.tabContent}>
            {modules.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    {t('no_modules_yet')}
                </Text>
            ) : (
                <View style={{ gap: 12 }}>
                    {(() => {
                        const renderModuleNode = (module: Module, depth: number) => {
                            const isExpanded = expandedModules.has(module.id);
                            const contentItems = Array.isArray(module.contentItems) ? module.contentItems : [];
                            const children = Array.isArray(module.children) ? module.children : [];

                            return (
                                <View
                                    key={module.id}
                                    style={[
                                        styles.moduleCard,
                                        {
                                            backgroundColor: colors.card,
                                            borderColor: colors.border,
                                            marginLeft: depth ? depth * 12 : 0
                                        }
                                    ]}
                                >
                                    <TouchableOpacity
                                        style={styles.moduleHeader}
                                        onPress={() => toggleModule(module.id)}
                                    >
                                        <Feather
                                            name={isExpanded ? 'chevron-down' : 'chevron-right'}
                                            size={20}
                                            color={colors.text}
                                        />
                                        <Text style={[styles.moduleTitle, { color: colors.text }]}>{module.title}</Text>
                                        <View style={{ flex: 1 }} />
                                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                                            {contentItems.length + children.length}
                                        </Text>
                                    </TouchableOpacity>

                                    {isExpanded && (
                                        <View style={styles.moduleContents}>
                                            {contentItems.length ? (
                                                contentItems.map((content) => (
                                                    <TouchableOpacity
                                                        key={content.id}
                                                        style={styles.contentItem}
                                                        onPress={() => void handleContentPress(content)}
                                                    >
                                                        <Feather name={getContentIcon(content.type)} size={16} color={colors.textSecondary} />
                                                        <Text style={[styles.contentTitle, { color: colors.textSecondary }]}>
                                                            {content.title}
                                                        </Text>
                                                    </TouchableOpacity>
                                                ))
                                            ) : (
                                                <Text style={[styles.emptyModuleText, { color: colors.textSecondary }]}>
                                                    {t('no_content_yet')}
                                                </Text>
                                            )}

                                            {children.length > 0 && (
                                                <View style={{ marginTop: 10, gap: 10 }}>
                                                    {children.map((child) => renderModuleNode(child, depth + 1))}
                                                </View>
                                            )}
                                        </View>
                                    )}
                                </View>
                            );
                        };

                        return modules.map((m) => renderModuleNode(m, 0));
                    })()}
                </View>
            )}
        </View>
    );

    // Render Content Tab
    const renderContent = () => (
        <View style={styles.tabContent}>
            {contents.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    {t('no_content_yet')}
                </Text>
            ) : (
                contents.map(content => (
                    <TouchableOpacity
                        key={content.id}
                        style={[styles.contentCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                        onPress={() => void handleContentPress(content)}
                    >
                        <View style={[styles.contentIconCircle, { backgroundColor: colors.primary + '15' }]}>
                            <Feather name={getContentIcon(content.type)} size={20} color={colors.primary} />
                        </View>
                        <View style={styles.contentInfo}>
                            <Text style={[styles.contentCardTitle, { color: colors.text }]}>{content.title}</Text>
                            <Text style={[styles.contentType, { color: colors.textSecondary }]}>
                                {content.type.toUpperCase()}
                            </Text>
                        </View>
                        <Feather name="chevron-right" size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                ))
            )}
        </View>
    );

    // Render Exams Tab
    const renderExams = () => (
        <View style={styles.tabContent}>
            {exams.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    {t('no_exams_yet', { defaultValue: 'Bu derste henüz sınav yok.' })}
                </Text>
            ) : (
                exams.map(exam => (
                    <TouchableOpacity
                        key={exam.id}
                        style={[styles.examCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                        onPress={() => onNavigateToExam?.(exam.id)}
                    >
                        <View style={styles.examInfo}>
                            <Text style={[styles.examTitle, { color: colors.text }]}>{exam.title}</Text>
                            <View style={styles.examMeta}>
                                <Text style={[styles.examMetaText, { color: colors.textSecondary }]}>
                                    {exam.durationMinutes ?? '-'} {t('minutes_short', { defaultValue: 'dk' })}
                                </Text>
                                {typeof exam.passThreshold === 'number' && (
                                    <Text style={[styles.examMetaText, { color: colors.textSecondary }]}>
                                        • {t('pass_grade', { defaultValue: 'Geçme' })}: {exam.passThreshold}
                                    </Text>
                                )}
                            </View>
                        </View>
                        <View style={[
                            styles.examStatus,
                            { backgroundColor: exam.isDraft ? colors.warning + '20' : colors.success + '20' }
                        ]}>
                            <Text style={{
                                color: exam.isDraft ? colors.warning : colors.success,
                                fontSize: 12,
                                fontWeight: '600'
                            }}>
                                {exam.isDraft ? t('draft', { defaultValue: 'Taslak' }) : t('published', { defaultValue: 'Yayında' })}
                            </Text>
                        </View>
                    </TouchableOpacity>
                ))
            )}
        </View>
    );

    // Render Participants Tab
    const renderParticipants = () => (
        <View style={styles.tabContent}>
            <Text style={[styles.sectionHeader, { color: colors.text }]}>
                {t('participants_title')} ({participants.length})
            </Text>
            {participants.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    {t('course_list_empty_student')}
                </Text>
            ) : (
                participants.map(participant => (
                    <View
                        key={participant.id}
                        style={[styles.participantCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                    >
                        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                            <Text style={styles.avatarText}>
                                {participant.username.charAt(0).toUpperCase()}
                            </Text>
                        </View>
                        <View style={styles.participantInfo}>
                            <Text style={[styles.participantName, { color: colors.text }]}>
                                {participant.username}
                            </Text>
                            <Text style={[styles.participantEmail, { color: colors.textSecondary }]}>
                                {participant.email || participant.role}
                            </Text>
                        </View>
                        <View style={[styles.roleBadge, { backgroundColor: colors.primary + '15' }]}>
                            <Text style={[styles.roleText, { color: colors.primary }]}>
                                {participant.role}
                            </Text>
                        </View>
                    </View>
                ))
            )}
        </View>
    );

    // Render Grades Tab
    const renderGrades = () => (
        <View style={styles.tabContent}>
            <Text style={[styles.sectionHeader, { color: colors.text }]}>{t('gradebook')}</Text>
            <View style={[styles.placeholderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="book-open" size={32} color={colors.textSecondary} />
                <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
                    {t('gradebook_desc')}
                </Text>
                {!!onOpenGradebook && (
                    <TouchableOpacity
                        onPress={onOpenGradebook}
                        style={[styles.placeholderBtn, { backgroundColor: colors.primary }]}
                    >
                        <Text style={styles.placeholderBtnText}>
                            {t('open')}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>

            <Text style={[styles.sectionHeader, { color: colors.text }]}>{t('notes')}</Text>
            <View style={[styles.placeholderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="file-text" size={32} color={colors.textSecondary} />
                <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
                    {t('notes_desc')}
                </Text>
                {!!onOpenNotes && (
                    <TouchableOpacity
                        onPress={onOpenNotes}
                        style={[styles.placeholderBtn, { backgroundColor: colors.primary }]}
                    >
                        <Text style={styles.placeholderBtnText}>
                            {t('open')}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );

    // Render Rubrics Tab
    const renderRubrics = () => (
        <View style={styles.tabContent}>
            <Text style={[styles.sectionHeader, { color: colors.text }]}>{t('rubrics')}</Text>
            <View style={[styles.placeholderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="clipboard" size={32} color={colors.textSecondary} />
                <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
                    {t('rubrics', { defaultValue: 'Rubrikler' })}
                </Text>
                <Text style={[styles.placeholderText, { color: colors.textSecondary, marginTop: 6 }]}>
                    {t('rubrics_desc', { defaultValue: 'Bu ders için rubrikleri görüntüleyip yeni rubrik oluşturabilirsiniz.' })}
                </Text>
                {!!onOpenRubrics && (
                    <TouchableOpacity
                        onPress={onOpenRubrics}
                        style={[styles.placeholderBtn, { backgroundColor: colors.primary }]}
                    >
                        <Text style={styles.placeholderBtnText}>
                            {t('open', { defaultValue: 'Aç' })}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );

    // Render Prerequisites Tab
    const renderPrerequisites = () => (
        <View style={styles.tabContent}>
            <Text style={[styles.sectionHeader, { color: colors.text }]}>{t('prerequisites')}</Text>
            <View style={[styles.placeholderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="link" size={32} color={colors.textSecondary} />
                <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
                    {t('prereq_desc', { defaultValue: 'Ön koşullar içerik bazında ayarlanır. İçerik düzenleme ekranında ön koşul seçebilirsiniz.' })}
                </Text>
                <TouchableOpacity
                    onPress={() => setActiveTab('content')}
                    style={[styles.placeholderBtn, { backgroundColor: colors.primary }]}
                >
                    <Text style={styles.placeholderBtnText}>
                        {t('go_to_content', { defaultValue: 'İçeriklere Git' })}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    const renderTabContent = () => {
        switch (activeTab) {
            case 'overview': return renderOverview();
            case 'modules': return renderModules();
            case 'content': return renderContent();
            case 'exams': return renderExams();
            case 'participants': return renderParticipants();
            case 'grades': return renderGrades();
            case 'rubrics': return renderRubrics();
            case 'prerequisites': return renderPrerequisites();
            default: return renderOverview();
        }
    };

    if (loading) {
        return (
            <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={onBack} style={styles.backBtn}>
                    <Feather name="arrow-left" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                    {course?.title || t('courses')}
                </Text>
                <TouchableOpacity style={styles.moreBtn}>
                    <Feather name="more-vertical" size={24} color={colors.text} />
                </TouchableOpacity>
            </View>

            {/* Tab Bar */}
            {renderTabBar()}

            {/* Content */}
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        colors={[colors.primary]}
                        tintColor={colors.primary}
                    />
                }
            >
                {renderTabContent()}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        paddingTop: 48,
        borderBottomWidth: 1,
    },
    backBtn: {
        padding: 4,
    },
    headerTitle: {
        flex: 1,
        fontSize: 18,
        fontWeight: '600',
        marginHorizontal: 12,
    },
    moreBtn: {
        padding: 4,
    },
    tabBar: {
        borderBottomWidth: 1,
    },
    tabBarContent: {
        paddingHorizontal: 8,
    },
    tab: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginRight: 4,
    },
    tabLabel: {
        marginLeft: 6,
        fontSize: 14,
        fontWeight: '500',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
    },
    tabContent: {
        flex: 1,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '700',
        marginBottom: 8,
    },
    description: {
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 16,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#e2e8f0',
    },
    statItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statValue: {
        marginLeft: 6,
        fontSize: 13,
    },
    sectionHeader: {
        fontSize: 16,
        fontWeight: '600',
        marginTop: 16,
        marginBottom: 12,
    },
    quickActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    actionBtn: {
        flex: 1,
        alignItems: 'center',
        padding: 16,
        marginHorizontal: 4,
        borderRadius: 12,
        borderWidth: 1,
    },
    actionLabel: {
        marginTop: 8,
        fontSize: 12,
        fontWeight: '500',
    },
    managementGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginTop: 8,
    },
    managementBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
    },
    managementBtnText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 13,
    },
    emptyText: {
        textAlign: 'center',
        marginTop: 40,
        fontSize: 14,
    },
    moduleCard: {
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 8,
        overflow: 'hidden',
    },
    moduleHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
    },
    moduleTitle: {
        flex: 1,
        fontSize: 16,
        fontWeight: '600',
        marginLeft: 8,
    },
    moduleContents: {
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderTopWidth: 1,
        borderTopColor: '#e2e8f0',
    },
    contentItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
    },
    contentTitle: {
        marginLeft: 8,
        fontSize: 14,
    },
    emptyModuleText: {
        fontSize: 13,
        fontStyle: 'italic',
        paddingVertical: 8,
    },
    contentCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 8,
    },
    contentIconCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    contentInfo: {
        flex: 1,
        marginLeft: 12,
    },
    contentCardTitle: {
        fontSize: 16,
        fontWeight: '500',
    },
    contentType: {
        fontSize: 12,
        marginTop: 2,
    },
    examCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 8,
    },
    examInfo: {
        flex: 1,
    },
    examTitle: {
        fontSize: 16,
        fontWeight: '600',
    },
    examMeta: {
        flexDirection: 'row',
        marginTop: 4,
    },
    examMetaText: {
        fontSize: 12,
    },
    examStatus: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    participantCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 8,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    participantInfo: {
        flex: 1,
        marginLeft: 12,
    },
    participantName: {
        fontSize: 15,
        fontWeight: '500',
    },
    participantEmail: {
        fontSize: 13,
        marginTop: 2,
    },
    roleBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    roleText: {
        fontSize: 12,
        fontWeight: '600',
    },
    pushInput: {
        height: 44,
        borderRadius: 10,
        borderWidth: 1,
        paddingHorizontal: 12,
        marginTop: 8,
    },
    pushTextarea: {
        minHeight: 100,
        borderRadius: 10,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingTop: 12,
        marginTop: 12,
        textAlignVertical: 'top',
    },
    pushButton: {
        height: 44,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 12,
    },
    pushButtonText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 14,
    },
    placeholderCard: {
        padding: 32,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    placeholderText: {
        marginTop: 12,
        fontSize: 14,
        textAlign: 'center',
    },
    placeholderBtn: {
        marginTop: 14,
        height: 44,
        paddingHorizontal: 16,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    placeholderBtnText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 14,
    },
});

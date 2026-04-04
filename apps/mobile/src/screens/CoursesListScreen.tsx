import React, { useState } from 'react';
import { View, Text, Switch, StyleSheet, ScrollView, Alert, Modal, TouchableOpacity, Image, TextInput, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import ScreenLayout from '../components/ui/ScreenLayout';
import Header from '../components/ui/Header';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { Feather } from '@expo/vector-icons';

interface Course {
    id: string;
    title: string;
    description?: string;
    thumbnail?: string;
    instructor?: string;
    enrolledCount?: number;
    contentCount?: number;
    isEnrolled?: boolean;
    progress?: number;
}

interface CoursesListScreenProps {
    courses: Course[];
    enrolledCourses?: Course[];
    onCoursePress: (course: Course) => void;
    onEnroll?: (courseId: string) => Promise<void>;
    onRefresh?: () => Promise<void>;
    onBack?: () => void;
    isInstructor?: boolean;
    onCreateCourse?: () => void;
}

export default function CoursesListScreen({
    courses,
    enrolledCourses = [],
    onCoursePress,
    onEnroll,
    onRefresh,
    onBack,
    isInstructor = false
}: CoursesListScreenProps) {
    const { t } = useTranslation();
    const { colors } = useTheme();

    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'enrolled' | 'browse'>('enrolled');
    const [refreshing, setRefreshing] = useState(false);
    const [enrollingId, setEnrollingId] = useState<string | null>(null);

    const handleRefresh = async () => {
        if (!onRefresh) return;
        setRefreshing(true);
        try {
            await onRefresh();
        } finally {
            setRefreshing(false);
        }
    };

    const handleEnroll = async (courseId: string) => {
        if (!onEnroll) return;
        setEnrollingId(courseId);
        try {
            await onEnroll(courseId);
        } finally {
            setEnrollingId(null);
        }
    };

    const filteredCourses = (activeTab === 'enrolled' ? enrolledCourses : courses)
        .filter(course =>
            course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            course.description?.toLowerCase().includes(searchQuery.toLowerCase())
        );

    const CourseCard = ({ course }: { course: Course }) => (
        <Card
            onPress={() => onCoursePress(course)}
            noPadding
            style={styles.courseCard}
        >
            <View style={styles.thumbnailContainer}>
                {course.thumbnail ? (
                    <Image source={{ uri: course.thumbnail }} style={styles.thumbnailImage} />
                ) : (
                    <View style={[styles.thumbnailPlaceholder, { backgroundColor: colors.primary + '15' }]}>
                        <Feather name="book" size={32} color={colors.primary} />
                    </View>
                )}
                {course.isEnrolled && (
                    <View style={[styles.enrolledBadge, { backgroundColor: colors.success }]}>
                        <Feather name="check" size={12} color="#fff" />
                    </View>
                )}
            </View>

            <View style={styles.cardContent}>
                <Text style={[styles.courseTitle, { color: colors.text }]} numberOfLines={2}>
                    {course.title}
                </Text>

                {course.instructor && (
                    <View style={styles.instructorRow}>
                        <Feather name="user" size={14} color={colors.textSecondary} />
                        <Text style={[styles.instructorText, { color: colors.textSecondary }]} numberOfLines={1}>
                            {course.instructor}
                        </Text>
                    </View>
                )}

                <View style={styles.footerRow}>
                    {course.isEnrolled && course.progress !== undefined ? (
                        <View style={{ flex: 1 }}>
                            <View style={[styles.progressBarBg, { backgroundColor: colors.border }]}>
                                <View style={[styles.progressBarFill, { width: `${course.progress}%`, backgroundColor: colors.success }]} />
                            </View>
                            <Text style={[styles.progressText, { color: colors.textSecondary }]}>
                                %{course.progress} {t('completed_s') || 'Tamamlandı'}
                            </Text>
                        </View>
                    ) : activeTab === 'browse' && !course.isEnrolled ? (
                        <Button
                            label={enrollingId === course.id ? t('processing') || '...' : t('enroll') || 'Kayıt Ol'}
                            onPress={() => handleEnroll(course.id)}
                            variant="primary"
                            style={{ height: 36, paddingHorizontal: 12, borderRadius: 8 }}
                            loading={enrollingId === course.id}
                        />
                    ) : (
                        <View style={styles.metaBadge}>
                            <Feather name="file-text" size={12} color={colors.textSecondary} />
                            <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                                {course.contentCount || 0} {t('content')}
                            </Text>
                        </View>
                    )}
                </View>
            </View>
        </Card>
    );

    return (
        <ScreenLayout
            header={
                <Header
                    title={t('courses') || 'Dersler'}
                    showBack={!!onBack}
                    rightAction={
                        <TouchableOpacity style={{ padding: 8 }}>
                            <Feather name="filter" size={24} color={colors.text} />
                        </TouchableOpacity>
                    }
                />
            }
        >
            {/* Search Bar */}
            <View style={[styles.searchContainer, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
                <Feather name="search" size={20} color={colors.textSecondary} style={{ marginRight: 10 }} />
                <TextInput
                    style={[styles.searchInput, { color: colors.text }]}
                    placeholder={t('search') || 'Ara...'}
                    placeholderTextColor={colors.textSecondary}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
            </View>

            {/* Custom Tabs */}
            {!isInstructor && (
                <View style={[styles.tabsContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <TouchableOpacity
                        style={[
                            styles.tab,
                            activeTab === 'enrolled' && { backgroundColor: colors.primary, shadowColor: colors.primary }
                        ]}
                        onPress={() => setActiveTab('enrolled')}
                    >
                        <Text style={[
                            styles.tabText,
                            { color: activeTab === 'enrolled' ? '#fff' : colors.textSecondary }
                        ]}>
                            {t('my_courses')}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[
                            styles.tab,
                            activeTab === 'browse' && { backgroundColor: colors.primary, shadowColor: colors.primary }
                        ]}
                        onPress={() => setActiveTab('browse')}
                    >
                        <Text style={[
                            styles.tabText,
                            { color: activeTab === 'browse' ? '#fff' : colors.textSecondary }
                        ]}>
                            {t('discover_courses') || 'Keşfet'}
                        </Text>
                    </TouchableOpacity>
                </View>
            )}

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
                }
            >
                {filteredCourses.length > 0 ? (
                    filteredCourses.map(course => (
                        <CourseCard key={course.id} course={course} />
                    ))
                ) : (
                    <View style={styles.emptyState}>
                        <Feather name="book-open" size={48} color={colors.border} />
                        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                            {t('no_courses_found') || 'Kurs bulunamadı'}
                        </Text>
                    </View>
                )}
            </ScrollView>
        </ScreenLayout>
    );
}

const styles = StyleSheet.create({
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 50,
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 16,
        marginBottom: 16,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        height: '100%',
    },
    tabsContainer: {
        flexDirection: 'row',
        padding: 4,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 16,
    },
    tab: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 8,
    },
    tabText: {
        fontWeight: '600',
        fontSize: 14,
    },
    listContent: {
        paddingBottom: 80, // Floating bar spacing
    },
    courseCard: {
        marginBottom: 16,
    },
    thumbnailContainer: {
        height: 150,
        backgroundColor: '#f1f5f9',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    thumbnailImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    thumbnailPlaceholder: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    enrolledBadge: {
        position: 'absolute',
        top: 12,
        right: 12,
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
    },
    cardContent: {
        padding: 16,
    },
    courseTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 8,
    },
    instructorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    instructorText: {
        fontSize: 14,
        marginLeft: 6,
    },
    footerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 4,
    },
    progressBarBg: {
        height: 6,
        borderRadius: 3,
        marginBottom: 4,
        width: '100%',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 3,
    },
    progressText: {
        fontSize: 12,
    },
    metaBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        backgroundColor: 'transparent', // Customize if needed
    },
    metaText: {
        fontSize: 12,
        marginLeft: 4,
    },
    emptyState: {
        alignItems: 'center',
        marginTop: 40,
        gap: 16,
    },
    emptyText: {
        fontSize: 16,
    }
});

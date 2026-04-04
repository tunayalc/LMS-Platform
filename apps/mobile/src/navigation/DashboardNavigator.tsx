import React, { useState, useEffect, useCallback } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DashboardTabParamList } from './types';
import { Platform, Alert, View, Text, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Screens
import DashboardScreen from '../screens/DashboardScreen';
import CoursesListScreen from '../screens/CoursesListScreen';
import ExamsListScreen from '../screens/ExamsListScreen';
import OpticReaderScreen from '../screens/OpticReaderScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from './types';
import { NotificationManager, supportsRemotePush } from '../utils/notifications';

// Wrapper component that fetches courses from API
function CoursesListWrapper() {
    const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
    const [browseCourses, setBrowseCourses] = useState<any[]>([]);
    const [enrolledCourses, setEnrolledCourses] = useState<any[]>([]);
    const [roleLower, setRoleLower] = useState<string>('');
    const [loading, setLoading] = useState(true);

    const fetchCourses = useCallback(async () => {
        try {
            setLoading(true);
            const token = await AsyncStorage.getItem('auth_token');
            const storedRole = await AsyncStorage.getItem('user_role');
            const nextRoleLower = (storedRole || '').toLowerCase();
            setRoleLower(nextRoleLower);
            console.log('[CoursesListWrapper] Token:', token ? 'EXISTS' : 'MISSING');

            if (!token) {
                console.error('[CoursesListWrapper] No auth token found!');
                Alert.alert('Token Hatası', 'Oturum bulunamadı. Lütfen tekrar giriş yapın.');
                return;
            }

            const headers = { Authorization: `Bearer ${token}` };
            const isStudent = nextRoleLower === 'student';

            if (isStudent) {
                const [enrolledRes, browseRes] = await Promise.all([
                    apiClient.get('/courses', { headers, params: { mode: 'enrolled' } }) as any,
                    apiClient.get('/courses', { headers, params: { mode: 'browse' } }) as any
                ]);

                const enrolledData = Array.isArray(enrolledRes) ? enrolledRes : (enrolledRes?.courses || enrolledRes?.data || []);
                const browseData = Array.isArray(browseRes) ? browseRes : (browseRes?.courses || browseRes?.data || []);

                setEnrolledCourses(enrolledData);
                setBrowseCourses(browseData);
            } else {
                const response = await apiClient.get('/courses', { headers }) as any;
                const coursesData = Array.isArray(response) ? response : (response?.courses || response?.data || []);
                setEnrolledCourses(coursesData);
                setBrowseCourses([]);
            }
        } catch (error: any) {
            console.error('[CoursesListWrapper] Failed to fetch courses:', error);
            Alert.alert('API Hatası', `Kurslar yüklenemedi: ${error?.message || 'Bilinmeyen hata'}`);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCourses();
    }, [fetchCourses]);

    return (
        <CoursesListScreen
            courses={browseCourses}
            enrolledCourses={enrolledCourses}
            onCoursePress={(course) => {
                navigation.navigate('CourseDetail', { courseId: course.id });
            }}
            onRefresh={fetchCourses}
            onCreateCourse={() => navigation.navigate('CourseForm', {})}
            isInstructor={roleLower !== 'student'}
            onEnroll={async (courseId) => {
                if (roleLower !== 'student') {
                    Alert.alert('Yetki', 'Sadece öğrenciler kayıt olabilir.');
                    return;
                }
                const token = await AsyncStorage.getItem('auth_token');
                if (!token) return;
                await apiClient.post(`/courses/${courseId}/enroll`, {}, { headers: { Authorization: `Bearer ${token}` } });
                await fetchCourses();
            }}
        />
    );
}

// Wrapper component that fetches exams from API
function ExamsListWrapper() {
    const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
    const [exams, setExams] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchExams = useCallback(async () => {
        try {
            setLoading(true);
            const token = await AsyncStorage.getItem('auth_token');
            const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

            const [examsRes, coursesRes] = await Promise.all([
                apiClient.get('/exams', { headers }) as any,
                apiClient.get('/courses', { headers, params: { limit: 500, offset: 0 } }) as any
            ]);

            const examsList = Array.isArray(examsRes) ? examsRes : (examsRes?.exams || []);
            const coursesList = Array.isArray(coursesRes) ? coursesRes : (coursesRes?.courses || []);
            const courseTitleById = new Map<string, string>(coursesList.map((c: any) => [c.id, c.title]));

            setExams(examsList.map((e: any) => ({ ...e, courseTitle: courseTitleById.get(e.courseId) })));
        } catch (error) {
            console.error('Failed to fetch exams:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchExams();
    }, [fetchExams]);

    return (
        <ExamsListScreen
            exams={exams}
            onExamPress={(exam) => {
                const doNav = async () => {
                    const role = (await AsyncStorage.getItem('user_role')) || 'Guest';
                    const roleLower = role.toLowerCase();
                    if (roleLower === 'student') {
                        Alert.alert(
                            'Safe Exam Browser',
                            'Sınavlar sadece Safe Exam Browser (SEB) üzerinden çözülebilir. Mobil uygulamadan sınava giriş kapalıdır.'
                        );
                        return;
                    }
                    if (exam.courseId) {
                        navigation.navigate('ExamForm', { examId: exam.id, courseId: exam.courseId });
                        return;
                    }
                    Alert.alert(exam.title, `CourseId missing. Exam edit cannot open.`);
                };
                void doNav();
            }}
            onRefresh={fetchExams}
        />
    );
}

// Wrapper component that fetches users from API (Admin only)
function UsersListWrapper() {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const { colors } = useTheme();
    const { t } = useTranslation();

    const fetchUsers = useCallback(async () => {
        try {
            setLoading(true);
            const token = await AsyncStorage.getItem('auth_token');
            const response = await apiClient.get('/users', {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            }) as any;
            setUsers(Array.isArray(response) ? response : (response?.users || []));
        } catch (error) {
            console.error('Failed to fetch users:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    // Simple users list display
    return (
        <View style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: colors.text, marginBottom: 16 }}>
                {t('users')} ({users.length})
            </Text>
            <ScrollView>
                {users.map((user: any, index: number) => (
                    <View key={user.id || index} style={{
                        backgroundColor: colors.card,
                        padding: 16,
                        borderRadius: 12,
                        marginBottom: 8,
                        borderWidth: 1,
                        borderColor: colors.border
                    }}>
                        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 16 }}>
                            {user.username}
                        </Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                            {user.email || 'No email'} • {user.role}
                        </Text>
                    </View>
                ))}
                {users.length === 0 && !loading && (
                    <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 40 }}>
                        No users found
                    </Text>
                )}
            </ScrollView>
        </View>
    );
}

const Tab = createBottomTabNavigator<DashboardTabParamList>();

interface DashboardNavigatorProps {
    role: string;
    onLogout: () => void;
}

export default function DashboardNavigator({ role, onLogout }: DashboardNavigatorProps) {
    const { colors, isDark } = useTheme();
    const { t } = useTranslation();

    const isAdmin = ['superadmin', 'admin'].includes(role.toLowerCase());
    const isInstructor = ['instructor', 'assistant'].includes(role.toLowerCase());

    useEffect(() => {
        const registerPush = async () => {
            try {
                if (!supportsRemotePush) return;
                const token = await AsyncStorage.getItem('auth_token');
                if (!token) return;

                const expoToken = await NotificationManager.registerForPushNotificationsAsync();
                if (!expoToken) return;

                await apiClient.post('/push/register', { token: expoToken }, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            } catch (e) {
                console.log('[Push] register failed:', e);
            }
        };

        registerPush();
    }, []);

    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: colors.card,
                    borderTopColor: colors.border,
                    height: Platform.OS === 'ios' ? 88 : 68,
                    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
                    paddingTop: 12,
                },
                tabBarActiveTintColor: colors.primary,
                tabBarInactiveTintColor: colors.textSecondary,
                tabBarLabelStyle: {
                    fontSize: 12,
                    fontWeight: '600',
                },
                tabBarIcon: ({ color, size, focused }) => {
                    let iconName: any;

                    if (route.name === 'Home') iconName = 'home';
                    else if (route.name === 'Courses') iconName = 'book-open';
                    else if (route.name === 'Exams') iconName = 'edit-3';
                    else if (route.name === 'OMR') iconName = 'camera';
                    else if (route.name === 'Users') iconName = 'users';
                    else if (route.name === 'Profile') iconName = 'user';

                    return <Feather name={iconName} size={size} color={color} />;
                },
            })}
        >
            <Tab.Screen
                name="Home"
                children={(props) => {
                    // Map lowercase screen names to actual tab names
                    const screenNameMap: Record<string, string> = {
                        'courses': 'Courses',
                        'exams': 'Courses', // No separate Exams tab, redirect to Courses
                        'omr': 'OMR',
                        'questions': 'Courses', // No separate Questions tab
                        'users': 'Profile', // No separate Users tab
                        'settings': 'Profile',
                        'gradebook': 'Courses', // No separate Gradebook tab
                    };
                    return (
                        <DashboardScreen
                            user={{ username: 'User', role: role }}
                            onNavigate={(screen) => {
                                const mappedScreen = screenNameMap[screen] || screen;
                                props.navigation.navigate(mappedScreen as any);
                            }}
                            onSettings={() => props.navigation.navigate('Profile')}
                            onRefresh={async () => { }}
                        />
                    );
                }}
                options={{ title: t('dashboard') }}
            />

            <Tab.Screen
                name="Courses"
                component={CoursesListWrapper}
                options={{ title: t('courses') }}
            />

            <Tab.Screen
                name="Exams"
                component={ExamsListWrapper}
                options={{ title: t('exams') }}
            />

            {/* OMR is Instructor/Admin Only */}
            {(isAdmin || isInstructor) && (
                <Tab.Screen
                    name="OMR"
                    children={() => <OpticReaderScreen route={{ params: { examId: '' } }} navigation={{ goBack: () => { } }} />}
                    options={{ title: 'OMR' }}
                />
            )}

            {/* Users is Admin Only */}
            {isAdmin && (
                <Tab.Screen
                    name="Users"
                    component={UsersListWrapper}
                    options={{ title: t('users') }}
                />
            )}


            <Tab.Screen
                name="Profile"
                children={(props) => (
                    <SettingsScreen
                        onBack={() => props.navigation.goBack()}
                        onLogout={onLogout}
                    />
                )}
                options={{ title: t('profile') }}
            />

        </Tab.Navigator>
    );
}

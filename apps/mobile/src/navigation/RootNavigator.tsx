import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createStackNavigator } from '@react-navigation/stack';

import { apiBaseUrl, apiClient } from '../api/client';
import { useTheme } from '../contexts/ThemeContext';

import AuthNavigator from './AuthNavigator';
import DashboardNavigator from './DashboardNavigator';
import { RootStackParamList } from './types';

// Full-screen modal screens
import ContentFormScreen from '../screens/ContentFormScreen';
import CourseDetailScreen from '../screens/CourseDetailScreen';
import CourseFormScreen from '../screens/CourseFormScreen';
import CourseRubricsScreen from '../screens/CourseRubricsScreen';
import CourseGradebookScreen from '../screens/CourseGradebookScreen';
import CourseNotesScreen from '../screens/CourseNotesScreen';
import ExamFormScreen from '../screens/ExamFormScreen';
import ExamTakingScreen from '../screens/ExamTakingScreen';
import ModulesEditorScreen from '../screens/ModulesEditorScreen';
import PdfViewerScreen from '../screens/PdfViewerScreen';
import QuestionBankScreen from '../screens/QuestionBankScreen';
import QuestionFormScreen from '../screens/QuestionFormScreen';
import UserFormScreen from '../screens/UserFormScreen';
import VideoPlayerScreen from '../screens/VideoPlayerScreen';
import WebViewerScreen from '../screens/WebViewerScreen';
import { normalizeContentSourceToUrl } from '../utils/contentUrl';

const Stack = createStackNavigator<RootStackParamList>();

export default function RootNavigator() {
    const { colors } = useTheme();
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [userRole, setUserRole] = useState<string>('Guest');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        void checkAuth();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const checkAuth = async () => {
        try {
            const token = await AsyncStorage.getItem('auth_token');
            if (!token) return;

            try {
                const me = (await apiClient.get('/auth/me', {
                    headers: { Authorization: `Bearer ${token}` }
                } as any)) as any;

                const role = me?.user?.role ?? (await AsyncStorage.getItem('user_role'));

                setIsAuthenticated(true);
                setUserRole(role || 'Guest');

                if (me?.user) {
                    await AsyncStorage.setItem('user_role', String(role || 'Guest'));
                    await AsyncStorage.setItem('user_data', JSON.stringify(me.user));
                }
            } catch (e: any) {
                console.log('[Auth] Stored token invalid or API unreachable, clearing session.', e?.message || e);
                await AsyncStorage.removeItem('auth_token');
                await AsyncStorage.removeItem('user_role');
                await AsyncStorage.removeItem('user_data');
                setIsAuthenticated(false);
                setUserRole('Guest');

                Alert.alert(
                    'Bağlantı',
                    `API'ye bağlanılamadı veya oturum geçersiz.\n\nURL: ${apiBaseUrl}`
                );
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleLoginSuccess = async (user: any, token: string) => {
        await AsyncStorage.setItem('auth_token', token);
        await AsyncStorage.setItem('user_role', user.role);
        await AsyncStorage.setItem('user_data', JSON.stringify(user));
        setUserRole(user.role);
        setIsAuthenticated(true);
    };

    const handleLogout = async () => {
        await AsyncStorage.removeItem('auth_token');
        await AsyncStorage.removeItem('user_role');
        await AsyncStorage.removeItem('user_data');
        setIsAuthenticated(false);
    };

    const roleLower = userRole.toLowerCase();

    if (loading) {
        return (
            <View
                style={{
                    flex: 1,
                    justifyContent: 'center',
                    alignItems: 'center',
                    backgroundColor: colors.background
                }}
            >
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            {!isAuthenticated ? (
                <Stack.Screen name="Auth">
                    {() => <AuthNavigator onLoginSuccess={handleLoginSuccess} />}
                </Stack.Screen>
            ) : (
                <>
                    <Stack.Screen name="Dashboard">
                        {() => <DashboardNavigator role={userRole} onLogout={handleLogout} />}
                    </Stack.Screen>

                    {/* Course Detail */}
                    <Stack.Screen name="CourseDetail">
                        {(props) => (
                            <CourseDetailScreen
                                courseId={props.route.params.courseId}
                                onBack={() => props.navigation.goBack()}
                                onEditModules={() =>
                                    props.navigation.navigate('ModulesEditor', { courseId: props.route.params.courseId })
                                }
                                onOpenRubrics={() =>
                                    props.navigation.navigate('CourseRubrics', { courseId: props.route.params.courseId })
                                }
                                onOpenQuestionBank={() =>
                                    props.navigation.navigate('QuestionBank', { courseId: props.route.params.courseId })
                                }
                                onOpenGradebook={() =>
                                    props.navigation.navigate('CourseGradebook', { courseId: props.route.params.courseId })
                                }
                                onOpenNotes={() =>
                                    props.navigation.navigate('CourseNotes', { courseId: props.route.params.courseId })
                                }
                                onCreateExam={() =>
                                    props.navigation.navigate('ExamForm', { courseId: props.route.params.courseId })
                                }
                                onCreateContent={() =>
                                    props.navigation.navigate('ContentForm', { courseId: props.route.params.courseId })
                                }
                                onNavigateToExam={(examId) => {
                                    if (roleLower === 'student') {
                                        Alert.alert(
                                            'Safe Exam Browser',
                                            'Sınavlar sadece Safe Exam Browser (SEB) üzerinden çözülebilir. Mobil uygulamadan sınava giriş kapalıdır.'
                                        );
                                    } else {
                                        props.navigation.navigate('ExamForm', {
                                            examId,
                                            courseId: props.route.params.courseId
                                        });
                                    }
                                }}
                                onNavigateToContent={(contentId) =>
                                    props.navigation.navigate('ContentForm', {
                                        contentId,
                                        courseId: props.route.params.courseId
                                    })
                                }
                                onOpenContent={async (content) => {
                                    const type = String((content as any).type || '').toLowerCase();
                                    const title = (content as any).title as string | undefined;
                                    const source = (content as any).source as string | undefined;
                                    const meetingUrl = (content as any).meetingUrl as string | undefined;

                                    if (type === 'pdf' && source) {
                                        const url = normalizeContentSourceToUrl(apiBaseUrl, source);
                                        if (!url) return;
                                        props.navigation.navigate('PdfViewer', {
                                            uri: url,
                                            title,
                                            contentId: (content as any).id
                                        });
                                        return;
                                    }

                                    if (type === 'video' && source) {
                                        const url = normalizeContentSourceToUrl(apiBaseUrl, source);
                                        if (!url) return;
                                        props.navigation.navigate('VideoPlayer', { url, title, contentId: (content as any).id });
                                        return;
                                    }

                                    if (type === 'live_class') {
                                        const url = meetingUrl || source;
                                        if (!url) return;
                                        const canOpen = await Linking.canOpenURL(url);
                                        if (!canOpen) {
                                            Alert.alert('Link', 'Bu bağlantı açılamıyor.');
                                            return;
                                        }
                                        await Linking.openURL(url);
                                        return;
                                    }

                                    if ((type === 'scorm' || type === 'h5p') && source) {
                                        const url = normalizeContentSourceToUrl(apiBaseUrl, source) || `${apiBaseUrl.replace(/\/$/, '')}/uploads/scorm/${encodeURIComponent(source)}/index.html`;
                                        props.navigation.navigate('WebViewer', { uri: url, title });
                                        return;
                                    }

                                    if (source) {
                                        const url = normalizeContentSourceToUrl(apiBaseUrl, source) || encodeURI(`${apiBaseUrl.replace(/\/$/, '')}${source.startsWith('/') ? '' : '/'}${source}`);
                                        props.navigation.navigate('WebViewer', { uri: url, title });
                                        return;
                                    }
                                }}
                            />
                        )}
                    </Stack.Screen>

                    <Stack.Screen name="ModulesEditor">
                        {(props) => (
                            <ModulesEditorScreen
                                courseId={props.route.params.courseId}
                                onBack={() => props.navigation.goBack()}
                            />
                        )}
                    </Stack.Screen>

                    <Stack.Screen name="CourseRubrics">
                        {(props) => (
                            <CourseRubricsScreen
                                courseId={props.route.params.courseId}
                                onBack={() => props.navigation.goBack()}
                            />
                        )}
                    </Stack.Screen>

                    <Stack.Screen name="QuestionBank">
                        {(props) => (
                            <QuestionBankScreen
                                courseId={props.route.params.courseId}
                                onBack={() => props.navigation.goBack()}
                            />
                        )}
                    </Stack.Screen>

                    <Stack.Screen name="CourseGradebook">
                        {(props) => (
                            <CourseGradebookScreen
                                courseId={props.route.params.courseId}
                                onBack={() => props.navigation.goBack()}
                            />
                        )}
                    </Stack.Screen>

                    <Stack.Screen name="CourseNotes">
                        {(props) => (
                            <CourseNotesScreen
                                courseId={props.route.params.courseId}
                                onBack={() => props.navigation.goBack()}
                            />
                        )}
                    </Stack.Screen>

                    <Stack.Screen name="ExamTaking">
                        {(props) => (
                            <ExamTakingScreen
                                examId={props.route.params.examId}
                                onBack={() => props.navigation.goBack()}
                            />
                        )}
                    </Stack.Screen>

                    <Stack.Screen name="VideoPlayer">
                        {(props) => <VideoPlayerScreen route={props.route} navigation={props.navigation} />}
                    </Stack.Screen>

                    <Stack.Screen name="WebViewer">
                        {(props) => <WebViewerScreen route={props.route} navigation={props.navigation} />}
                    </Stack.Screen>

                    {/* Course Form */}
                    <Stack.Screen name="CourseForm" options={{ presentation: 'modal' }}>
                        {(props) => (
                            <CourseFormScreen
                                courseId={props.route.params?.courseId}
                                onBack={() => props.navigation.goBack()}
                                onSuccess={() => props.navigation.goBack()}
                            />
                        )}
                    </Stack.Screen>

                    {/* Exam Form */}
                    <Stack.Screen name="ExamForm" options={{ presentation: 'modal' }}>
                        {(props) => (
                            <ExamFormScreen
                                examId={props.route.params?.examId}
                                courseId={props.route.params.courseId}
                                onBack={() => props.navigation.goBack()}
                                onSuccess={() => props.navigation.goBack()}
                                onNavigateToQuestions={(examId) =>
                                    props.navigation.navigate('QuestionForm', { examId })
                                }
                            />
                        )}
                    </Stack.Screen>

                    {/* Question Form */}
                    <Stack.Screen name="QuestionForm" options={{ presentation: 'modal' }}>
                        {(props) => (
                            <QuestionFormScreen
                                questionId={props.route.params?.questionId}
                                examId={props.route.params.examId}
                                onBack={() => props.navigation.goBack()}
                                onSuccess={() => props.navigation.goBack()}
                            />
                        )}
                    </Stack.Screen>

                    {/* Content Form */}
                    <Stack.Screen name="ContentForm" options={{ presentation: 'modal' }}>
                        {(props) => (
                            <ContentFormScreen
                                contentId={props.route.params?.contentId}
                                courseId={props.route.params.courseId}
                                moduleId={props.route.params?.moduleId}
                                onBack={() => props.navigation.goBack()}
                                onSuccess={() => props.navigation.goBack()}
                                onPreview={({ type, url, title, contentId }) => {
                                    if (type === 'pdf') {
                                        props.navigation.navigate('PdfViewer', { uri: url, title, contentId });
                                        return;
                                    }
                                    if (type === 'video') {
                                        props.navigation.navigate('VideoPlayer', { url, title, contentId });
                                        return;
                                    }
                                    props.navigation.navigate('WebViewer', { uri: url, title });
                                }}
                            />
                        )}
                    </Stack.Screen>

                    {/* User Form */}
                    <Stack.Screen name="UserForm" options={{ presentation: 'modal' }}>
                        {(props) => (
                            <UserFormScreen
                                userId={props.route.params?.userId}
                                onBack={() => props.navigation.goBack()}
                                onSuccess={() => props.navigation.goBack()}
                            />
                        )}
                    </Stack.Screen>

                    {/* PDF Viewer */}
                    <Stack.Screen name="PdfViewer">
                        {(props) => <PdfViewerScreen route={props.route} navigation={props.navigation} />}
                    </Stack.Screen>
                </>
            )}
        </Stack.Navigator>
    );
}

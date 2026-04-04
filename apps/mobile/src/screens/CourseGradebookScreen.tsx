import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { apiClient } from '../api/client';
import { useTheme } from '../contexts/ThemeContext';

type LeaderRow = { studentId: string; username: string; percentage: number; letter: string };

type StudentGradeRow = {
    id: string;
    gradeItemId: string;
    points: number;
    feedback?: string | null;
    gradedAt?: string | null;
    itemName: string;
    maxPoints: number;
    categoryName: string;
    weight: number;
};

type FinalGrade = { percentage: number; letter: string };

type GradeItem = {
    id: string;
    courseId: string;
    categoryId: string;
    name: string;
    maxPoints: number;
    dueDate?: string | null;
};

type Exam = { id: string; title: string };

export default function CourseGradebookScreen({ courseId, onBack }: { courseId: string; onBack: () => void }) {
    const { t } = useTranslation();
    const { colors } = useTheme();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [role, setRole] = useState<string>('Student');

    const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
    const [myGrades, setMyGrades] = useState<StudentGradeRow[]>([]);
    const [myFinal, setMyFinal] = useState<FinalGrade | null>(null);
    const [items, setItems] = useState<GradeItem[]>([]);
    const [exams, setExams] = useState<Exam[]>([]);
    const [syncing, setSyncing] = useState(false);

    const canManage = useMemo(() => ['superadmin', 'admin', 'instructor', 'assistant'].includes(role.toLowerCase()), [role]);

    const load = useCallback(async () => {
        const token = await AsyncStorage.getItem('auth_token');
        const storedRole = (await AsyncStorage.getItem('user_role')) || 'Student';
        setRole(storedRole);
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

        const [leaderRes, itemsRes, examsRes] = await Promise.allSettled([
            apiClient.get(`/api/gradebook/${courseId}/leaderboard`, { headers, params: { limit: 50 } } as any),
            apiClient.get(`/api/gradebook/${courseId}/items`, { headers } as any),
            apiClient.get(`/exams`, { headers, params: { courseId } } as any)
        ]);

        if (leaderRes.status === 'fulfilled') {
            setLeaderboard(Array.isArray(leaderRes.value) ? (leaderRes.value as any) : []);
        } else {
            setLeaderboard([]);
        }

        if (itemsRes.status === 'fulfilled') {
            setItems(Array.isArray(itemsRes.value) ? (itemsRes.value as any) : []);
        } else {
            setItems([]);
        }

        if (examsRes.status === 'fulfilled') {
            const value: any = examsRes.value;
            setExams(Array.isArray(value) ? value : value?.exams || []);
        } else {
            setExams([]);
        }

        // Student view
        if (!['superadmin', 'admin', 'instructor', 'assistant'].includes(storedRole.toLowerCase())) {
            const mine = await apiClient.get(`/api/gradebook/${courseId}/my-grades`, { headers } as any) as any;
            setMyGrades(Array.isArray(mine?.grades) ? mine.grades : []);
            setMyFinal(mine?.finalGrade ?? null);
        } else {
            setMyGrades([]);
            setMyFinal(null);
        }
    }, [courseId]);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await load();
        } catch (e: any) {
            console.log('[Gradebook] refresh failed', e?.message || e);
        } finally {
            setRefreshing(false);
        }
    }, [load]);

    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                await load();
            } catch (e: any) {
                console.log('[Gradebook] load failed', e?.message || e);
            } finally {
                setLoading(false);
            }
        })();
    }, [load]);

    const handleSyncExams = useCallback(async () => {
        const token = await AsyncStorage.getItem('auth_token');
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

        if (!canManage) return;
        if (exams.length === 0) {
            Alert.alert(t('gradebook') || 'Not Defteri', t('no_exams_yet') || 'Bu derste sınav yok.');
            return;
        }

        setSyncing(true);
        try {
            for (const exam of exams) {
                await apiClient.post(`/api/gradebook/sync-exam/${exam.id}`, {}, { headers } as any);
            }
            Alert.alert(t('success') || 'Başarılı', t('synced') || 'Sınav notları not defterine aktarıldı.');
            await load();
        } catch (e: any) {
            console.log('[Gradebook] sync failed', e?.message || e);
            Alert.alert(t('error') || 'Hata', t('sync_failed') || 'Aktarım başarısız.');
        } finally {
            setSyncing(false);
        }
    }, [canManage, exams, load, t]);

    if (loading) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={onBack} style={styles.backBtn}>
                    <Feather name="arrow-left" size={22} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>{t('gradebook') || 'Not Defteri'}</Text>
                {canManage ? (
                    <TouchableOpacity
                        onPress={handleSyncExams}
                        disabled={syncing}
                        style={[styles.syncBtn, { backgroundColor: syncing ? colors.border : colors.primary }]}
                    >
                        <Text style={styles.syncText}>{t('sync') || 'Senkron'}</Text>
                    </TouchableOpacity>
                ) : (
                    <View style={{ width: 72 }} />
                )}
            </View>

            {!canManage ? (
                <View style={styles.section}>
                    {myFinal && (
                        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                            <Text style={[styles.cardTitle, { color: colors.text }]}>{t('final_grade') || 'Final'}</Text>
                            <Text style={[styles.finalText, { color: colors.primary }]}>
                                %{Math.round(myFinal.percentage)} · {myFinal.letter}
                            </Text>
                        </View>
                    )}

                    <FlatList
                        data={myGrades}
                        keyExtractor={(row) => row.id}
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        contentContainerStyle={{ padding: 16 }}
                        ListEmptyComponent={
                            <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 20 }}>
                                {t('no_grades') || 'Henüz not yok.'}
                            </Text>
                        }
                        renderItem={({ item }) => (
                            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                                <Text style={[styles.cardTitle, { color: colors.text }]}>{item.itemName}</Text>
                                <Text style={{ color: colors.textSecondary }}>
                                    {item.categoryName} · {item.points}/{item.maxPoints}
                                </Text>
                                {!!item.feedback && (
                                    <Text style={{ color: colors.textSecondary, marginTop: 6 }}>{item.feedback}</Text>
                                )}
                            </View>
                        )}
                    />
                </View>
            ) : (
                <FlatList
                    data={leaderboard}
                    keyExtractor={(row) => row.studentId}
                    refreshing={refreshing}
                    onRefresh={handleRefresh}
                    contentContainerStyle={{ padding: 16 }}
                    ListHeaderComponent={
                        <>
                            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                                <Text style={[styles.cardTitle, { color: colors.text }]}>{t('grade_items') || 'Not Kalemleri'}</Text>
                                {items.length === 0 ? (
                                    <Text style={{ color: colors.textSecondary }}>
                                        {t('no_items') || 'Henüz not kalemi yok.'}
                                    </Text>
                                ) : (
                                    items.slice(0, 6).map((it) => (
                                        <Text key={it.id} style={{ color: colors.textSecondary }}>
                                            • {it.name} ({it.maxPoints})
                                        </Text>
                                    ))
                                )}
                            </View>

                            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('leaderboard') || 'Sıralama'}</Text>
                        </>
                    }
                    ListEmptyComponent={
                        <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 20 }}>
                            {t('no_students') || 'Öğrenci yok.'}
                        </Text>
                    }
                    renderItem={({ item, index }) => (
                        <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
                            <Text style={[styles.rank, { color: colors.textSecondary }]}>{index + 1}</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: colors.text, fontWeight: '600' }}>{item.username}</Text>
                                <Text style={{ color: colors.textSecondary }}>{item.letter}</Text>
                            </View>
                            <Text style={{ color: colors.primary, fontWeight: '700' }}>
                                %{Math.round(item.percentage)}
                            </Text>
                        </View>
                    )}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        paddingTop: 48,
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        flexDirection: 'row',
        alignItems: 'center'
    },
    backBtn: { padding: 6, marginRight: 10 },
    headerTitle: { flex: 1, fontSize: 18, fontWeight: '700' },
    syncBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
    syncText: { color: '#fff', fontWeight: '700' },
    section: { flex: 1 },
    sectionTitle: { marginTop: 8, marginBottom: 10, fontSize: 16, fontWeight: '700' },
    card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
    cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 6 },
    finalText: { fontSize: 22, fontWeight: '900' },
    row: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
    rank: { width: 26, textAlign: 'center' }
});


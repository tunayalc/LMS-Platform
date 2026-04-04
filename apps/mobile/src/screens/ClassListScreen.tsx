import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Alert
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';

interface Member {
    id: string;
    username: string;
    email?: string;
    role: string;
    enrolledAt?: string;
}

interface ClassListScreenProps {
    apiClient: any;
    token: string;
    courseId: string;
    courseName?: string;
    onBack: () => void;
    isAdmin?: boolean;
}

export default function ClassListScreen({
    apiClient,
    token,
    courseId,
    courseName,
    onBack,
    isAdmin = false
}: ClassListScreenProps) {
    const { t } = useTranslation();
    const { colors } = useTheme();
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadMembers();
    }, [courseId]);

    const loadMembers = async () => {
        setLoading(true);
        try {
            const response = await apiClient.get(`/courses/${courseId}/members`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setMembers(response.members || response || []);
        } catch (error) {
            console.error('ClassList load error:', error);
            Alert.alert(t('error'), t('load_failed'));
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveMember = async (memberId: string) => {
        Alert.alert(
            t('confirm'),
            t('remove_member_confirm'),
            [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: t('remove'),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await apiClient.delete(`/courses/${courseId}/members/${memberId}`, {
                                headers: { Authorization: `Bearer ${token}` }
                            });
                            setMembers(members.filter(m => m.id !== memberId));
                        } catch (error) {
                            console.error('Remove member error:', error);
                            Alert.alert(t('error'), t('remove_failed'));
                        }
                    }
                }
            ]
        );
    };

    const getRoleIcon = (role: string) => {
        switch (role.toLowerCase()) {
            case 'instructor': return '👨‍🏫';
            case 'assistant': return '👨‍💼';
            case 'student': return '👨‍🎓';
            default: return '👤';
        }
    };

    const formatDate = (dateString?: string) => {
        if (!dateString) return '';
        return new Date(dateString).toLocaleDateString();
    };

    const renderMember = ({ item }: { item: Member }) => (
        <View style={[styles.memberCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.memberInfo}>
                <Text style={styles.memberIcon}>{getRoleIcon(item.role)}</Text>
                <View style={styles.memberDetails}>
                    <Text style={[styles.memberName, { color: colors.text }]}>{item.username}</Text>
                    {item.email && (
                        <Text style={[styles.memberEmail, { color: colors.textSecondary }]}>{item.email}</Text>
                    )}
                    <Text style={[styles.memberRole, { color: colors.primary }]}>{t(item.role.toLowerCase()) || item.role}</Text>
                </View>
            </View>
            <View style={styles.memberActions}>
                {item.enrolledAt && (
                    <Text style={[styles.enrollDate, { color: colors.textSecondary }]}>
                        {formatDate(item.enrolledAt)}
                    </Text>
                )}
                {isAdmin && item.role.toLowerCase() === 'student' && (
                    <TouchableOpacity
                        onPress={() => handleRemoveMember(item.id)}
                        style={[styles.removeButton, { backgroundColor: colors.error + '20' }]}
                    >
                        <Text style={{ color: colors.error, fontSize: 12 }}>{t('remove')}</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );

    const instructors = members.filter(m => ['instructor', 'assistant'].includes(m.role.toLowerCase()));
    const students = members.filter(m => m.role.toLowerCase() === 'student');

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={onBack} style={styles.backButton}>
                    <Text style={{ color: colors.primary, fontSize: 16 }}>← {t('back')}</Text>
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors.text }]}>{t('class_list')}</Text>
                <View style={{ width: 60 }} />
            </View>

            {courseName && (
                <View style={[styles.courseHeader, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.courseName, { color: colors.text }]}>📚 {courseName}</Text>
                    <Text style={[styles.memberCount, { color: colors.textSecondary }]}>
                        {members.length} {t('members')}
                    </Text>
                </View>
            )}

            {loading ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={[
                        ...(instructors.length > 0 ? [{ type: 'header', title: t('instructors'), count: instructors.length }] : []),
                        ...instructors.map(m => ({ type: 'member', ...m })),
                        ...(students.length > 0 ? [{ type: 'header', title: t('students'), count: students.length }] : []),
                        ...students.map(m => ({ type: 'member', ...m })),
                    ]}
                    renderItem={({ item }: any) => {
                        if (item.type === 'header') {
                            return (
                                <View style={styles.sectionHeader}>
                                    <Text style={[styles.sectionTitle, { color: colors.text }]}>{item.title}</Text>
                                    <Text style={[styles.sectionCount, { color: colors.textSecondary }]}>{item.count}</Text>
                                </View>
                            );
                        }
                        return renderMember({ item });
                    }}
                    keyExtractor={(item: any) => item.type === 'header' ? item.title : item.id}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.centered}>
                            <Text style={{ color: colors.textSecondary }}>{t('no_members')}</Text>
                        </View>
                    }
                />
            )}
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
        paddingTop: 20,
        paddingBottom: 10,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.05)',
        borderRadius: 12,
    },
    title: {
        fontSize: 24,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    courseHeader: {
        paddingHorizontal: 20,
        paddingVertical: 16,
        marginBottom: 10,
        marginHorizontal: 20,
        borderRadius: 16,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
    },
    courseName: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 4,
    },
    memberCount: {
        fontSize: 13,
        opacity: 0.7,
    },
    listContent: {
        padding: 20,
        paddingTop: 0,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        marginTop: 8,
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
        opacity: 0.6,
    },
    sectionCount: {
        fontSize: 12,
        fontWeight: '600',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
        backgroundColor: 'rgba(0,0,0,0.05)',
        overflow: 'hidden',
    },
    memberCard: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderRadius: 20,
        marginBottom: 12,
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        borderWidth: 0,
    },
    memberInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    memberIcon: {
        fontSize: 32,
        marginRight: 16,
        backgroundColor: 'rgba(0,0,0,0.03)',
        width: 50,
        height: 50,
        textAlign: 'center',
        textAlignVertical: 'center',
        lineHeight: 50,
        borderRadius: 25,
        overflow: 'hidden',
    },
    memberDetails: {
        flex: 1,
    },
    memberName: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 2,
    },
    memberEmail: {
        fontSize: 12,
        opacity: 0.7,
        marginBottom: 4,
    },
    memberRole: {
        fontSize: 11,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    memberActions: {
        alignItems: 'flex-end',
        justifyContent: 'center',
        marginLeft: 10,
    },
    enrollDate: {
        fontSize: 10,
        opacity: 0.5,
        marginBottom: 6,
    },
    removeButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        marginTop: 4,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 40,
    },
});

import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import ScreenLayout from '../components/ui/ScreenLayout';
import Header from '../components/ui/Header';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { Feather } from '@expo/vector-icons';

interface ProfileScreenProps {
    user: {
        id: string;
        username: string;
        email?: string;
        role: string;
        createdAt?: string;
    };
    onBack: () => void;
    onUpdateProfile?: (data: { username?: string; email?: string }) => Promise<void>;
    onChangePassword?: (data: { currentPassword: string; newPassword: string }) => Promise<void>;
    onLogout: () => void;
}

export default function ProfileScreen({
    user,
    onBack,
    onUpdateProfile,
    onChangePassword,
    onLogout
}: ProfileScreenProps) {
    const { t } = useTranslation();
    const { colors } = useTheme();

    const [editMode, setEditMode] = useState(false);
    const [loading, setLoading] = useState(false);

    // Form States
    const [editUsername, setEditUsername] = useState(user.username);
    const [editEmail, setEditEmail] = useState(user.email || '');

    const handleUpdate = async () => {
        if (!onUpdateProfile) return;
        setLoading(true);
        try {
            await onUpdateProfile({ username: editUsername, email: editEmail });
            setEditMode(false);
            Alert.alert(t('success'), t('profile_updated'));
        } catch (error) {
            Alert.alert(t('error'), t('update_failed'));
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        Alert.alert(
            t('logout'),
            t('logout_confirm') || 'Are you sure?',
            [
                { text: t('cancel'), style: 'cancel' },
                { text: t('logout'), style: 'destructive', onPress: onLogout }
            ]
        );
    };

    const SectionHeader = ({ title, icon }: { title: string; icon: keyof typeof Feather.glyphMap }) => (
        <View style={styles.sectionHeader}>
            <Feather name={icon} size={18} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
        </View>
    );

    const InfoRow = ({ label, value }: { label: string; value: string }) => (
        <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{label}</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{value}</Text>
        </View>
    );

    return (
        <ScreenLayout
            header={
                <Header
                    title={t('profile') || 'Profil'}
                    showBack
                    rightAction={
                        <TouchableOpacity onPress={handleLogout}>
                            <Feather name="log-out" size={24} color={colors.error} />
                        </TouchableOpacity>
                    }
                />
            }
        >
            <ScrollView showsVerticalScrollIndicator={false}>
                {/* Avatar Section */}
                <View style={styles.avatarSection}>
                    <View style={[styles.avatarContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary + '20' }]}>
                            <Text style={[styles.avatarText, { color: colors.primary }]}>
                                {user.username.charAt(0).toUpperCase()}
                            </Text>
                        </View>
                        <View style={[styles.roleBadge, { backgroundColor: colors.primary }]}>
                            <Text style={styles.roleText}>{user.role.toUpperCase()}</Text>
                        </View>
                    </View>
                    <Text style={[styles.userName, { color: colors.text }]}>{user.username}</Text>
                    <Text style={[styles.userEmail, { color: colors.textSecondary }]}>{user.email || 'No Email'}</Text>
                </View>

                {/* Profile Details */}
                <Card>
                    {!editMode ? (
                        <>
                            <View style={styles.headerRow}>
                                <SectionHeader title={t('personal_info') || 'Kişisel Bilgiler'} icon="user" />
                                <TouchableOpacity onPress={() => setEditMode(true)}>
                                    <Feather name="edit-2" size={20} color={colors.primary} />
                                </TouchableOpacity>
                            </View>
                            <InfoRow label={t('username')} value={user.username} />
                            <InfoRow label={t('email')} value={user.email || '-'} />
                            <InfoRow label={t('role')} value={t(`role_${user.role}`) || user.role} />
                            <InfoRow label={t('joined_date')} value={user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'} />
                        </>
                    ) : (
                        <View style={styles.editForm}>
                            <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('username')}</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                                value={editUsername}
                                onChangeText={setEditUsername}
                            />

                            <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('email')}</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                                value={editEmail}
                                onChangeText={setEditEmail}
                                keyboardType="email-address"
                            />

                            <View style={styles.editActions}>
                                <Button
                                    label={t('cancel')}
                                    onPress={() => setEditMode(false)}
                                    variant="ghost"
                                    style={{ flex: 1, marginRight: 8 }}
                                />
                                <Button
                                    label={t('save')}
                                    onPress={handleUpdate}
                                    loading={loading}
                                    style={{ flex: 1 }}
                                />
                            </View>
                        </View>
                    )}
                </Card>

                {/* Security Section (Placeholder for change password) */}
                <Card>
                    <SectionHeader title={t('security') || 'Güvenlik'} icon="shield" />
                    <TouchableOpacity
                        style={[styles.actionRow, { borderBottomColor: colors.border }]}
                        onPress={() => Alert.alert('Info', 'Change password feature coming soon.')}
                    >
                        <Text style={[styles.actionText, { color: colors.text }]}>{t('change_password')}</Text>
                        <Feather name="chevron-right" size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.actionRow}
                        onPress={() => Alert.alert('Info', '2FA settings coming soon.')}
                    >
                        <Text style={[styles.actionText, { color: colors.text }]}>{t('two_factor_auth')}</Text>
                        <Feather name="chevron-right" size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                </Card>

            </ScrollView>
        </ScreenLayout>
    );
}

const styles = StyleSheet.create({
    avatarSection: {
        alignItems: 'center',
        marginVertical: 24,
    },
    avatarContainer: {
        width: 100,
        height: 100,
        borderRadius: 50,
        padding: 4,
        borderWidth: 1,
        marginBottom: 16,
        position: 'relative',
    },
    avatarPlaceholder: {
        width: '100%',
        height: '100%',
        borderRadius: 50,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: {
        fontSize: 40,
        fontWeight: 'bold',
    },
    roleBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#fff',
    },
    roleText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
    },
    userName: {
        fontSize: 24,
        fontWeight: '700',
        marginBottom: 4,
    },
    userEmail: {
        fontSize: 14,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        gap: 8,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '700',
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    infoLabel: {
        fontSize: 14,
    },
    infoValue: {
        fontSize: 14,
        fontWeight: '500',
    },
    editForm: {
        marginTop: 8,
    },
    fieldLabel: {
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 6,
    },
    input: {
        height: 48,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        marginBottom: 16,
    },
    editActions: {
        flexDirection: 'row',
        marginTop: 8,
    },
    actionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    actionText: {
        fontSize: 15,
        fontWeight: '500',
    }
});

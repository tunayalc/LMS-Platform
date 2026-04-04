import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Modal, Pressable, StyleSheet, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { apiClient } from '../../api/client';
import { useTheme } from '../../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';

interface CreateUserModalProps {
    visible: boolean;
    onClose: () => void;
    token: string;
    onSuccess: () => void;
}

export default function CreateUserModal({ visible, onClose, token, onSuccess }: CreateUserModalProps) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('student'); // Default role
    const [loading, setLoading] = useState(false);

    const { colors, isDark } = useTheme();
    const { t } = useTranslation();
    const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

    const handleCreate = async () => {
        if (!username || !password || !email) {
            Alert.alert(t('error'), t('all_fields_required'));
            return;
        }

        setLoading(true);
        try {
            await apiClient.post('/users', {
                username,
                password,
                email,
                role
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            Alert.alert(t('success'), t('user_created'));
            onSuccess();
            onClose();
            // Reset form
            setUsername('');
            setPassword('');
            setEmail('');
            setRole('student');
        } catch (error: any) {
            Alert.alert(t('error'), error?.message || t('user_create_failed'));
        } finally {
            setLoading(false);
        }
    };

    const roles = ['student', 'instructor', 'admin'];

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.card}>
                    <View style={styles.header}>
                        <Text style={styles.title}>{t('create_user')}</Text>
                        <Pressable onPress={onClose}><Text style={styles.closeText}>✕</Text></Pressable>
                    </View>

                    <View style={styles.form}>
                        <Text style={styles.label}>{t('username')}</Text>
                        <TextInput
                            style={styles.input}
                            value={username}
                            onChangeText={setUsername}
                            autoCapitalize="none"
                            placeholderTextColor={colors.textSecondary}
                        />

                        <Text style={styles.label}>{t('email')}</Text>
                        <TextInput
                            style={styles.input}
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            placeholderTextColor={colors.textSecondary}
                        />

                        <Text style={styles.label}>{t('password')}</Text>
                        <TextInput
                            style={styles.input}
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                            placeholderTextColor={colors.textSecondary}
                        />

                        <Text style={styles.label}>{t('role')}</Text>
                        <View style={styles.roleContainer}>
                            {roles.map((r) => (
                                <TouchableOpacity
                                    key={r}
                                    style={[styles.roleBadge, role === r && styles.roleBadgeActive]}
                                    onPress={() => setRole(r)}
                                >
                                    <Text style={[styles.roleText, role === r && styles.roleTextActive]}>
                                        {r === 'student'
                                            ? t('role_student')
                                            : r === 'instructor'
                                                ? t('role_instructor')
                                                : t('role_admin')}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Pressable style={styles.createButton} onPress={handleCreate} disabled={loading}>
                            {loading ? (
                                <ActivityIndicator color={colors.primaryText} />
                            ) : (
                                <Text style={styles.createButtonText}>{t('create')}</Text>
                            )}
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

type ThemeColors = ReturnType<typeof useTheme>['colors'];

const createStyles = (colors: ThemeColors, isDark: boolean) =>
    StyleSheet.create({
        overlay: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            padding: 20
        },
        card: {
            backgroundColor: colors.card,
            borderRadius: 20,
            padding: 24,
            borderWidth: 1,
            borderColor: colors.border,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: isDark ? 0.35 : 0.25,
            shadowRadius: 6,
            elevation: 5
        },
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20
        },
        title: {
            fontSize: 20,
            fontWeight: 'bold',
            color: colors.text
        },
        closeText: {
            fontSize: 24,
            color: colors.textSecondary
        },
        form: {
            gap: 12
        },
        label: {
            fontSize: 14,
            fontWeight: '600',
            color: colors.textSecondary,
            marginBottom: 4
        },
        input: {
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            padding: 12,
            fontSize: 16,
            color: colors.text,
            backgroundColor: colors.surface
        },
        roleContainer: {
            flexDirection: 'row',
            gap: 10,
            marginBottom: 10
        },
        roleBadge: {
            paddingVertical: 8,
            paddingHorizontal: 16,
            borderRadius: 20,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border
        },
        roleBadgeActive: {
            backgroundColor: isDark ? 'rgba(20, 184, 166, 0.18)' : 'rgba(13, 148, 136, 0.10)',
            borderColor: colors.primary
        },
        roleText: {
            fontSize: 14,
            color: colors.textSecondary,
            fontWeight: '500'
        },
        roleTextActive: {
            color: colors.primary,
            fontWeight: '700'
        },
        createButton: {
            backgroundColor: colors.primary,
            borderRadius: 12,
            padding: 16,
            alignItems: 'center',
            marginTop: 10
        },
        createButtonText: {
            color: colors.primaryText,
            fontWeight: 'bold',
            fontSize: 16
        }
    });

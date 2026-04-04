import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    TextInput,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';

type UserRole = 'SuperAdmin' | 'Admin' | 'Instructor' | 'Assistant' | 'Student' | 'Guest';

interface UserFormScreenProps {
    userId?: string; // If provided, we're editing
    onBack: () => void;
    onSuccess: () => void;
}

interface UserFormData {
    username: string;
    email: string;
    password: string;
    role: UserRole;
    isActive: boolean;
}

const roleOptions: { value: UserRole; label: string; icon: keyof typeof Feather.glyphMap }[] = [
    { value: 'Admin', label: 'Admin', icon: 'shield' },
    { value: 'Instructor', label: 'Instructor', icon: 'book' },
    { value: 'Assistant', label: 'Assistant', icon: 'users' },
    { value: 'Student', label: 'Student', icon: 'user' },
    { value: 'Guest', label: 'Guest', icon: 'eye' },
];

export default function UserFormScreen({
    userId,
    onBack,
    onSuccess
}: UserFormScreenProps) {
    const { t } = useTranslation();
    const { colors, isDark } = useTheme();

    const isEditing = !!userId;
    const [loading, setLoading] = useState(isEditing);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState<UserFormData>({
        username: '',
        email: '',
        password: '',
        role: 'Student',
        isActive: true,
    });

    const fetchUser = useCallback(async () => {
        if (!userId) return;

        try {
            const token = await AsyncStorage.getItem('auth_token');
            const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
            const response = await apiClient.get(`/users/${userId}`, { headers }) as any;

            setFormData({
                username: response.username || '',
                email: response.email || '',
                password: '', // Don't show password
                role: response.role || 'Student',
                isActive: response.isActive !== false,
            });
        } catch (error) {
            console.error('Failed to fetch user:', error);
            Alert.alert(t('error'), t('connection_error'));
        } finally {
            setLoading(false);
        }
    }, [userId, t]);

    useEffect(() => {
        if (isEditing) {
            fetchUser();
        }
    }, [isEditing, fetchUser]);

    const handleSubmit = async () => {
        // Validation
        if (!formData.username.trim()) {
            Alert.alert(t('error'), t('validation_error_username'));
            return;
        }
        if (!formData.email.trim()) {
            Alert.alert(t('error'), t('validation_error_email'));
            return;
        }
        if (!isEditing && !formData.password) {
            Alert.alert(t('error'), t('validation_error_password'));
            return;
        }

        setSaving(true);
        try {
            const token = await AsyncStorage.getItem('auth_token');
            const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
            const payload: any = {
                username: formData.username.trim(),
                email: formData.email.trim(),
                role: formData.role,
                isActive: formData.isActive,
            };

            if (formData.password) {
                payload.password = formData.password;
            }

            if (isEditing) {
                await apiClient.patch(`/users/${userId}`, payload, { headers });
                Alert.alert(t('success'), t('user_update_success'));
            } else {
                await apiClient.post('/users', payload, { headers });
                Alert.alert(t('success'), t('user_create_success'));
            }

            onSuccess();
        } catch (error) {
            console.error('Failed to save user:', error);
            Alert.alert(t('error'), t('user_create_error'));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!isEditing) return;

        Alert.alert(
            t('delete'),
            t('user_delete_confirm'),
            [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: t('delete'),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const token = await AsyncStorage.getItem('auth_token');
                            const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
                            await apiClient.del(`/users/${userId}`, { headers });
                            Alert.alert(t('success'), t('delete_success'));
                            onSuccess();
                        } catch (error) {
                            Alert.alert(t('error'), t('delete_error'));
                        }
                    }
                }
            ]
        );
    };

    if (loading) {
        return (
            <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={[styles.container, { backgroundColor: colors.background }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            {/* Header */}
            <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={onBack} style={styles.backBtn}>
                    <Feather name="x" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>
                    {isEditing ? t('edit_user') : t('create_user')}
                </Text>
                {isEditing && (
                    <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn}>
                        <Feather name="trash-2" size={20} color={colors.error} />
                    </TouchableOpacity>
                )}
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
            >
                {/* Username */}
                <View style={styles.formGroup}>
                    <Text style={[styles.label, { color: colors.text }]}>{t('username')} *</Text>
                    <TextInput
                        style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
                        value={formData.username}
                        onChangeText={(text) => setFormData(prev => ({ ...prev, username: text }))}
                        placeholder={t('username_placeholder')}
                        placeholderTextColor={colors.textSecondary}
                        autoCapitalize="none"
                    />
                </View>

                {/* Email */}
                <View style={styles.formGroup}>
                    <Text style={[styles.label, { color: colors.text }]}>{t('email')} *</Text>
                    <TextInput
                        style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
                        value={formData.email}
                        onChangeText={(text) => setFormData(prev => ({ ...prev, email: text }))}
                        placeholder={t('email_placeholder')}
                        placeholderTextColor={colors.textSecondary}
                        keyboardType="email-address"
                        autoCapitalize="none"
                    />
                </View>

                {/* Password */}
                <View style={styles.formGroup}>
                    <Text style={[styles.label, { color: colors.text }]}>
                        {t('password')} {!isEditing && '*'}
                    </Text>
                    <TextInput
                        style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
                        value={formData.password}
                        onChangeText={(text) => setFormData(prev => ({ ...prev, password: text }))}
                        placeholder={isEditing ? t('password_unchanged') : t('password_placeholder')}
                        placeholderTextColor={colors.textSecondary}
                        secureTextEntry
                    />
                    {isEditing && (
                        <Text style={[styles.hint, { color: colors.textSecondary }]}>
                            {t('password_edit_hint')}
                        </Text>
                    )}
                </View>

                {/* Role Selector */}
                <View style={styles.formGroup}>
                    <Text style={[styles.label, { color: colors.text }]}>{t('role')} *</Text>
                    <View style={styles.roleGrid}>
                        {roleOptions.map(role => (
                            <TouchableOpacity
                                key={role.value}
                                style={[
                                    styles.roleCard,
                                    {
                                        backgroundColor: formData.role === role.value ? colors.primary + '15' : colors.card,
                                        borderColor: formData.role === role.value ? colors.primary : colors.border,
                                    }
                                ]}
                                onPress={() => setFormData(prev => ({ ...prev, role: role.value }))}
                            >
                                <Feather
                                    name={role.icon}
                                    size={20}
                                    color={formData.role === role.value ? colors.primary : colors.textSecondary}
                                />
                                <Text style={[
                                    styles.roleLabel,
                                    { color: formData.role === role.value ? colors.primary : colors.text }
                                ]}>
                                    {role.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Active Toggle */}
                <TouchableOpacity
                    style={[styles.toggleRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => setFormData(prev => ({ ...prev, isActive: !prev.isActive }))}
                >
                    <View style={styles.toggleInfo}>
                        <Text style={[styles.toggleLabel, { color: colors.text }]}>{t('active')}</Text>
                        <Text style={[styles.toggleHint, { color: colors.textSecondary }]}>
                            {t('user_active_hint')}
                        </Text>
                    </View>
                    <View style={[styles.toggle, { backgroundColor: formData.isActive ? colors.success : colors.border }]}>
                        <View style={[styles.toggleKnob, { transform: [{ translateX: formData.isActive ? 20 : 0 }] }]} />
                    </View>
                </TouchableOpacity>

                {/* Submit Button */}
                <TouchableOpacity
                    style={[styles.submitBtn, { backgroundColor: colors.primary }, saving && styles.submitBtnDisabled]}
                    onPress={handleSubmit}
                    disabled={saving}
                >
                    {saving ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <>
                            <Feather name={isEditing ? 'save' : 'user-plus'} size={20} color="#fff" />
                            <Text style={styles.submitBtnText}>
                                {isEditing ? t('save') : t('create_user')}
                            </Text>
                        </>
                    )}
                </TouchableOpacity>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        paddingTop: 48,
        borderBottomWidth: 1,
    },
    backBtn: { padding: 4 },
    headerTitle: { flex: 1, fontSize: 18, fontWeight: '600', marginLeft: 12 },
    deleteBtn: { padding: 4 },
    scrollView: { flex: 1 },
    scrollContent: { padding: 16 },
    formGroup: { marginBottom: 20 },
    label: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
    input: { height: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, fontSize: 16 },
    hint: { fontSize: 12, marginTop: 6 },
    roleGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
    roleCard: {
        width: '48%',
        margin: '1%',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1.5,
        flexDirection: 'row',
        alignItems: 'center',
    },
    roleLabel: { fontSize: 14, fontWeight: '500', marginLeft: 10 },
    toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 20 },
    toggleInfo: { flex: 1 },
    toggleLabel: { fontSize: 16, fontWeight: '500' },
    toggleHint: { fontSize: 13, marginTop: 2 },
    toggle: { width: 48, height: 28, borderRadius: 14, padding: 2, justifyContent: 'center' },
    toggleKnob: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' },
    submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 52, borderRadius: 12, marginTop: 8, marginBottom: 32 },
    submitBtnDisabled: { opacity: 0.6 },
    submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '600', marginLeft: 8 },
});

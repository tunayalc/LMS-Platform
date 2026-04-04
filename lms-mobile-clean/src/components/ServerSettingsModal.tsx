import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { View, Text, TextInput, Modal, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { getApiBaseUrl, setApiBaseUrl } from '../api/client';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ThemeToggle from './ThemeToggle';

interface SettingsModalProps {
    visible: boolean;
    onClose: () => void;
}

export default function SettingsModal({ visible, onClose }: SettingsModalProps) {
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [testing, setTesting] = useState(false);

    const { colors, isDark } = useTheme();
    const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
    const { t, i18n } = useTranslation();

    useEffect(() => {
        if (visible) {
            setUrl(getApiBaseUrl());
        }
    }, [visible]);

    const handleSaveUrl = async () => {
        setLoading(true);
        await setApiBaseUrl(url);
        setLoading(false);
        onClose();
        // Force reload might be needed or handled by loadData
        Alert.alert(t('success'), t('settings_saved_restart'));
    };

    const testConnection = useCallback(async () => {
        const trimmed = url.trim();
        if (!trimmed) {
            Alert.alert(t('error'), t('server_url'));
            return;
        }

        const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
        const normalizedUrl = withScheme.replace(/\/$/, '');
        const healthUrl = `${normalizedUrl}/health`;

        setTesting(true);
        try {
            const res = await fetch(healthUrl, { headers: { Accept: 'application/json' } });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`${res.status} ${text}`);
            }
            const json = await res.json();
            const status = typeof json?.status === 'string' ? json.status : 'ok';
            Alert.alert(t('success'), `${t('connection_ok')}\n${t('status')}: ${status}`);
        } catch (err: any) {
            Alert.alert(t('error'), `${t('connection_failed')}\n${String(err?.message ?? err)}`);
        } finally {
            setTesting(false);
        }
    }, [t, url]);

    const changeLanguage = (lang: string) => {
        i18n.changeLanguage(lang);
        AsyncStorage.setItem('user-language', lang);
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.card}>
                    <Text style={styles.title}>{t('settings')}</Text>

                    {/* SERVER URL */}
                    <Text style={styles.label}>{t('server_url')}</Text>
                    <TextInput
                        style={styles.input}
                        value={url}
                        onChangeText={setUrl}
                        placeholder="http://..."
                        placeholderTextColor={colors.textSecondary}
                        autoCapitalize="none"
                    />

                    {/* APPEARANCE */}
                    <Text style={[styles.label, { marginTop: 16 }]}>{t('appearance')}</Text>
                    <ThemeToggle />

                    {/* LANGUAGE */}
                    <Text style={[styles.label, { marginTop: 16 }]}>{t('language')}</Text>
                    <View style={[styles.row, styles.langRow]}>
                        <Pressable
                            style={[styles.langBtn, i18n.language === 'tr' && styles.activeLang]}
                            onPress={() => changeLanguage('tr')}
                        >
                            <Text style={{ color: i18n.language === 'tr' ? colors.primaryText : colors.text }}>
                                Türkçe
                            </Text>
                        </Pressable>
                        <Pressable
                            style={[styles.langBtn, i18n.language === 'en' && styles.activeLang]}
                            onPress={() => changeLanguage('en')}
                        >
                            <Text style={{ color: i18n.language === 'en' ? colors.primaryText : colors.text }}>
                                English
                            </Text>
                        </Pressable>
                        <Pressable
                            style={[styles.langBtn, i18n.language === 'de' && styles.activeLang]}
                            onPress={() => changeLanguage('de')}
                        >
                            <Text style={{ color: i18n.language === 'de' ? colors.primaryText : colors.text }}>
                                Deutsch
                            </Text>
                        </Pressable>
                        <Pressable
                            style={[styles.langBtn, i18n.language === 'fr' && styles.activeLang]}
                            onPress={() => changeLanguage('fr')}
                        >
                            <Text style={{ color: i18n.language === 'fr' ? colors.primaryText : colors.text }}>
                                Français
                            </Text>
                        </Pressable>
                    </View>

                    {/* ACTIONS */}
                    <View style={[styles.row, { marginTop: 24, justifyContent: 'space-between' }]}>
                        <Pressable style={[styles.button, styles.cancelBtn]} onPress={onClose}>
                            <Text style={styles.textBtn}>{t('close')}</Text>
                        </Pressable>
                        <Pressable style={[styles.button, styles.testBtn]} onPress={testConnection} disabled={testing || loading}>
                            {testing ? (
                                <ActivityIndicator color={colors.primaryText} />
                            ) : (
                                <Text style={styles.textBtn}>{t('test_connection')}</Text>
                            )}
                        </Pressable>
                        <Pressable style={[styles.button, styles.saveBtn]} onPress={handleSaveUrl}>
                            {loading ? (
                                <ActivityIndicator color={colors.primaryText} />
                            ) : (
                                <Text style={styles.textBtn}>{t('save')}</Text>
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
            justifyContent: 'center',
            padding: 20,
            backgroundColor: 'rgba(0,0,0,0.5)'
        },
        card: {
            borderRadius: 16,
            padding: 24,
            width: '100%',
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: isDark ? 0.4 : 0.25,
            shadowRadius: 6,
            elevation: 5
        },
        title: {
            fontSize: 20,
            fontWeight: 'bold',
            marginBottom: 20,
            textAlign: 'center',
            color: colors.text
        },
        label: {
            fontSize: 14,
            fontWeight: '600',
            marginBottom: 8,
            color: colors.textSecondary
        },
        input: {
            borderWidth: 1,
            borderRadius: 10,
            padding: 12,
            fontSize: 16,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            color: colors.text
        },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between'
        },
        langRow: {
            justifyContent: 'flex-start',
            flexWrap: 'wrap',
            gap: 10,
        },
        button: {
            paddingVertical: 12,
            paddingHorizontal: 24,
            borderRadius: 10
        },
        cancelBtn: {
            backgroundColor: isDark ? 'rgba(148, 163, 184, 0.25)' : '#94a3b8'
        },
        testBtn: {
            backgroundColor: isDark ? 'rgba(148, 163, 184, 0.25)' : '#94a3b8'
        },
        saveBtn: {
            backgroundColor: colors.primary
        },
        textBtn: {
            color: colors.primaryText,
            fontWeight: 'bold'
        },
        langBtn: {
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 8
        },
        activeLang: {
            backgroundColor: colors.primary,
            borderColor: colors.primary
        }
    });

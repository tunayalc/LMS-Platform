import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';

const LANGUAGES = [
    { code: 'tr', label: 'TR', flag: '🇹🇷' },
    { code: 'en', label: 'EN', flag: '🇬🇧' },
    { code: 'de', label: 'DE', flag: '🇩🇪' },
    { code: 'fr', label: 'FR', flag: '🇫🇷' },
];

interface LanguageSwitcherProps {
    showFlags?: boolean;
    compact?: boolean;
}

export default function LanguageSwitcher({ showFlags = false, compact = false }: LanguageSwitcherProps) {
    const { i18n } = useTranslation();
    const { colors } = useTheme();

    const changeLanguage = (lng: string) => {
        i18n.changeLanguage(lng);
    };

    if (compact) {
        return (
            <View style={styles.compactContainer}>
                {LANGUAGES.map((lang, index) => (
                    <React.Fragment key={lang.code}>
                        <TouchableOpacity
                            onPress={() => changeLanguage(lang.code)}
                            style={[
                                styles.compactButton,
                                i18n.language === lang.code && { backgroundColor: colors.primary + '20' }
                            ]}
                        >
                            <Text style={[
                                styles.compactText,
                                { color: i18n.language === lang.code ? colors.primary : colors.textSecondary },
                                i18n.language === lang.code && { fontWeight: '700' }
                            ]}>
                                {showFlags ? lang.flag : lang.label}
                            </Text>
                        </TouchableOpacity>
                        {index < LANGUAGES.length - 1 && (
                            <Text style={[styles.separator, { color: colors.border }]}>|</Text>
                        )}
                    </React.Fragment>
                ))}
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {LANGUAGES.map((lang) => (
                <TouchableOpacity
                    key={lang.code}
                    onPress={() => changeLanguage(lang.code)}
                    style={[
                        styles.button,
                        {
                            backgroundColor: i18n.language === lang.code ? colors.primary : colors.inputBackground,
                            borderColor: i18n.language === lang.code ? colors.primary : colors.border
                        }
                    ]}
                >
                    {showFlags && <Text style={styles.flag}>{lang.flag}</Text>}
                    <Text style={[
                        styles.label,
                        { color: i18n.language === lang.code ? '#fff' : colors.textSecondary }
                    ]}>
                        {lang.label}
                    </Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        gap: 8,
        flexWrap: 'wrap',
        justifyContent: 'center',
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        gap: 6,
    },
    flag: {
        fontSize: 16,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
    },
    compactContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    compactButton: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    compactText: {
        fontSize: 13,
        fontWeight: '500',
    },
    separator: {
        fontSize: 12,
        marginHorizontal: 2,
    },
});

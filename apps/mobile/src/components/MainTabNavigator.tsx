import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';

export type TabSection =
    | 'dashboard'
    | 'courses'
    | 'omr'       // Instructor/Admin
    | 'users'     // Admin
    | 'profile'
    | 'settings'
    | 'exams'     // Kept for sub-navigation compatibility if needed
    | 'gradebook'
    | 'questions';

interface MainTabNavigatorProps {
    activeSection: TabSection;
    onSelectSection: (section: TabSection) => void;
    userRole: string;
}

export default function MainTabNavigator({ activeSection, onSelectSection, userRole }: MainTabNavigatorProps) {
    const { colors, isDark } = useTheme();
    const { t } = useTranslation();

    const role = userRole.toLowerCase();
    const isAdmin = ['superadmin', 'admin'].includes(role);
    const isInstructor = ['instructor', 'assistant'].includes(role);
    const isStudent = role === 'student';

    // Define Tabs based on Role
    const getTabs = () => {
        const tabs = [
            { id: 'dashboard', label: t('home') || 'Ana Sayfa', icon: 'home' },
            { id: 'courses', label: t('courses') || 'Dersler', icon: 'book' },
        ];

        if (isAdmin) {
            tabs.push({ id: 'users', label: t('users') || 'Kullanıcılar', icon: 'users' });
        } else if (isInstructor) {
            tabs.push({ id: 'omr', label: t('omr_scan_title') || 'OMR', icon: 'camera' });
        }

        tabs.push({ id: 'profile', label: t('profile') || 'Profil', icon: 'user' });

        return tabs;
    };

    const tabs = getTabs();

    return (
        <View style={styles.container}>
            <View style={[
                styles.tabBar,
                {
                    backgroundColor: isDark ? '#1e293bE6' : '#ffffffE6', // High opacity for blur effect simulation
                    borderColor: colors.border,
                    shadowColor: isDark ? '#000' : '#888',
                }
            ]}>
                {tabs.map((tab) => {
                    const isActive = activeSection === tab.id;
                    return (
                        <TouchableOpacity
                            key={tab.id}
                            style={styles.tabItem}
                            onPress={() => onSelectSection(tab.id as TabSection)}
                            activeOpacity={0.7}
                        >
                            <View style={[
                                styles.iconContainer,
                                isActive && { backgroundColor: isDark ? colors.primary + '30' : colors.primary + '15' }
                            ]}>
                                <Feather
                                    name={tab.icon as any}
                                    size={22}
                                    color={isActive ? colors.primary : colors.textSecondary}
                                />
                            </View>
                            {isActive && (
                                <Text style={[styles.label, { color: colors.primary }]}>
                                    {tab.label}
                                </Text>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 24,
        left: 20,
        right: 20,
        alignItems: 'center',
        zIndex: 100,
    },
    tabBar: {
        flexDirection: 'row',
        borderRadius: 24,
        padding: 5,
        paddingHorizontal: 8,
        borderWidth: 1,
        // Shadow for floating effect
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 10,
        width: '100%',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    tabItem: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        flex: 1,
    },
    iconContainer: {
        padding: 8,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    label: {
        fontSize: 10,
        fontWeight: '700',
        marginTop: 4,
    }
});

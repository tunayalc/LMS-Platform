import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeColors {
    background: string;
    surface: string;
    card: string;
    text: string;
    textSecondary: string;
    border: string;
    primary: string;
    primaryText: string;
    error: string;
    success: string;
}

interface ThemeContextType {
    mode: ThemeMode;
    isDark: boolean;
    colors: ThemeColors;
    setMode: (mode: ThemeMode) => void;
}

const lightColors: ThemeColors = {
    background: '#f8fafc',
    surface: '#ffffff',
    card: '#ffffff',
    text: '#0f172a',
    textSecondary: '#64748b',
    border: '#e2e8f0',
    primary: '#0d9488',
    primaryText: '#ffffff',
    error: '#dc2626',
    success: '#059669',
};

const darkColors: ThemeColors = {
    background: '#0f172a',
    surface: '#1e293b',
    card: '#1e293b',
    text: '#f1f5f9',
    textSecondary: '#94a3b8',
    border: '#334155',
    primary: '#14b8a6',
    primaryText: '#ffffff',
    error: '#f87171',
    success: '#34d399',
};

const THEME_STORAGE_KEY = 'lms_theme_mode';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
    children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
    const systemColorScheme = useColorScheme();
    const [mode, setModeState] = useState<ThemeMode>('system');

    // Load saved preference on mount
    useEffect(() => {
        const loadTheme = async () => {
            try {
                const saved = await AsyncStorage.getItem(THEME_STORAGE_KEY);
                if (saved && (saved === 'light' || saved === 'dark' || saved === 'system')) {
                    setModeState(saved);
                }
            } catch (e) {
                console.warn('Failed to load theme preference', e);
            }
        };
        loadTheme();
    }, []);

    const setMode = async (newMode: ThemeMode) => {
        setModeState(newMode);
        try {
            await AsyncStorage.setItem(THEME_STORAGE_KEY, newMode);
        } catch (e) {
            console.warn('Failed to save theme preference', e);
        }
    };

    // Determine if dark mode is active
    const isDark = mode === 'dark' || (mode === 'system' && systemColorScheme === 'dark');
    const colors = isDark ? darkColors : lightColors;

    const value: ThemeContextType = {
        mode,
        isDark,
        colors,
        setMode,
    };

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextType {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}

// Helper hook for dynamic styles
export function useThemedStyles<T>(
    factory: (colors: ThemeColors, isDark: boolean) => T
): T {
    const { colors, isDark } = useTheme();
    return factory(colors, isDark);
}

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
    primaryLight: string;
    primaryText: string;
    error: string;
    errorLight: string;
    success: string;
    successLight: string;
    warning: string;
    inputBackground: string;
    disabled: string;
}

interface ThemeContextType {
    mode: ThemeMode;
    isDark: boolean;
    colors: ThemeColors;
    setMode: (mode: ThemeMode) => void;
}

const lightColors: ThemeColors = {
    background: '#f8fafc', // --bg
    surface: '#ffffff',
    card: '#ffffff', // --card (0.95 opacity implied, using solid for RN performance)
    text: '#0f172a', // --ink
    textSecondary: '#64748b', // --ink-light
    border: '#e2e8f0', // --border
    primary: '#0f766e', // --accent
    primaryLight: '#ccfbf1', // light teal
    primaryText: '#ffffff',
    error: '#ef4444',
    errorLight: '#fef2f2', // light red
    success: '#10b981',
    successLight: '#dcfce7', // light green
    warning: '#f59e0b',
    inputBackground: '#f8fafc', // Matches bg
    disabled: '#94a3b8',
};

const darkColors: ThemeColors = {
    background: '#0f172a', // --bg
    surface: '#1e293b',
    card: '#1e293b', // --card base
    text: '#f1f5f9', // --ink
    textSecondary: '#94a3b8', // --ink-light
    border: '#334155', // --border
    primary: '#2dd4bf', // --accent
    primaryLight: '#134e4a', // dark teal
    primaryText: '#0f172a',
    error: '#ef4444',
    errorLight: '#7f1d1d', // dark red
    success: '#10b981',
    successLight: '#14532d', // dark green
    warning: '#f59e0b',
    inputBackground: '#0f172a', // Matches bg
    disabled: '#475569',
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

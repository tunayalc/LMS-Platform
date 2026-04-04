'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
    theme: Theme;
    resolvedTheme: 'light' | 'dark';
    setTheme: (theme: Theme) => void;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'lms-theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<Theme>('system');
    const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

    // Get system preference
    const getSystemTheme = (): 'light' | 'dark' => {
        if (typeof window === 'undefined') return 'light';
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    };

    // Resolve theme based on setting
    const resolveTheme = (t: Theme): 'light' | 'dark' => {
        if (t === 'system') return getSystemTheme();
        return t;
    };

    // Apply theme to document
    const applyTheme = (resolved: 'light' | 'dark') => {
        if (typeof document === 'undefined') return;

        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(resolved);
        document.documentElement.setAttribute('data-theme', resolved);

        // Update meta theme-color
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            metaThemeColor.setAttribute('content', resolved === 'dark' ? '#1f2937' : '#ffffff');
        }
    };

    // Initialize on mount
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
        const initialTheme = stored || 'system';
        setThemeState(initialTheme);

        const resolved = resolveTheme(initialTheme);
        setResolvedTheme(resolved);
        applyTheme(resolved);
    }, []);

    // Listen for system theme changes
    useEffect(() => {
        if (theme !== 'system') return;

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = () => {
            const resolved = resolveTheme('system');
            setResolvedTheme(resolved);
            applyTheme(resolved);
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [theme]);

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
        localStorage.setItem(STORAGE_KEY, newTheme);

        const resolved = resolveTheme(newTheme);
        setResolvedTheme(resolved);
        applyTheme(resolved);
    };

    const toggleTheme = () => {
        const newTheme = resolvedTheme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
    };

    return (
        <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}

// Theme toggle button component
export function ThemeToggle({ className = '' }: { className?: string }) {
    const { resolvedTheme, toggleTheme } = useTheme();

    return (
        <button
            onClick={toggleTheme}
            className={`theme-toggle ${className}`}
            title={resolvedTheme === 'light' ? 'Karanlık Mod' : 'Aydınlık Mod'}
            aria-label="Tema Değiştir"
        >
            <style jsx>{`
                .theme-toggle {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 40px;
                    height: 40px;
                    border: none;
                    background: transparent;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 20px;
                    transition: background 0.2s;
                }
                .theme-toggle:hover {
                    background: var(--hover-bg, rgba(0, 0, 0, 0.1));
                }
            `}</style>
            {resolvedTheme === 'light' ? '🌙' : '☀️'}
        </button>
    );
}

// Theme selector dropdown component
export function ThemeSelector({ className = '' }: { className?: string }) {
    const { theme, setTheme } = useTheme();

    return (
        <div className={`theme-selector ${className}`}>
            <style jsx>{`
                .theme-selector {
                    display: flex;
                    gap: 4px;
                    padding: 4px;
                    background: var(--bg-secondary, #f3f4f6);
                    border-radius: 8px;
                }
                .theme-option {
                    padding: 8px 12px;
                    border: none;
                    background: transparent;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    color: var(--text-secondary, #6b7280);
                    transition: all 0.2s;
                }
                .theme-option:hover {
                    background: var(--hover-bg, rgba(0, 0, 0, 0.05));
                }
                .theme-option.active {
                    background: var(--bg-primary, white);
                    color: var(--text-primary, #1f2937);
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                }
            `}</style>
            <button
                className={`theme-option ${theme === 'light' ? 'active' : ''}`}
                onClick={() => setTheme('light')}
            >
                ☀️ Aydınlık
            </button>
            <button
                className={`theme-option ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => setTheme('dark')}
            >
                🌙 Karanlık
            </button>
            <button
                className={`theme-option ${theme === 'system' ? 'active' : ''}`}
                onClick={() => setTheme('system')}
            >
                💻 Sistem
            </button>
        </div>
    );
}

export default ThemeProvider;

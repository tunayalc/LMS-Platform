import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

export default function ThemeToggle() {
    const { isDark, setMode } = useTheme();

    const toggleTheme = () => {
        setMode(isDark ? 'light' : 'dark');
    };

    return (
        <TouchableOpacity onPress={toggleTheme} style={styles.button}>
            <Text style={styles.icon}>{isDark ? '☀️' : '🌙'}</Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    button: {
        padding: 8,
        borderRadius: 8,
    },
    icon: {
        fontSize: 24,
    },
});

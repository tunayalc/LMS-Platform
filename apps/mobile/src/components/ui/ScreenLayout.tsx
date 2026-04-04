import React from 'react';
import { View, StyleSheet, SafeAreaView, Platform, StatusBar, ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

interface ScreenLayoutProps {
    children: React.ReactNode;
    style?: ViewStyle;
    noPadding?: boolean;
    header?: React.ReactNode;
}

/**
 * A wrapper component that enforces the correct background color and safe area handling.
 * This solves the "half white half black" issue by filling the entire screen with the theme background.
 */
export default function ScreenLayout({ children, style, noPadding = false, header }: ScreenLayoutProps) {
    const { colors, isDark } = useTheme();

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <StatusBar
                barStyle={isDark ? 'light-content' : 'dark-content'}
                backgroundColor={colors.background}
            />
            <SafeAreaView style={styles.safeArea}>
                {header}
                <View style={[
                    styles.content,
                    !noPadding && styles.padding,
                    style
                ]}>
                    {children}
                </View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    safeArea: {
        flex: 1,
    },
    content: {
        flex: 1,
    },
    padding: {
        paddingHorizontal: 16,
        paddingTop: 16,
    }
});

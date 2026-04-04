import 'react-native-gesture-handler'; // Recommended import for stack
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, LogBox } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import RootNavigator from './src/navigation/RootNavigator';
import './i18n'; // Init i18n
import { useTranslation } from 'react-i18next';
import { StatusBar } from 'expo-status-bar';

// Ignore specific warnings if needed (optional)
LogBox.ignoreLogs(['Require cycle:', 'Non-serializable values']);

function AppContent() {
    const { colors, isDark } = useTheme();
    const { i18n } = useTranslation();
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        // Ensure i18n is loaded
        if (i18n.isInitialized) {
            setIsReady(true);
        } else {
            i18n.on('initialized', () => setIsReady(true));
        }
    }, [i18n]);

    if (!isReady) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" />
            </View>
        );
    }


    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <NavigationContainer theme={{
                dark: isDark,
                colors: {
                    primary: colors.primary,
                    background: colors.background,
                    card: colors.card,
                    text: colors.text,
                    border: colors.border,
                    notification: colors.error,
                },
                fonts: DefaultTheme.fonts
            }}>
                <StatusBar style={isDark ? "light" : "dark"} />
                <RootNavigator />
            </NavigationContainer>
        </GestureHandlerRootView>
    );
}

export default function App() {
    return (
        <ThemeProvider>
            <AppContent />
        </ThemeProvider>
    );
}

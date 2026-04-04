/**
 * Anti-Cheat Lock Mode for Exams
 * Uses AppState and DeviceEventEmitter to detect app switching
 */
import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Alert, BackHandler } from 'react-native';

interface AntiCheatConfig {
    maxViolations?: number;
    onViolation?: (count: number) => void;
    onMaxViolationsReached?: () => void;
    lockBackButton?: boolean;
}

export function useAntiCheat(enabled: boolean, config: AntiCheatConfig = {}) {
    const {
        maxViolations = 3,
        onViolation,
        onMaxViolationsReached,
        lockBackButton = true
    } = config;

    const [violations, setViolations] = useState(0);
    const [isLocked, setIsLocked] = useState(false);
    const appState = useRef(AppState.currentState);

    useEffect(() => {
        if (!enabled) return;

        setIsLocked(true);

        // App State Listener - Detect background/foreground switches
        const appStateListener = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
            if (appState.current === 'active' && nextAppState.match(/inactive|background/)) {
                // User left the app during exam
                const newCount = violations + 1;
                setViolations(newCount);

                if (onViolation) {
                    onViolation(newCount);
                }

                Alert.alert(
                    '⚠️ Uyarı',
                    `Sınav sırasında uygulamadan çıkış tespit edildi! (${newCount}/${maxViolations})`,
                    [{ text: 'Tamam' }]
                );

                if (newCount >= maxViolations && onMaxViolationsReached) {
                    onMaxViolationsReached();
                }
            }

            appState.current = nextAppState;
        });

        // Back Button Blocker
        let backHandler: any = null;
        if (lockBackButton) {
            backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
                Alert.alert(
                    '🔒 Sınav Modu',
                    'Sınav sırasında geri tuşu devre dışıdır.',
                    [{ text: 'Tamam' }]
                );
                return true; // Prevent default back behavior
            });
        }

        return () => {
            appStateListener.remove();
            if (backHandler) backHandler.remove();
            setIsLocked(false);
        };
    }, [enabled, violations, maxViolations, onViolation, onMaxViolationsReached, lockBackButton]);

    return {
        violations,
        isLocked,
        resetViolations: () => setViolations(0)
    };
}

// Lock Screen Component to overlay when locked
import { View, Text, StyleSheet } from 'react-native';

export function ExamLockOverlay({ visible, message }: { visible: boolean; message?: string }) {
    if (!visible) return null;

    return (
        <View style={lockStyles.container}>
            <Text style={lockStyles.icon}>🔒</Text>
            <Text style={lockStyles.title}>Sınav Modu Aktif</Text>
            <Text style={lockStyles.message}>
                {message || 'Sınav tamamlanana kadar uygulamadan çıkamazsınız.'}
            </Text>
        </View>
    );
}

const lockStyles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.95)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
        zIndex: 9999
    },
    icon: {
        fontSize: 64,
        marginBottom: 16
    },
    title: {
        color: '#fff',
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 8
    },
    message: {
        color: '#94a3b8',
        fontSize: 16,
        textAlign: 'center'
    }
});

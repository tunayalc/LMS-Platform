import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Feather } from '@expo/vector-icons';

interface HeaderProps {
    title: string;
    showBack?: boolean;
    onBack?: () => void;
    rightAction?: React.ReactNode;
}

export default function Header({ title, showBack = false, onBack, rightAction }: HeaderProps) {
    const { colors } = useTheme();

    const handleBack = () => {
        if (onBack) {
            onBack();
        }
    };

    return (
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.leftContainer}>
                {showBack && (
                    <TouchableOpacity
                        onPress={handleBack}
                        style={styles.backButton}
                    >
                        <Feather name="arrow-left" size={24} color={colors.text} />
                    </TouchableOpacity>
                )}
                <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                    {title}
                </Text>
            </View>
            {rightAction && <View style={styles.rightContainer}>{rightAction}</View>}
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        height: 56,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    leftContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    rightContainer: {
        marginLeft: 16,
    },
    backButton: {
        marginRight: 12,
        padding: 4,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        flex: 1,
    }
});

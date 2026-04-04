import React from 'react';
import { View, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

interface CardProps {
    children: React.ReactNode;
    style?: ViewStyle;
    onPress?: () => void;
    noPadding?: boolean;
}

export default function Card({ children, style, onPress, noPadding = false }: CardProps) {
    const { colors, isDark } = useTheme();

    const cardStyles = [
        styles.card,
        {
            backgroundColor: colors.card,
            borderColor: colors.border,
            shadowColor: isDark ? '#000' : '#888',
        },
        !noPadding && styles.padding,
        style
    ];

    if (onPress) {
        return (
            <TouchableOpacity
                style={cardStyles}
                onPress={onPress}
                activeOpacity={0.7}
            >
                {children}
            </TouchableOpacity>
        );
    }

    return (
        <View style={cardStyles}>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: 12,
        // Shadow for iOS and Android
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    padding: {
        padding: 16,
    }
});

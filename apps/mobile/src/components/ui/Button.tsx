import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Feather } from '@expo/vector-icons';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

interface ButtonProps {
    label: string;
    onPress: () => void;
    variant?: ButtonVariant;
    loading?: boolean;
    icon?: keyof typeof Feather.glyphMap;
    style?: ViewStyle;
    disabled?: boolean;
}

export default function Button({
    label,
    onPress,
    variant = 'primary',
    loading = false,
    icon,
    style,
    disabled = false
}: ButtonProps) {
    const { colors } = useTheme();

    const getBackgroundColor = () => {
        if (disabled) return colors.disabled;
        switch (variant) {
            case 'primary': return colors.primary;
            case 'secondary': return colors.surface;
            case 'outline': return 'transparent';
            case 'ghost': return 'transparent';
            case 'danger': return colors.error;
            default: return colors.primary;
        }
    };

    const getTextColor = () => {
        if (disabled) return '#fff';
        switch (variant) {
            case 'primary': return '#fff';
            case 'secondary': return colors.text;
            case 'outline': return colors.primary;
            case 'ghost': return colors.textSecondary;
            case 'danger': return '#fff';
            default: return '#fff';
        }
    };

    const getBorderWidth = () => {
        return variant === 'outline' || variant === 'secondary' ? 1 : 0;
    };

    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={disabled || loading}
            activeOpacity={0.8}
            style={[
                styles.button,
                {
                    backgroundColor: getBackgroundColor(),
                    borderColor: colors.border,
                    borderWidth: getBorderWidth(),
                },
                style
            ]}
        >
            {loading ? (
                <ActivityIndicator color={getTextColor()} />
            ) : (
                <>
                    {icon && (
                        <Feather
                            name={icon}
                            size={18}
                            color={getTextColor()}
                            style={{ marginRight: 8 }}
                        />
                    )}
                    <Text style={[styles.label, { color: getTextColor() }]}>
                        {label}
                    </Text>
                </>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    button: {
        height: 48,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
    },
    label: {
        fontSize: 15,
        fontWeight: '600',
    }
});

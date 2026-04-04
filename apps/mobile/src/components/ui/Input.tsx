import React from 'react';
import {
    View,
    TextInput,
    Text,
    StyleSheet,
    TextInputProps,
    TouchableOpacity,
    Platform
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

interface InputProps extends TextInputProps {
    label?: string;
    error?: string;
    icon?: keyof typeof Ionicons.glyphMap;
    rightIcon?: keyof typeof Ionicons.glyphMap;
    onRightIconPress?: () => void;
}

export const Input = React.forwardRef<TextInput, InputProps>(({
    label,
    error,
    icon,
    rightIcon,
    onRightIconPress,
    style,
    ...props
}, ref) => {
    const { colors } = useTheme();

    return (
        <View style={styles.container}>
            {label && (
                <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
            )}
            <View style={[
                styles.inputContainer,
                {
                    backgroundColor: colors.inputBackground,
                    borderColor: error ? colors.error : colors.border
                }
            ]}>
                {icon && (
                    <Ionicons
                        name={icon}
                        size={20}
                        color={colors.textSecondary}
                        style={styles.icon}
                    />
                )}
                <TextInput
                    ref={ref}
                    style={[
                        styles.input,
                        { color: colors.text },
                        icon && { paddingLeft: 8 },
                        rightIcon && { paddingRight: 8 },
                        style
                    ]}
                    placeholderTextColor={colors.textSecondary}
                    {...props}
                />
                {rightIcon && (
                    <TouchableOpacity
                        onPress={onRightIconPress}
                        disabled={!onRightIconPress}
                        style={styles.rightIcon}
                    >
                        <Ionicons
                            name={rightIcon}
                            size={20}
                            color={colors.textSecondary}
                        />
                    </TouchableOpacity>
                )}
            </View>
            {error && (
                <Text style={[styles.errorText, { color: colors.error }]}>
                    {error}
                </Text>
            )}
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        marginBottom: 16,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 8,
        marginLeft: 4,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 50,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.05,
                shadowRadius: 4,
            },
            android: {
                elevation: 2,
            },
        }),
    },
    input: {
        flex: 1,
        fontSize: 16,
        height: '100%',
    },
    icon: {
        marginRight: 4,
    },
    rightIcon: {
        marginLeft: 4,
        padding: 4,
    },
    errorText: {
        fontSize: 12,
        marginTop: 4,
        marginLeft: 4,
    },
});

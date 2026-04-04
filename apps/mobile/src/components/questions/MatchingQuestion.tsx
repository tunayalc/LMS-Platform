/**
 * Matching Question Component for React Native
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

interface MatchingQuestionProps {
    leftItems: string[];
    rightItems: string[];
    value: Record<string, string>;
    onChange: (matches: Record<string, string>) => void;
    disabled?: boolean;
    showCorrect?: boolean;
    correctAnswer?: Record<string, string>;
}

export function MatchingQuestion({
    leftItems,
    rightItems,
    value = {},
    onChange,
    disabled = false,
    showCorrect = false,
    correctAnswer = {}
}: MatchingQuestionProps) {
    const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
    const [shuffledRight] = useState(() => [...rightItems].sort(() => Math.random() - 0.5));

    const handleLeftPress = (item: string) => {
        if (disabled) return;

        if (selectedLeft === item) {
            setSelectedLeft(null);
        } else if (value[item]) {
            // Remove existing match
            const newMatches = { ...value };
            delete newMatches[item];
            onChange(newMatches);
        } else {
            setSelectedLeft(item);
        }
    };

    const handleRightPress = (item: string) => {
        if (disabled || !selectedLeft) return;

        // Remove any existing match with this right item
        const newMatches = { ...value };
        for (const [k, v] of Object.entries(newMatches)) {
            if (v === item) delete newMatches[k];
        }

        newMatches[selectedLeft] = item;
        onChange(newMatches);
        setSelectedLeft(null);
    };

    const isUsed = (rightItem: string) => Object.values(value).includes(rightItem);

    const isCorrect = (left: string) => {
        if (!showCorrect) return null;
        return value[left] === correctAnswer[left];
    };

    return (
        <View style={styles.container}>
            <Text style={styles.helper}>Her sol öğe için sağdaki eşini seçin</Text>

            <View style={styles.columns}>
                <View style={styles.column}>
                    <Text style={styles.columnHeader}>Sol</Text>
                    {leftItems.map((item, idx) => {
                        const matched = value[item];
                        const correct = isCorrect(item);

                        return (
                            <TouchableOpacity
                                key={idx}
                                style={[
                                    styles.item,
                                    selectedLeft === item && styles.itemSelected,
                                    matched && styles.itemMatched,
                                    correct === true && styles.itemCorrect,
                                    correct === false && styles.itemIncorrect,
                                    disabled && styles.itemDisabled
                                ]}
                                onPress={() => handleLeftPress(item)}
                                disabled={disabled}
                            >
                                <Text style={styles.itemText}>{item}</Text>
                                {matched && (
                                    <Text style={styles.matchIndicator}>→ {matched}</Text>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <View style={styles.column}>
                    <Text style={styles.columnHeader}>Sağ</Text>
                    {shuffledRight.map((item, idx) => {
                        const used = isUsed(item);

                        return (
                            <TouchableOpacity
                                key={idx}
                                style={[
                                    styles.item,
                                    used && styles.itemUsed,
                                    disabled && styles.itemDisabled
                                ]}
                                onPress={() => handleRightPress(item)}
                                disabled={disabled || !selectedLeft}
                            >
                                <Text style={[styles.itemText, used && styles.itemTextUsed]}>
                                    {item}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 12,
    },
    helper: {
        fontSize: 14,
        color: '#6b7280',
        marginBottom: 12,
        textAlign: 'center',
    },
    columns: {
        flexDirection: 'row',
        gap: 16,
    },
    column: {
        flex: 1,
    },
    columnHeader: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
        textAlign: 'center',
        padding: 8,
        backgroundColor: '#f3f4f6',
        borderRadius: 6,
        marginBottom: 8,
    },
    item: {
        padding: 12,
        backgroundColor: 'white',
        borderWidth: 2,
        borderColor: '#e5e7eb',
        borderRadius: 8,
        marginBottom: 8,
    },
    itemSelected: {
        borderColor: '#3b82f6',
        backgroundColor: '#eff6ff',
    },
    itemMatched: {
        borderColor: '#3b82f6',
        backgroundColor: '#dbeafe',
    },
    itemCorrect: {
        borderColor: '#10b981',
        backgroundColor: '#d1fae5',
    },
    itemIncorrect: {
        borderColor: '#ef4444',
        backgroundColor: '#fee2e2',
    },
    itemUsed: {
        opacity: 0.5,
    },
    itemDisabled: {
        opacity: 0.7,
    },
    itemText: {
        fontSize: 14,
        color: '#374151',
    },
    itemTextUsed: {
        color: '#9ca3af',
    },
    matchIndicator: {
        fontSize: 12,
        color: '#3b82f6',
        marginTop: 4,
    },
});

export default MatchingQuestion;

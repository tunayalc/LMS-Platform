/**
 * Ordering Question Component for React Native
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface OrderingQuestionProps {
    items: string[];
    value: string[];
    onChange: (order: string[]) => void;
    disabled?: boolean;
    showCorrect?: boolean;
    correctAnswer?: string[];
}

export function OrderingQuestion({
    items,
    value = [],
    onChange,
    disabled = false,
    showCorrect = false,
    correctAnswer = []
}: OrderingQuestionProps) {
    // Initialize with items if no value
    const currentOrder = value.length > 0 ? value : items;

    const moveUp = (idx: number) => {
        if (disabled || idx === 0) return;
        const newOrder = [...currentOrder];
        [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
        onChange(newOrder);
    };

    const moveDown = (idx: number) => {
        if (disabled || idx === currentOrder.length - 1) return;
        const newOrder = [...currentOrder];
        [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
        onChange(newOrder);
    };

    const isCorrectPosition = (idx: number) => {
        if (!showCorrect || correctAnswer.length === 0) return null;
        return currentOrder[idx] === correctAnswer[idx];
    };

    return (
        <View style={styles.container}>
            <Text style={styles.helper}>Öğeleri doğru sıraya getirin</Text>

            {currentOrder.map((item, idx) => {
                const correct = isCorrectPosition(idx);

                return (
                    <View
                        key={`${item}-${idx}`}
                        style={[
                            styles.item,
                            correct === true && styles.itemCorrect,
                            correct === false && styles.itemIncorrect,
                            disabled && styles.itemDisabled
                        ]}
                    >
                        <View style={styles.orderNumber}>
                            <Text style={styles.orderNumberText}>{idx + 1}</Text>
                        </View>

                        <Text style={styles.itemText}>{item}</Text>

                        {!disabled && (
                            <View style={styles.controls}>
                                <TouchableOpacity
                                    style={[styles.controlBtn, idx === 0 && styles.controlBtnDisabled]}
                                    onPress={() => moveUp(idx)}
                                    disabled={idx === 0}
                                >
                                    <Text style={styles.controlBtnText}>▲</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.controlBtn, idx === currentOrder.length - 1 && styles.controlBtnDisabled]}
                                    onPress={() => moveDown(idx)}
                                    disabled={idx === currentOrder.length - 1}
                                >
                                    <Text style={styles.controlBtnText}>▼</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                );
            })}
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
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: 'white',
        borderWidth: 2,
        borderColor: '#e5e7eb',
        borderRadius: 8,
        marginBottom: 8,
    },
    itemCorrect: {
        borderColor: '#10b981',
        backgroundColor: '#d1fae5',
    },
    itemIncorrect: {
        borderColor: '#ef4444',
        backgroundColor: '#fee2e2',
    },
    itemDisabled: {
        opacity: 0.7,
    },
    orderNumber: {
        width: 28,
        height: 28,
        backgroundColor: '#3b82f6',
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    orderNumberText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 14,
    },
    itemText: {
        flex: 1,
        fontSize: 14,
        color: '#374151',
    },
    controls: {
        flexDirection: 'column',
        gap: 4,
    },
    controlBtn: {
        width: 28,
        height: 20,
        backgroundColor: '#e5e7eb',
        borderRadius: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    controlBtnDisabled: {
        opacity: 0.3,
    },
    controlBtnText: {
        fontSize: 10,
        color: '#374151',
    },
});

export default OrderingQuestion;

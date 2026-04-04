/**
 * Code Question Component for React Native
 */

import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet } from 'react-native';

interface TestResult {
    input: string;
    expectedOutput: string;
    actualOutput?: string;
    passed?: boolean;
    points?: number;
    hidden?: boolean;
}

interface CodeQuestionProps {
    language: string;
    starterCode?: string;
    value: string;
    onChange: (code: string) => void;
    disabled?: boolean;
    showResults?: boolean;
    testResults?: TestResult[];
}

const LANGUAGE_LABELS: Record<string, string> = {
    python: 'Python',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    java: 'Java',
    cpp: 'C++',
    c: 'C',
    csharp: 'C#',
    go: 'Go',
    rust: 'Rust',
};

export function CodeQuestion({
    language,
    starterCode = '',
    value,
    onChange,
    disabled = false,
    showResults = false,
    testResults = []
}: CodeQuestionProps) {
    const displayValue = value || starterCode;
    const lineCount = displayValue.split('\n').length;

    const visibleTests = testResults.filter(t => !t.hidden);
    const passedCount = visibleTests.filter(t => t.passed).length;

    return (
        <View style={styles.container}>
            <View style={styles.languageBadge}>
                <Text style={styles.languageText}>
                    {LANGUAGE_LABELS[language] || language}
                </Text>
            </View>

            <View style={styles.editorContainer}>
                <View style={styles.lineNumbers}>
                    {Array.from({ length: Math.max(lineCount, 10) }, (_, i) => (
                        <Text key={i} style={styles.lineNumber}>{i + 1}</Text>
                    ))}
                </View>

                <TextInput
                    style={[styles.codeInput, disabled && styles.codeInputDisabled]}
                    value={displayValue}
                    onChangeText={onChange}
                    multiline
                    editable={!disabled}
                    textAlignVertical="top"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="// Kodunuzu buraya yazın..."
                    placeholderTextColor="#475569"
                />
            </View>

            {showResults && testResults.length > 0 && (
                <View style={styles.resultsContainer}>
                    <View style={styles.resultsHeader}>
                        <Text style={styles.resultsTitle}>Test Sonuçları</Text>
                        <Text style={styles.resultsScore}>
                            {passedCount}/{visibleTests.length} test geçti
                        </Text>
                    </View>

                    <ScrollView style={styles.testsList}>
                        {visibleTests.map((test, idx) => (
                            <View
                                key={idx}
                                style={[
                                    styles.testCase,
                                    test.passed ? styles.testCasePassed : styles.testCaseFailed
                                ]}
                            >
                                <View style={[
                                    styles.testIcon,
                                    test.passed ? styles.testIconPassed : styles.testIconFailed
                                ]}>
                                    <Text style={styles.testIconText}>
                                        {test.passed ? '✓' : '✗'}
                                    </Text>
                                </View>

                                <View style={styles.testDetails}>
                                    <Text style={styles.testLabel}>Test #{idx + 1}</Text>
                                    <Text style={styles.testInfo}>
                                        Girdi: <Text style={styles.testCode}>{test.input}</Text>
                                    </Text>
                                    <Text style={styles.testInfo}>
                                        Beklenen: <Text style={styles.testCode}>{test.expectedOutput}</Text>
                                    </Text>
                                    {test.actualOutput !== undefined && (
                                        <Text style={styles.testInfo}>
                                            Çıktı: <Text style={styles.testCode}>{test.actualOutput}</Text>
                                        </Text>
                                    )}
                                </View>
                            </View>
                        ))}

                        {testResults.some(t => t.hidden) && (
                            <View style={styles.hiddenTests}>
                                <Text style={styles.hiddenTestsText}>
                                    + {testResults.filter(t => t.hidden).length} gizli test
                                </Text>
                            </View>
                        )}
                    </ScrollView>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 12,
    },
    languageBadge: {
        alignSelf: 'flex-start',
        backgroundColor: '#1e293b',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderTopLeftRadius: 6,
        borderTopRightRadius: 6,
    },
    languageText: {
        color: '#60a5fa',
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
    },
    editorContainer: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        borderWidth: 2,
        borderColor: '#1e293b',
        borderTopRightRadius: 8,
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 8,
        minHeight: 200,
    },
    lineNumbers: {
        backgroundColor: '#1e293b',
        paddingVertical: 12,
        paddingHorizontal: 8,
        alignItems: 'flex-end',
    },
    lineNumber: {
        color: '#64748b',
        fontSize: 12,
        lineHeight: 18,
        fontFamily: 'monospace',
    },
    codeInput: {
        flex: 1,
        color: '#e2e8f0',
        fontSize: 12,
        fontFamily: 'monospace',
        padding: 12,
        lineHeight: 18,
    },
    codeInputDisabled: {
        opacity: 0.7,
    },
    resultsContainer: {
        marginTop: 16,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 8,
        overflow: 'hidden',
    },
    resultsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#f3f4f6',
        padding: 12,
    },
    resultsTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
    },
    resultsScore: {
        fontSize: 12,
        color: '#6b7280',
    },
    testsList: {
        maxHeight: 300,
    },
    testCase: {
        flexDirection: 'row',
        padding: 12,
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
    },
    testCasePassed: {
        backgroundColor: '#f0fdf4',
    },
    testCaseFailed: {
        backgroundColor: '#fef2f2',
    },
    testIcon: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    testIconPassed: {
        backgroundColor: '#10b981',
    },
    testIconFailed: {
        backgroundColor: '#ef4444',
    },
    testIconText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 12,
    },
    testDetails: {
        flex: 1,
    },
    testLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 4,
    },
    testInfo: {
        fontSize: 12,
        color: '#6b7280',
        marginTop: 2,
    },
    testCode: {
        fontFamily: 'monospace',
        backgroundColor: '#e5e7eb',
        paddingHorizontal: 4,
        borderRadius: 2,
    },
    hiddenTests: {
        padding: 12,
        backgroundColor: '#f9fafb',
    },
    hiddenTestsText: {
        fontSize: 12,
        color: '#6b7280',
        fontStyle: 'italic',
    },
});

export default CodeQuestion;

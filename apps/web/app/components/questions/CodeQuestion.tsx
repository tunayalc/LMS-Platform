'use client';

import React, { useState, useEffect } from 'react';

interface CodeQuestionProps {
    language: string;
    starterCode?: string;
    value: string;
    onChange: (code: string) => void;
    disabled?: boolean;
    showResults?: boolean;
    testResults?: Array<{
        input: string;
        expectedOutput: string;
        actualOutput?: string;
        passed?: boolean;
        points?: number;
        hidden?: boolean;
    }>;
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
    ruby: 'Ruby',
    php: 'PHP',
    sql: 'SQL'
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
    const [lineCount, setLineCount] = useState(1);

    useEffect(() => {
        const lines = (value || starterCode || '').split('\n').length;
        setLineCount(Math.max(lines, 10));
    }, [value, starterCode]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const target = e.target as HTMLTextAreaElement;
            const start = target.selectionStart;
            const end = target.selectionEnd;
            const newValue = value.substring(0, start) + '    ' + value.substring(end);
            onChange(newValue);
            // Set cursor position after tab
            setTimeout(() => {
                target.selectionStart = target.selectionEnd = start + 4;
            }, 0);
        }
    };

    const passedCount = testResults.filter(t => t.passed && !t.hidden).length;
    const visibleTests = testResults.filter(t => !t.hidden);

    return (
        <div className="code-question">
            <style jsx>{`
                .code-question {
                    font-family: 'Fira Code', 'Monaco', 'Consolas', monospace;
                }
                .language-badge {
                    display: inline-block;
                    padding: 0.25rem 0.75rem;
                    background: #1e293b;
                    color: #60a5fa;
                    border-radius: 6px 6px 0 0;
                    font-size: 0.75rem;
                    font-weight: 600;
                    text-transform: uppercase;
                }
                .code-container {
                    display: flex;
                    border: 2px solid #1e293b;
                    border-radius: 0 8px 8px 8px;
                    overflow: hidden;
                    background: #0f172a;
                }
                .line-numbers {
                    padding: 1rem 0.75rem;
                    background: #1e293b;
                    color: #64748b;
                    text-align: right;
                    user-select: none;
                    font-size: 0.875rem;
                    line-height: 1.5;
                }
                .code-editor {
                    flex: 1;
                    padding: 1rem;
                    background: #0f172a;
                    color: #e2e8f0;
                    border: none;
                    outline: none;
                    resize: none;
                    font-family: inherit;
                    font-size: 0.875rem;
                    line-height: 1.5;
                    min-height: 200px;
                }
                .code-editor:disabled {
                    opacity: 0.7;
                    cursor: not-allowed;
                }
                .code-editor::placeholder {
                    color: #475569;
                }
                .test-results {
                    margin-top: 1rem;
                    border: 1px solid #e5e7eb;
                    border-radius: 8px;
                    overflow: hidden;
                }
                .results-header {
                    padding: 0.75rem 1rem;
                    background: #f3f4f6;
                    font-weight: 600;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .results-score {
                    font-size: 0.875rem;
                    color: #6b7280;
                }
                .test-case {
                    padding: 0.75rem 1rem;
                    border-top: 1px solid #e5e7eb;
                    display: flex;
                    align-items: flex-start;
                    gap: 0.75rem;
                }
                .test-case.passed {
                    background: #f0fdf4;
                }
                .test-case.failed {
                    background: #fef2f2;
                }
                .test-icon {
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.75rem;
                    font-weight: bold;
                    flex-shrink: 0;
                }
                .test-icon.passed {
                    background: #10b981;
                    color: white;
                }
                .test-icon.failed {
                    background: #ef4444;
                    color: white;
                }
                .test-details {
                    flex: 1;
                    font-size: 0.875rem;
                }
                .test-label {
                    font-weight: 600;
                    margin-bottom: 0.25rem;
                }
                .test-io {
                    display: flex;
                    gap: 1rem;
                    color: #6b7280;
                }
                .test-io code {
                    background: #e5e7eb;
                    padding: 0.125rem 0.375rem;
                    border-radius: 4px;
                    font-family: monospace;
                }
            `}</style>

            <span className="language-badge">{LANGUAGE_LABELS[language] || language}</span>

            <div className="code-container">
                <div className="line-numbers">
                    {Array.from({ length: lineCount }, (_, i) => (
                        <div key={i}>{i + 1}</div>
                    ))}
                </div>
                <textarea
                    className="code-editor"
                    value={value || starterCode}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                    placeholder="// Kodunuzu buraya yazın..."
                    spellCheck={false}
                />
            </div>

            {showResults && testResults.length > 0 && (
                <div className="test-results">
                    <div className="results-header">
                        <span>Test Sonuçları</span>
                        <span className="results-score">
                            {passedCount}/{visibleTests.length} test geçti
                        </span>
                    </div>
                    {visibleTests.map((test, idx) => (
                        <div key={idx} className={`test-case ${test.passed ? 'passed' : 'failed'}`}>
                            <div className={`test-icon ${test.passed ? 'passed' : 'failed'}`}>
                                {test.passed ? '✓' : '✗'}
                            </div>
                            <div className="test-details">
                                <div className="test-label">Test #{idx + 1}</div>
                                <div className="test-io">
                                    <span>Girdi: <code>{test.input}</code></span>
                                    <span>Beklenen: <code>{test.expectedOutput}</code></span>
                                    {test.actualOutput !== undefined && (
                                        <span>Çıktı: <code>{test.actualOutput}</code></span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                    {testResults.some(t => t.hidden) && (
                        <div className="test-case" style={{ background: '#f9fafb', fontStyle: 'italic', color: '#6b7280' }}>
                            + {testResults.filter(t => t.hidden).length} gizli test
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default CodeQuestion;

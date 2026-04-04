/**
 * Code Sandbox Service
 * Executes code in multiple languages using Piston API or similar
 * https://github.com/engineer-man/piston
 */

interface CodeExecutionRequest {
    language: string;
    version?: string;
    code: string;
    stdin?: string;
    timeout?: number; // ms
}

interface CodeExecutionResult {
    success: boolean;
    output: string;
    stderr: string;
    exitCode: number;
    executionTime: number; // ms
    memoryUsed?: number; // bytes
}

// Language configuration
const LANGUAGE_CONFIG: Record<string, { pistonName: string; version: string }> = {
    'python': { pistonName: 'python', version: '3.10.0' },
    'python3': { pistonName: 'python', version: '3.10.0' },
    'javascript': { pistonName: 'javascript', version: '18.15.0' },
    'js': { pistonName: 'javascript', version: '18.15.0' },
    'typescript': { pistonName: 'typescript', version: '5.0.3' },
    'ts': { pistonName: 'typescript', version: '5.0.3' },
    'java': { pistonName: 'java', version: '15.0.2' },
    'c': { pistonName: 'c', version: '10.2.0' },
    'cpp': { pistonName: 'cpp', version: '10.2.0' },
    'c++': { pistonName: 'cpp', version: '10.2.0' },
    'csharp': { pistonName: 'csharp', version: '6.12.0' },
    'c#': { pistonName: 'csharp', version: '6.12.0' },
    'go': { pistonName: 'go', version: '1.16.2' },
    'rust': { pistonName: 'rust', version: '1.68.2' },
    'ruby': { pistonName: 'ruby', version: '3.0.1' },
    'php': { pistonName: 'php', version: '8.2.3' },
    'sql': { pistonName: 'sqlite3', version: '3.36.0' },
};

// Piston API endpoint (public instance or self-hosted)
const PISTON_API = process.env.PISTON_API_URL || 'https://emkc.org/api/v2/piston';

export const CodeSandbox = {
    /**
     * Execute code in sandbox
     */
    execute: async (request: CodeExecutionRequest): Promise<CodeExecutionResult> => {
        const startTime = Date.now();

        try {
            // Get language config
            const langConfig = LANGUAGE_CONFIG[request.language.toLowerCase()];
            if (!langConfig) {
                return {
                    success: false,
                    output: '',
                    stderr: `Unsupported language: ${request.language}`,
                    exitCode: 1,
                    executionTime: 0
                };
            }

            // Prepare request for Piston API
            const pistonRequest = {
                language: langConfig.pistonName,
                version: request.version || langConfig.version,
                files: [{
                    name: getFileName(langConfig.pistonName),
                    content: request.code
                }],
                stdin: request.stdin || '',
                args: [],
                compile_timeout: 10000,
                run_timeout: request.timeout || 5000,
                compile_memory_limit: -1,
                run_memory_limit: -1
            };

            // Call Piston API
            const response = await fetch(`${PISTON_API}/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pistonRequest)
            });

            if (!response.ok) {
                throw new Error(`Piston API error: ${response.status}`);
            }

            const result = await response.json();
            const executionTime = Date.now() - startTime;

            // Handle compile errors
            if (result.compile && result.compile.code !== 0) {
                return {
                    success: false,
                    output: result.compile.output || '',
                    stderr: result.compile.stderr || 'Compilation failed',
                    exitCode: result.compile.code,
                    executionTime
                };
            }

            // Handle run result
            return {
                success: result.run.code === 0,
                output: result.run.stdout || '',
                stderr: result.run.stderr || '',
                exitCode: result.run.code,
                executionTime
            };

        } catch (error) {
            return {
                success: false,
                output: '',
                stderr: `Execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                exitCode: 1,
                executionTime: Date.now() - startTime
            };
        }
    },

    /**
     * Check if language is supported
     */
    isLanguageSupported: (language: string): boolean => {
        return language.toLowerCase() in LANGUAGE_CONFIG;
    },

    /**
     * Get supported languages
     */
    getSupportedLanguages: (): string[] => {
        return Object.keys(LANGUAGE_CONFIG);
    },

    /**
     * Validate code before execution (basic checks)
     */
    validateCode: (code: string, language: string): { valid: boolean; error?: string } => {
        // Check for empty code
        if (!code || !code.trim()) {
            return { valid: false, error: 'Code cannot be empty' };
        }

        // Check code length (max 64KB)
        if (code.length > 65536) {
            return { valid: false, error: 'Code exceeds maximum length (64KB)' };
        }

        // Basic security checks (block dangerous patterns)
        const dangerousPatterns = [
            /\bos\.system\b/i,
            /\bsubprocess\b/i,
            /\beval\s*\(/i,
            /\bexec\s*\(/i,
            /\bimport\s+os\b/,
            /\brequire\s*\(\s*['"]child_process['"]\s*\)/,
            /\bfs\.(unlink|rmdir|rm)\b/,
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(code)) {
                return { valid: false, error: 'Code contains potentially dangerous operations' };
            }
        }

        return { valid: true };
    },

    /**
     * Grade code submission against test cases
     */
    gradeSubmission: async (
        code: string,
        language: string,
        testCases: Array<{ input: string; expectedOutput: string; points: number }>
    ): Promise<{ score: number; maxScore: number; results: any[] }> => {
        let score = 0;
        let maxScore = 0;
        const results = [];

        for (const testCase of testCases) {
            maxScore += testCase.points;

            const result = await CodeSandbox.execute({
                language,
                code,
                stdin: testCase.input,
                timeout: 5000
            });

            const passed = result.success &&
                result.output.trim() === testCase.expectedOutput.trim();

            if (passed) {
                score += testCase.points;
            }

            results.push({
                input: testCase.input,
                expectedOutput: testCase.expectedOutput,
                actualOutput: result.output,
                passed,
                points: passed ? testCase.points : 0,
                error: result.stderr || null
            });
        }

        return { score, maxScore, results };
    }
};

function getFileName(language: string): string {
    const extensions: Record<string, string> = {
        'python': 'main.py',
        'javascript': 'main.js',
        'typescript': 'main.ts',
        'java': 'Main.java',
        'c': 'main.c',
        'cpp': 'main.cpp',
        'csharp': 'Main.cs',
        'go': 'main.go',
        'rust': 'main.rs',
        'ruby': 'main.rb',
        'php': 'main.php',
        'sqlite3': 'main.sql'
    };
    return extensions[language] || 'main.txt';
}

export default CodeSandbox;

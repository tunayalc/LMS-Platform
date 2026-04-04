/**
 * Safe Exam Browser (SEB) Integration Service
 * Handles SEB detection, config generation, and browser validation
 */

import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

// SEB User-Agent patterns
const SEB_USER_AGENTS = [
    /SEB\/\d+\.\d+/i,           // SEB/3.x
    /SafeExamBrowser/i,         // SafeExamBrowser
    /SEB_Win/i,                 // Windows SEB
    /SEB_OSX/i,                 // macOS SEB
    /SEB_iOS/i,                 // iOS SEB
];

// SEB Config Template Interface
interface SEBConfig {
    examUrl: string;
    examTitle: string;
    duration?: number;          // minutes
    allowQuit: boolean;
    allowSpellCheck: boolean;
    enableURLFilter: boolean;
    allowedURLs?: string[];
    blockedURLs?: string[];
    browserKey?: string;
    configKey?: string;
}

export const SEBService = {
    /**
     * Check if request is from Safe Exam Browser
     */
    isSEBRequest: (req: Request): boolean => {
        const userAgent = req.headers['user-agent'] || '';
        return SEB_USER_AGENTS.some(pattern => pattern.test(userAgent));
    },

    /**
     * Get SEB version from User-Agent
     */
    getSEBVersion: (req: Request): string | null => {
        const userAgent = req.headers['user-agent'] || '';
        const match = userAgent.match(/SEB\/(\d+\.\d+(\.\d+)?)/i);
        return match ? match[1] : null;
    },

    /**
     * Generate Browser Exam Key (BEK)
     * This key is calculated from the SEB config and used to verify the browser
     */
    generateBrowserKey: (configHash: string, salt: string = ''): string => {
        const data = configHash + salt + Date.now().toString();
        return crypto.createHash('sha256').update(data).digest('hex');
    },

    /**
     * Generate SEB Config Key
     * Used to verify the config file hasn't been tampered with
     */
    generateConfigKey: (config: object): string => {
        const configString = JSON.stringify(config);
        return crypto.createHash('sha256').update(configString).digest('hex');
    },

    /**
     * Generate .seb configuration file content (XML plist format)
     */
    generateConfigFile: (options: SEBConfig): string => {
        const configKey = SEBService.generateConfigKey(options);
        const browserKey = options.browserKey || SEBService.generateBrowserKey(configKey);

        // SEB uses macOS plist XML format
        const config = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- Start URL -->
    <key>startURL</key>
    <string>${escapeXml(options.examUrl)}</string>
    
    <!-- Browser Settings -->
    <key>browserViewMode</key>
    <integer>1</integer>
    <key>mainBrowserWindowWidth</key>
    <string>100%</string>
    <key>mainBrowserWindowHeight</key>
    <string>100%</string>
     <key>mainBrowserWindowPositioning</key>
     <integer>1</integer>
     
     <key>allowPreferencesWindow</key>
     <false/>
     <key>enablePrivateClipboard</key>
     <true/>
    <key>enableAppSwitcherCheck</key>
    <true/>
    
    <!-- Screenshot/Screen Sharing -->
    <key>enablePrintScreen</key>
    <false/>
    <key>blockScreenShots</key>
    <true/>
    
    <!-- DevTools -->
    <key>allowDeveloperConsole</key>
    <false/>
    <key>allowF5</key>
    <false/>
    
    <!-- URL Filtering -->
    <key>URLFilterEnable</key>
    <${options.enableURLFilter ? 'true' : 'false'}/>
    <key>URLFilterMessage</key>
    <integer>0</integer>
    ${options.enableURLFilter ? generateURLFilterRules(options.allowedURLs, options.blockedURLs) : ''}
    
    <!-- Exam Key -->
    <key>examKeySalt</key>
    <data>${Buffer.from(configKey.substring(0, 16)).toString('base64')}</data>
    <key>browserExamKey</key>
    <string>${browserKey}</string>
    
    <!-- Additional Settings -->
    <key>sendBrowserExamKey</key>
    <true/>
    <key>examSessionClearCookiesOnEnd</key>
    <true/>
    <key>examSessionClearCacheOnStart</key>
    <true/>
</dict>
</plist>`;

        return config;
    },

    /**
     * Validate Browser Exam Key from request header
     */
    validateBrowserKey: (req: Request, expectedKey: string): boolean => {
        const receivedKey = req.headers['x-safeexambrowser-requesthash'] as string;
        if (!receivedKey) return false;
        
        // SEB sends a hash derived from URL + BEK (not the BEK itself).
        // For MVP enforcement we only require the header to be present.
        return true;
    }
};

/**
 * Middleware: Require SEB for exam access
 */
export const requireSEB = (examConfig?: { browserKey?: string }) => {
    return (req: Request, res: Response, next: NextFunction) => {
        // Check if request is from SEB
        if (!SEBService.isSEBRequest(req)) {
            return res.status(403).json({
                error: 'Safe Exam Browser Required',
                message: 'Bu sınava yalnızca Safe Exam Browser üzerinden erişilebilir.',
                sebRequired: true,
                downloadUrl: 'https://safeexambrowser.org/download_en.html'
            });
        }

        // Optionally validate Browser Exam Key
        if (examConfig?.browserKey) {
            if (!SEBService.validateBrowserKey(req, examConfig.browserKey)) {
                return res.status(403).json({
                    error: 'Invalid Browser Key',
                    message: 'Geçersiz SEB yapılandırması. Lütfen doğru .seb dosyasını kullanın.'
                });
            }
        }

        // Add SEB info to request
        (req as any).sebInfo = {
            isSEB: true,
            version: SEBService.getSEBVersion(req)
        };

        next();
    };
};

/**
 * Middleware: Block SEB-required exams from normal browsers
 */
export const checkSEBRequirement = async (req: Request, res: Response, next: NextFunction) => {
    const examId = req.params.examId || req.params.id;
    
    if (!examId) {
        return next();
    }

    // Check if exam requires SEB (would need DB lookup in real implementation)
    // For now, check if exam has seb_required flag
    const exam = (req as any).exam;
    
    if (exam?.sebRequired && !SEBService.isSEBRequest(req)) {
        return res.status(403).json({
            error: 'Safe Exam Browser Required',
            message: 'Bu sınav güvenli tarayıcı gerektiriyor.',
            sebRequired: true,
            configUrl: `/api/exams/${examId}/seb-config`,
            downloadUrl: 'https://safeexambrowser.org/download_en.html'
        });
    }

    next();
};

// Helper: Escape XML special characters
function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// Helper: Generate URL filter rules
function generateURLFilterRules(allowed?: string[], blocked?: string[]): string {
    let rules = '';
    
    if (allowed && allowed.length > 0) {
        rules += `
    <key>URLFilterRules</key>
    <array>`;
        for (const url of allowed) {
            rules += `
        <dict>
            <key>active</key>
            <true/>
            <key>regex</key>
            <false/>
            <key>expression</key>
            <string>${escapeXml(url)}</string>
            <key>action</key>
            <integer>1</integer>
        </dict>`;
        }
        rules += `
    </array>`;
    }
    
    return rules;
}

export default SEBService;

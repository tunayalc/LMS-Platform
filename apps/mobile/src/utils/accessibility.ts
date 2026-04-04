/**
 * Accessibility Helpers for React Native
 * Provides common accessibility props and utilities for WCAG 2.1 compliance
 */
import { AccessibilityProps, Platform } from 'react-native';

// Common accessibility roles
type A11yRole =
    | 'button' | 'link' | 'header' | 'search' | 'image' | 'text'
    | 'adjustable' | 'checkbox' | 'radio' | 'switch' | 'tab' | 'tablist'
    | 'timer' | 'alert' | 'menu' | 'menuitem' | 'progressbar' | 'spinbutton';

interface A11yConfig {
    label: string;
    hint?: string;
    role?: A11yRole;
    state?: {
        disabled?: boolean;
        selected?: boolean;
        checked?: boolean | 'mixed';
        busy?: boolean;
        expanded?: boolean;
    };
    value?: {
        min?: number;
        max?: number;
        now?: number;
        text?: string;
    };
}

/**
 * Generate accessibility props for a component
 */
export function a11yProps(config: A11yConfig): AccessibilityProps {
    const props: AccessibilityProps = {
        accessible: true,
        accessibilityLabel: config.label,
    };

    if (config.hint) {
        props.accessibilityHint = config.hint;
    }

    if (config.role) {
        props.accessibilityRole = config.role;
    }

    if (config.state) {
        props.accessibilityState = {
            disabled: config.state.disabled,
            selected: config.state.selected,
            checked: config.state.checked,
            busy: config.state.busy,
            expanded: config.state.expanded,
        };
    }

    if (config.value) {
        props.accessibilityValue = {
            min: config.value.min,
            max: config.value.max,
            now: config.value.now,
            text: config.value.text,
        };
    }

    return props;
}

/**
 * Generate button accessibility props
 */
export function a11yButton(label: string, hint?: string, disabled?: boolean): AccessibilityProps {
    return a11yProps({
        label,
        hint,
        role: 'button',
        state: { disabled }
    });
}

/**
 * Generate link accessibility props
 */
export function a11yLink(label: string, hint?: string): AccessibilityProps {
    return a11yProps({
        label,
        hint,
        role: 'link'
    });
}

/**
 * Generate header accessibility props
 */
export function a11yHeader(label: string, level?: number): AccessibilityProps {
    return {
        accessible: true,
        accessibilityLabel: label,
        accessibilityRole: 'header',
        // Note: React Native doesn't support heading levels directly
    };
}

/**
 * Generate image accessibility props
 */
export function a11yImage(altText: string): AccessibilityProps {
    return a11yProps({
        label: altText,
        role: 'image'
    });
}

/**
 * Generate form input accessibility props
 */
export function a11yInput(label: string, hint?: string, required?: boolean): AccessibilityProps {
    const fullLabel = required ? `${label}, zorunlu alan` : label;
    return {
        accessible: true,
        accessibilityLabel: fullLabel,
        accessibilityHint: hint,
    };
}

/**
 * Generate checkbox accessibility props
 */
export function a11yCheckbox(label: string, checked: boolean, disabled?: boolean): AccessibilityProps {
    return a11yProps({
        label,
        role: 'checkbox',
        state: { checked, disabled }
    });
}

/**
 * Generate progress accessibility props
 */
export function a11yProgress(label: string, value: number, max: number = 100): AccessibilityProps {
    return a11yProps({
        label: `${label}: yüzde ${Math.round((value / max) * 100)}`,
        role: 'progressbar',
        value: { min: 0, max, now: value }
    });
}

/**
 * Announce a message for screen readers
 */
export function announceForAccessibility(message: string): void {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
        // This uses the native announcement API
        const { AccessibilityInfo } = require('react-native');
        AccessibilityInfo.announceForAccessibility(message);
    }
}

/**
 * Check if screen reader is enabled
 */
export async function isScreenReaderEnabled(): Promise<boolean> {
    const { AccessibilityInfo } = require('react-native');
    return AccessibilityInfo.isScreenReaderEnabled();
}

// Color contrast helpers for WCAG 2.1 AA compliance
export const A11Y_COLORS = {
    // High contrast text colors
    textPrimary: '#0f172a',      // 12.63:1 on white
    textSecondary: '#475569',    // 6.62:1 on white
    textOnDark: '#ffffff',       // 21:1 on dark

    // Interactive element colors (4.5:1 minimum)
    linkColor: '#1d4ed8',        // 8.59:1 on white
    errorColor: '#b91c1c',       // 7.75:1 on white
    successColor: '#15803d',     // 5.27:1 on white

    // Focus indicators
    focusRing: '#2563eb',
    focusRingWidth: 2,
};

// Minimum touch target sizes (WCAG 2.5.5)
export const A11Y_TOUCH_TARGETS = {
    minimum: 44, // 44x44 dp minimum
    recommended: 48, // 48x48 dp recommended
};

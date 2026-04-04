export const normalizeContentSourceToUrl = (baseUrl: string, raw?: string | null): string | null => {
    if (!raw) return null;
    const trimmed = String(raw).trim();
    if (!trimmed) return null;

    // Already absolute
    if (/^https?:\/\//i.test(trimmed)) {
        try {
            const absolute = new URL(trimmed);
            if (absolute.hostname === 'localhost' || absolute.hostname === '127.0.0.1') {
                const base = new URL(baseUrl);
                const rewritten = new URL(`${base.origin}${absolute.pathname}${absolute.search}${absolute.hash}`);
                return encodeURI(rewritten.toString());
            }
        } catch {
            // ignore parsing and fall back
        }
        return encodeURI(trimmed);
    }

    // file:// URIs: keep as-is (encode spaces)
    if (/^file:\/\//i.test(trimmed)) {
        return encodeURI(trimmed);
    }

    // Windows absolute paths (e.g. C:\...\uploads\file.pdf) -> /uploads/...
    const lower = trimmed.toLowerCase();
    const uploadsIdx = lower.lastIndexOf('uploads');
    let normalizedPath = trimmed;
    if (uploadsIdx >= 0) {
        normalizedPath = trimmed.slice(uploadsIdx);
    }

    // If user pasted "uploads something" (space instead of slash) fix it.
    if (/^uploads\s+/i.test(normalizedPath) && !/[\/\\]/.test(normalizedPath)) {
        normalizedPath = normalizedPath.replace(/\s+/g, '/');
    }

    // Normalize slashes and ensure it becomes /uploads/...
    normalizedPath = normalizedPath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (/^uploads\b/i.test(normalizedPath)) {
        normalizedPath = `/${normalizedPath}`;
    } else if (!normalizedPath.startsWith('/')) {
        normalizedPath = `/${normalizedPath}`;
    }

    // If it's just a filename (no /uploads prefix), assume it lives under /uploads
    if (!normalizedPath.toLowerCase().startsWith('/uploads/')) {
        normalizedPath = `/uploads/${normalizedPath.replace(/^\/+/, '')}`;
    }

    const full = `${baseUrl.replace(/\/$/, '')}${normalizedPath}`;
    return encodeURI(full);
};


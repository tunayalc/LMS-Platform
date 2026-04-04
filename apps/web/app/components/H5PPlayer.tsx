"use client";

import React from "react";
import { resolveApiBaseUrl } from "@lms/shared";

interface H5PPlayerProps {
    contentPath: string; // Path to the extracted H5P content folder (e.g., /uploads/folder-name/)
    title?: string;
}

const H5PPlayer: React.FC<H5PPlayerProps> = ({ contentPath, title }) => {
    const apiBaseUrl = resolveApiBaseUrl({ runtime: "web" });

    let fullContentPath = contentPath;
    if (contentPath && !contentPath.startsWith("http")) {
        const needsProxy = apiBaseUrl === "/api" || apiBaseUrl.endsWith("/api");
        if (needsProxy) {
            fullContentPath = contentPath.startsWith("/") ? contentPath : `/${contentPath}`;
        } else {
            fullContentPath = `${apiBaseUrl}${contentPath.startsWith("/") ? "" : "/"}${contentPath}`;
        }
    }

    const playerUrl = `/h5p/player.html?path=${encodeURIComponent(fullContentPath)}`;

    return (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            {title && (
                <div style={{
                    height: '50px',
                    backgroundColor: 'var(--card)',
                    color: 'var(--ink)',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 16px',
                    flexShrink: 0,
                    justifyContent: 'space-between'
                }}>
                    <span style={{ fontWeight: 'bold' }}>🎮 {title}</span>
                    <span style={{ fontSize: '12px', color: 'var(--ink-light)' }}>H5P İnteraktif İçerik</span>
                </div>
            )}
            <div style={{ flex: 1, position: 'relative', backgroundColor: 'var(--bg)' }}>
                <iframe
                    src={playerUrl}
                    style={{
                        width: '100%',
                        height: '100%',
                        border: 'none'
                    }}
                    allowFullScreen
                    title={title || 'H5P Content'}
                />
            </div>
        </div>
    );
};

export default H5PPlayer;

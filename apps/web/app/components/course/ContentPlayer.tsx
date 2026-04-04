import React, { useState, useRef } from "react";
import ScormPlayer from "../ScormPlayer";
import H5PPlayer from "../H5PPlayer";
import { Content } from "@lms/shared";
import NotesPanel from "./NotesPanel";

interface ContentPlayerProps {
    content: Content;
    onComplete?: () => void;
    apiBaseUrl: string;
    token: string | null;
}

export default function ContentPlayer({ content, onComplete, apiBaseUrl, token }: ContentPlayerProps) {
    const [error, setError] = useState<string | null>(null);
    const [showNotes, setShowNotes] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);

    // File Browser State
    const [fileList, setFileList] = useState<{ name: string, type: 'directory' | 'file', path: string }[]>([]);
    const [currentBrowserPath, setCurrentBrowserPath] = useState<string>("");
    const [selectedFile, setSelectedFile] = useState<string>("");
    const [browserLoading, setBrowserLoading] = useState(false);
    const [debugInfo, setDebugInfo] = useState<string>("");

    const fetchFiles = async (pathStr: string) => {
        setBrowserLoading(true);
        setDebugInfo(`Requesting: ${pathStr}`);
        try {
            const res = await fetch(`${apiBaseUrl}/content/list-files`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ path: pathStr })
            });
            const data = await res.json();
            if (res.ok && data.files) {
                setFileList(data.files);
                setCurrentBrowserPath(data.currentPath);
                setDebugInfo(`OK: ${data.files.length} dosya bulundu. Path: ${data.currentPath}`);
            } else {
                setDebugInfo(`API Error: ${res.status} - ${JSON.stringify(data)}`);
            }
        } catch (e: any) {
            setDebugInfo(`Network Error: ${e.message}`);
            console.error(e);
        }
        setBrowserLoading(false);
    };

    const handleFileClick = (file: { type: 'directory' | 'file', path: string }) => {
        if (file.type === 'directory') {
            fetchFiles(file.path);
        } else {
            setSelectedFile(`${apiBaseUrl}${file.path}`);
        }
    };

    // Initial load for zip content
    React.useEffect(() => {
        if ((content.type === 'scorm' || content.type === 'h5p') && content.source) {
            const init = async () => {
                await fetchFiles(content.source || "");
                // If source points to index.html, set it as selected
                if (content.source && content.source.toLowerCase().endsWith('.html')) {
                    setSelectedFile(getFullUrl(content.source));
                }
            };
            init();
        }
    }, [content.id, content.source]);

    const getFullUrl = (source: string) => {
        if (!source) return "";
        if (source.startsWith("http")) return source;
        const base = apiBaseUrl.replace(/\/$/, "");
        const path = source.startsWith("/") ? source : `/${source}`;
        return `${base}${path}`;
    };

    const fullSource = getFullUrl(content.source || "");

    // Fetch progress on mount
    React.useEffect(() => {
        if (!token) return;

        const fetchProgress = async () => {
            try {
                const res = await fetch(`${apiBaseUrl}/api/modules/progress/${content.id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.position > 0 && videoRef.current) {
                        // Small delay to ensure video metadata loaded
                        setTimeout(() => {
                            if (videoRef.current) {
                                videoRef.current.currentTime = data.position;
                            }
                        }, 500);
                    }
                }
            } catch (err) {
                console.error("Error fetching progress", err);
            }
        };

        fetchProgress();
    }, [content.id, token, apiBaseUrl]);

    // Save progress periodically
    React.useEffect(() => {
        if (!videoRef.current || !token) return;

        const interval = setInterval(() => {
            if (videoRef.current && !videoRef.current.paused) {
                saveProgress(videoRef.current.currentTime, videoRef.current.duration, false);
            }
        }, 5000); // Save every 5 seconds

        return () => clearInterval(interval);
    }, [content.id, token]);

    const saveProgress = async (time: number, duration: number, completed: boolean) => {
        try {
            await fetch(`${apiBaseUrl}/api/modules/progress`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    contentId: content.id,
                    position: time,
                    duration: duration,
                    completed: completed
                })
            });
        } catch (err) {
            console.error("Error saving progress", err);
        }
    };

    // Wrap onComplete to save completed status
    const handleVideoComplete = () => {
        if (videoRef.current) {
            saveProgress(videoRef.current.duration, videoRef.current.duration, true);
        }
        if (onComplete) onComplete();
    };

    const getCurrentTime = () => {
        if (videoRef.current) {
            return videoRef.current.currentTime;
        }
        return 0;
    };

    const handleSeek = (time: number) => {
        if (videoRef.current) {
            videoRef.current.currentTime = time;
            videoRef.current.play().catch(() => { });
        }
    };

    const renderContent = () => {
        if (!content.source) {
            return <div className="flex items-center justify-center h-64 text-red-500 bg-red-50 rounded-lg">İçerik kaynağı bulunamadı.</div>;
        }

        // 1. VIDEO PLAYER (Native Video Tag - Cleanest approach)
        if (content.type === "video") {
            return (
                <div style={{ width: '100%', height: '100%', backgroundColor: 'black', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
                    <video
                        ref={videoRef}
                        controls
                        style={{ width: '100%', height: '100%', objectFit: 'contain', outline: 'none' }}
                        src={fullSource}
                        onEnded={handleVideoComplete}
                        onError={() => setError("Video oynatılamadı. Dosya formatı desteklenmiyor olabilir.")}
                    >
                        Tarayıcınız bu videoyu oynatamıyor.
                    </video>
                    {error && (
                        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 10, color: 'white' }}>
                            <p style={{ marginBottom: '10px', color: '#ef4444' }}>⚠️ {error}</p>
                            <a href={fullSource} target="_blank" rel="noreferrer" style={{ color: '#60a5fa', textDecoration: 'underline' }}>
                                Videoyu Yeni Sekmede Aç
                            </a>
                        </div>
                    )}
                </div>
            );
        }

        // 2. PDF VIEWER (Embed Tag - Force Full Size)
        if (content.type === "pdf") {
            return (
                <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f3f4f6' }}>
                    <div style={{
                        flexShrink: 0,
                        height: '50px',
                        backgroundColor: '#1f2937',
                        color: 'white',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0 16px'
                    }}>
                        <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {content.title}
                        </span>
                        <a
                            href={fullSource}
                            download
                            style={{
                                backgroundColor: '#2563eb',
                                color: 'white',
                                padding: '6px 12px',
                                borderRadius: '4px',
                                textDecoration: 'none',
                                fontSize: '0.875rem'
                            }}
                        >
                            İndir
                        </a>
                    </div>

                    <div style={{ flex: 1, position: 'relative', width: '100%', height: 'calc(100vh - 50px)', overflow: 'hidden' }}>
                        <embed
                            src={fullSource}
                            type="application/pdf"
                            width="100%"
                            height="100%"
                            style={{ width: '100%', height: '100%', border: 'none', minHeight: '80vh' }}
                        />
                    </div>
                </div>
            );
        }

        // 3. H5P PLAYER (Using h5p-standalone)
        if (content.type === "h5p") {
            return (
                <div style={{ width: '100vw', height: '100vh' }}>
                    <H5PPlayer
                        contentPath={content.source || ''}
                        title={content.title}
                    />
                </div>
            );
        }

        // 4. SCORM PLAYER (File Browser Mode)
        if (content.type === "scorm") {
            return (
                <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f3f4f6' }}>
                    {/* Browser Header */}
                    <div style={{ height: '50px', backgroundColor: '#1f2937', color: 'white', display: 'flex', alignItems: 'center', padding: '0 16px', justifyContent: 'space-between', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontWeight: 'bold' }}>📂 {content.title} - Dosya Gezgini</span>
                            {currentBrowserPath && currentBrowserPath !== '/uploads' && (
                                <button
                                    onClick={() => fetchFiles(currentBrowserPath + '/..')}
                                    style={{ background: '#374151', border: 'none', color: 'white', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                                >
                                    ⬆ Üst Dizin
                                </button>
                            )}
                        </div>
                    </div>

                    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                        {/* File List Sidebar */}
                        <div style={{ width: '200px', minWidth: '200px', backgroundColor: '#e5e7eb', borderRight: '1px solid #d1d5db', overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column' }}>
                            {browserLoading ? (
                                <div style={{ padding: '10px', textAlign: 'center' }}>Yükleniyor...</div>
                            ) : (
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                    {fileList.map((file, idx) => (
                                        <li
                                            key={idx}
                                            onClick={() => handleFileClick(file)}
                                            style={{
                                                padding: '8px',
                                                cursor: 'pointer',
                                                backgroundColor: selectedFile === `${apiBaseUrl}${file.path}` ? '#bfdbfe' : 'transparent',
                                                borderBottom: '1px solid #d1d5db',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                color: 'black'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#dbeafe'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = selectedFile === `${apiBaseUrl}${file.path}` ? '#bfdbfe' : 'transparent'}
                                        >
                                            <span>{file.type === 'directory' ? '📁' : '📄'}</span>
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '14px' }}>{file.name}</span>
                                        </li>
                                    ))}
                                    {fileList.length === 0 && (
                                        <div style={{ padding: '10px', color: '#6b7280', fontSize: '12px' }}>
                                            <p style={{ marginBottom: '5px' }}>Dosya yok veya yüklenemedi.</p>
                                            <p style={{ color: '#ef4444', wordBreak: 'break-all' }}>
                                                <strong>Debug:</strong> {debugInfo || 'Henüz istek yapılmadı'}
                                            </p>
                                            <p style={{ marginTop: '5px', color: '#3b82f6', wordBreak: 'break-all' }}>
                                                <strong>Source:</strong> {content.source || '(boş)'}
                                            </p>
                                        </div>
                                    )}
                                </ul>
                            )}
                        </div>

                        {/* Preview Pane */}
                        <div style={{ flex: 1, position: 'relative', backgroundColor: 'white' }}>
                            {selectedFile ? (
                                <iframe
                                    src={selectedFile}
                                    style={{ width: '100%', height: '100%', border: 'none' }}
                                    allowFullScreen
                                />
                            ) : (
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#6b7280', flexDirection: 'column' }}>
                                    <p style={{ fontSize: '40px' }}>👈</p>
                                    <p>Görüntülemek için soldan bir dosya seçin.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            );
        }

        // 5. LIVE CLASS
        if (content.type === "live_class") {
            return (
                <div className="live-class-container w-full h-full flex flex-col items-center justify-center p-8 bg-gray-50 rounded-lg text-center">
                    <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full">
                        <span className="text-4xl mb-4 block">📹</span>
                        <h3 className="text-2xl font-bold mb-2 text-gray-800">Canlı Ders: {content.title}</h3>
                        <p className="mb-8 text-gray-500">Bu ders harici bir platformda (Jitsi/Zoom) yapılmaktadır.</p>
                        <a
                            href={content.source}
                            target="_blank"
                            rel="noreferrer"
                            className="w-full block bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-transform transform active:scale-95"
                            onClick={onComplete}
                        >
                            Derse Katıl
                        </a>
                    </div>
                </div>
            )
        }

        return (
            <div className="flex flex-col items-center justify-center h-64 bg-gray-100 rounded text-gray-500">
                <p>Desteklenmeyen içerik türü: <b>{content.type}</b></p>
                <a href={content.source} target="_blank" rel="noreferrer" className="text-blue-600 underline mt-2">
                    Dosyayı İndir/Görüntüle
                </a>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full gap-2">
            {/* Toolbar */}
            <div className="flex justify-end px-2">
                <button
                    onClick={() => setShowNotes(!showNotes)}
                    className="flex items-center gap-2 px-3 py-1 bg-yellow-100 text-yellow-700 rounded border border-yellow-300 hover:bg-yellow-200 text-sm"
                >
                    📝 {showNotes ? "Notları Gizle" : "Notlar"}
                </button>
            </div>

            <div className="flex flex-1 gap-4 overflow-hidden">
                <div className="flex-1 overflow-auto">
                    {renderContent()}
                </div>

                {showNotes && (
                    <NotesPanel
                        contentId={content.id}
                        contentType={content.type}
                        apiBaseUrl={apiBaseUrl}
                        token={token}
                        getCurrentTime={content.type === 'video' ? getCurrentTime : undefined}
                        onSeek={handleSeek}
                    />
                )}
            </div>
        </div>
    );
}

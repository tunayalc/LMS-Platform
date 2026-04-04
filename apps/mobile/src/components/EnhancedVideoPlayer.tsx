import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import Slider from '@react-native-community/slider';
import { ProgressTracker } from '../utils/progressTracker';

interface EnhancedVideoPlayerProps {
    source: { uri: string };
    title?: string;
    subtitles?: { language: string; uri: string }[];
    contentId?: string;
    onClose?: () => void;
}

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export default function EnhancedVideoPlayer({
    source,
    title,
    subtitles,
    contentId,
    onClose,
}: EnhancedVideoPlayerProps) {
    const videoRef = useRef<Video>(null);
    const [status, setStatus] = useState<AVPlaybackStatus | null>(null);
    const [showControls, setShowControls] = useState(true);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [showSpeedMenu, setShowSpeedMenu] = useState(false);
    const [selectedSubtitle, setSelectedSubtitle] = useState<string | null>(null);
    const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const pendingSeekMillisRef = useRef<number | null>(null);
    const hasAppliedInitialSeekRef = useRef(false);
    const lastSavedSecondRef = useRef(0);

    const isPlaying = status?.isLoaded && status.isPlaying;
    const position = status?.isLoaded ? status.positionMillis : 0;
    const duration = status?.isLoaded ? status.durationMillis || 0 : 0;

    useEffect(() => {
        let cancelled = false;
        if (!contentId) return;
        ProgressTracker.getProgress(contentId).then((saved) => {
            if (cancelled) return;
            if (saved && saved.type === 'video' && typeof saved.progress === 'number') {
                pendingSeekMillisRef.current = Math.max(0, Math.floor(saved.progress * 1000));
            }
        });
        return () => {
            cancelled = true;
        };
    }, [contentId]);

    const formatTime = (millis: number) => {
        const totalSeconds = Math.floor(millis / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const togglePlayPause = useCallback(async () => {
        if (!videoRef.current) return;
        if (isPlaying) {
            await videoRef.current.pauseAsync();
        } else {
            await videoRef.current.playAsync();
        }
    }, [isPlaying]);

    const handleSeek = useCallback(async (value: number) => {
        if (!videoRef.current || !duration) return;
        const seekPosition = value * duration;
        await videoRef.current.setPositionAsync(seekPosition);
    }, [duration]);

    const changeSpeed = useCallback(async (speed: number) => {
        if (!videoRef.current) return;
        await videoRef.current.setRateAsync(speed, true);
        setPlaybackSpeed(speed);
        setShowSpeedMenu(false);
    }, []);

    const skip = useCallback(async (seconds: number) => {
        if (!videoRef.current) return;
        const newPosition = position + seconds * 1000;
        await videoRef.current.setPositionAsync(Math.max(0, Math.min(newPosition, duration)));
    }, [position, duration]);

    const handlePlaybackStatusUpdate = useCallback(
        async (next: AVPlaybackStatus) => {
            setStatus(next);

            if (!next.isLoaded) return;
            if (errorMessage) {
                setErrorMessage(null);
            }

            if (!hasAppliedInitialSeekRef.current && pendingSeekMillisRef.current !== null && videoRef.current) {
                hasAppliedInitialSeekRef.current = true;
                const seekTo = Math.min(pendingSeekMillisRef.current, next.durationMillis ?? pendingSeekMillisRef.current);
                pendingSeekMillisRef.current = null;
                try {
                    await videoRef.current.setPositionAsync(seekTo);
                } catch {
                    // ignore seek errors
                }
            }

            if (!contentId) return;
            const posMs = next.positionMillis ?? 0;
            const durMs = next.durationMillis ?? 0;
            const posSec = Math.floor(posMs / 1000);
            const durSec = Math.floor(durMs / 1000);
            if (durSec <= 0) return;

            const shouldSave = posSec - lastSavedSecondRef.current >= 5 || posSec >= durSec - 2;
            if (!shouldSave) return;
            lastSavedSecondRef.current = posSec;

            await ProgressTracker.trackVideoLocal(contentId, posSec, durSec);
        },
        [contentId]
    );

    const handleClose = useCallback(async () => {
        if (contentId && status?.isLoaded) {
            const posSec = Math.floor((status.positionMillis ?? 0) / 1000);
            const durSec = Math.floor((status.durationMillis ?? 0) / 1000);
            if (durSec > 0) {
                await ProgressTracker.trackVideoLocal(contentId, posSec, durSec);
            }
        }
        onClose?.();
    }, [contentId, onClose, status]);

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                {onClose && (
                    <Pressable style={styles.closeBtn} onPress={() => void handleClose()}>
                        <Text style={styles.closeBtnText}>✕</Text>
                    </Pressable>
                )}
                {title && <Text style={styles.titleText} numberOfLines={1}>{title}</Text>}
            </View>

            {/* Video */}
            <Pressable style={styles.videoWrapper} onPress={() => setShowControls(!showControls)}>
                <Video
                    ref={videoRef}
                    source={source}
                    style={styles.video}
                    resizeMode={ResizeMode.CONTAIN}
                    shouldPlay={false}
                    isLooping={false}
                    onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
                    onError={(e) => {
                        const msg = (e as any)?.nativeEvent?.error ?? 'Video oynatılamadı.';
                        setErrorMessage(String(msg));
                    }}
                    useNativeControls={false}
                />

                {/* Overlay Controls */}
                {showControls && (
                    <View style={styles.overlay}>
                        {/* Center Controls */}
                        <View style={styles.centerControls}>
                            <Pressable style={styles.skipBtn} onPress={() => skip(-10)}>
                                <Text style={styles.skipBtnText}>-10s</Text>
                            </Pressable>
                            <Pressable style={styles.playBtn} onPress={togglePlayPause}>
                                <Text style={styles.playBtnText}>{isPlaying ? '⏸' : '▶️'}</Text>
                            </Pressable>
                            <Pressable style={styles.skipBtn} onPress={() => skip(10)}>
                                <Text style={styles.skipBtnText}>+10s</Text>
                            </Pressable>
                        </View>

                        {/* Bottom Bar */}
                        <View style={styles.bottomBar}>
                            <Text style={styles.timeText}>{formatTime(position)}</Text>
                            <Slider
                                style={styles.slider}
                                minimumValue={0}
                                maximumValue={1}
                                value={duration ? position / duration : 0}
                                onSlidingComplete={handleSeek}
                                minimumTrackTintColor="#2563eb"
                                maximumTrackTintColor="#94a3b8"
                                thumbTintColor="#2563eb"
                            />
                            <Text style={styles.timeText}>{formatTime(duration)}</Text>
                        </View>

                        {/* Speed & Subtitle Controls */}
                        <View style={styles.extraControls}>
                            {/* Speed Control */}
                            <Pressable
                                style={styles.controlBtn}
                                onPress={() => {
                                    setShowSpeedMenu(!showSpeedMenu);
                                    setShowSubtitleMenu(false);
                                }}
                            >
                                <Text style={styles.controlBtnText}>{playbackSpeed}x</Text>
                            </Pressable>

                            {/* Subtitle Control */}
                            {subtitles && subtitles.length > 0 && (
                                <Pressable
                                    style={styles.controlBtn}
                                    onPress={() => {
                                        setShowSubtitleMenu(!showSubtitleMenu);
                                        setShowSpeedMenu(false);
                                    }}
                                >
                                    <Text style={styles.controlBtnText}>CC</Text>
                                </Pressable>
                            )}
                        </View>

                        {/* Speed Menu */}
                        {showSpeedMenu && (
                            <View style={styles.menuPopup}>
                                <Text style={styles.menuTitle}>Hız</Text>
                                {PLAYBACK_SPEEDS.map((speed) => (
                                    <Pressable
                                        key={speed}
                                        style={[styles.menuItem, playbackSpeed === speed && styles.menuItemActive]}
                                        onPress={() => changeSpeed(speed)}
                                    >
                                        <Text style={[styles.menuItemText, playbackSpeed === speed && styles.menuItemTextActive]}>
                                            {speed}x
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        )}

                        {/* Subtitle Menu */}
                        {showSubtitleMenu && subtitles && (
                            <View style={styles.menuPopup}>
                                <Text style={styles.menuTitle}>Altyazı</Text>
                                <Pressable
                                    style={[styles.menuItem, !selectedSubtitle && styles.menuItemActive]}
                                    onPress={() => {
                                        setSelectedSubtitle(null);
                                        setShowSubtitleMenu(false);
                                    }}
                                >
                                    <Text style={[styles.menuItemText, !selectedSubtitle && styles.menuItemTextActive]}>
                                        Kapalı
                                    </Text>
                                </Pressable>
                                {subtitles.map((sub) => (
                                    <Pressable
                                        key={sub.language}
                                        style={[styles.menuItem, selectedSubtitle === sub.language && styles.menuItemActive]}
                                        onPress={() => {
                                            setSelectedSubtitle(sub.language);
                                            setShowSubtitleMenu(false);
                                        }}
                                    >
                                        <Text style={[styles.menuItemText, selectedSubtitle === sub.language && styles.menuItemTextActive]}>
                                            {sub.language}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        )}
                    </View>
                )}

                {errorMessage && (
                    <View style={styles.errorOverlay}>
                        <Text style={styles.errorTitle}>Video Hatası</Text>
                        <Text style={styles.errorText} numberOfLines={6}>
                            {errorMessage}
                        </Text>
                        <Text style={styles.errorHint} numberOfLines={3}>
                            Kaynak: {source?.uri}
                        </Text>
                    </View>
                )}
            </Pressable>
        </View>
    );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    header: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
    closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    closeBtnText: { color: '#fff', fontSize: 24 },
    titleText: { color: '#fff', fontSize: 16, fontWeight: '600', flex: 1 },
    videoWrapper: { flex: 1, justifyContent: 'center' },
    video: { width: '100%', height: '100%' },
    overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center' },
    centerControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 },
    playBtn: { width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    playBtnText: { fontSize: 32 },
    skipBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    skipBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
    bottomBar: { position: 'absolute', bottom: 60, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
    timeText: { color: '#fff', fontSize: 12, minWidth: 40 },
    slider: { flex: 1, height: 40 },
    extraControls: { position: 'absolute', bottom: 16, right: 16, flexDirection: 'row', gap: 12 },
    controlBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4 },
    controlBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
    menuPopup: { position: 'absolute', bottom: 80, right: 16, backgroundColor: '#1e293b', borderRadius: 8, padding: 8, minWidth: 100 },
    menuTitle: { color: '#94a3b8', fontSize: 12, marginBottom: 8, paddingHorizontal: 8 },
    menuItem: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 4 },
    menuItemActive: { backgroundColor: '#2563eb' },
    menuItemText: { color: '#fff', fontSize: 14 },
    menuItemTextActive: { fontWeight: '600' },
    errorOverlay: {
        position: 'absolute',
        top: 70,
        left: 16,
        right: 16,
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: 'rgba(248,113,113,0.4)'
    },
    errorTitle: { color: '#fecaca', fontSize: 14, fontWeight: '700', marginBottom: 6 },
    errorText: { color: '#fff', fontSize: 12, marginBottom: 8 },
    errorHint: { color: '#94a3b8', fontSize: 11 },
});

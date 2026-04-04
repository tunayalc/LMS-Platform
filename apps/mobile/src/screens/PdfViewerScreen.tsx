import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions, ActivityIndicator, Alert, Linking, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import Slider from '@react-native-community/slider';
import { ProgressTracker } from '../utils/progressTracker';
import { OfflineManager } from '../utils/offline';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface EnhancedPdfViewerProps {
    navigation?: { goBack: () => void };
    route?: { params: { uri: string; title?: string; contentId?: string } };
    source?: { uri: string };
    title?: string;
    contentId?: string;
    onClose?: () => void;
    bookmarks?: { page: number; title: string }[];
    onBookmarkAdd?: (page: number) => void;
    apiClient?: any;
    token?: string;
}

export default function EnhancedPdfViewer(props: EnhancedPdfViewerProps) {
    const {
        navigation,
        route,
        bookmarks = [],
        onBookmarkAdd,
        apiClient,
    } = props;

    const source = props.source || { uri: route?.params?.uri || '' };
    const title = props.title || route?.params?.title;
    const contentId = props.contentId || route?.params?.contentId;
    const onClose = props.onClose || navigation?.goBack;

    const webViewRef = useRef<WebView>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showBookmarks, setShowBookmarks] = useState(false);
    const [localUri, setLocalUri] = useState<string | null>(null);

    // Load saved progress on mount
    useEffect(() => {
        if (contentId) {
            ProgressTracker.getProgress(contentId).then((saved) => {
                if (saved && saved.type === 'pdf') {
                    setCurrentPage(saved.progress);
                }
            });
        }
    }, [contentId]);

    useEffect(() => {
        let cancelled = false;
        if (!contentId) return;
        OfflineManager.getLocalUri(contentId).then((uri) => {
            if (cancelled) return;
            setLocalUri(uri);
        });
        return () => {
            cancelled = true;
        };
    }, [contentId]);

    // Save progress periodically
    const saveProgress = useCallback((page: number, total: number) => {
        if (contentId && apiClient) {
            ProgressTracker.trackPdf(apiClient, contentId, page, total);
        }
    }, [contentId, apiClient]);

    const handleClose = () => {
        // Save final progress before closing
        if (contentId && apiClient) {
            ProgressTracker.trackPdf(apiClient, contentId, currentPage, totalPages);
        }
        onClose?.();
    };

    const openLocalPdf = useCallback(async (uri: string) => {
        try {
            if (Platform.OS === 'android') {
                const contentUri = await FileSystem.getContentUriAsync(uri);
                await Linking.openURL(contentUri);
                return;
            }
            await Linking.openURL(uri);
        } catch (e: any) {
            Alert.alert('PDF', e?.message ? String(e.message) : 'PDF açılamadı.');
        }
    }, []);

    const handleDownload = useCallback(async () => {
        const safeId =
            contentId ||
            String(source.uri || 'pdf')
                .replace(/[^a-z0-9]+/gi, '_')
                .replace(/^_+|_+$/g, '')
                .slice(-48) ||
            `pdf_${Date.now()}`;
        if (!source.uri) {
            Alert.alert('PDF', 'PDF adresi bulunamadı.');
            return;
        }

        try {
            const token = await AsyncStorage.getItem('auth_token');
            const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
            const downloaded = await OfflineManager.downloadContent(safeId, source.uri, title || 'PDF', 'pdf', headers);
            setLocalUri(downloaded.localUri);
            Alert.alert('PDF', 'İndirildi. Açılıyor...');
            await openLocalPdf(downloaded.localUri);
        } catch (e: any) {
            const message = e?.message ? String(e.message) : 'İndirme başarısız.';
            Alert.alert('PDF İndirme', `${message}\n\nURL:\n${source.uri}`, [
                { text: 'Kapat', style: 'cancel' },
                { text: 'Tarayıcıda Aç', onPress: () => void Linking.openURL(source.uri) }
            ]);
        }
    }, [contentId, openLocalPdf, source.uri, title]);

    // Use Google Docs Viewer for PDF rendering (works in WebView without native modules)
    const pdfViewerUrl = `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(source.uri)}`;

    // Alternatively, if PDF is local or needs auth, we can use PDF.js
    const pdfJsViewerHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #f1f5f9; }
        iframe, embed, object { width: 100%; height: 100vh; border: none; }
        .loading { display: flex; justify-content: center; align-items: center; height: 100vh; font-family: sans-serif; color: #64748b; }
        .error { text-align: center; padding: 20px; color: #dc2626; font-family: sans-serif; }
    </style>
</head>
<body>
    <iframe src="${pdfViewerUrl}" allowfullscreen></iframe>
</body>
</html>
    `;

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                {onClose && (
                    <Pressable style={styles.iconBtn} onPress={handleClose}>
                        <Text style={styles.iconText}>✕</Text>
                    </Pressable>
                )}
                <Text style={styles.title} numberOfLines={1}>{title || 'PDF Görüntüleyici'}</Text>
                <View style={styles.headerActions}>
                    {localUri && (
                        <Pressable style={styles.iconBtn} onPress={() => void openLocalPdf(localUri)}>
                            <Text style={styles.iconText}>📂</Text>
                        </Pressable>
                    )}
                    <Pressable style={styles.iconBtn} onPress={() => void handleDownload()}>
                        <Text style={styles.iconText}>⬇️</Text>
                    </Pressable>
                    <Pressable style={styles.iconBtn} onPress={() => setShowBookmarks(!showBookmarks)}>
                        <Text style={styles.iconText}>📑</Text>
                    </Pressable>
                </View>
            </View>

            {/* Bookmarks Panel */}
            {showBookmarks && (
                <View style={styles.bookmarksPanel}>
                    <View style={styles.bookmarkHeader}>
                        <Text style={styles.bookmarkTitle}>Yer İmleri</Text>
                        {onBookmarkAdd && (
                            <Pressable style={styles.addBookmarkBtn} onPress={() => onBookmarkAdd(currentPage)}>
                                <Text style={styles.addBookmarkText}>+ Ekle</Text>
                            </Pressable>
                        )}
                    </View>
                    {bookmarks.length === 0 ? (
                        <Text style={styles.noBookmarks}>Henüz yer imi yok</Text>
                    ) : (
                        bookmarks.map((bm, idx) => (
                            <Pressable key={idx} style={styles.bookmarkItem} onPress={() => setCurrentPage(bm.page)}>
                                <Text style={styles.bookmarkItemText}>📌 {bm.title || `Sayfa ${bm.page}`}</Text>
                            </Pressable>
                        ))
                    )}
                </View>
            )}

            {/* PDF Content - WebView Based */}
            <View style={styles.pdfContainer}>
                {loading && (
                    <View style={styles.loadingOverlay}>
                        <ActivityIndicator size="large" color="#2563eb" />
                        <Text style={styles.loadingText}>PDF Yükleniyor...</Text>
                    </View>
                )}
                {error && (
                    <View style={styles.errorContainer}>
                        <Text style={styles.errorText}>❌ {error}</Text>
                        <Pressable style={styles.retryBtn} onPress={() => { setError(null); setLoading(true); }}>
                            <Text style={styles.retryBtnText}>Tekrar Dene</Text>
                        </Pressable>
                    </View>
                )}
                <WebView
                    ref={webViewRef}
                    source={{ html: pdfJsViewerHtml }}
                    style={styles.webview}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    scalesPageToFit={true}
                    startInLoadingState={false}
                    onLoadStart={() => setLoading(true)}
                    onLoadEnd={() => setLoading(false)}
                    onError={(syntheticEvent) => {
                        const { nativeEvent } = syntheticEvent;
                        setError(`PDF yüklenemedi: ${nativeEvent.description || 'Bilinmeyen hata'}`);
                        setLoading(false);
                    }}
                    onHttpError={(syntheticEvent) => {
                        const { nativeEvent } = syntheticEvent;
                        if (nativeEvent.statusCode >= 400) {
                            setError(`HTTP Hatası: ${nativeEvent.statusCode}`);
                        }
                    }}
                />
            </View>

            {/* Bottom Controls */}
            <View style={styles.bottomBar}>
                <View style={styles.infoRow}>
                    <Text style={styles.infoText}>📄 {title || 'PDF Dökümanı'}</Text>
                </View>
                <Text style={styles.helpText}>
                    PDF'i yakınlaştırmak için iki parmakla sıkıştırın
                </Text>
            </View>
        </View>
    );
}

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    header: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', gap: 8 },
    iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    iconText: { fontSize: 20 },
    title: { flex: 1, fontSize: 16, fontWeight: '600', color: '#0f172a' },
    headerActions: { flexDirection: 'row', gap: 4 },
    bookmarksPanel: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', backgroundColor: '#f8fafc', maxHeight: 200 },
    bookmarkHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    bookmarkTitle: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
    addBookmarkBtn: { paddingHorizontal: 12, paddingVertical: 4, backgroundColor: '#10b981', borderRadius: 4 },
    addBookmarkText: { color: '#fff', fontSize: 12, fontWeight: '600' },
    noBookmarks: { color: '#64748b', fontSize: 13, fontStyle: 'italic' },
    bookmarkItem: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
    bookmarkItemText: { fontSize: 14, color: '#2563eb' },
    pdfContainer: { flex: 1, backgroundColor: '#f1f5f9' },
    webview: { flex: 1 },
    loadingOverlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.9)',
        zIndex: 10
    },
    loadingText: { marginTop: 12, color: '#64748b' },
    errorContainer: { padding: 20, alignItems: 'center' },
    errorText: { color: '#dc2626', fontSize: 16, marginBottom: 16 },
    retryBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#2563eb', borderRadius: 8 },
    retryBtnText: { color: '#fff', fontWeight: '600' },
    bottomBar: { padding: 12, borderTopWidth: 1, borderTopColor: '#e2e8f0', backgroundColor: '#f8fafc' },
    infoRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 8 },
    infoText: { fontSize: 14, color: '#0f172a', fontWeight: '500' },
    helpText: { textAlign: 'center', fontSize: 12, color: '#64748b' },
});

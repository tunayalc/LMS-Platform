import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Image, Animated, Easing, Dimensions, TextInput, ScrollView, Switch } from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiBaseUrl, apiClient } from '../api/client';
import { useTheme } from '../contexts/ThemeContext';
import Slider from '@react-native-community/slider';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCAN_AREA_SIZE = SCREEN_WIDTH * 0.8;

export default function OpticReaderScreen({ navigation, route, token: propToken, apiBaseUrl: propApiUrl }: any) {
    const { colors } = useTheme();
    const [token, setToken] = useState<string | null>(propToken || null);
    const [baseUrl, setBaseUrl] = useState<string>(propApiUrl || apiBaseUrl || '');

    const stripDebug = (payload: any) => {
        if (!payload || typeof payload !== 'object') return payload;
        const { debug: _debug, ...rest } = payload as any;
        return rest;
    };

    // OMR settings (156-question fixed template; calibrated via OpenCV pipeline)
    const [answerKeyJson, setAnswerKeyJson] = useState<string>('');
    const [threshold, setThreshold] = useState<number>(0.22);
    const [xOffset, setXOffset] = useState<number>(0);
    const [yOffset, setYOffset] = useState<number>(0);
    const [smartAlign, setSmartAlign] = useState<boolean>(true);
    const [skipWarp, setSkipWarp] = useState<boolean>(false);
    const [showSettings, setShowSettings] = useState<boolean>(false);

    // Manual Crop Mode - Tap to select corners
    const [cropMode, setCropMode] = useState<boolean>(false);
    const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
    const [previewLayout, setPreviewLayout] = useState<{ width: number; height: number } | null>(null);
    // Corners: user taps to place each corner (TL, TR, BR, BL order)
    const [corners, setCorners] = useState<{ x: number; y: number }[]>([]);
    // Which corner is being placed next (0=TL, 1=TR, 2=BR, 3=BL)
    const [cornerIndex, setCornerIndex] = useState<number>(0);
    const cornerLabels = ['Sol Üst', 'Sağ Üst', 'Sağ Alt', 'Sol Alt'];
    const cornerColors = ['#ef4444', '#22c55e', '#3b82f6', '#f59e0b'];

    // Results + batch mode
    const [scanResult, setScanResult] = useState<any | null>(null);
    const [batchResults, setBatchResults] = useState<any[]>([]);
    const [answerKeyLoading, setAnswerKeyLoading] = useState(false);

    useEffect(() => {
        const loadAuth = async () => {
            if (!token) {
                const t = await AsyncStorage.getItem('auth_token');
                setToken(t);
            }
        };
        loadAuth();
    }, []);

    const mapDisplayPointToImagePixel = (x: number, y: number) => {
        if (!previewLayout || !imageSize) return null;

        const scale = Math.min(previewLayout.width / imageSize.width, previewLayout.height / imageSize.height);
        if (!Number.isFinite(scale) || scale <= 0) return null;

        const displayedWidth = imageSize.width * scale;
        const displayedHeight = imageSize.height * scale;
        const offsetX = (previewLayout.width - displayedWidth) / 2;
        const offsetY = (previewLayout.height - displayedHeight) / 2;

        const localX = x - offsetX;
        const localY = y - offsetY;
        if (localX < 0 || localY < 0 || localX > displayedWidth || localY > displayedHeight) {
            return null;
        }

        const px = Math.max(0, Math.min(imageSize.width - 1, localX / scale));
        const py = Math.max(0, Math.min(imageSize.height - 1, localY / scale));
        return [Math.round(px), Math.round(py)] as const;
    };

    // ... rest of component
    const [permission, requestPermission] = useCameraPermissions();
    const [facing, setFacing] = useState<CameraType>('back');
    const [photo, setPhoto] = useState<string | null>(null);
    const [processing, setProcessing] = useState(false);
    const cameraRef = useRef<CameraView>(null);

    useEffect(() => {
        if (!photo) {
            setImageSize(null);
            return;
        }
        Image.getSize(
            photo,
            (width, height) => setImageSize({ width, height }),
            () => setImageSize(null)
        );
    }, [photo]);

    // Animation for scanning line
    const scanAnim = useRef(new Animated.Value(0)).current;

    const examId = route.params?.examId; // Passed from Exam Detail

    useEffect(() => {
        const loadAnswerKey = async () => {
            if (!examId) return;
            if (answerKeyJson.trim()) return;

            const t = token || (await AsyncStorage.getItem('auth_token'));
            if (!t) return;

            setAnswerKeyLoading(true);
            try {
                const res = await apiClient.get('/questions', {
                    headers: { Authorization: `Bearer ${t}` },
                    params: { examId, limit: 500, offset: 0 }
                } as any) as any;
                const questions = Array.isArray(res?.questions) ? res.questions : [];
                const sorted = [...questions].sort((a, b) => {
                    const at = Date.parse(a?.createdAt ?? '') || 0;
                    const bt = Date.parse(b?.createdAt ?? '') || 0;
                    return at - bt;
                });
                const key: Record<string, string> = {};
                sorted.forEach((q: any, index: number) => {
                    const ans = String(q?.answer ?? '').trim().toUpperCase();
                    if (['A', 'B', 'C', 'D', 'E'].includes(ans)) {
                        key[`q_${index + 1}`] = ans;
                    }
                });
                if (Object.keys(key).length) {
                    setAnswerKeyJson(JSON.stringify(key));
                }
            } catch (e) {
                // Optional; user can paste answer key manually.
                console.log('[OMR] Failed to auto-generate answer key:', e);
            } finally {
                setAnswerKeyLoading(false);
            }
        };

        void loadAnswerKey();
    }, [answerKeyJson, examId, token]);

    useEffect(() => {
        const startAnimation = () => {
            scanAnim.setValue(0);
            Animated.loop(
                Animated.timing(scanAnim, {
                    toValue: 1,
                    duration: 3000,
                    easing: Easing.linear,
                    useNativeDriver: true,
                })
            ).start();
        };

        if (!photo) {
            startAnimation();
        } else {
            scanAnim.stopAnimation();
        }
    }, [photo]);

    if (!permission) {
        return <View />;
    }

    if (!permission.granted) {
        return (
            <View style={styles.container}>
                <Text style={styles.message}>Kamerayı kullanmak için izne ihtiyacımız var.</Text>
                <TouchableOpacity style={styles.button} onPress={requestPermission}>
                    <Text style={styles.buttonText}>İzin Ver</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const takePicture = async () => {
        if (cameraRef.current) {
            try {
                const photoData = await cameraRef.current.takePictureAsync({
                    base64: false, // We upload via URI
                    quality: 0.8,
                });
                if (photoData?.uri) {
                    setPhoto(photoData.uri);
                }
            } catch (error) {
                Alert.alert("Hata", "Fotoğraf çekilemedi.");
            }
        }
    };

    const pickFromGallery = async () => {
        try {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) {
                Alert.alert("İzin Gerekli", "Galeriden seçmek için izin vermelisin.");
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 1,
            });

            if (!result.canceled && result.assets?.length) {
                setPhoto(result.assets[0].uri);
            }
        } catch (e: any) {
            Alert.alert("Hata", e?.message || "Galeri seçimi başarısız.");
        }
    };

    const pickFromFiles = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['image/*'],
                copyToCacheDirectory: true,
            } as any);

            const uri =
                (result as any)?.assets?.[0]?.uri ||
                (result as any)?.uri ||
                null;

            if (uri) {
                setPhoto(uri);
            }
        } catch (e: any) {
            Alert.alert("Hata", e?.message || "Dosya seçimi başarısız.");
        }
    };

    const handleUpload = async () => {
        if (!examId) {
            // Exam context is optional; allow generic OMR scanning from the dashboard tab.
            console.warn('[OMR] Missing examId - running general scan.');
        }

        if (!token) {
            Alert.alert("Hata", "Önce giriş yapmalısın.");
            return;
        }

        if (!photo) {
            Alert.alert("Hata", "Önce fotoğraf çekmelisin.");
            return;
        }

        setProcessing(true);
        try {
            const normalizedBaseUrl = (baseUrl || apiBaseUrl || '').replace(/\/$/, '');
            const uploadUrl = `${normalizedBaseUrl}/api/omr/scan`;

            const parameters: Record<string, string> = {
                threshold: threshold.toString(),
                xOffset: xOffset.toString(),
                yOffset: yOffset.toString(),
                smartAlign: smartAlign ? 'true' : 'false',
                skipWarp: skipWarp ? 'true' : 'false',
                preferPython: 'true',
            };
            if (answerKeyJson.trim()) {
                parameters.answerKey = answerKeyJson.trim();
            }

            // Send manual corners if user adjusted them in crop mode
            if (corners && corners.length === 4) {
                const pixelCorners = corners
                    .map((c) => mapDisplayPointToImagePixel(c.x, c.y))
                    .filter(Boolean) as Array<readonly [number, number]>;

                if (pixelCorners.length === 4) {
                    parameters.corners = JSON.stringify(pixelCorners);
                } else {
                    Alert.alert("Uyarı", "Kırpma noktaları görüntü alanı dışında kaldı. Lütfen tekrar deneyin.");
                }
            }

            const response = await FileSystem.uploadAsync(uploadUrl, photo, {
                fieldName: 'image',
                httpMethod: 'POST',
                uploadType: FileSystem.FileSystemUploadType.MULTIPART,
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                parameters,
            });

            if (response.status === 200) {
                const result = JSON.parse(response.body);
                setScanResult(result);
            } else {
                console.error("Upload failed", response.body);
                const msg = String(response.body || "").slice(0, 400);
                Alert.alert("Hata", msg || "Tarama başarısız oldu. Lütfen tekrar deneyin.");
            }
        } catch (error: any) {
            console.error("OMR Error", error);
            Alert.alert("Hata", "Sunucu hatası: " + error.message);
        } finally {
            setProcessing(false);
        }
    };

    const handleAddToBatch = () => {
        if (!scanResult) return;
        const entry = {
            ...stripDebug(scanResult),
            examId: examId ?? null,
            capturedAt: new Date().toISOString(),
        };
        setBatchResults((prev) => [entry, ...prev]);
        setScanResult(null);
        setPhoto(null);
    };

    const handleDiscardResult = () => {
        setScanResult(null);
        setPhoto(null);
    };

    const handleExportBatch = async () => {
        try {
            const base = FileSystem.documentDirectory;
            if (!base) {
                Alert.alert("Hata", "Cihaz dosya dizini bulunamadı.");
                return;
            }

            const items = [
                ...(scanResult
                    ? [
                        {
                            ...stripDebug(scanResult),
                            examId: examId ?? null,
                            capturedAt: new Date().toISOString(),
                        },
                    ]
                    : []),
                ...batchResults.map(stripDebug),
            ];

            if (!items.length) {
                Alert.alert("Bilgi", "Batch listesi boş.");
                return;
            }

            const path = `${base}omr_batch_${Date.now()}.json`;
            await FileSystem.writeAsStringAsync(path, JSON.stringify(items, null, 2), {
                encoding: FileSystem.EncodingType.UTF8,
            });
            Alert.alert("JSON Kaydedildi", path);
        } catch (e: any) {
            console.error("Export batch failed", e);
            Alert.alert("Hata", e?.message || "JSON export başarısız.");
        }
    };

    const translateY = scanAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, SCAN_AREA_SIZE],
    });

    if (scanResult) {
        const score = scanResult.score ?? scanResult.result?.score ?? 0;
        const serviceUsed = scanResult.service_used || scanResult.serviceUsed || '';
        const warnings: string[] = Array.isArray(scanResult.warnings) ? scanResult.warnings : [];
        const meta = scanResult.meta || {};
        const debugImageBase64: string | undefined = scanResult.debug?.debugImage;
        const details: any[] = Array.isArray(scanResult.details) ? scanResult.details : [];
        const suspects = details
            .filter((d) => d?.selected && typeof d?.confidence === 'number' && d.confidence < 0.12)
            .slice(0, 20);

        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <ScrollView contentContainerStyle={styles.resultScroll}>
                    <Text style={[styles.resultTitle, { color: colors.text }]}>OMR Sonucu</Text>
                    <Text style={[styles.resultStat, { color: colors.text }]}>
                        Puan: <Text style={{ fontWeight: '800' }}>{score}</Text>
                        {!!serviceUsed && <Text style={{ color: colors.textSecondary }}>  ·  {serviceUsed}</Text>}
                    </Text>
                    <Text style={[styles.resultStat, { color: colors.textSecondary }]}>
                        İşaretlenen: {meta.markedCount ?? '?'}
                        {typeof meta.reviewCount === 'number' ? `  ·  İnceleme: ${meta.reviewCount}` : ''}
                    </Text>
                    {!!meta.cornerMode && (
                        <Text style={[styles.resultStat, { color: colors.textSecondary }]}>
                            Köşe Modu: {String(meta.cornerMode)}
                        </Text>
                    )}
                    <Text style={[styles.resultStat, { color: colors.textSecondary }]}>
                        Batch: {batchResults.length}
                    </Text>

                    {!!warnings.length && (
                        <View style={[styles.resultBox, { borderColor: colors.warning }]}>
                            <Text style={[styles.resultBoxTitle, { color: colors.warning }]}>Uyarılar</Text>
                            {warnings.slice(0, 8).map((w, idx) => (
                                <Text key={idx} style={{ color: colors.textSecondary }}>• {String(w)}</Text>
                            ))}
                        </View>
                    )}

                    {!!debugImageBase64 && (
                        <Image
                            source={{ uri: `data:image/jpeg;base64,${debugImageBase64}` }}
                            style={styles.debugPreview}
                        />
                    )}

                    {!!suspects.length && (
                        <View style={[styles.resultBox, { borderColor: colors.border }]}>
                            <Text style={[styles.resultBoxTitle, { color: colors.text }]}>Düşük Güven (ilk 20)</Text>
                            {suspects.map((d, idx) => (
                                <Text key={idx} style={{ color: colors.textSecondary }}>
                                    • Soru {d.question ?? (typeof d.questionIndex === 'number' ? d.questionIndex + 1 : '?')} → {d.selected} (conf: {d.confidence})
                                </Text>
                            ))}
                        </View>
                    )}

                    <TouchableOpacity
                        style={[styles.button, styles.exportBtn, { backgroundColor: colors.primary }]}
                        onPress={handleExportBatch}
                    >
                        <Text style={styles.buttonText}>Batch JSON Export</Text>
                    </TouchableOpacity>
                </ScrollView>

                <View style={styles.resultActions}>
                    <TouchableOpacity
                        style={[styles.button, styles.cancelBtn]}
                        onPress={handleDiscardResult}
                    >
                        <Text style={styles.buttonText}>Tekrar Çek</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.button, styles.uploadBtn, { backgroundColor: colors.success }]}
                        onPress={handleAddToBatch}
                    >
                        <Text style={styles.buttonText}>Onayla + Batch</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    if (photo) {
        return (
            <View style={styles.container}>
                <Image
                    source={{ uri: photo }}
                    style={styles.preview}
                    onLayout={(e) => {
                        const { width, height } = e.nativeEvent.layout;
                        setPreviewLayout({ width, height });
                    }}
                />

                {showSettings && (
                    <View style={[styles.settingsPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <ScrollView contentContainerStyle={styles.settingsContent} showsVerticalScrollIndicator={false}>
                            <Text style={[styles.settingsTitle, { color: colors.text }]}>OMR Ayarlari</Text>

                            <Text style={[styles.settingsLabel, { color: colors.textSecondary }]}>
                                Threshold: {threshold.toFixed(2)}
                            </Text>
                            <Slider
                                value={threshold}
                                onValueChange={setThreshold}
                                minimumValue={0.05}
                                maximumValue={0.6}
                                step={0.01}
                                minimumTrackTintColor={colors.primary}
                                maximumTrackTintColor={colors.border}
                            />

                            <Text style={[styles.settingsLabel, { color: colors.textSecondary }]}>
                                X Offset: {xOffset.toFixed(3)}
                            </Text>
                            <Slider
                                value={xOffset}
                                onValueChange={setXOffset}
                                minimumValue={-0.05}
                                maximumValue={0.05}
                                step={0.001}
                                minimumTrackTintColor={colors.primary}
                                maximumTrackTintColor={colors.border}
                            />

                            <Text style={[styles.settingsLabel, { color: colors.textSecondary }]}>
                                Y Offset: {yOffset.toFixed(3)}
                            </Text>
                            <Slider
                                value={yOffset}
                                onValueChange={setYOffset}
                                minimumValue={-0.05}
                                maximumValue={0.05}
                                step={0.001}
                                minimumTrackTintColor={colors.primary}
                                maximumTrackTintColor={colors.border}
                            />

                            <View style={styles.switchRow}>
                                <Text style={[styles.settingsLabel, { color: colors.textSecondary }]}>Smart Align</Text>
                                <Switch value={smartAlign} onValueChange={setSmartAlign} />
                            </View>
                            <View style={styles.switchRow}>
                                <Text style={[styles.settingsLabel, { color: colors.textSecondary }]}>Skip Warp</Text>
                                <Switch value={skipWarp} onValueChange={setSkipWarp} />
                            </View>

                            <View style={styles.switchRow}>
                                <Text style={[styles.settingsLabel, { color: colors.textSecondary }]}>
                                    AnswerKey (JSON)
                                </Text>
                                {!!answerKeyLoading && <ActivityIndicator size="small" color={colors.primary} />}
                            </View>
                            <TextInput
                                value={answerKeyJson}
                                onChangeText={setAnswerKeyJson}
                                placeholder='{"q_1":"A"...}'
                                placeholderTextColor={colors.textSecondary}
                                multiline
                                style={[styles.answerKeyInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                            />
                        </ScrollView>
                    </View>
                )}

                {/* Crop Mode Overlay - Tap to Place Corners */}
                {cropMode && (
                    <View
                        style={styles.cropOverlay}
                        onStartShouldSetResponder={() => true}
                        onResponderRelease={(e) => {
                            if (cornerIndex < 4) {
                                const { locationX, locationY } = e.nativeEvent;
                                setCorners(prev => [...prev, { x: locationX, y: locationY }]);
                                setCornerIndex(prev => prev + 1);
                            }
                        }}
                    >
                        <Text style={styles.cropTitle}>
                            {cornerIndex < 4
                                ? `📍 ${cornerLabels[cornerIndex]} köşesine dokun`
                                : '✅ Tüm köşeler seçildi!'}
                        </Text>
                        <Text style={styles.cropSubtitle}>
                            {cornerIndex < 4
                                ? `Köşe ${cornerIndex + 1}/4`
                                : 'Şimdi "Onayla" tıkla'}
                        </Text>

                        {/* Show placed corners as dots (no lines) */}
                        {corners.map((corner, index) => (
                            <View
                                key={index}
                                style={[
                                    styles.cornerDot,
                                    {
                                        left: corner.x - 15,
                                        top: corner.y - 15,
                                        backgroundColor: cornerColors[index],
                                    }
                                ]}
                            >
                                <Text style={styles.cornerLabel}>{index + 1}</Text>
                            </View>
                        ))}

                        {/* Crop Actions */}
                        <View style={styles.cropActions}>
                            <TouchableOpacity
                                style={[styles.button, { backgroundColor: '#6b7280' }]}
                                onPress={() => {
                                    setCropMode(false);
                                    setCorners([]);
                                    setCornerIndex(0);
                                }}
                            >
                                <Text style={styles.buttonText}>İptal</Text>
                            </TouchableOpacity>
                            {cornerIndex > 0 && (
                                <TouchableOpacity
                                    style={[styles.button, { backgroundColor: '#f59e0b' }]}
                                    onPress={() => {
                                        setCorners(prev => prev.slice(0, -1));
                                        setCornerIndex(prev => prev - 1);
                                    }}
                                >
                                    <Text style={styles.buttonText}>Geri Al</Text>
                                </TouchableOpacity>
                            )}
                            {cornerIndex === 4 && (
                                <TouchableOpacity
                                    style={[styles.button, { backgroundColor: colors.success }]}
                                    onPress={() => {
                                        setCropMode(false);
                                        Alert.alert('Köşeler Kaydedildi', 'Şimdi "Gönder" ile devam edin.');
                                    }}
                                >
                                    <Text style={styles.buttonText}>Onayla</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                )}

                <View style={styles.previewControls}>
                    <TouchableOpacity
                        style={[styles.button, styles.cancelBtn]}
                        onPress={() => { setPhoto(null); setCropMode(false); }}
                        disabled={processing}
                    >
                        <Text style={styles.buttonText}>Tekrar Çek</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.button, { backgroundColor: '#f59e0b' }]}
                        onPress={() => setCropMode(true)}
                        disabled={processing || cropMode}
                    >
                        <Text style={styles.buttonText}>Kırp</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.button, styles.settingsBtn, { backgroundColor: colors.primary }]}
                        onPress={() => setShowSettings((v) => !v)}
                        disabled={processing}
                    >
                        <Text style={styles.buttonText}>{showSettings ? 'Kapat' : 'Ayarlar'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.button, styles.uploadBtn]}
                        onPress={handleUpload}
                        disabled={processing}
                    >
                        {processing ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.buttonText}>Gönder</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        )
    }

    return (
        <View style={styles.container}>
            <CameraView style={styles.camera} facing={facing} ref={cameraRef}>
                <View style={styles.overlay}>
                    {/* Darkened Backgrounds around the scan area */}
                    <View style={styles.maskTop} />
                    <View style={styles.maskRow}>
                        <View style={styles.maskSide} />
                        <View style={styles.scanFrame}>
                            {/* Corner Markers */}
                            <View style={[styles.corner, styles.tl]} />
                            <View style={[styles.corner, styles.tr]} />
                            <View style={[styles.corner, styles.bl]} />
                            <View style={[styles.corner, styles.br]} />

                            {/* Scanning Line */}
                            <Animated.View style={[styles.scanLine, { transform: [{ translateY }] }]} />
                        </View>
                        <View style={styles.maskSide} />
                    </View>
                    <View style={styles.maskBottom}>
                        <Text style={styles.guideText}>Kağıdın 4 köşesini çerçeveye hizalayın.</Text>
                        <Text style={styles.subGuideText}>Otomatik perspektif düzeltme aktiftir.</Text>
                    </View>
                </View>

                <View style={styles.importBar}>
                    <TouchableOpacity style={styles.importBtn} onPress={pickFromGallery}>
                        <Text style={styles.importText}>Galeriden Seç</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.importBtn} onPress={pickFromFiles}>
                        <Text style={styles.importText}>Dosya Seç</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.buttonContainer}>
                    <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
                        <View style={styles.captureInner} />
                    </TouchableOpacity>
                </View>
            </CameraView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    message: {
        textAlign: 'center',
        paddingBottom: 10,
        color: '#fff',
    },
    camera: {
        flex: 1,
    },
    overlay: {
        flex: 1,
    },
    maskTop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    maskRow: {
        flexDirection: 'row',
        height: SCAN_AREA_SIZE,
    },
    maskSide: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    maskBottom: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        alignItems: 'center',
        paddingTop: 20,
    },
    scanFrame: {
        width: SCAN_AREA_SIZE,
        height: SCAN_AREA_SIZE,
        overflow: 'hidden', // Clip the scan line
    },
    corner: {
        position: 'absolute',
        width: 30,
        height: 30,
        borderColor: '#22c55e',
        borderWidth: 4,
    },
    tl: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
    tr: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
    bl: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
    br: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
    scanLine: {
        width: '100%',
        height: 2,
        backgroundColor: '#ef4444',
        shadowColor: '#ef4444',
        shadowOpacity: 0.8,
        shadowRadius: 10,
    },
    guideText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
        marginTop: 10,
    },
    subGuideText: {
        color: '#ccc',
        fontSize: 14,
        marginTop: 4,
    },
    buttonContainer: {
        position: 'absolute',
        bottom: 50,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    importBar: {
        position: 'absolute',
        bottom: 150,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 12,
        paddingHorizontal: 16,
    },
    importBtn: {
        backgroundColor: 'rgba(0,0,0,0.55)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.25)',
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 12,
    },
    importText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 13,
    },
    button: {
        padding: 15,
        borderRadius: 10,
        marginHorizontal: 10,
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 100,
    },
    cancelBtn: {
        backgroundColor: '#ef4444',
    },
    uploadBtn: {
        backgroundColor: '#22c55e',
    },
    buttonText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: 'white',
    },
    captureButton: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 4,
        borderColor: 'white',
    },
    captureInner: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#fff',
    },
    preview: {
        flex: 1,
        resizeMode: 'contain',
    },
    previewControls: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 16,
        backgroundColor: '#000',
    },

    // Result screen styles
    resultScroll: {
        padding: 16,
        paddingBottom: 24,
    },
    resultTitle: {
        fontSize: 22,
        fontWeight: '800',
        marginBottom: 10,
        textAlign: 'center',
    },
    resultStat: {
        fontSize: 15,
        marginBottom: 6,
    },
    resultBox: {
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        marginTop: 12,
    },
    resultBoxTitle: {
        fontSize: 15,
        fontWeight: '700',
        marginBottom: 8,
    },
    debugPreview: {
        width: '100%',
        height: 360,
        borderRadius: 12,
        marginTop: 12,
    },
    resultActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 16,
    },
    exportBtn: {
        width: '100%',
        marginHorizontal: 0,
        marginTop: 16,
    },

    // Settings panel on preview screen
    settingsPanel: {
        position: 'absolute',
        left: 16,
        right: 16,
        top: 16,
        maxHeight: 380,
        borderWidth: 1,
        borderRadius: 16,
        overflow: 'hidden',
    },
    settingsContent: {
        padding: 12,
        paddingBottom: 16,
    },
    settingsTitle: {
        fontSize: 18,
        fontWeight: '800',
        marginBottom: 12,
    },
    settingsLabel: {
        fontSize: 13,
        fontWeight: '600',
        marginTop: 10,
        marginBottom: 6,
    },
    switchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 10,
    },
    answerKeyInput: {
        borderWidth: 1,
        borderRadius: 12,
        padding: 10,
        minHeight: 110,
        textAlignVertical: 'top',
    },
    settingsBtn: {},

    // Crop Mode Styles
    cropOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.25)',
        justifyContent: 'flex-start',
        alignItems: 'center',
        paddingTop: 60,
    },
    cropTitle: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '800',
        marginBottom: 8,
    },
    cropSubtitle: {
        color: '#ccc',
        fontSize: 14,
        marginBottom: 20,
    },
    cornerHandle: {
        position: 'absolute',
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
        borderColor: '#fff',
    },
    cornerDot: {
        position: 'absolute',
        width: 30,
        height: 30,
        borderRadius: 15,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#fff',
    },
    cornerLabel: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '700',
    },
    cropActions: {
        position: 'absolute',
        bottom: 100,
        flexDirection: 'row',
        gap: 16,
    },
});

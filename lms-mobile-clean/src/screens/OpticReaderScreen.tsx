import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Image, Animated, Easing, Dimensions, Switch } from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { FileSystemUploadType, uploadAsync } from 'expo-file-system/legacy';
import { useTheme } from '../contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import Slider from '@react-native-community/slider';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
// A4 portrait-ish guide. (width / height)
const PAPER_ASPECT = 210 / 297;
const MAX_FRAME_WIDTH = SCREEN_WIDTH * 0.88;
const MAX_FRAME_HEIGHT = SCREEN_HEIGHT * 0.55;
const SCAN_FRAME_WIDTH = Math.min(MAX_FRAME_WIDTH, MAX_FRAME_HEIGHT * PAPER_ASPECT);
const SCAN_FRAME_HEIGHT = SCAN_FRAME_WIDTH / PAPER_ASPECT;

export default function OpticReaderScreen({ navigation, route, token, apiBaseUrl }: any) {
    const { colors, isDark } = useTheme();
    const { t } = useTranslation();
    const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
    const [permission, requestPermission] = useCameraPermissions();
    const [facing, setFacing] = useState<CameraType>('back');
    const [photo, setPhoto] = useState<string | null>(null);
    const [processing, setProcessing] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    // Calibration settings (sent as multipart fields; backend may ignore unknown fields safely)
    const [threshold, setThreshold] = useState(0.35);
    const [xOffset, setXOffset] = useState(0);
    const [yOffset, setYOffset] = useState(0);
    const [smartAlign, setSmartAlign] = useState(true);
    const [skipWarp, setSkipWarp] = useState(false);
    const [debug, setDebug] = useState(false);
    const cameraRef = useRef<CameraView>(null);

    // Animation for scanning line
    const scanAnim = useRef(new Animated.Value(0)).current;

    const examId = route.params?.examId; // Passed from Exam Detail

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
            <View style={styles.permissionContainer}>
                <Text style={styles.permissionMessage}>{t('camera_permission_required')}</Text>
                <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
                    <Text style={styles.permissionButtonText}>{t('grant_permission')}</Text>
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
                Alert.alert(t('error'), t('photo_capture_failed'));
            }
        }
    };

    const handleUpload = async () => {
        if (!examId) {
            Alert.alert(t('error'), t('exam_id_missing'));
            return;
        }

        setProcessing(true);
        try {
            const uploadUrl = `${apiBaseUrl}/exams/${examId}/omr/scan`;

            const response = await uploadAsync(uploadUrl, photo!, {
                fieldName: 'paper',
                httpMethod: 'POST',
                uploadType: FileSystemUploadType.MULTIPART,
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                parameters: {
                    threshold: String(threshold),
                    xOffset: String(xOffset),
                    yOffset: String(yOffset),
                    smartAlign: smartAlign ? 'true' : 'false',
                    skipWarp: skipWarp ? 'true' : 'false',
                    debug: debug ? 'true' : 'false',
                }
            });

            if (response.status === 200) {
                const result = JSON.parse(response.body);
                // Result contains { result: { score, details... } }
                const score = result.result?.score ?? 0;

                Alert.alert(
                    t('success'),
                    `${t('sheet_scanned')}\n${t('score')}: ${score} / 30`,
                    [
                        {
                            text: t('close'),
                            onPress: () => {
                                setPhoto(null);
                                navigation.goBack();
                            },
                            style: 'cancel'
                        },
                        {
                            text: t('next_sheet'),
                            onPress: () => {
                                setPhoto(null);
                            }
                        }
                    ]
                );
            } else {
                console.error("Upload failed", response.body);
                Alert.alert(t('error'), t('scan_failed_try_again'));
            }
        } catch (error: any) {
            console.error("OMR Error", error);
            Alert.alert(t('error'), `${t('error')}: ${error.message}`);
        } finally {
            setProcessing(false);
        }
    };

    const translateY = scanAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, SCAN_FRAME_HEIGHT],
    });

    if (photo) {
        return (
            <View style={styles.container}>
                <Image source={{ uri: photo }} style={styles.preview} />
                <View style={styles.previewControls}>
                    <TouchableOpacity
                        style={[styles.button, styles.cancelBtn]}
                        onPress={() => setPhoto(null)}
                        disabled={processing}
                    >
                        <Text style={styles.buttonText}>{t('retake_photo')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.button, styles.uploadBtn]}
                        onPress={handleUpload}
                        disabled={processing}
                    >
                        {processing ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.buttonText}>{t('upload_and_grade')}</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        )
    }

    return (
        <View style={styles.container}>
            <CameraView style={styles.camera} facing={facing} ref={cameraRef}>
                <TouchableOpacity
                    style={styles.settingsButton}
                    onPress={() => setShowSettings((prev) => !prev)}
                >
                    <Ionicons name="settings-outline" size={22} color="white" />
                </TouchableOpacity>

                {showSettings && (
                    <View style={styles.settingsPanel}>
                        <Text style={styles.settingsTitle}>{t('omr_scan')}</Text>

                        <View style={styles.settingRow}>
                            <Text style={styles.settingLabel}>
                                {t('omr_threshold_label')}: {threshold.toFixed(2)}
                            </Text>
                            <Slider
                                style={styles.slider}
                                minimumValue={0.05}
                                maximumValue={0.6}
                                step={0.01}
                                value={threshold}
                                onValueChange={setThreshold}
                                minimumTrackTintColor={colors.primary}
                                maximumTrackTintColor="rgba(255,255,255,0.35)"
                                thumbTintColor={colors.primary}
                            />
                        </View>

                        <View style={styles.settingRow}>
                            <Text style={styles.settingLabel}>
                                {t('omr_x_offset_label')}: {xOffset.toFixed(3)}
                            </Text>
                            <Slider
                                style={styles.slider}
                                minimumValue={-0.05}
                                maximumValue={0.05}
                                step={0.001}
                                value={xOffset}
                                onValueChange={setXOffset}
                                minimumTrackTintColor={colors.primary}
                                maximumTrackTintColor="rgba(255,255,255,0.35)"
                                thumbTintColor={colors.primary}
                            />
                        </View>

                        <View style={styles.settingRow}>
                            <Text style={styles.settingLabel}>
                                {t('omr_y_offset_label')}: {yOffset.toFixed(3)}
                            </Text>
                            <Slider
                                style={styles.slider}
                                minimumValue={-0.05}
                                maximumValue={0.05}
                                step={0.001}
                                value={yOffset}
                                onValueChange={setYOffset}
                                minimumTrackTintColor={colors.primary}
                                maximumTrackTintColor="rgba(255,255,255,0.35)"
                                thumbTintColor={colors.primary}
                            />
                        </View>

                        <View style={styles.toggleRow}>
                            <Text style={styles.toggleLabel}>{t('omr_smart_align_label')}</Text>
                            <Switch value={smartAlign} onValueChange={setSmartAlign} />
                        </View>
                        <View style={styles.toggleRow}>
                            <Text style={styles.toggleLabel}>{t('omr_skip_warp_label')}</Text>
                            <Switch value={skipWarp} onValueChange={setSkipWarp} />
                        </View>
                        <View style={styles.toggleRow}>
                            <Text style={styles.toggleLabel}>{t('omr_debug_label')}</Text>
                            <Switch value={debug} onValueChange={setDebug} />
                        </View>
                    </View>
                )}

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
                        <Text style={styles.guideText}>{t('omr_align_corners')}</Text>
                        <Text style={styles.subGuideText}>{t('omr_perspective_active')}</Text>
                    </View>
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

type ThemeColors = ReturnType<typeof useTheme>['colors'];

const createStyles = (colors: ThemeColors, isDark: boolean) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: '#000',
        },
        permissionContainer: {
            flex: 1,
            backgroundColor: colors.background,
            justifyContent: 'center',
            padding: 20,
        },
        permissionMessage: {
            textAlign: 'center',
            paddingBottom: 12,
            color: colors.text,
        },
        permissionButton: {
            alignSelf: 'center',
            paddingVertical: 12,
            paddingHorizontal: 18,
            borderRadius: 12,
            backgroundColor: colors.primary,
        },
        permissionButtonText: {
            fontSize: 16,
            fontWeight: '700',
            color: colors.primaryText,
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
            height: SCAN_FRAME_HEIGHT,
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
            width: SCAN_FRAME_WIDTH,
            height: SCAN_FRAME_HEIGHT,
            overflow: 'hidden',
        },
        corner: {
            position: 'absolute',
            width: 30,
            height: 30,
            borderColor: colors.success,
            borderWidth: 4,
        },
        tl: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
        tr: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
        bl: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
        br: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
        scanLine: {
            width: '100%',
            height: 2,
            backgroundColor: colors.primary,
            shadowColor: colors.primary,
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
            color: 'rgba(255,255,255,0.82)',
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
        button: {
            padding: 15,
            borderRadius: 10,
            marginHorizontal: 10,
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 100,
        },
        cancelBtn: {
            backgroundColor: colors.error,
        },
        uploadBtn: {
            backgroundColor: colors.success,
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
            justifyContent: 'center',
            padding: 20,
            backgroundColor: '#000',
        },
        settingsButton: {
            position: 'absolute',
            top: 40,
            right: 18,
            zIndex: 20,
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: 'rgba(0,0,0,0.5)',
            alignItems: 'center',
            justifyContent: 'center',
        },
        settingsPanel: {
            position: 'absolute',
            top: 90,
            right: 18,
            left: 18,
            zIndex: 20,
            padding: 14,
            borderRadius: 14,
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.9)' : 'rgba(15, 23, 42, 0.85)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.18)',
        },
        settingsTitle: {
            color: 'white',
            fontWeight: '700',
            marginBottom: 10,
        },
        settingRow: {
            marginBottom: 10,
        },
        settingLabel: {
            color: 'rgba(255,255,255,0.92)',
            fontSize: 12,
            marginBottom: 6,
        },
        slider: {
            width: '100%',
            height: 28,
        },
        toggleRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 6,
        },
        toggleLabel: {
            color: 'rgba(255,255,255,0.92)',
            fontSize: 13,
        }
    });

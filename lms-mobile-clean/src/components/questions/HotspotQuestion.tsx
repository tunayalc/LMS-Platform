/**
 * Hotspot Question Component for React Native
 */

import React, { useState } from 'react';
import { View, Text, Image, TouchableWithoutFeedback, StyleSheet, Dimensions } from 'react-native';

interface Region {
    id: string;
    type: 'circle' | 'rectangle';
    x: number;
    y: number;
    radius?: number;
    width?: number;
    height?: number;
}

interface HotspotQuestionProps {
    imageUrl: string;
    regions?: Region[];
    value: { x: number; y: number } | null;
    onChange: (point: { x: number; y: number }) => void;
    disabled?: boolean;
    showCorrect?: boolean;
    correctRegionId?: string;
}

export function HotspotQuestion({
    imageUrl,
    regions = [],
    value = null,
    onChange,
    disabled = false,
    showCorrect = false,
    correctRegionId
}: HotspotQuestionProps) {
    const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

    const handlePress = (event: any) => {
        if (disabled) return;

        const { locationX, locationY } = event.nativeEvent;
        onChange({ x: Math.round(locationX), y: Math.round(locationY) });
    };

    const isPointInRegion = (point: { x: number; y: number }, region: Region): boolean => {
        if (region.type === 'circle') {
            const dx = point.x - region.x;
            const dy = point.y - region.y;
            return Math.sqrt(dx * dx + dy * dy) <= (region.radius || 0);
        } else if (region.type === 'rectangle') {
            return point.x >= region.x &&
                point.x <= region.x + (region.width || 0) &&
                point.y >= region.y &&
                point.y <= region.y + (region.height || 0);
        }
        return false;
    };

    const getClickedRegion = (): string | null => {
        if (!value) return null;
        for (const region of regions) {
            if (isPointInRegion(value, region)) {
                return region.id;
            }
        }
        return null;
    };

    const clickedRegion = getClickedRegion();
    const isCorrect = showCorrect && clickedRegion === correctRegionId;
    const isIncorrect = showCorrect && value !== null && clickedRegion !== correctRegionId;

    return (
        <View style={styles.container}>
            <Text style={styles.helper}>Resim üzerinde doğru noktaya dokunun</Text>

            <TouchableWithoutFeedback onPress={handlePress} disabled={disabled}>
                <View style={[
                    styles.imageContainer,
                    isCorrect && styles.imageContainerCorrect,
                    isIncorrect && styles.imageContainerIncorrect
                ]}>
                    <Image
                        source={{ uri: imageUrl }}
                        style={styles.image}
                        resizeMode="contain"
                        onLoad={(e) => {
                            const { width, height } = e.nativeEvent.source;
                            const screenWidth = Dimensions.get('window').width - 48;
                            const scale = screenWidth / width;
                            setImageSize({ width: screenWidth, height: height * scale });
                        }}
                    />

                    {/* User click marker */}
                    {value && (
                        <View
                            style={[
                                styles.marker,
                                isCorrect && styles.markerCorrect,
                                isIncorrect && styles.markerIncorrect,
                                { left: value.x - 10, top: value.y - 10 }
                            ]}
                        />
                    )}

                    {/* Show correct region in review mode */}
                    {showCorrect && regions.map(region => {
                        if (region.id !== correctRegionId) return null;

                        if (region.type === 'circle') {
                            return (
                                <View
                                    key={region.id}
                                    style={[
                                        styles.correctRegion,
                                        {
                                            left: region.x - (region.radius || 0),
                                            top: region.y - (region.radius || 0),
                                            width: (region.radius || 0) * 2,
                                            height: (region.radius || 0) * 2,
                                            borderRadius: region.radius || 0,
                                        }
                                    ]}
                                />
                            );
                        }
                        return null;
                    })}
                </View>
            </TouchableWithoutFeedback>

            {showCorrect && value && (
                <View style={[styles.feedback, isCorrect ? styles.feedbackCorrect : styles.feedbackIncorrect]}>
                    <Text style={styles.feedbackText}>
                        {isCorrect ? '✓ Doğru bölge!' : '✗ Yanlış bölge'}
                    </Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 12,
    },
    helper: {
        fontSize: 14,
        color: '#6b7280',
        marginBottom: 12,
        textAlign: 'center',
    },
    imageContainer: {
        position: 'relative',
        borderWidth: 2,
        borderColor: '#e5e7eb',
        borderRadius: 8,
        overflow: 'hidden',
        backgroundColor: '#f9fafb',
        minHeight: 200,
    },
    imageContainerCorrect: {
        borderColor: '#10b981',
    },
    imageContainerIncorrect: {
        borderColor: '#ef4444',
    },
    image: {
        width: '100%',
        height: 250,
    },
    marker: {
        position: 'absolute',
        width: 20,
        height: 20,
        backgroundColor: '#3b82f6',
        borderWidth: 3,
        borderColor: 'white',
        borderRadius: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 5,
    },
    markerCorrect: {
        backgroundColor: '#10b981',
    },
    markerIncorrect: {
        backgroundColor: '#ef4444',
    },
    correctRegion: {
        position: 'absolute',
        backgroundColor: 'rgba(16, 185, 129, 0.3)',
        borderWidth: 2,
        borderColor: '#10b981',
    },
    feedback: {
        marginTop: 12,
        padding: 12,
        borderRadius: 8,
    },
    feedbackCorrect: {
        backgroundColor: '#d1fae5',
    },
    feedbackIncorrect: {
        backgroundColor: '#fee2e2',
    },
    feedbackText: {
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center',
    },
});

export default HotspotQuestion;

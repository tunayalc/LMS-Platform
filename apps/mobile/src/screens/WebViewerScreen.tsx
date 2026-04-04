import React from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';

type WebViewerRoute = RouteProp<RootStackParamList, 'WebViewer'>;

interface WebViewerScreenProps {
  route: WebViewerRoute;
  navigation: { goBack: () => void };
}

export default function WebViewerScreen({ route }: WebViewerScreenProps) {
  const { colors } = useTheme();
  const { uri } = route.params;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <WebView source={{ uri }} style={styles.webview} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 },
});


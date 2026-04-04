import React from 'react';
import { View, StyleSheet } from 'react-native';
import { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import EnhancedVideoPlayer from '../components/EnhancedVideoPlayer';

type VideoPlayerRoute = RouteProp<RootStackParamList, 'VideoPlayer'>;

interface VideoPlayerScreenProps {
  route: VideoPlayerRoute;
  navigation: { goBack: () => void };
}

export default function VideoPlayerScreen({ route, navigation }: VideoPlayerScreenProps) {
  const { url, title, contentId } = route.params;

  return (
    <View style={styles.container}>
      <EnhancedVideoPlayer
        source={{ uri: url }}
        title={title}
        contentId={contentId}
        onClose={() => navigation.goBack()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});

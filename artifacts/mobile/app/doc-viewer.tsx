import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { getApiBase } from '@/constants/config';

function buildDocUrl(objectPath: string): string {
  return `${getApiBase()}/api/storage${objectPath}`;
}

function isImage(contentType: string): boolean {
  return contentType.startsWith('image/');
}

function isPdf(contentType: string): boolean {
  return contentType === 'application/pdf';
}

function getGoogleDocsViewerUrl(fileUrl: string): string {
  return `https://docs.google.com/viewer?url=${encodeURIComponent(fileUrl)}&embedded=true`;
}

function triggerWebDownload(url: string, fileName: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function WebViewer({
  url,
  contentType,
  fileName,
}: {
  url: string;
  contentType: string;
  fileName: string;
}) {
  const [loaded, setLoaded] = useState(false);

  if (isImage(contentType)) {
    return (
      <Image
        source={{ uri: url }}
        style={{ flex: 1, width: '100%' }}
        contentFit="contain"
        onLoad={() => setLoaded(true)}
      />
    );
  }

  const viewUrl = isPdf(contentType) ? url : getGoogleDocsViewerUrl(url);

  return (
    <View style={{ flex: 1 }}>
      {!loaded && (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text
            style={{
              color: 'rgba(255,255,255,0.5)',
              marginTop: 12,
              fontSize: 13,
              fontFamily: 'Inter_400Regular',
            }}
          >
            Loading document…
          </Text>
        </View>
      )}
      {React.createElement('iframe', {
        src: viewUrl,
        style: {
          flex: 1,
          border: 'none',
          width: '100%',
          height: '100%',
          display: 'block',
          opacity: loaded ? 1 : 0,
          transition: 'opacity 0.2s',
        },
        onLoad: () => setLoaded(true),
        title: fileName,
        allowFullScreen: true,
      })}
    </View>
  );
}

export default function DocViewerScreen() {
  const { docId } = useLocalSearchParams<{ docId: string }>();
  const { docs } = useApp();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const doc = docs.find(d => d.id === docId);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const docUrl = doc ? buildDocUrl(doc.objectPath) : null;

  const handleDownload = () => {
    if (!docUrl || !doc) return;
    if (Platform.OS === 'web') {
      triggerWebDownload(docUrl, doc.name);
    }
  };

  if (!doc || !docUrl) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textMuted, fontSize: 14, fontFamily: 'Inter_400Regular' }}>
          Document not found.
        </Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: colors.primary, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>
            Go back
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[s.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={[s.iconBtn, { backgroundColor: colors.muted }]}>
          <Feather name="arrow-left" size={18} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, marginHorizontal: 10 }}>
          <Text style={[s.title, { color: colors.text }]} numberOfLines={1}>
            {doc.name}
          </Text>
          <Text style={[s.subtitle, { color: colors.textMuted }]}>{doc.category}</Text>
        </View>
        <Pressable
          onPress={handleDownload}
          style={[s.iconBtn, { backgroundColor: colors.indigoBg, borderColor: colors.indigoBorder, borderWidth: 1 }]}
        >
          <Feather name="download" size={18} color={colors.primary} />
        </Pressable>
      </View>

      {/* Viewer area */}
      <View style={{ flex: 1 }}>
        {Platform.OS === 'web' ? (
          <WebViewer url={docUrl} contentType={doc.contentType} fileName={doc.name} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <View style={[s.iconWrap, { backgroundColor: colors.indigoBg, borderColor: colors.indigoBorder }]}>
              <Feather name="file-text" size={32} color={colors.primary} />
            </View>
            <Text style={[s.noPreviewTitle, { color: colors.text }]}>
              Preview not available on this device
            </Text>
            <Text style={[s.noPreviewBody, { color: colors.textMuted }]}>
              This document cannot be previewed in-app on native. Open it with another app using the share button.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  subtitle: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginTop: 1,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: 20,
  },
  noPreviewTitle: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  noPreviewBody: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
});

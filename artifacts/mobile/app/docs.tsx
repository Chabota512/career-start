import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DocCategory, StoredDocument, useApp } from '@/context/AppContext';
import { getApiBase } from '@/constants/config';
import { useColors } from '@/hooks/useColors';

const CATEGORIES: DocCategory[] = [
  'CV / Resume',
  'Cover Letter',
  'Certificate',
  'Academic Transcript',
  'Reference Letter',
  'Portfolio',
  'Other',
];

const CATEGORY_ICONS: Record<DocCategory, string> = {
  'CV / Resume': 'user',
  'Cover Letter': 'mail',
  'Certificate': 'award',
  'Academic Transcript': 'book',
  'Reference Letter': 'users',
  'Portfolio': 'briefcase',
  'Other': 'file',
};

const CATEGORY_COLORS: Record<DocCategory, { bg: string; icon: string; border: string }> = {
  'CV / Resume': { bg: 'rgba(99,102,241,0.14)', icon: '#6366f1', border: 'rgba(99,102,241,0.25)' },
  'Cover Letter': { bg: 'rgba(59,130,246,0.14)', icon: '#3b82f6', border: 'rgba(59,130,246,0.25)' },
  'Certificate': { bg: 'rgba(245,158,11,0.14)', icon: '#f59e0b', border: 'rgba(245,158,11,0.25)' },
  'Academic Transcript': { bg: 'rgba(16,185,129,0.14)', icon: '#10b981', border: 'rgba(16,185,129,0.25)' },
  'Reference Letter': { bg: 'rgba(168,85,247,0.14)', icon: '#a855f7', border: 'rgba(168,85,247,0.25)' },
  'Portfolio': { bg: 'rgba(239,68,68,0.14)', icon: '#ef4444', border: 'rgba(239,68,68,0.25)' },
  'Other': { bg: 'rgba(255,255,255,0.08)', icon: 'rgba(255,255,255,0.6)', border: 'rgba(255,255,255,0.15)' },
};

const DOCS_DIR = `${FileSystem.documentDirectory}career-compass-docs/`;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function ensureDocsDir() {
  const info = await FileSystem.getInfoAsync(DOCS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(DOCS_DIR, { intermediates: true });
  }
}

export default function DocsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { docs, addDoc, updateDoc, deleteDoc, profile, updateProfile } = useApp();

  const [filter, setFilter] = useState<DocCategory | 'All'>('All');
  const [uploading, setUploading] = useState(false);
  const [uploadingCategory, setUploadingCategory] = useState<DocCategory>('CV / Resume');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [pendingFile, setPendingFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 72 : insets.bottom + 56;

  const filteredDocs = filter === 'All' ? docs : docs.filter(d => d.category === filter);

  const handlePickFile = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      setPendingFile(asset);
      setShowCategoryPicker(true);
    } catch {
      Alert.alert('Error', 'Failed to pick file. Please try again.');
    }
  };

  const handleUpload = async (category: DocCategory) => {
    if (!pendingFile) return;
    setShowCategoryPicker(false);
    setUploading(true);
    setUploadingCategory(category);

    try {
      const asset = pendingFile;

      await ensureDocsDir();

      const ext = asset.name.split('.').pop()?.toLowerCase() || 'bin';
      const uniqueName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const localUri = `${DOCS_DIR}${uniqueName}`;

      await FileSystem.copyAsync({ from: asset.uri, to: localUri });

      const stored = await addDoc({
        name: asset.name,
        category,
        objectPath: localUri,
        contentType: asset.mimeType ?? 'application/octet-stream',
        size: asset.size ?? 0,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved!', `"${asset.name}" added to your document library.`);

      const apiBase = getApiBase();
      if (apiBase) {
        FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 })
          .then(async base64 => {
            const res = await fetch(`${apiBase}/api/storage/extract-content`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fileContent: base64,
                contentType: asset.mimeType ?? 'application/octet-stream',
                category,
              }),
            });
            if (!res.ok) return null;
            return res.json();
          })
          .then(async data => {
            if (!data?.extractedText) return;
            await updateDoc(stored.id, { extractedText: data.extractedText });

            if (category === 'CV / Resume' && profile) {
              try {
                const parseRes = await fetch(`${apiBase}/api/ai/parse-profile-from-cv`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ cvContent: data.extractedText }),
                });
                if (!parseRes.ok) return;
                const parsed = await parseRes.json();

                const mergedFields = [...(profile.profileFields ?? [])];
                const existingLabels = new Set(mergedFields.map(f => f.label.toLowerCase()));
                for (const pf of (parsed.profileFields ?? [])) {
                  if (pf.label?.trim() && pf.value?.trim() && !existingLabels.has(pf.label.toLowerCase())) {
                    mergedFields.push({ id: `cv_${Date.now()}_${mergedFields.length}`, label: pf.label.trim(), value: pf.value.trim() });
                  }
                }

                await updateProfile({
                  ...profile,
                  displayName: parsed.displayName || profile.displayName,
                  currentDegree: parsed.currentDegree || profile.currentDegree,
                  institution: parsed.institution || profile.institution,
                  yearOfStudy: parsed.yearOfStudy || profile.yearOfStudy,
                  skills: parsed.skills || profile.skills,
                  city: parsed.city || profile.city,
                  preferredIndustries: parsed.preferredIndustries || profile.preferredIndustries,
                  careerGoals: parsed.careerGoals || profile.careerGoals,
                  portfolioUrl: parsed.portfolioUrl || profile.portfolioUrl,
                  profileFields: mergedFields,
                });

                const filled = [
                  parsed.displayName && 'Name',
                  parsed.currentDegree && 'Degree',
                  parsed.institution && 'Institution',
                  parsed.skills && 'Skills',
                  parsed.city && 'City',
                  parsed.careerGoals && 'Career goals',
                ].filter(Boolean);
                if (filled.length > 0) {
                  Alert.alert(
                    'Profile auto-filled from CV',
                    `Your profile was updated with: ${filled.join(', ')}.`,
                  );
                }
              } catch {}
            }
          })
          .catch(() => {});
      }
    } catch (err: any) {
      Alert.alert('Save Failed', err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setUploading(false);
      setPendingFile(null);
    }
  };

  const handleOpen = async (doc: StoredDocument) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS !== 'web' && doc.objectPath.startsWith('file://')) {
      try {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(doc.objectPath, {
            mimeType: doc.contentType,
            dialogTitle: `Open ${doc.name}`,
          });
        } else {
          Alert.alert('Cannot open', 'No app available to open this file type.');
        }
      } catch {
        Alert.alert('Error', 'Could not open this document.');
      }
      return;
    }
    router.push(`/doc-viewer?docId=${encodeURIComponent(doc.id)}`);
  };

  const handleDelete = async (doc: StoredDocument) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Remove document',
      `Remove "${doc.name}" from your library?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            deleteDoc(doc.id);
            if (doc.objectPath.startsWith('file://')) {
              try { await FileSystem.deleteAsync(doc.objectPath, { idempotent: true }); } catch {}
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          },
        },
      ],
    );
  };

  const s = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 16, paddingBottom: 12,
      gap: 10,
    },
    backBtn: {
      width: 36, height: 36, borderRadius: 10,
      backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: {
      flex: 1, fontSize: 20, fontFamily: 'Inter_700Bold', color: colors.text,
    },
    uploadBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: colors.primary, borderRadius: 10,
      paddingHorizontal: 14, paddingVertical: 8,
    },
    uploadBtnText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#fff' },
    statsRow: {
      flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12,
    },
    statChip: {
      flex: 1, alignItems: 'center', paddingVertical: 10,
      backgroundColor: colors.indigoBg, borderRadius: 12,
      borderWidth: 1, borderColor: colors.indigoBorder,
    },
    statVal: { fontSize: 18, fontFamily: 'Inter_700Bold', color: colors.primary },
    statLbl: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: colors.textMuted, marginTop: 1 },
    filterScroll: { paddingHorizontal: 16, marginBottom: 12 },
    filterChip: {
      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
      borderWidth: 1, marginRight: 8,
    },
    filterChipText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
    docCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: colors.card, borderRadius: 14,
      borderWidth: 1, borderColor: colors.border,
      padding: 14, marginHorizontal: 16, marginBottom: 10,
    },
    docIcon: {
      width: 44, height: 44, borderRadius: 12,
      alignItems: 'center', justifyContent: 'center',
    },
    docName: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.text, marginBottom: 2 },
    docMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.textMuted },
    docActions: { flexDirection: 'row', gap: 8 },
    actionBtn: {
      width: 34, height: 34, borderRadius: 9,
      alignItems: 'center', justifyContent: 'center',
    },
    emptyState: {
      alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32,
    },
    emptyIcon: {
      width: 72, height: 72, borderRadius: 36,
      backgroundColor: colors.indigoBg, alignItems: 'center', justifyContent: 'center',
      marginBottom: 16,
    },
    emptyTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: colors.text, marginBottom: 8 },
    emptyBody: {
      fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textMuted,
      textAlign: 'center', lineHeight: 20,
    },
    modal: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      backgroundColor: colors.card,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      paddingHorizontal: 20, paddingBottom: bottomPad + 12,
      borderWidth: 1, borderColor: colors.border,
    },
    modalHandle: {
      width: 36, height: 4, borderRadius: 2,
      backgroundColor: colors.border, alignSelf: 'center', marginTop: 10, marginBottom: 16,
    },
    modalTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.text, marginBottom: 4 },
    modalSub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.textMuted, marginBottom: 16 },
    catBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 12, paddingHorizontal: 14,
      borderRadius: 12, borderWidth: 1, borderColor: colors.border,
      backgroundColor: colors.muted, marginBottom: 8,
    },
    catBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.text, flex: 1 },
    cancelCatBtn: {
      paddingVertical: 12, alignItems: 'center',
      borderRadius: 12, borderWidth: 1, borderColor: colors.border,
      marginTop: 4,
    },
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        style={s.screen}
        contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: bottomPad + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <Feather name="arrow-left" size={18} color={colors.text} />
          </Pressable>
          <Text style={s.headerTitle}>My Documents</Text>
          <Pressable
            onPress={handlePickFile}
            disabled={uploading}
            style={({ pressed }) => [s.uploadBtn, pressed && { opacity: 0.8 }, uploading && { opacity: 0.6 }]}
          >
            {uploading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="upload" size={14} color="#fff" />
            )}
            <Text style={s.uploadBtnText}>{uploading ? 'Saving…' : 'Upload'}</Text>
          </Pressable>
        </View>

        <View style={s.statsRow}>
          <View style={s.statChip}>
            <Text style={s.statVal}>{docs.length}</Text>
            <Text style={s.statLbl}>Total Files</Text>
          </View>
          {CATEGORIES.slice(0, 2).map(cat => (
            <View key={cat} style={s.statChip}>
              <Text style={s.statVal}>{docs.filter(d => d.category === cat).length}</Text>
              <Text style={s.statLbl} numberOfLines={1}>{cat.split(' ')[0]}</Text>
            </View>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterScroll}>
          {(['All', ...CATEGORIES] as const).map(cat => {
            const active = filter === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => setFilter(cat)}
                style={[s.filterChip, {
                  backgroundColor: active ? colors.primary : colors.muted,
                  borderColor: active ? colors.primary : colors.border,
                }]}
              >
                <Text style={[s.filterChipText, { color: active ? '#fff' : colors.textSecondary }]}>
                  {cat}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {uploading && (
          <View style={{
            marginHorizontal: 16, marginBottom: 12, padding: 14,
            backgroundColor: colors.indigoBg, borderRadius: 12,
            borderWidth: 1, borderColor: colors.indigoBorder,
            flexDirection: 'row', alignItems: 'center', gap: 10,
          }}>
            <ActivityIndicator size="small" color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.text }}>
                Saving {pendingFile?.name ?? 'file'}…
              </Text>
              <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.textMuted, marginTop: 2 }}>
                Category: {uploadingCategory}
              </Text>
            </View>
          </View>
        )}

        {filteredDocs.length === 0 ? (
          <View style={s.emptyState}>
            <View style={s.emptyIcon}>
              <Feather name="folder" size={28} color={colors.primary} />
            </View>
            <Text style={s.emptyTitle}>
              {filter === 'All' ? 'No documents yet' : `No ${filter} files`}
            </Text>
            <Text style={s.emptyBody}>
              {filter === 'All'
                ? 'Tap Upload to add your CV, certificates, cover letters, and other documents.'
                : `Tap Upload to add a ${filter} to your library.`}
            </Text>
          </View>
        ) : (
          filteredDocs.map(doc => {
            const catColors = CATEGORY_COLORS[doc.category];
            return (
              <View key={doc.id} style={s.docCard}>
                <View style={[s.docIcon, { backgroundColor: catColors.bg, borderWidth: 1, borderColor: catColors.border }]}>
                  <Feather name={CATEGORY_ICONS[doc.category] as any} size={18} color={catColors.icon} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.docName} numberOfLines={1}>{doc.name}</Text>
                  <Text style={s.docMeta}>
                    {doc.category} · {formatFileSize(doc.size)} · {formatDate(doc.uploadedAt)}
                  </Text>
                  {doc.extractedText && (
                    <Text style={[s.docMeta, { color: colors.success, marginTop: 2 }]}>
                      ✓ AI-indexed
                    </Text>
                  )}
                </View>
                <View style={s.docActions}>
                  <Pressable
                    onPress={() => handleOpen(doc)}
                    style={({ pressed }) => [
                      s.actionBtn,
                      { backgroundColor: colors.indigoBg, borderWidth: 1, borderColor: colors.indigoBorder },
                      pressed && { opacity: 0.7 },
                    ]}
                    accessibilityLabel="Open document"
                  >
                    <Feather name="external-link" size={15} color={colors.primary} />
                  </Pressable>
                  <Pressable
                    onPress={() => handleDelete(doc)}
                    style={({ pressed }) => [
                      s.actionBtn,
                      { backgroundColor: colors.dangerBg, borderWidth: 1, borderColor: colors.dangerBorder },
                      pressed && { opacity: 0.7 },
                    ]}
                    accessibilityLabel="Remove document"
                  >
                    <Feather name="trash-2" size={15} color={colors.danger} />
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {showCategoryPicker && (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <Pressable style={{ flex: 1 }} onPress={() => { setShowCategoryPicker(false); setPendingFile(null); }} />
          <View style={s.modal}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Choose a category</Text>
            <Text style={s.modalSub}>
              "{pendingFile?.name ?? 'File'}" — {formatFileSize(pendingFile?.size ?? 0)}
            </Text>
            {CATEGORIES.map(cat => {
              const cc = CATEGORY_COLORS[cat];
              return (
                <Pressable
                  key={cat}
                  onPress={() => handleUpload(cat)}
                  style={({ pressed }) => [s.catBtn, pressed && { opacity: 0.75 }]}
                >
                  <View style={{
                    width: 32, height: 32, borderRadius: 8,
                    backgroundColor: cc.bg, alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1, borderColor: cc.border,
                  }}>
                    <Feather name={CATEGORY_ICONS[cat] as any} size={14} color={cc.icon} />
                  </View>
                  <Text style={s.catBtnText}>{cat}</Text>
                  <Feather name="chevron-right" size={14} color={colors.textMuted} />
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => { setShowCategoryPicker(false); setPendingFile(null); }}
              style={({ pressed }) => [s.cancelCatBtn, pressed && { opacity: 0.7 }]}
            >
              <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.textMuted }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

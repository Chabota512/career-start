import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/context/AppContext';
import { getApiBase } from '@/constants/config';
import { useColors } from '@/hooks/useColors';

interface CompanyData {
  name: string;
  description: string;
  fitScore: string;
  website?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  linkedin?: string | null;
  facebook?: string | null;
  twitter?: string | null;
}

type LetterOpType = 'attachment' | 'internship' | 'graduate' | 'general';
const LETTER_OP_TYPES: { key: LetterOpType; label: string }[] = [
  { key: 'attachment', label: 'Industrial Attachment' },
  { key: 'internship', label: 'Internship' },
  { key: 'graduate', label: 'Graduate Programme' },
  { key: 'general', label: 'General Application' },
];

const FIT_META: Record<string, { color: string; bg: string; border: string; icon: string }> = {
  'Excellent Fit': { color: '#10b981', bg: 'rgba(16,185,129,0.14)', border: 'rgba(16,185,129,0.25)', icon: 'star' },
  'Strong Fit':    { color: '#6366f1', bg: 'rgba(99,102,241,0.14)', border: 'rgba(99,102,241,0.25)', icon: 'trending-up' },
  'Good Fit':      { color: '#3b82f6', bg: 'rgba(59,130,246,0.14)', border: 'rgba(59,130,246,0.25)', icon: 'thumbs-up' },
};

export default function CompanyDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ data: string }>();
  const { profile, applications, addApplication, updateApplication } = useApp();

  const company: CompanyData | null = React.useMemo(() => {
    try { return params.data ? JSON.parse(decodeURIComponent(params.data)) : null; }
    catch { return null; }
  }, [params.data]);

  const [showLetterModal, setShowLetterModal] = useState(false);
  const [research, setResearch] = useState('');
  const [researchLoading, setResearchLoading] = useState(false);
  const [interviewQ, setInterviewQ] = useState<{ personal: string[]; company: string[]; experience: string[] } | null>(null);
  const [interviewLoading, setInterviewLoading] = useState(false);

  const [letterOpType, setLetterOpType] = useState<LetterOpType>('attachment');
  const [letterRole, setLetterRole] = useState('');
  const [letterDraft, setLetterDraft] = useState('');
  const [letter, setLetter] = useState('');
  const [letterLoading, setLetterLoading] = useState(false);
  const [letterError, setLetterError] = useState('');

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 72 : insets.bottom;

  const trackedApp = company
    ? applications.find(a => a.companyName.toLowerCase() === company.name.toLowerCase())
    : null;

  const isTracked = !!trackedApp;

  if (!company) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textMuted, fontSize: 14, fontFamily: 'Inter_400Regular' }}>
          Company data not found.
        </Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: colors.primary, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const fit = FIT_META[company.fitScore] || FIT_META['Good Fit'];

  const handleTrack = async () => {
    if (isTracked) {
      router.push('/(tabs)/applications');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await addApplication({
      companyName: company.name,
      role: `WIL Placement – ${profile?.currentDegree || 'General'}`,
      status: 'Interested',
      researchSummary: research || undefined,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Tracked!', `${company.name} added to your Applications.`);
  };

  const handleOpenMaps = () => {
    const query = encodeURIComponent(company.address || company.name + ' Zambia');
    const url = Platform.OS === 'ios'
      ? `maps:?q=${query}`
      : `https://maps.google.com/maps?q=${query}`;
    Linking.openURL(url).catch(() => Linking.openURL(`https://maps.google.com/maps?q=${query}`));
  };

  const handleResearch = async () => {
    setResearchLoading(true);
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/ai/research-company`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: company.name,
          degree: profile?.currentDegree || '',
          goals: profile?.careerGoals || '',
        }),
      });
      if (!res.ok) throw new Error('api');
      const data = await res.json();
      const summary = data.summary || data.research || JSON.stringify(data);
      setResearch(summary);
      if (trackedApp) {
        await updateApplication(trackedApp.id, { researchSummary: summary });
      }
    } catch {
      Alert.alert('Research failed', 'Could not fetch research. Check your connection.');
    } finally {
      setResearchLoading(false);
    }
  };

  const handleInterviewPrep = async () => {
    setInterviewLoading(true);
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/ai/interview-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: company.name,
          role: `WIL Placement – ${profile?.currentDegree || 'General'}`,
          degree: profile?.currentDegree || '',
          goals: profile?.careerGoals || '',
          skills: profile?.skills || '',
          researchSummary: research || '',
        }),
      });
      if (!res.ok) throw new Error('api');
      const data = await res.json();
      setInterviewQ(data);
    } catch {
      Alert.alert('Interview prep failed', 'Could not generate questions. Check your connection.');
    } finally {
      setInterviewLoading(false);
    }
  };

  const generateLetter = async () => {
    setLetterLoading(true);
    setLetterError('');
    setLetter('');
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/ai/draft-letter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: company.name,
          role: letterRole.trim() || 'Relevant Department',
          degree: profile?.currentDegree || '',
          goals: profile?.careerGoals || '',
          institution: profile?.institution || '',
          yearOfStudy: profile?.yearOfStudy || '',
          skills: profile?.skills || '',
          portfolioUrl: profile?.portfolioUrl || '',
          letterType: letterOpType,
          studentName: profile?.displayName && profile.displayName !== 'You' ? profile.displayName : '',
          studentCity: profile?.city || '',
          userDraft: letterDraft.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.letter) {
        setLetter(data.letter);
        if (trackedApp) {
          await updateApplication(trackedApp.id, { draftedLetter: data.letter });
        }
      } else {
        setLetterError('Could not generate the letter. Please try again.');
      }
    } catch {
      setLetterError('Connection error — check your internet and try again.');
    } finally {
      setLetterLoading(false);
    }
  };

  const s = styles(colors);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        style={s.screen}
        contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: bottomPad + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={s.headerRow}>
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <Feather name="arrow-left" size={18} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.companyName} numberOfLines={2}>{company.name}</Text>
          </View>
          <View style={[s.fitBadge, { backgroundColor: fit.bg, borderColor: fit.border }]}>
            <Feather name={fit.icon as any} size={11} color={fit.color} />
            <Text style={[s.fitText, { color: fit.color }]}>{company.fitScore}</Text>
          </View>
        </View>

        {/* Description */}
        <View style={s.card}>
          <Text style={s.cardLabel}>About</Text>
          <Text style={s.description}>{company.description}</Text>
        </View>

        {/* Quick Actions */}
        <View style={s.actionsRow}>
          <Pressable
            style={({ pressed }) => [
              s.actionBtn,
              isTracked ? s.actionBtnSuccess : s.actionBtnPrimary,
              pressed && { opacity: 0.82 },
            ]}
            onPress={handleTrack}
            android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
          >
            <Feather name={isTracked ? 'check-circle' : 'plus-circle'} size={16} color="#fff" />
            <Text style={s.actionBtnText}>{isTracked ? 'Tracked' : 'Track'}</Text>
          </Pressable>

          {company.website && (
            <Pressable
              style={({ pressed }) => [s.actionBtnSecondary, pressed && { opacity: 0.75 }]}
              onPress={() => Linking.openURL(company.website!)}
            >
              <Feather name="globe" size={15} color={colors.primary} />
              <Text style={s.actionBtnSecondaryText}>Website</Text>
            </Pressable>
          )}

          {(company.address || company.name) && (
            <Pressable
              style={({ pressed }) => [s.actionBtnSecondary, pressed && { opacity: 0.75 }]}
              onPress={handleOpenMaps}
            >
              <Feather name="map-pin" size={15} color={colors.primary} />
              <Text style={s.actionBtnSecondaryText}>Maps</Text>
            </Pressable>
          )}
        </View>

        {/* Contact Info */}
        {(company.address || company.phone || company.email || company.linkedin || company.facebook || company.twitter) && (
          <View style={s.card}>
            <Text style={s.cardLabel}>Contact Details</Text>
            {company.address ? (
              <Pressable style={s.contactRow} onPress={handleOpenMaps}>
                <Feather name="map-pin" size={13} color={colors.textMuted} />
                <Text style={s.contactText}>{company.address}</Text>
              </Pressable>
            ) : null}
            {company.phone ? (
              <Pressable style={s.contactRow} onPress={() => Linking.openURL(`tel:${company.phone!.replace(/\s/g, '')}`)}>
                <Feather name="phone" size={13} color={colors.primary} />
                <Text style={[s.contactText, s.contactLink]}>{company.phone}</Text>
              </Pressable>
            ) : null}
            {company.email ? (
              <Pressable style={s.contactRow} onPress={() => Linking.openURL(`mailto:${company.email}`)}>
                <Feather name="mail" size={13} color={colors.primary} />
                <Text style={[s.contactText, s.contactLink]} numberOfLines={1}>{company.email}</Text>
              </Pressable>
            ) : null}
            {company.website ? (
              <Pressable style={s.contactRow} onPress={() => Linking.openURL(company.website!)}>
                <Feather name="globe" size={13} color={colors.primary} />
                <Text style={[s.contactText, s.contactLink]} numberOfLines={1}>{company.website.replace(/^https?:\/\//, '')}</Text>
              </Pressable>
            ) : null}
            {company.linkedin ? (
              <Pressable style={s.contactRow} onPress={() => Linking.openURL(company.linkedin!)}>
                <Feather name="linkedin" size={13} color={colors.primary} />
                <Text style={[s.contactText, s.contactLink]} numberOfLines={1}>{company.linkedin.replace(/^https?:\/\/(www\.)?/, '')}</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {/* AI Research */}
        <View style={s.card}>
          <View style={s.cardHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.cardLabel}>AI Company Research</Text>
              <Text style={s.cardSub}>Get insider info to tailor your application</Text>
            </View>
            <Pressable
              style={({ pressed }) => [s.aiBtn, pressed && { opacity: 0.8 }]}
              onPress={handleResearch}
              disabled={researchLoading}
            >
              {researchLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Feather name="search" size={14} color="#fff" />}
              <Text style={s.aiBtnText}>{researchLoading ? 'Researching…' : research ? 'Refresh' : 'Research'}</Text>
            </Pressable>
          </View>
          {research ? (
            <View style={s.researchBox}>
              <Text style={s.researchText}>{research}</Text>
            </View>
          ) : !researchLoading ? (
            <Text style={[s.cardSub, { marginTop: 8 }]}>
              Tap Research to get company background, culture, and tips for your application.
            </Text>
          ) : null}
        </View>

        {/* Interview Prep */}
        <View style={s.card}>
          <View style={s.cardHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.cardLabel}>Interview Questions</Text>
              <Text style={s.cardSub}>AI-generated questions for this company</Text>
            </View>
            <Pressable
              style={({ pressed }) => [s.aiBtn, pressed && { opacity: 0.8 }]}
              onPress={handleInterviewPrep}
              disabled={interviewLoading}
            >
              {interviewLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Feather name="mic" size={14} color="#fff" />}
              <Text style={s.aiBtnText}>{interviewLoading ? 'Generating…' : interviewQ ? 'Refresh' : 'Generate'}</Text>
            </Pressable>
          </View>

          {interviewQ ? (
            <View style={{ gap: 14, marginTop: 12 }}>
              {[
                { title: 'Personal & Motivational', items: interviewQ.personal },
                { title: 'Company-specific', items: interviewQ.company },
                { title: 'Experience-based', items: interviewQ.experience },
              ].map(section => (
                <View key={section.title}>
                  <Text style={s.interviewSection}>{section.title}</Text>
                  {section.items?.map((q, i) => (
                    <View key={i} style={s.questionRow}>
                      <Text style={s.questionNum}>{i + 1}.</Text>
                      <Text style={s.questionText}>{q}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ) : !interviewLoading ? (
            <Text style={[s.cardSub, { marginTop: 8 }]}>
              Tap Generate to get tailored interview questions for {company.name}.
            </Text>
          ) : null}
        </View>

        {/* Letter Writer */}
        <Pressable
          style={({ pressed }) => [s.letterBtn, pressed && { opacity: 0.9 }]}
          onPress={() => setShowLetterModal(true)}
        >
          <LinearGradient
            colors={['#10b981', '#059669']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.letterBtnGradient}
          >
            <Feather name="file-text" size={18} color="#fff" />
            <Text style={s.letterBtnText}>Write Application Letter</Text>
            <Feather name="chevron-right" size={16} color="rgba(255,255,255,0.7)" />
          </LinearGradient>
        </Pressable>
      </ScrollView>

      {/* Letter Writer Modal */}
      <Modal
        visible={showLetterModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowLetterModal(false)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[s.modalContainer, { paddingTop: insets.top || 16 }]}>
            <View style={s.modalHeader}>
              <Pressable onPress={() => { setShowLetterModal(false); setLetter(''); setLetterError(''); }} style={s.closeBtn}>
                <Feather name="x" size={20} color={colors.textMuted} />
              </Pressable>
              <Text style={s.modalTitle}>Write a Letter</Text>
              <View style={{ width: 36 }} />
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
              <View style={s.companyChip}>
                <Feather name="briefcase" size={13} color={colors.primary} />
                <Text style={s.companyChipText} numberOfLines={1}>{company.name}</Text>
              </View>

              <Text style={s.fieldLabel}>Letter Type</Text>
              <View style={s.segmentRow}>
                {LETTER_OP_TYPES.map(t => (
                  <Pressable
                    key={t.key}
                    onPress={() => setLetterOpType(t.key)}
                    style={[s.segment, letterOpType === t.key && s.segmentActive]}
                  >
                    <Text style={[s.segmentText, letterOpType === t.key && { color: '#fff' }]}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={s.fieldLabel}>Target Role (optional)</Text>
              <TextInput
                value={letterRole}
                onChangeText={setLetterRole}
                placeholder="e.g. Software Engineer Intern"
                placeholderTextColor={colors.textMuted}
                style={s.textInput}
                returnKeyType="next"
              />

              <Text style={s.fieldLabel}>Extra notes (optional)</Text>
              <TextInput
                value={letterDraft}
                onChangeText={setLetterDraft}
                placeholder="Add any specific points you'd like included…"
                placeholderTextColor={colors.textMuted}
                style={[s.textInput, { height: 80, textAlignVertical: 'top' }]}
                multiline
              />

              <Pressable
                style={({ pressed }) => [s.generateBtn, pressed && { opacity: 0.85 }, letterLoading && { opacity: 0.7 }]}
                onPress={generateLetter}
                disabled={letterLoading}
              >
                {letterLoading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Feather name="zap" size={16} color="#fff" />}
                <Text style={s.generateBtnText}>{letterLoading ? 'Writing letter…' : 'Generate Letter'}</Text>
              </Pressable>

              {letterError ? (
                <Text style={{ color: colors.danger, fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 12, textAlign: 'center' }}>
                  {letterError}
                </Text>
              ) : null}

              {letter ? (
                <View style={s.letterBox}>
                  <Text style={s.letterText}>{letter}</Text>
                  <Pressable
                    style={[s.generateBtn, { marginTop: 16, backgroundColor: colors.primary }]}
                    onPress={() => Share.share({ message: letter, title: `Application Letter – ${company.name}` })}
                  >
                    <Feather name="share-2" size={16} color="#fff" />
                    <Text style={s.generateBtnText}>Share Letter</Text>
                  </Pressable>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = (colors: ReturnType<typeof import('@/hooks/useColors').useColors>) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  companyName: { fontSize: 22, fontFamily: 'Inter_700Bold', color: colors.text, letterSpacing: -0.5 },
  fitBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1,
    flexShrink: 0,
  },
  fitText: { fontSize: 11, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  card: {
    backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border,
    padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3,
  },
  cardLabel: {
    fontSize: 11, fontFamily: 'Inter_700Bold', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
  },
  cardSub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.textMuted, lineHeight: 17 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  description: { fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.textSecondary, lineHeight: 22 },
  actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14,
  },
  actionBtnPrimary: {
    backgroundColor: colors.primary,
    shadowColor: '#3730a3', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4,
  },
  actionBtnSuccess: {
    backgroundColor: colors.success,
    shadowColor: '#059669', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4,
  },
  actionBtnText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' },
  actionBtnSecondary: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14,
    backgroundColor: colors.indigoBg, borderWidth: 1, borderColor: colors.indigoBorder,
  },
  actionBtnSecondaryText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.primary },
  contactRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 5 },
  contactText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textSecondary, flex: 1, lineHeight: 18 },
  contactLink: { color: colors.primary, fontFamily: 'Inter_500Medium' },
  aiBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primary, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, flexShrink: 0,
  },
  aiBtnText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#fff' },
  researchBox: {
    marginTop: 12, padding: 14,
    backgroundColor: colors.muted, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
  },
  researchText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textSecondary, lineHeight: 21 },
  interviewSection: {
    fontSize: 12, fontFamily: 'Inter_700Bold', color: colors.primary,
    textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 6,
  },
  questionRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  questionNum: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.textMuted, minWidth: 18 },
  questionText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textSecondary, flex: 1, lineHeight: 20 },
  letterBtn: { borderRadius: 16, overflow: 'hidden', marginBottom: 8 },
  letterBtnGradient: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingVertical: 18,
  },
  letterBtnText: { flex: 1, fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' },
  modalContainer: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  closeBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.text },
  companyChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.indigoBg, borderWidth: 1, borderColor: colors.indigoBorder,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 20,
    alignSelf: 'flex-start',
  },
  companyChipText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.primary, maxWidth: 250 },
  fieldLabel: {
    fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 8, marginTop: 4,
  },
  segmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  segment: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
  },
  segmentActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmentText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.textSecondary },
  textInput: {
    backgroundColor: colors.muted, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.text,
    borderWidth: 1, borderColor: colors.border, marginBottom: 16,
  } as any,
  generateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#10b981', borderRadius: 14, paddingVertical: 16,
    shadowColor: '#059669', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 5,
  },
  generateBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' },
  letterBox: {
    marginTop: 16, padding: 16,
    backgroundColor: colors.muted, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
  },
  letterText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.text, lineHeight: 22 },
});

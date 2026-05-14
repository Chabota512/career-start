import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { getApiBase } from '@/constants/config';
import { getCvContent } from '@/utils/docContext';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ProfileSnapshot {
  displayName?: string;
  currentDegree?: string;
  institution?: string;
  yearOfStudy?: string;
  skills?: string;
  city?: string;
  preferredIndustries?: string;
  careerGoals?: string;
  portfolioUrl?: string;
  profileFields?: Array<{ label: string; value: string }>;
}

// ─── Voice input ──────────────────────────────────────────────────────────────

function useVoiceInput(onTranscript: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const supported = Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    !!(((window as any).SpeechRecognition) || ((window as any).webkitSpeechRecognition));

  const toggleListening = useCallback(() => {
    if (!supported) return;
    if (isListening) { recognitionRef.current?.stop(); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = 'en-ZM';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event: any) => onTranscript(event.results[0][0].transcript);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [supported, isListening, onTranscript]);

  useEffect(() => { return () => { recognitionRef.current?.stop(); }; }, []);
  return { isListening, toggleListening, supported };
}

// ─── Typing dots ──────────────────────────────────────────────────────────────

function TypingDots({ colors }: { colors: ReturnType<typeof useColors> }) {
  const dots = [useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current];
  useEffect(() => {
    const anims = dots.map((dot, i) =>
      Animated.loop(Animated.sequence([
        Animated.delay(i * 180),
        Animated.timing(dot, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.timing(dot, { toValue: 0.3, duration: 280, useNativeDriver: true }),
        Animated.delay(540 - i * 180),
      ]))
    );
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, []);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 2 }}>
      {dots.map((dot, i) => (
        <Animated.View key={i} style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.primary, opacity: dot }} />
      ))}
    </View>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg, colors, index }: { msg: ChatMessage; colors: ReturnType<typeof useColors>; index: number }) {
  const isAI = msg.role === 'assistant';
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 280, delay: index === 0 ? 200 : 0, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 280, delay: index === 0 ? 200 : 0, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.View style={[
      { opacity, transform: [{ translateY }] },
      isAI ? { alignSelf: 'flex-start', maxWidth: '85%' } : { alignSelf: 'flex-end', maxWidth: '80%' },
      { marginBottom: 12 },
    ]}>
      {isAI && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 }}>
          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 10, color: '#fff' }}>✦</Text>
          </View>
          <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: colors.primary, letterSpacing: 0.5 }}>
            CAREER COMPASS AI
          </Text>
        </View>
      )}
      <View style={isAI ? {
        backgroundColor: 'rgba(99,102,241,0.1)', borderColor: 'rgba(99,102,241,0.25)', borderWidth: 1,
        borderRadius: 18, borderTopLeftRadius: 4, paddingHorizontal: 16, paddingVertical: 13,
      } : {
        backgroundColor: 'rgba(255,255,255,0.09)', borderColor: 'rgba(255,255,255,0.13)', borderWidth: 1,
        borderRadius: 18, borderTopRightRadius: 4, paddingHorizontal: 16, paddingVertical: 13,
      }}>
        <Text style={{ fontSize: 15, fontFamily: 'Inter_400Regular', color: colors.text, lineHeight: 22 }}>
          {msg.content}
        </Text>
      </View>
    </Animated.View>
  );
}

// ─── Floating profile panel ───────────────────────────────────────────────────

function FloatingProfilePanel({
  snapshot,
  onSave,
  colors,
}: {
  snapshot: ProfileSnapshot;
  onSave: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [expanded, setExpanded] = useState(false);
  const expandAnim = useRef(new Animated.Value(0)).current;
  const badgeScale = useRef(new Animated.Value(1)).current;

  const fields = snapshot.profileFields ?? [];
  const fieldCount = fields.filter(f => f.value?.trim()).length;

  // Pulse badge when new fields arrive
  const lastCount = useRef(0);
  useEffect(() => {
    if (fieldCount > lastCount.current) {
      lastCount.current = fieldCount;
      Animated.sequence([
        Animated.timing(badgeScale, { toValue: 1.3, duration: 180, useNativeDriver: true }),
        Animated.timing(badgeScale, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [fieldCount]);

  const toggleExpanded = useCallback(() => {
    const toValue = expanded ? 0 : 1;
    Animated.spring(expandAnim, { toValue, useNativeDriver: false, tension: 70, friction: 12 }).start();
    setExpanded(!expanded);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [expanded]);

  const panelHeight = expandAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 320] });
  const panelOpacity = expandAnim.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0, 1] });

  return (
    <View style={floatStyles.container} pointerEvents="box-none">
      {/* Expanded panel */}
      <Animated.View style={[floatStyles.panel, { height: panelHeight, overflow: 'hidden' }]}>
        <Animated.View style={{ opacity: panelOpacity, flex: 1 }}>
          {/* Panel header */}
          <View style={floatStyles.panelHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[floatStyles.headerDot, { backgroundColor: colors.primary }]} />
              <Text style={[floatStyles.panelTitle, { color: colors.text }]}>Profile Preview</Text>
            </View>
            <Pressable onPress={toggleExpanded} hitSlop={8}>
              <Feather name="chevron-down" size={16} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Fields list */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {fields.filter(f => f.value?.trim()).map((field, i) => (
              <View key={i} style={floatStyles.fieldRow}>
                <Text style={[floatStyles.fieldLabel, { color: colors.textMuted }]} numberOfLines={1}>
                  {field.label}
                </Text>
                <Text style={[floatStyles.fieldValue, { color: colors.text }]} numberOfLines={2}>
                  {field.value}
                </Text>
              </View>
            ))}
            {fieldCount === 0 && (
              <Text style={[floatStyles.emptyText, { color: colors.textMuted }]}>
                Keep chatting — your info will appear here in real time.
              </Text>
            )}
          </ScrollView>

          {/* Save button */}
          <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
            <Pressable
              style={[floatStyles.saveBtn, { backgroundColor: colors.primary, opacity: fieldCount === 0 ? 0.5 : 1 }]}
              onPress={() => { toggleExpanded(); onSave(); }}
              android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
              disabled={fieldCount === 0}
            >
              <Feather name="save" size={14} color="#fff" />
              <Text style={floatStyles.saveBtnText}>Save & Continue</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>

      {/* Collapsed badge — always visible */}
      {!expanded && (
        <Pressable onPress={toggleExpanded} style={floatStyles.badgeWrap}>
          <Animated.View style={[
            floatStyles.badge,
            { backgroundColor: fieldCount > 0 ? colors.primary : 'rgba(99,102,241,0.4)', transform: [{ scale: badgeScale }] },
          ]}>
            <Feather name="user" size={12} color="#fff" />
            <Text style={floatStyles.badgeText}>
              {fieldCount > 0 ? `${fieldCount} collected` : 'Profile'}
            </Text>
          </Animated.View>
        </Pressable>
      )}
    </View>
  );
}

const floatStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 80,
    right: 12,
    width: 230,
    zIndex: 100,
    alignItems: 'flex-end',
  },
  panel: {
    width: 230,
    backgroundColor: 'rgba(18,18,30,0.97)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.35)',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  headerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  panelTitle: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.4,
  },
  fieldRow: {
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  fieldLabel: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  fieldValue: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    lineHeight: 16,
  },
  emptyText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    paddingVertical: 16,
    lineHeight: 18,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 10,
  },
  saveBtnText: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  badgeWrap: {
    alignSelf: 'flex-end',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 6,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, updateProfile, docs } = useApp();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(true); // starts true while fetching first message
  const [isLoadingFirst, setIsLoadingFirst] = useState(true);
  const [isDone, setIsDone] = useState(false);
  const [snapshot, setSnapshot] = useState<ProfileSnapshot>({ profileFields: [] });
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const firstMessageFetched = useRef(false);

  const { isListening, toggleListening, supported: voiceSupported } = useVoiceInput(
    useCallback((transcript: string) => { setInput(prev => prev ? `${prev} ${transcript}` : transcript); }, [])
  );

  const scrollToBottom = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, isThinking]);

  // Build a snapshot from the existing profile so the panel shows immediately
  useEffect(() => {
    if (!profile) return;
    const fields: Array<{ label: string; value: string }> = [];
    if (profile.displayName && profile.displayName !== 'You') fields.push({ label: 'Full Name', value: profile.displayName });
    if (profile.currentDegree) fields.push({ label: 'Degree', value: profile.currentDegree });
    if (profile.institution) fields.push({ label: 'Institution', value: profile.institution });
    if (profile.yearOfStudy) fields.push({ label: 'Year of Study', value: profile.yearOfStudy });
    if (profile.skills) fields.push({ label: 'Skills', value: profile.skills });
    if (profile.city) fields.push({ label: 'City', value: profile.city });
    if (profile.preferredIndustries) fields.push({ label: 'Preferred Industries', value: profile.preferredIndustries });
    if (profile.careerGoals) fields.push({ label: 'Career Goals', value: profile.careerGoals });
    if (profile.portfolioUrl) fields.push({ label: 'Portfolio / GitHub', value: profile.portfolioUrl });
    if (profile.profileFields) {
      for (const pf of profile.profileFields) {
        if (!fields.some(f => f.label === pf.label)) fields.push({ label: pf.label, value: pf.value });
      }
    }
    setSnapshot({
      displayName: profile.displayName,
      currentDegree: profile.currentDegree,
      institution: profile.institution,
      yearOfStudy: profile.yearOfStudy,
      skills: profile.skills,
      city: profile.city,
      preferredIndustries: profile.preferredIndustries,
      careerGoals: profile.careerGoals,
      portfolioUrl: profile.portfolioUrl,
      profileFields: fields,
    });
  }, [profile?.uid]);

  // Fetch the AI-generated opening message on mount (passing existing profile)
  useEffect(() => {
    if (!profile || firstMessageFetched.current) return;
    firstMessageFetched.current = true;

    const existingProfile = {
      displayName: profile.displayName !== 'You' ? profile.displayName : '',
      currentDegree: profile.currentDegree || '',
      institution: profile.institution || '',
      yearOfStudy: profile.yearOfStudy || '',
      skills: profile.skills || '',
      city: profile.city || '',
      preferredIndustries: profile.preferredIndustries || '',
      careerGoals: profile.careerGoals || '',
      portfolioUrl: profile.portfolioUrl || '',
      profileFields: profile.profileFields ?? [],
    };

    fetch(`${getApiBase()}/api/ai/profile-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [], existingProfile, cvContent: getCvContent(docs) }),
    })
      .then(r => r.json())
      .then(data => {
        const firstMsg: ChatMessage = {
          role: 'assistant',
          content: data.reply || "Hi! I'm Career Compass AI. What's your name?",
        };
        setMessages([firstMsg]);
        if (data.partialProfile) setSnapshot(data.partialProfile);
      })
      .catch(() => {
        setMessages([{
          role: 'assistant',
          content: "Hi! I'm Career Compass AI. Let's set up your profile — what's your full name?",
        }]);
      })
      .finally(() => {
        setIsLoadingFirst(false);
        setIsThinking(false);
      });
  }, [profile]);

  // Commit collected profile data to context (manual save or auto-complete)
  const saveProfile = useCallback(async (data: ProfileSnapshot) => {
    if (!profile) return;
    const rawFields: Array<{ label: string; value: string }> = data.profileFields ?? [];
    const profileFields = rawFields
      .filter(f => f.label?.trim() && f.value?.trim())
      .map((f, i) => ({ id: `ai_${Date.now()}_${i}`, label: f.label.trim(), value: f.value.trim() }));
    await updateProfile({
      ...profile,
      displayName: data.displayName || profile.displayName,
      currentDegree: data.currentDegree || profile.currentDegree,
      institution: data.institution || profile.institution,
      yearOfStudy: data.yearOfStudy || profile.yearOfStudy,
      skills: data.skills || profile.skills,
      city: data.city || profile.city,
      preferredIndustries: data.preferredIndustries || profile.preferredIndustries,
      careerGoals: data.careerGoals || profile.careerGoals,
      portfolioUrl: data.portfolioUrl || profile.portfolioUrl,
      profileFields: profileFields.length > 0 ? profileFields : profile.profileFields,
    });
  }, [profile, updateProfile]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isThinking || isDone || isLoadingFirst) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const userMsg: ChatMessage = { role: 'user', content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setIsThinking(true);

    const existingProfile = profile ? {
      displayName: profile.displayName !== 'You' ? profile.displayName : '',
      currentDegree: profile.currentDegree || '',
      institution: profile.institution || '',
      yearOfStudy: profile.yearOfStudy || '',
      skills: profile.skills || '',
      city: profile.city || '',
      preferredIndustries: profile.preferredIndustries || '',
      careerGoals: profile.careerGoals || '',
      portfolioUrl: profile.portfolioUrl || '',
      profileFields: profile.profileFields ?? [],
    } : undefined;

    try {
      const res = await fetch(`${getApiBase()}/api/ai/profile-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages, existingProfile, cvContent: getCvContent(docs) }),
      });
      if (!res.ok) throw new Error('api');
      const data = await res.json();

      const aiMsg: ChatMessage = { role: 'assistant', content: data.reply || "I'm having trouble — please try again." };
      setMessages(prev => [...prev, aiMsg]);

      if (data.partialProfile) setSnapshot(data.partialProfile);

      if (data.isComplete && data.profileData) {
        setIsDone(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await saveProfile(data.profileData);
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "I'm having trouble connecting right now. Please check your internet and try again.",
      }]);
    } finally {
      setIsThinking(false);
      inputRef.current?.focus();
    }
  }, [input, isThinking, isDone, isLoadingFirst, messages, profile, saveProfile]);

  const handleManualSave = useCallback(async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await saveProfile(snapshot);
    router.replace('/(tabs)');
  }, [snapshot, saveProfile, router]);

  const handleContinue = useCallback(() => { router.replace('/(tabs)'); }, [router]);
  const handleSkip = useCallback(() => { router.replace('/(tabs)'); }, [router]);

  const s = styles(colors);
  const topPad = Platform.OS === 'web' ? 20 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 20 : insets.bottom;

  return (
    <View style={[s.screen, { paddingTop: topPad }]}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerCenter}>
          <View style={[s.aiDot, { backgroundColor: isLoadingFirst ? colors.textMuted : colors.success }]} />
          <Text style={s.headerTitle}>Career Compass AI</Text>
        </View>
        <Pressable onPress={handleSkip} style={s.skipBtn} accessibilityLabel="Skip setup">
          <Text style={s.skipText}>Skip</Text>
        </Pressable>
      </View>

      {/* Chat + floating panel */}
      <View style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          style={s.chatArea}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollToBottom}
        >
          {/* First-message loading state */}
          {isLoadingFirst && (
            <View style={{ alignSelf: 'flex-start', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, color: '#fff' }}>✦</Text>
                </View>
                <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: colors.primary, letterSpacing: 0.5 }}>
                  CAREER COMPASS AI
                </Text>
              </View>
              <View style={s.thinkingBubble}>
                <TypingDots colors={colors} />
              </View>
            </View>
          )}

          {messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} colors={colors} index={i} />
          ))}

          {isThinking && !isLoadingFirst && (
            <Animated.View style={{ alignSelf: 'flex-start', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, color: '#fff' }}>✦</Text>
                </View>
                <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: colors.primary, letterSpacing: 0.5 }}>
                  CAREER COMPASS AI
                </Text>
              </View>
              <View style={s.thinkingBubble}>
                <TypingDots colors={colors} />
              </View>
            </Animated.View>
          )}

          {isDone && (
            <View style={s.doneCard}>
              <View style={s.doneIconWrap}>
                <Feather name="check" size={22} color="#10b981" />
              </View>
              <Text style={s.doneTitle}>Profile saved!</Text>
              <Text style={s.doneSub}>You're all set. Let's find your next opportunity.</Text>
              <Pressable style={s.continueBtn} onPress={handleContinue} android_ripple={{ color: 'rgba(255,255,255,0.15)' }}>
                <Text style={s.continueBtnText}>Continue to Career Compass</Text>
                <Feather name="arrow-right" size={16} color="#fff" />
              </Pressable>
            </View>
          )}
        </ScrollView>

        {/* Floating profile panel — always visible during onboarding */}
        {!isDone && (
          <FloatingProfilePanel
            snapshot={snapshot}
            onSave={handleManualSave}
            colors={colors}
          />
        )}
      </View>

      {/* Input area */}
      {!isDone && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={topPad}
        >
          <View style={[s.inputArea, { paddingBottom: bottomPad + 12 }]}>
            <View style={s.inputRow}>
              <TextInput
                ref={inputRef}
                value={input}
                onChangeText={setInput}
                placeholder="Type your answer…"
                placeholderTextColor={colors.textMuted}
                style={s.textInput}
                multiline
                maxLength={500}
                returnKeyType="send"
                onSubmitEditing={handleSend}
                blurOnSubmit={false}
                editable={!isThinking && !isDone && !isLoadingFirst}
                accessibilityLabel="Chat input"
              />
              {voiceSupported && (
                <Pressable
                  style={[s.micBtn, isListening && s.micBtnActive]}
                  onPress={toggleListening}
                  accessibilityLabel={isListening ? 'Stop listening' : 'Speak your answer'}
                >
                  <Feather name={isListening ? 'mic-off' : 'mic'} size={18} color={isListening ? '#fff' : colors.textMuted} />
                </Pressable>
              )}
              <Pressable
                style={[s.sendBtn, (!input.trim() || isThinking || isLoadingFirst) && s.sendBtnDisabled]}
                onPress={handleSend}
                disabled={!input.trim() || isThinking || isLoadingFirst}
                accessibilityLabel="Send message"
                android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
              >
                <Feather name="send" size={18} color={!input.trim() || isThinking || isLoadingFirst ? colors.textMuted : '#fff'} />
              </Pressable>
            </View>
            {voiceSupported && isListening && (
              <Text style={s.listeningHint}>Listening… speak now</Text>
            )}
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border, position: 'relative',
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiDot: { width: 8, height: 8, borderRadius: 4 },
  headerTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.text, letterSpacing: -0.3 },
  skipBtn: { position: 'absolute', right: 20, paddingVertical: 6, paddingHorizontal: 4 },
  skipText: { fontSize: 14, fontFamily: 'Inter_500Medium', color: colors.textMuted },
  chatArea: { flex: 1 },
  thinkingBubble: {
    backgroundColor: 'rgba(99,102,241,0.1)', borderColor: 'rgba(99,102,241,0.25)', borderWidth: 1,
    borderRadius: 18, borderTopLeftRadius: 4, paddingHorizontal: 16, paddingVertical: 8,
  },
  doneCard: {
    alignItems: 'center', padding: 28, marginTop: 8,
    backgroundColor: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.25)', borderWidth: 1, borderRadius: 20,
  },
  doneIconWrap: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(16,185,129,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  doneTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', color: colors.text, marginBottom: 6 },
  doneSub: { fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 22 },
  continueBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24,
  },
  continueBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' },
  inputArea: {
    paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  textInput: {
    flex: 1, minHeight: 44, maxHeight: 120,
    backgroundColor: 'rgba(255,255,255,0.07)', borderColor: colors.border, borderWidth: 1,
    borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, fontFamily: 'Inter_400Regular', color: colors.text,
  },
  micBtn: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: colors.border,
  },
  micBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  sendBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.07)' },
  listeningHint: {
    fontSize: 12, fontFamily: 'Inter_500Medium', color: colors.primary,
    textAlign: 'center', marginTop: 6,
  },
});

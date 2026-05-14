import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/context/AppContext';
import { getApiBase } from '@/constants/config';
import { useColors } from '@/hooks/useColors';
import { getCvContent } from '@/utils/docContext';

type PrepSection = 'letters' | 'interview';
type InterviewStage = 'pick' | 'loading-intel' | 'briefing' | 'interviewing' | 'loading-verdict' | 'verdict';
type LetterType = 'attachment' | 'internship' | 'graduate' | 'general';

interface SelectedCompany {
  name: string;
  role: string;
}

interface AnswerFeedback {
  question: string;
  answer: string;
  feedback: string;
  score: number;
}

interface VerdictResult {
  verdict: 'accepted' | 'shortlisted' | 'rejected';
  overallScore: number;
  overallFeedback: string;
  strengths: string[];
  areasToImprove: string[];
  answerFeedback: AnswerFeedback[];
  recommendation: string;
}

const LETTER_TYPES: { key: LetterType; label: string }[] = [
  { key: 'attachment', label: 'Industrial Attachment' },
  { key: 'internship', label: 'Internship' },
  { key: 'graduate', label: 'Graduate Programme' },
  { key: 'general', label: 'General Application' },
];

function getProfileField(fields: { label: string; value: string }[] | undefined, ...keys: string[]) {
  if (!fields) return '';
  const lower = keys.map(k => k.toLowerCase());
  return fields.find(f => lower.some(k => f.label.toLowerCase().includes(k)))?.value ?? '';
}

export default function PrepScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { profile, applications, docs } = useApp();
  const s = styles(colors);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 72 : insets.bottom + 56;

  const [section, setSection] = useState<PrepSection>('letters');

  return (
    <View style={[s.screen, { paddingTop: topPad }]}>
      {/* Header */}
      <View style={s.headerArea}>
        <Text style={s.pageTitle}>Career Prep</Text>
        <Text style={s.pageSubtitle}>Write winning letters · Ace your interviews</Text>
        <View style={s.toggle}>
          <Pressable
            style={[s.toggleBtn, section === 'letters' && s.toggleBtnActive]}
            onPress={() => setSection('letters')}
            android_ripple={{ color: colors.indigoBg }}
          >
            <Feather name="file-text" size={14} color={section === 'letters' ? '#fff' : colors.textMuted} />
            <Text style={[s.toggleLabel, section === 'letters' && s.toggleLabelActive]}>Letters</Text>
          </Pressable>
          <Pressable
            style={[s.toggleBtn, section === 'interview' && s.toggleBtnActive]}
            onPress={() => setSection('interview')}
            android_ripple={{ color: colors.indigoBg }}
          >
            <Feather name="mic" size={14} color={section === 'interview' ? '#fff' : colors.textMuted} />
            <Text style={[s.toggleLabel, section === 'interview' && s.toggleLabelActive]}>Interview Prep</Text>
          </Pressable>
        </View>
      </View>

      {section === 'letters' ? (
        <LettersSection bottomPad={bottomPad} colors={colors} profile={profile} docs={docs} />
      ) : (
        <InterviewSection bottomPad={bottomPad} colors={colors} profile={profile} applications={applications} docs={docs} />
      )}
    </View>
  );
}

function LettersSection({
  bottomPad,
  colors,
  profile,
  docs,
}: {
  bottomPad: number;
  colors: ReturnType<typeof useColors>;
  profile: ReturnType<typeof useApp>['profile'];
  docs: ReturnType<typeof useApp>['docs'];
}) {
  const s = styles(colors);
  const scrollRef = useRef<ScrollView>(null);

  const profilePhone = getProfileField(profile?.profileFields, 'phone', 'mobile', 'tel');
  const profileEmail = getProfileField(profile?.profileFields, 'email');

  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [letterType, setLetterType] = useState<LetterType>('attachment');
  const [hasDraft, setHasDraft] = useState(false);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedLetter, setGeneratedLetter] = useState('');
  const [copied, setCopied] = useState(false);

  async function generateLetter() {
    if (!company.trim()) { Alert.alert('Company required', 'Please enter the company or organisation name.'); return; }
    if (!role.trim()) { Alert.alert('Role required', 'Please enter the role or department you are applying for.'); return; }
    if (!profile?.currentDegree) { Alert.alert('Degree missing', 'Add your degree in Profile first so we can personalise your letter.'); return; }
    setLoading(true);
    setGeneratedLetter('');
    try {
      const res = await fetch(`${getApiBase()}/api/ai/draft-letter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: company.trim(),
          role: role.trim(),
          degree: profile.currentDegree,
          goals: profile.careerGoals || '',
          institution: profile.institution || '',
          yearOfStudy: profile.yearOfStudy || '',
          skills: profile.skills || '',
          portfolioUrl: profile.portfolioUrl || '',
          userDraft: hasDraft ? draft.trim() : undefined,
          letterType,
          studentName: profile.displayName || '',
          studentPhone: profilePhone,
          studentEmail: profileEmail,
          studentCity: profile.city || '',
          cvContent: getCvContent(docs),
        }),
      });
      if (!res.ok) throw new Error('api');
      const data: { letter: string } = await res.json();
      setGeneratedLetter(data.letter);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
    } catch {
      Alert.alert('Could not generate letter', 'Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function copyLetter() {
    await Clipboard.setStringAsync(generatedLetter);
    setCopied(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollRef}
        style={s.sectionScroll}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomPad + 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Profile auto-fill notice */}
        {profile?.displayName ? (
          <View style={s.infoBox}>
            <Feather name="user-check" size={13} color={colors.success} />
            <Text style={s.infoText}>Auto-filling from your profile: {profile.displayName} · {profile.institution || 'No institution'}</Text>
          </View>
        ) : (
          <View style={[s.infoBox, { backgroundColor: colors.warningBg, borderColor: colors.warningBorder }]}>
            <Feather name="alert-triangle" size={13} color={colors.warning} />
            <Text style={[s.infoText, { color: colors.warning }]}>Complete your Profile for a more personalised letter</Text>
          </View>
        )}

        {/* Form */}
        <View style={s.formCard}>
          <Text style={s.formLabel}>Company / Organisation *</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. Zamtel, Zanaco, ZESCO, NHIMA..."
            placeholderTextColor={colors.textMuted}
            value={company}
            onChangeText={setCompany}
          />

          <Text style={s.formLabel}>Role / Department *</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. IT Department, Finance Internship..."
            placeholderTextColor={colors.textMuted}
            value={role}
            onChangeText={setRole}
          />

          <Text style={s.formLabel}>Letter Type</Text>
          <View style={s.letterTypeRow}>
            {LETTER_TYPES.map(lt => (
              <Pressable
                key={lt.key}
                style={[s.ltChip, letterType === lt.key && s.ltChipActive]}
                onPress={() => setLetterType(lt.key)}
                android_ripple={{ color: colors.indigoBg }}
              >
                <Text style={[s.ltChipText, letterType === lt.key && s.ltChipTextActive]}>{lt.label}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={s.draftToggle}
            onPress={() => setHasDraft(p => !p)}
            android_ripple={{ color: colors.indigoBg }}
          >
            <View style={[s.checkbox, hasDraft && s.checkboxOn]}>
              {hasDraft && <Feather name="check" size={11} color="#fff" />}
            </View>
            <Text style={s.draftToggleText}>I have a draft I want polished</Text>
          </Pressable>

          {hasDraft && (
            <TextInput
              style={[s.input, s.textarea]}
              placeholder="Paste your draft letter here…"
              placeholderTextColor={colors.textMuted}
              value={draft}
              onChangeText={setDraft}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />
          )}
        </View>

        {/* Generate Button */}
        <Pressable
          style={({ pressed }) => [s.actionBtn, pressed && { opacity: 0.9 }]}
          onPress={generateLetter}
          disabled={loading}
          android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
        >
          <LinearGradient colors={['#6366f1', '#4f46e5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.actionBtnGradient}>
            {loading ? (
              <>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={s.actionBtnText}>Generating Letter…</Text>
              </>
            ) : (
              <>
                <Feather name="edit-3" size={18} color="#fff" />
                <Text style={s.actionBtnText}>{generatedLetter ? 'Regenerate' : 'Generate Letter'}</Text>
              </>
            )}
          </LinearGradient>
        </Pressable>

        {/* Generated letter */}
        {!!generatedLetter && (
          <View style={s.letterCard}>
            <View style={s.letterCardHeader}>
              <Feather name="file-text" size={16} color={colors.primary} />
              <Text style={s.letterCardTitle}>Your Application Letter</Text>
              <Pressable style={s.copyBtn} onPress={copyLetter} android_ripple={{ color: colors.indigoBg }}>
                <Feather name={copied ? 'check' : 'copy'} size={14} color={copied ? colors.success : colors.primary} />
                <Text style={[s.copyBtnText, copied && { color: colors.success }]}>{copied ? 'Copied!' : 'Copy'}</Text>
              </Pressable>
            </View>
            <Text style={s.letterText} selectable>{generatedLetter}</Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function InterviewSection({
  bottomPad,
  colors,
  profile,
  applications,
  docs,
}: {
  bottomPad: number;
  colors: ReturnType<typeof useColors>;
  profile: ReturnType<typeof useApp>['profile'];
  applications: ReturnType<typeof useApp>['applications'];
  docs: ReturnType<typeof useApp>['docs'];
}) {
  const s = styles(colors);

  const [stage, setStage] = useState<InterviewStage>('pick');
  const [customCompany, setCustomCompany] = useState('');
  const [customRole, setCustomRole] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [selected, setSelected] = useState<SelectedCompany | null>(null);
  const [researchSummary, setResearchSummary] = useState('');
  const [questions, setQuestions] = useState<string[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [verdict, setVerdict] = useState<VerdictResult | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [isListening, setIsListening] = useState(false);
  const chatRef = useRef<ScrollView>(null);
  const recognitionRef = useRef<any>(null);

  function toggleVoice() {
    if (Platform.OS !== 'web') return;
    const win = window as any;
    const SR = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SR) {
      Alert.alert('Voice not supported', 'Speech recognition is not available in this browser. Please type your answer.');
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const r = new SR();
    recognitionRef.current = r;
    r.continuous = true;
    r.interimResults = true;
    r.lang = 'en-US';
    r.onstart = () => setIsListening(true);
    r.onend = () => setIsListening(false);
    r.onerror = () => setIsListening(false);
    r.onresult = (e: any) => {
      let t = '';
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      setCurrentAnswer(t);
    };
    r.start();
  }

  function resetInterview() {
    recognitionRef.current?.stop();
    setIsListening(false);
    setStage('pick');
    setSelected(null);
    setResearchSummary('');
    setQuestions([]);
    setCurrentIdx(0);
    setAnswers([]);
    setCurrentAnswer('');
    setVerdict(null);
    setShowCustomInput(false);
    setCustomCompany('');
    setCustomRole('');
  }

  async function startWithCompany(company: SelectedCompany) {
    setSelected(company);
    setStage('loading-intel');
    setStatusMsg('Loading company information…');
    try {
      const [researchRes, questionsRes] = await Promise.all([
        fetch(`${getApiBase()}/api/ai/research-company`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyName: company.name }),
        }),
        fetch(`${getApiBase()}/api/ai/interview-questions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyName: company.name,
            role: company.role,
            degree: profile?.currentDegree || 'General',
            goals: profile?.careerGoals || '',
            institution: profile?.institution || '',
            yearOfStudy: profile?.yearOfStudy || '',
            skills: profile?.skills || '',
            cvContent: getCvContent(docs),
          }),
        }),
      ]);

      if (!researchRes.ok || !questionsRes.ok) throw new Error('api');

      const researchData: { summary: string } = await researchRes.json();
      const questionsData: { personal: string[]; company: string[]; experience: string[] } = await questionsRes.json();

      const allQuestions = [
        ...questionsData.personal,
        ...questionsData.company,
        ...questionsData.experience,
      ].slice(0, 8);

      if (allQuestions.length === 0) throw new Error('no-questions');

      setResearchSummary(researchData.summary);
      setQuestions(allQuestions);
      setStage('briefing');
    } catch {
      Alert.alert('Could not load company data', 'Check your connection and try again.');
      setStage('pick');
    }
  }

  async function submitAnswer() {
    if (!currentAnswer.trim()) {
      Alert.alert('Please answer the question', 'Type or speak your response before submitting.');
      return;
    }
    recognitionRef.current?.stop();
    setIsListening(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newAnswers = [...answers, currentAnswer.trim()];
    setAnswers(newAnswers);
    setCurrentAnswer('');

    if (currentIdx + 1 < questions.length) {
      setCurrentIdx(i => i + 1);
      setTimeout(() => chatRef.current?.scrollToEnd({ animated: true }), 200);
    } else {
      await finishInterview(newAnswers);
    }
  }

  async function finishInterview(finalAnswers: string[]) {
    if (!selected) return;
    setStage('loading-verdict');
    setStatusMsg('The panel is reviewing your performance…');
    try {
      const res = await fetch(`${getApiBase()}/api/ai/interview-verdict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: selected.name,
          role: selected.role,
          degree: profile?.currentDegree || 'General',
          goals: profile?.careerGoals || '',
          institution: profile?.institution || '',
          yearOfStudy: profile?.yearOfStudy || '',
          skills: profile?.skills || '',
          city: profile?.city || '',
          questions,
          answers: finalAnswers,
          researchSummary,
          cvContent: getCvContent(docs),
        }),
      });
      if (!res.ok) throw new Error('api');
      const data: VerdictResult = await res.json();
      setVerdict(data);
      setStage('verdict');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Could not get verdict', 'Check your connection and try again.');
      setStage('interviewing');
    }
  }

  const VERDICT_META = {
    accepted: { color: colors.success, bg: colors.successBg, border: colors.successBorder, icon: 'check-circle', label: 'ACCEPTED' },
    shortlisted: { color: colors.warning, bg: colors.warningBg, border: colors.warningBorder, icon: 'star', label: 'SHORTLISTED' },
    rejected: { color: colors.danger, bg: colors.dangerBg, border: colors.dangerBorder, icon: 'x-circle', label: 'NOT SELECTED' },
  } as const;

  if (stage === 'pick') {
    return (
      <ScrollView
        style={s.sectionScroll}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomPad + 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.pickTitle}>Choose a Company</Text>
        <Text style={s.pickSubtitle}>Pick from your tracked applications or enter a custom company to start a mock interview.</Text>

        {/* Custom company input */}
        {showCustomInput ? (
          <View style={s.formCard}>
            <Text style={s.formLabel}>Company Name *</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Zamtel, Zanaco, MTN Zambia..."
              placeholderTextColor={colors.textMuted}
              value={customCompany}
              onChangeText={setCustomCompany}
              autoFocus
            />
            <Text style={s.formLabel}>Role / Position *</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Software Engineer Intern, Finance Attachment..."
              placeholderTextColor={colors.textMuted}
              value={customRole}
              onChangeText={setCustomRole}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <Pressable
                style={[s.smallBtn, { flex: 1, borderColor: colors.border }]}
                onPress={() => { setShowCustomInput(false); setCustomCompany(''); setCustomRole(''); }}
              >
                <Text style={[s.smallBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[s.smallBtn, { flex: 1, backgroundColor: colors.indigoBg, borderColor: colors.indigoBorder }]}
                onPress={() => {
                  if (!customCompany.trim() || !customRole.trim()) {
                    Alert.alert('Fill in both fields', 'Company name and role are required.');
                    return;
                  }
                  startWithCompany({ name: customCompany.trim(), role: customRole.trim() });
                }}
              >
                <Text style={[s.smallBtnText, { color: colors.primary }]}>Start Interview</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            style={s.customCard}
            onPress={() => setShowCustomInput(true)}
            android_ripple={{ color: colors.indigoBg }}
          >
            <View style={[s.companyInitialBox, { backgroundColor: colors.indigoBg, borderColor: colors.indigoBorder }]}>
              <Feather name="plus" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.companyCardName}>Custom Company</Text>
              <Text style={s.companyCardRole}>Enter any company name and role</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.textMuted} />
          </Pressable>
        )}

        {applications.length > 0 && (
          <>
            <Text style={s.sectionLabel}>Your Tracked Companies</Text>
            {applications.map((app) => (
              <Pressable
                key={app.id}
                style={s.companyPickCard}
                onPress={() => startWithCompany({ name: app.companyName, role: app.role })}
                android_ripple={{ color: colors.indigoBg }}
              >
                <View style={s.companyInitialBox}>
                  <Text style={s.companyInitialText}>{app.companyName[0]?.toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.companyCardName}>{app.companyName}</Text>
                  <Text style={s.companyCardRole} numberOfLines={1}>{app.role}</Text>
                </View>
                <View style={[s.statusChip, getStatusStyle(app.status, colors)]}>
                  <Text style={[s.statusChipText, getStatusTextStyle(app.status, colors)]}>{app.status}</Text>
                </View>
              </Pressable>
            ))}
          </>
        )}

        {applications.length === 0 && !showCustomInput && (
          <View style={s.emptyState}>
            <Feather name="briefcase" size={28} color={colors.primary} />
            <Text style={s.emptyTitle}>No tracked companies yet</Text>
            <Text style={s.emptySubtitle}>Use the custom option above, or track companies in the Companies tab first.</Text>
          </View>
        )}
      </ScrollView>
    );
  }

  if (stage === 'loading-intel' || stage === 'loading-verdict') {
    return (
      <View style={s.loadingFull}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={s.loadingTitle}>{stage === 'loading-intel' ? selected?.name : 'Interview Panel'}</Text>
        <Text style={s.loadingSubtitle}>{statusMsg}</Text>
      </View>
    );
  }

  if (stage === 'briefing' && selected) {
    const summary = researchSummary.split('\n').slice(0, 6).join('\n');
    return (
      <ScrollView
        style={s.sectionScroll}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomPad + 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.briefingHeader}>
          <View style={s.companyInitialBox}>
            <Text style={s.companyInitialText}>{selected.name[0]?.toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.briefingCompany}>{selected.name}</Text>
            <Text style={s.briefingRole}>{selected.role}</Text>
          </View>
        </View>

        <View style={s.briefingCard}>
          <View style={s.briefingCardHeader}>
            <Feather name="book-open" size={14} color={colors.primary} />
            <Text style={s.briefingCardTitle}>Company Information</Text>
          </View>
          <Text style={s.briefingText}>{summary}</Text>
        </View>

        <View style={s.briefingTips}>
          <Text style={s.tipsTitle}>Interview Tips</Text>
          {[
            'Answer each question naturally — the AI adapts follow-up questions based on your responses.',
            'Structure answers: what you did, how you did it, and the outcome.',
            'You will receive a full verdict and per-answer feedback at the end.',
          ].map((tip, i) => (
            <View key={i} style={s.tipRow}>
              <View style={s.tipDot} />
              <Text style={s.tipText}>{tip}</Text>
            </View>
          ))}
        </View>

        <Pressable
          style={({ pressed }) => [s.actionBtn, pressed && { opacity: 0.9 }]}
          onPress={() => { setCurrentIdx(0); setAnswers([]); setStage('interviewing'); }}
          android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
        >
          <LinearGradient colors={['#6366f1', '#4f46e5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.actionBtnGradient}>
            <Feather name="mic" size={18} color="#fff" />
            <Text style={s.actionBtnText}>Begin Mock Interview</Text>
          </LinearGradient>
        </Pressable>

        <Pressable style={s.backLink} onPress={resetInterview}>
          <Feather name="arrow-left" size={14} color={colors.textMuted} />
          <Text style={s.backLinkText}>Choose a different company</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (stage === 'interviewing' && selected) {
    const progress = questions.length > 0 ? (currentIdx / questions.length) * 100 : 0;
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={topPadForKAV()}>
        <View style={s.interviewHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.interviewCompanyChip}>{selected.name} · {selected.role}</Text>
            <Text style={s.interviewProgress}>Question {currentIdx + 1} of {questions.length}</Text>
          </View>
          <Pressable onPress={() => Alert.alert('End Interview?', 'Your progress will be lost.', [
            { text: 'Keep Going', style: 'cancel' },
            { text: 'End', style: 'destructive', onPress: resetInterview },
          ])}>
            <Feather name="x" size={20} color={colors.textMuted} />
          </Pressable>
        </View>

        {/* Progress bar */}
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${progress}%` as any }]} />
        </View>

        <ScrollView
          ref={chatRef}
          style={s.chatArea}
          contentContainerStyle={{ padding: 20 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => chatRef.current?.scrollToEnd({ animated: true })}
        >
          {/* Previous Q&As */}
          {answers.map((ans, i) => (
            <View key={i} style={s.qaPair}>
              <View style={s.questionBubble}>
                <Feather name="cpu" size={12} color={colors.primary} style={{ marginTop: 2 }} />
                <Text style={s.questionText}>{questions[i]}</Text>
              </View>
              <View style={s.answerBubble}>
                <Feather name="user" size={12} color={colors.textSecondary} style={{ marginTop: 2 }} />
                <Text style={s.answerText}>{ans}</Text>
              </View>
            </View>
          ))}

          {/* Current question */}
          <View style={[s.questionBubble, s.questionBubbleCurrent]}>
            <Feather name="cpu" size={13} color={colors.primary} style={{ marginTop: 2 }} />
            <Text style={[s.questionText, { color: colors.text }]}>{questions[currentIdx]}</Text>
          </View>
        </ScrollView>

        {/* Answer input */}
        <View style={[s.answerInputArea, { paddingBottom: bottomPad + 8 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            {Platform.OS === 'web' && (
              <Pressable
                onPress={toggleVoice}
                style={({ pressed }) => [s.micBtn, isListening && s.micBtnActive, pressed && { opacity: 0.8 }]}
              >
                <Feather name={isListening ? 'mic-off' : 'mic'} size={20} color={isListening ? '#fff' : colors.primary} />
              </Pressable>
            )}
            <TextInput
              style={[s.answerInput, { flex: 1 }]}
              placeholder={isListening ? '🎤 Listening… speak now' : 'Type your answer or tap the mic…'}
              placeholderTextColor={isListening ? colors.primary : colors.textMuted}
              value={currentAnswer}
              onChangeText={setCurrentAnswer}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>
          <Pressable
            style={({ pressed }) => [s.submitBtn, pressed && { opacity: 0.85 }]}
            onPress={submitAnswer}
            android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
          >
            <LinearGradient colors={['#6366f1', '#4f46e5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.submitBtnGradient}>
              <Text style={s.submitBtnText}>{currentIdx + 1 === questions.length ? 'Finish Interview' : 'Next Question'}</Text>
              <Feather name={currentIdx + 1 === questions.length ? 'flag' : 'arrow-right'} size={16} color="#fff" />
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    );
  }

  if (stage === 'verdict' && verdict && selected) {
    const meta = VERDICT_META[verdict.verdict] ?? VERDICT_META.rejected;
    return (
      <ScrollView
        style={s.sectionScroll}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomPad + 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Verdict banner */}
        <View style={[s.verdictBanner, { backgroundColor: meta.bg, borderColor: meta.border }]}>
          <Feather name={meta.icon as any} size={36} color={meta.color} />
          <Text style={[s.verdictLabel, { color: meta.color }]}>{meta.label}</Text>
          <Text style={[s.verdictCompany, { color: meta.color }]}>{selected.name} · {selected.role}</Text>
          <View style={s.scoreBadge}>
            <Text style={[s.scoreText, { color: meta.color }]}>{verdict.overallScore}<Text style={s.scoreOutOf}>/10</Text></Text>
          </View>
        </View>

        {/* Overall feedback */}
        <View style={s.feedbackCard}>
          <Text style={s.feedbackCardTitle}>Overall Assessment</Text>
          <Text style={s.feedbackCardText}>{verdict.overallFeedback}</Text>
        </View>

        {/* Strengths */}
        <View style={s.feedbackCard}>
          <Text style={s.feedbackCardTitle}>What You Did Well</Text>
          {verdict.strengths.map((s2, i) => (
            <View key={i} style={s.strengthRow}>
              <Feather name="check-circle" size={14} color={colors.success} />
              <Text style={s.strengthText}>{s2}</Text>
            </View>
          ))}
        </View>

        {/* Areas to improve */}
        <View style={s.feedbackCard}>
          <Text style={s.feedbackCardTitle}>Areas to Improve</Text>
          {verdict.areasToImprove.map((area, i) => (
            <View key={i} style={s.improveRow}>
              <Feather name="alert-circle" size={14} color={colors.warning} />
              <Text style={s.improveText}>{area}</Text>
            </View>
          ))}
        </View>

        {/* Per-answer feedback */}
        <Text style={s.sectionLabel}>Answer-by-Answer Breakdown</Text>
        {verdict.answerFeedback.map((af, i) => (
          <View key={i} style={s.answerFeedbackCard}>
            <View style={s.answerFeedbackHeader}>
              <Text style={s.afQuestionNum}>Q{i + 1}</Text>
              <Text style={[s.afScore, { color: scoreColor(af.score, colors) }]}>{af.score}/10</Text>
            </View>
            <Text style={s.afQuestion}>{af.question}</Text>
            <View style={s.afAnswerBox}>
              <Text style={s.afAnswerLabel}>Your answer</Text>
              <Text style={s.afAnswerText}>{af.answer}</Text>
            </View>
            <Text style={s.afFeedback}>{af.feedback}</Text>
          </View>
        ))}

        {/* Recommendation */}
        <View style={[s.feedbackCard, { borderColor: colors.indigoBorder, backgroundColor: colors.indigoBg }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Feather name="compass" size={14} color={colors.primary} />
            <Text style={[s.feedbackCardTitle, { color: colors.primary }]}>Personal Recommendation</Text>
          </View>
          <Text style={s.feedbackCardText}>{verdict.recommendation}</Text>
        </View>

        {/* Actions */}
        <View style={{ gap: 12, marginTop: 8 }}>
          <Pressable
            style={({ pressed }) => [s.actionBtn, pressed && { opacity: 0.9 }]}
            onPress={() => {
              setCurrentIdx(0);
              setAnswers([]);
              setCurrentAnswer('');
              setVerdict(null);
              setStage('briefing');
            }}
            android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
          >
            <LinearGradient colors={['#6366f1', '#4f46e5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.actionBtnGradient}>
              <Feather name="refresh-cw" size={16} color="#fff" />
              <Text style={s.actionBtnText}>Practice Again</Text>
            </LinearGradient>
          </Pressable>
          <Pressable style={s.outlineBtn} onPress={resetInterview} android_ripple={{ color: colors.indigoBg }}>
            <Text style={s.outlineBtnText}>Try a Different Company</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return null;
}

function topPadForKAV() {
  return Platform.OS === 'ios' ? 120 : 0;
}

function scoreColor(score: number, colors: ReturnType<typeof useColors>) {
  if (score >= 8) return colors.success;
  if (score >= 5) return colors.warning;
  return colors.danger;
}

function getStatusStyle(status: string, colors: ReturnType<typeof useColors>) {
  const map: Record<string, object> = {
    Interviewing: { backgroundColor: colors.purpleBg, borderColor: colors.purpleBorder },
    Applied: { backgroundColor: colors.indigoBg, borderColor: colors.indigoBorder },
    Offer: { backgroundColor: colors.successBg, borderColor: colors.successBorder },
    Accepted: { backgroundColor: colors.successBg, borderColor: colors.successBorder },
    Rejected: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
  };
  return map[status] ?? { backgroundColor: colors.muted, borderColor: colors.border };
}

function getStatusTextStyle(status: string, colors: ReturnType<typeof useColors>) {
  const map: Record<string, object> = {
    Interviewing: { color: colors.purple },
    Applied: { color: colors.primary },
    Offer: { color: colors.success },
    Accepted: { color: colors.success },
    Rejected: { color: colors.danger },
  };
  return map[status] ?? { color: colors.textMuted };
}

const styles = (colors: ReturnType<typeof useColors>) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  headerArea: { paddingHorizontal: 20, paddingBottom: 16 },
  pageTitle: { fontSize: 30, fontFamily: 'Inter_700Bold', color: colors.text, letterSpacing: -0.8, marginBottom: 4 },
  pageSubtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.textSecondary, marginBottom: 18 },
  toggle: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 4, gap: 4 },
  toggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 10, borderRadius: 12 },
  toggleBtnActive: { backgroundColor: colors.primary },
  toggleLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.textMuted },
  toggleLabelActive: { color: '#fff' },

  sectionScroll: { flex: 1 },
  infoBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.successBg, borderWidth: 1, borderColor: colors.successBorder, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16 },
  infoText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: colors.success, flex: 1 },

  formCard: { backgroundColor: colors.card, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: colors.border, marginBottom: 16, gap: 6 },
  formLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.textSecondary, marginTop: 10, marginBottom: 4 },
  input: { backgroundColor: colors.background, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.text },
  textarea: { height: 120, textAlignVertical: 'top', paddingTop: 12 },

  letterTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ltChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  ltChipActive: { backgroundColor: colors.indigoBg, borderColor: colors.indigoBorder },
  ltChipText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: colors.textMuted },
  ltChipTextActive: { color: colors.primary },

  draftToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  draftToggleText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.textSecondary },

  actionBtn: { borderRadius: 18, overflow: 'hidden', marginBottom: 16 },
  actionBtnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 20 },
  actionBtnText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#fff', letterSpacing: 0.2 },

  letterCard: { backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  letterCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, borderBottomWidth: 1, borderBottomColor: colors.divider },
  letterCardTitle: { flex: 1, fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.text },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.indigoBg, borderRadius: 10, borderWidth: 1, borderColor: colors.indigoBorder },
  copyBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.primary },
  letterText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textSecondary, lineHeight: 22, padding: 18 },

  pickTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', color: colors.text, marginBottom: 6, letterSpacing: -0.5 },
  pickSubtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.textSecondary, lineHeight: 20, marginBottom: 20 },
  sectionLabel: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 8, marginBottom: 12 },

  customCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.indigoBorder, marginBottom: 20 },
  companyPickCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  companyInitialBox: { width: 50, height: 50, borderRadius: 14, backgroundColor: colors.indigoBg, borderWidth: 1, borderColor: colors.indigoBorder, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  companyInitialText: { fontSize: 22, fontFamily: 'Inter_700Bold', color: colors.primary },
  companyCardName: { fontSize: 15, fontFamily: 'Inter_700Bold', color: colors.text, marginBottom: 3 },
  companyCardRole: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.textMuted },
  statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  statusChipText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },

  smallBtn: { paddingVertical: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  smallBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: colors.text },
  emptySubtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.textMuted, textAlign: 'center', lineHeight: 20, maxWidth: 280 },

  loadingFull: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, paddingHorizontal: 40 },
  loadingTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', color: colors.text, textAlign: 'center' },
  loadingSubtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.textMuted, textAlign: 'center' },

  briefingHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  briefingCompany: { fontSize: 20, fontFamily: 'Inter_700Bold', color: colors.text, letterSpacing: -0.4 },
  briefingRole: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textMuted, marginTop: 3 },
  briefingCard: { backgroundColor: colors.card, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
  briefingCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  briefingCardTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  briefingText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textSecondary, lineHeight: 22 },
  briefingTips: { backgroundColor: colors.card, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: colors.border, marginBottom: 20 },
  tipsTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  tipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginTop: 6, flexShrink: 0 },
  tipText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textMuted, lineHeight: 20, flex: 1 },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', paddingVertical: 16 },
  backLinkText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.textMuted },

  interviewHeader: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  interviewCompanyChip: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.text, marginBottom: 3 },
  interviewProgress: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.textMuted },
  progressTrack: { height: 3, backgroundColor: colors.muted, marginHorizontal: 0 },
  progressFill: { height: 3, backgroundColor: colors.primary, borderRadius: 2 },

  chatArea: { flex: 1 },
  qaPair: { marginBottom: 16 },
  questionBubble: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 8 },
  questionBubbleCurrent: { borderColor: colors.indigoBorder, backgroundColor: colors.indigoBg },
  questionText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.textSecondary, lineHeight: 22, flex: 1 },
  answerBubble: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: colors.mutedStrong, borderRadius: 16, padding: 14, marginLeft: 20 },
  answerText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textSecondary, lineHeight: 20, flex: 1 },

  answerInputArea: { borderTopWidth: 1, borderTopColor: colors.border, padding: 16, gap: 12, backgroundColor: colors.background },
  answerInput: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.text, minHeight: 80, textAlignVertical: 'top' },
  micBtn: { width: 48, height: 80, borderRadius: 14, borderWidth: 1, borderColor: colors.indigoBorder, backgroundColor: colors.indigoBg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  micBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  submitBtn: { borderRadius: 14, overflow: 'hidden' },
  submitBtnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
  submitBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' },

  verdictBanner: { borderRadius: 24, borderWidth: 1, padding: 28, alignItems: 'center', marginBottom: 20, gap: 8 },
  verdictLabel: { fontSize: 28, fontFamily: 'Inter_700Bold', letterSpacing: 2, textTransform: 'uppercase' },
  verdictCompany: { fontSize: 13, fontFamily: 'Inter_400Regular', opacity: 0.8 },
  scoreBadge: { marginTop: 8 },
  scoreText: { fontSize: 42, fontFamily: 'Inter_700Bold' },
  scoreOutOf: { fontSize: 20, fontFamily: 'Inter_400Regular' },

  feedbackCard: { backgroundColor: colors.card, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: colors.border, marginBottom: 14 },
  feedbackCardTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  feedbackCardText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.textSecondary, lineHeight: 22 },
  strengthRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  strengthText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textSecondary, lineHeight: 20, flex: 1 },
  improveRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  improveText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textSecondary, lineHeight: 20, flex: 1 },

  answerFeedbackCard: { backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  answerFeedbackHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  afQuestionNum: { fontSize: 11, fontFamily: 'Inter_700Bold', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  afScore: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  afQuestion: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.text, lineHeight: 20, marginBottom: 10 },
  afAnswerBox: { backgroundColor: colors.mutedStrong, borderRadius: 10, padding: 12, marginBottom: 10 },
  afAnswerLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  afAnswerText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.textSecondary, lineHeight: 18 },
  afFeedback: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textSecondary, lineHeight: 20 },

  outlineBtn: { borderRadius: 16, borderWidth: 1.5, borderColor: colors.indigoBorder, paddingVertical: 16, alignItems: 'center', backgroundColor: colors.indigoBg },
  outlineBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: colors.primary },
});

import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';

import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { getApiBase } from '@/constants/config';
import { buildDocumentsContext } from '@/utils/docContext';

interface CompanyResult {
  name: string;
  description: string;
  fitScore: 'Excellent Fit' | 'Strong Fit' | 'Good Fit';
  website?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  linkedin?: string | null;
  facebook?: string | null;
  twitter?: string | null;
}

const FIT_META: Record<string, { color: string; bg: string; border: string; icon: string }> = {
  'Excellent Fit': { color: '#10b981', bg: 'rgba(16,185,129,0.14)', border: 'rgba(16,185,129,0.25)', icon: 'star' },
  'Strong Fit':    { color: '#6366f1', bg: 'rgba(99,102,241,0.14)', border: 'rgba(99,102,241,0.25)', icon: 'trending-up' },
  'Good Fit':      { color: '#3b82f6', bg: 'rgba(59,130,246,0.14)', border: 'rgba(59,130,246,0.25)', icon: 'thumbs-up' },
};

async function getLocation(): Promise<{ latitude: number; longitude: number }> {
  if (Platform.OS === 'web') {
    return new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(
        p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
        reject,
      ),
    );
  }
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Location permission denied');
  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
}

export default function CompaniesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { profile, applications, docs, addApplication } = useApp();
  const [results, setResults] = useState<CompanyResult[]>([]);
  const [trackedNames, setTrackedNames] = useState<Set<string>>(new Set());
  const [locationText, setLocationText] = useState(profile?.city || '');
  const [gpsLoading, setGpsLoading] = useState(false);
  const locationInputRef = useRef<TextInput>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 72 : insets.bottom + 56;

  const alreadyTracked = (name: string) =>
    applications.some(a => a.companyName.toLowerCase() === name.toLowerCase()) || trackedNames.has(name);

  const handleUseGps = async () => {
    setGpsLoading(true);
    try {
      const { latitude, longitude } = await getLocation();
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
        { headers: { 'Accept-Language': 'en' } },
      );
      if (res.ok) {
        const data = await res.json() as { address?: { city?: string; town?: string; county?: string; state?: string; country?: string } };
        const addr = data.address ?? {};
        const place = addr.city || addr.town || addr.county || addr.state || '';
        const country = addr.country || '';
        setLocationText([place, country].filter(Boolean).join(', '));
      }
    } catch {
      Alert.alert('Could not get location', 'Enter your location manually instead.');
    } finally {
      setGpsLoading(false);
    }
  };

  const [searchedLocation, setSearchedLocation] = useState('');

  const discoverMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.currentDegree) throw new Error('no-degree');
      const loc = locationText.trim();
      if (!loc) throw new Error('no-location');
      setSearchedLocation(loc);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45_000);
      try {
        const res = await fetch(`${getApiBase()}/api/ai/discover-companies`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            locationText: loc,
            degree: profile.currentDegree,
            institution: profile.institution,
            yearOfStudy: profile.yearOfStudy,
            skills: profile.skills,
            city: profile.city,
            preferredIndustries: profile.preferredIndustries,
            goals: profile.careerGoals,
            documentsContext: buildDocumentsContext(docs),
          }),
        });
        if (!res.ok) throw new Error('api');
        return res.json() as Promise<CompanyResult[]>;
      } finally {
        clearTimeout(timeout);
      }
    },
    onSuccess: (data) => {
      setResults(data);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => {
      if (err.message === 'no-degree') {
        Alert.alert('Degree required', 'Please add your degree in Profile before discovering organisations.');
      } else if (err.message === 'no-location') {
        Alert.alert('Location required', 'Enter a town, province, or country to search in.');
        locationInputRef.current?.focus();
      } else if (err.name === 'AbortError') {
        Alert.alert('Taking too long', 'The search timed out. Try again — AI searches can take up to 30 seconds.');
      } else {
        Alert.alert('Search failed', 'Check your internet connection and try again.');
      }
    },
  });

  const handleTrack = async (company: CompanyResult) => {
    if (alreadyTracked(company.name)) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await addApplication({
      companyName: company.name,
      role: `WIL Placement – ${profile?.currentDegree || 'General'}`,
      status: 'Interested',
      researchSummary: undefined,
    });
    setTrackedNames(prev => new Set([...prev, company.name]));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const router = useRouter();
  const s = styles(colors);

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={{ paddingTop: topPad + 24, paddingBottom: bottomPad + 24 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={s.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Find Work Placements</Text>
          <Text style={s.subtitle}>AI finds companies, NGOs, hospitals, and government offices near you that could take you on as an intern or work experience student — with their full contact details.</Text>
        </View>
        <View style={s.flagTag}>
          <Text style={s.flagText}>🇿🇲</Text>
        </View>
      </View>

      {/* Degree chip */}
      {profile?.currentDegree ? (
        <View style={s.degreeChip}>
          <Feather name="book-open" size={13} color={colors.primary} />
          <Text style={s.degreeText} numberOfLines={1}>{profile.currentDegree}</Text>
        </View>
      ) : (
        <View style={[s.degreeChip, { backgroundColor: colors.warningBg, borderColor: colors.warningBorder }]}>
          <Feather name="alert-triangle" size={13} color={colors.warning} />
          <Text style={[s.degreeText, { color: colors.warning }]}>Add your degree in Profile first</Text>
        </View>
      )}

      {/* Location input */}
      <View style={{ marginBottom: 16 }}>
        <Text style={s.locationLabel}>Search location</Text>
        <View style={s.locationRow}>
          <View style={s.locationInputWrap}>
            <Feather name="map-pin" size={14} color={colors.textMuted} style={{ marginLeft: 12 }} />
            <TextInput
              ref={locationInputRef}
              value={locationText}
              onChangeText={setLocationText}
              placeholder="e.g. Lusaka, Ndola, Cape Town…"
              placeholderTextColor={colors.textMuted}
              style={s.locationInput}
              returnKeyType="search"
              onSubmitEditing={() => discoverMutation.mutate()}
              autoCorrect={false}
            />
            {locationText.length > 0 && (
              <Pressable onPress={() => setLocationText('')} style={{ paddingHorizontal: 10 }}>
                <Feather name="x" size={14} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
          <Pressable
            style={({ pressed }) => [s.gpsBtn, pressed && { opacity: 0.75 }]}
            onPress={handleUseGps}
            disabled={gpsLoading}
            accessibilityLabel="Detect my location"
          >
            {gpsLoading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Feather name="map-pin" size={16} color="#fff" />}
            {!gpsLoading && <Text style={s.gpsBtnLabel}>Locate</Text>}
          </Pressable>
        </View>

        {/* Location confirmation / progress hint */}
        {discoverMutation.isPending ? (
          <View style={s.locationHint}>
            <ActivityIndicator size="small" color={colors.primary} style={{ transform: [{ scale: 0.65 }] }} />
            <Text style={s.locationHintText}>
              Searching in <Text style={{ color: colors.text, fontFamily: 'Inter_600SemiBold' }}>{searchedLocation}</Text> — AI search takes 15–30 s…
            </Text>
          </View>
        ) : locationText.trim().length > 0 ? (
          <View style={s.locationHint}>
            <Feather name="info" size={11} color={colors.primary} />
            <Text style={s.locationHintText}>
              Will search for organisations in <Text style={{ color: colors.text, fontFamily: 'Inter_600SemiBold' }}>{locationText.trim()}</Text>
            </Text>
          </View>
        ) : null}
      </View>

      {/* Scan Button */}
      <Pressable
        style={({ pressed }) => [s.scanBtn, pressed && { opacity: 0.9 }]}
        onPress={() => discoverMutation.mutate()}
        disabled={discoverMutation.isPending}
        accessibilityRole="button"
        accessibilityLabel={results.length > 0 ? 'Scan again' : 'Start scanning for WIL placements'}
        android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
      >
        <LinearGradient
          colors={['#6366f1', '#4f46e5']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={s.scanBtnGradient}
        >
          {discoverMutation.isPending ? (
            <>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={s.scanBtnText}>Searching…</Text>
            </>
          ) : (
            <>
              <Feather name="compass" size={20} color="#fff" />
              <Text style={s.scanBtnText}>{results.length > 0 ? 'Scan Again' : 'Start Scan'}</Text>
            </>
          )}
        </LinearGradient>
      </Pressable>

      {/* Results */}
      {results.length > 0 && (
        <>
          <View style={s.resultHeader}>
            <Text style={s.resultCount}>{results.length} organisations found{searchedLocation ? ` in ${searchedLocation}` : ''}</Text>
            <Text style={s.resultHint}>Tap a card to visit their website · Track to add to Applications</Text>
          </View>

          {results.map((company, idx) => {
            const fit = FIT_META[company.fitScore] || FIT_META['Good Fit'];
            const tracked = alreadyTracked(company.name);
            return (
              <View key={idx} style={s.companyCard}>
                <View style={s.companyTop}>
                  <View style={[s.companyInitial, { backgroundColor: fit.bg, borderColor: fit.border }]}>
                    <Text style={[s.companyInitialText, { color: fit.color }]}>{company.name[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.companyName}>{company.name}</Text>
                    <View style={[s.fitBadge, { backgroundColor: fit.bg, borderColor: fit.border }]}>
                      <Feather name={fit.icon as any} size={10} color={fit.color} />
                      <Text style={[s.fitText, { color: fit.color }]}>{company.fitScore}</Text>
                    </View>
                  </View>
                </View>

                <Text style={s.companyDesc}>{company.description}</Text>

                {/* Contact details */}
                {(company.address || company.phone || company.email || company.website || company.linkedin || company.facebook || company.twitter) && (
                  <View style={s.contactSection}>
                    <Text style={s.contactSectionLabel}>Contact Details</Text>
                    {company.address ? (
                      <View style={s.contactRow}>
                        <Feather name="map-pin" size={12} color={colors.textMuted} />
                        <Text style={s.contactText} numberOfLines={2}>{company.address}</Text>
                      </View>
                    ) : null}
                    {company.phone ? (
                      <Pressable style={s.contactRow} onPress={() => Linking.openURL(`tel:${company.phone!.replace(/\s/g, '')}`)} android_ripple={{ color: colors.indigoBg }}>
                        <Feather name="phone" size={12} color={colors.primary} />
                        <Text style={[s.contactText, s.contactLink]}>{company.phone}</Text>
                      </Pressable>
                    ) : null}
                    {company.email ? (
                      <Pressable style={s.contactRow} onPress={() => Linking.openURL(`mailto:${company.email}`)} android_ripple={{ color: colors.indigoBg }}>
                        <Feather name="mail" size={12} color={colors.primary} />
                        <Text style={[s.contactText, s.contactLink]} numberOfLines={1}>{company.email}</Text>
                      </Pressable>
                    ) : null}
                    {company.website ? (
                      <Pressable style={s.contactRow} onPress={() => Linking.openURL(company.website!)} android_ripple={{ color: colors.indigoBg }}>
                        <Feather name="globe" size={12} color={colors.primary} />
                        <Text style={[s.contactText, s.contactLink]} numberOfLines={1}>{company.website.replace(/^https?:\/\//, '')}</Text>
                      </Pressable>
                    ) : null}
                    {company.linkedin ? (
                      <Pressable style={s.contactRow} onPress={() => Linking.openURL(company.linkedin!)} android_ripple={{ color: colors.indigoBg }}>
                        <Feather name="linkedin" size={12} color={colors.primary} />
                        <Text style={[s.contactText, s.contactLink]} numberOfLines={1}>{company.linkedin.replace(/^https?:\/\/(www\.)?/, '')}</Text>
                      </Pressable>
                    ) : null}
                    {company.facebook ? (
                      <Pressable style={s.contactRow} onPress={() => Linking.openURL(company.facebook!)} android_ripple={{ color: colors.indigoBg }}>
                        <Feather name="facebook" size={12} color={colors.primary} />
                        <Text style={[s.contactText, s.contactLink]} numberOfLines={1}>{company.facebook.replace(/^https?:\/\/(www\.)?/, '')}</Text>
                      </Pressable>
                    ) : null}
                    {company.twitter ? (
                      <Pressable style={s.contactRow} onPress={() => Linking.openURL(company.twitter!)} android_ripple={{ color: colors.indigoBg }}>
                        <Feather name="twitter" size={12} color={colors.primary} />
                        <Text style={[s.contactText, s.contactLink]} numberOfLines={1}>{company.twitter.replace(/^https?:\/\/(www\.)?/, '')}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                )}

                <View style={s.companyActions}>
                  <Pressable
                    style={[s.trackBtn, tracked && s.trackBtnDone]}
                    onPress={() => handleTrack(company)}
                    disabled={tracked}
                    accessibilityRole="button"
                    accessibilityLabel={tracked ? `${company.name} is already tracked` : `Track ${company.name}`}
                    accessibilityState={{ disabled: tracked }}
                    android_ripple={{ color: tracked ? colors.successBg : colors.indigoBg }}
                  >
                    <Feather
                      name={tracked ? 'check' : 'plus'}
                      size={14}
                      color={tracked ? colors.success : '#fff'}
                    />
                    <Text style={[s.trackBtnText, tracked && { color: colors.success }]}>
                      {tracked ? 'Tracked' : 'Track'}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={s.detailsBtn}
                    onPress={() => router.push(`/company-detail?data=${encodeURIComponent(JSON.stringify(company))}` as any)}
                    accessibilityRole="button"
                    accessibilityLabel={`View full details for ${company.name}`}
                    android_ripple={{ color: colors.muted }}
                  >
                    <Feather name="chevron-right" size={14} color={colors.textSecondary} />
                    <Text style={s.detailsBtnText}>Details</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </>
      )}

      {/* Empty state */}
      {!discoverMutation.isPending && results.length === 0 && (
        <View style={s.emptyState}>
          <View style={s.emptyIconBg}>
            <Feather name="compass" size={32} color={colors.primary} />
          </View>
          <Text style={s.emptyTitle}>Ready to scan</Text>
          <Text style={s.emptySubtitle}>
            Enter a location, then tap Scan. We'll find companies, NGOs, hospitals, government bodies, and universities offering internships and placements that match your degree.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = (colors: ReturnType<typeof useColors>) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  title: { fontSize: 30, fontFamily: 'Inter_700Bold', color: colors.text, letterSpacing: -0.8, marginBottom: 6 },
  subtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.textSecondary, lineHeight: 20 },
  flagTag: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  flagText: { fontSize: 20 },
  degreeChip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.indigoBg, borderWidth: 1, borderColor: colors.indigoBorder, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16, alignSelf: 'flex-start' },
  degreeText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.primary, flexShrink: 1 },
  locationLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 8 },
  locationHint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingHorizontal: 2 },
  locationHintText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.textMuted, flex: 1, lineHeight: 17 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  locationInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, height: 48 },
  locationInput: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.text, paddingHorizontal: 10, height: '100%' } as any,
  gpsBtn: { width: 56, height: 48, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', gap: 2, shadowColor: '#3730a3', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4 },
  gpsBtnLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', color: '#fff', letterSpacing: 0.5 },
  scanBtn: { borderRadius: 18, overflow: 'hidden', marginBottom: 28, shadowColor: '#3730a3', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 8 },
  scanBtnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 22 },
  scanBtnText: { fontSize: 17, fontFamily: 'Inter_700Bold', color: '#fff', letterSpacing: 0.3 },
  resultHeader: { marginBottom: 16 },
  resultCount: { fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.text, marginBottom: 4 },
  resultHint: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.textMuted },
  companyCard: { backgroundColor: colors.card, borderRadius: 20, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 10, elevation: 5 },
  companyTop: { flexDirection: 'row', gap: 14, marginBottom: 12, alignItems: 'center' },
  companyInitial: { width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, flexShrink: 0 },
  companyInitialText: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  companyName: { fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.text, marginBottom: 6, letterSpacing: -0.2 },
  fitBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, borderWidth: 1, alignSelf: 'flex-start' },
  fitText: { fontSize: 11, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  companyDesc: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textSecondary, lineHeight: 20, marginBottom: 14 },
  contactSection: { marginBottom: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', gap: 7 },
  contactSectionLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
  contactRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 1 },
  contactText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.textSecondary, flex: 1, lineHeight: 18 },
  contactLink: { color: colors.primary, fontFamily: 'Inter_500Medium' },
  companyActions: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.divider },
  trackBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.primary, borderRadius: 12, shadowColor: '#3730a3', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4 },
  trackBtnDone: { backgroundColor: colors.successBg, borderWidth: 1, borderColor: colors.successBorder, shadowColor: 'transparent', elevation: 0 },
  trackBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 14 },
  emptyIconBg: { width: 72, height: 72, borderRadius: 20, backgroundColor: colors.indigoBg, borderWidth: 1, borderColor: colors.indigoBorder, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', color: colors.text },
  emptySubtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.textMuted, textAlign: 'center', lineHeight: 22, maxWidth: 300 },
  detailsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.muted,
  },
  detailsBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.textSecondary },
});

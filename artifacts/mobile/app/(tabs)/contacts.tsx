import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useApp, Contact } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { getApiBase } from '@/constants/config';
import { requestNotificationPermissions, scheduleLocalNotification } from '@/utils/notifications';

// ─── Types ───────────────────────────────────────────────────────────────────

interface NetworkingEvent {
  id: string;
  title: string;
  eventType: EventType;
  organizer: string;
  dateLabel: string;
  dateIso?: string;
  location: string;
  description?: string;
  url?: string;
  source?: string;
  tags?: string[];
  isOnline?: boolean;
}

// All possible networking opportunity types the AI can return.
// Not rigid — the AI may return any of these based on what it finds on the internet.
type EventType =
  | 'all'
  | 'career-expo'       // Career Expos & Job Fairs
  | 'conference'        // Conferences & Summits
  | 'workshop'          // Workshops & Short Courses
  | 'meetup'            // Meetups & Networking Socials
  | 'trade-fair'        // Trade Fairs & Business Exhibitions
  | 'seminar'           // Seminars & Talks
  | 'hackathon'         // Hackathons & Tech/Innovation Competitions
  | 'alumni'            // Alumni Events & University Reunions
  | 'webinar'           // Webinars & Virtual Events
  | 'panel'             // Panel Discussions & Industry Forums
  | 'open-day'          // Open Days & Company Site Visits
  | 'pitch'             // Pitch Competitions & Startup Demo Days
  | 'mentorship'        // Mentorship Sessions & Coaching Clinics
  | 'association'       // Professional & Industry Association Meetings
  | 'community'         // Community, CSR & Volunteer Events
  | 'awards'            // Awards Ceremonies & Gala Dinners
  | 'training'          // Professional Training & Certification Programmes
  | 'sport'             // Sports & Social Networking Events
  | 'cultural'          // Cultural, Arts & Social Events
  | 'other';            // Any other opportunity not covered above

type SortBy = 'date' | 'location' | 'field' | 'company';
type ContactFilterMode = 'all' | 'warm' | 'followup';

const HOW_MET_OPTIONS = ['Career Expo', 'LinkedIn', 'Referral', 'Cold Outreach', 'University', 'Other'];

// ─── Constants ────────────────────────────────────────────────────────────────

const EVENT_FILTERS: { key: EventType; label: string }[] = [
  { key: 'all',         label: 'All' },
  { key: 'career-expo', label: 'Job Fairs' },
  { key: 'conference',  label: 'Conferences' },
  { key: 'workshop',    label: 'Workshops' },
  { key: 'meetup',      label: 'Meetups' },
  { key: 'trade-fair',  label: 'Trade Fairs' },
  { key: 'seminar',     label: 'Seminars' },
  { key: 'hackathon',   label: 'Hackathons' },
  { key: 'alumni',      label: 'Alumni' },
  { key: 'webinar',     label: 'Webinars' },
  { key: 'panel',       label: 'Panels' },
  { key: 'open-day',    label: 'Open Days' },
  { key: 'pitch',       label: 'Pitch Events' },
  { key: 'mentorship',  label: 'Mentorship' },
  { key: 'association', label: 'Associations' },
  { key: 'community',   label: 'Community' },
  { key: 'awards',      label: 'Awards' },
  { key: 'training',    label: 'Training' },
  { key: 'sport',       label: 'Sports' },
  { key: 'cultural',    label: 'Cultural' },
];

const SORT_OPTIONS: { key: SortBy; label: string; icon: string }[] = [
  { key: 'date',     label: 'Date (Soonest first)',   icon: 'calendar' },
  { key: 'company',  label: 'Organiser / Company',    icon: 'briefcase' },
  { key: 'location', label: 'Location',               icon: 'map-pin' },
  { key: 'field',    label: 'Career / Field',          icon: 'tag' },
];

const TYPE_META: Record<string, { color: string; bg: string; border: string; label: string }> = {
  'career-expo': { color: '#6366f1', bg: 'rgba(99,102,241,0.14)',  border: 'rgba(99,102,241,0.25)',  label: 'Job Fair' },
  'conference':  { color: '#f59e0b', bg: 'rgba(245,158,11,0.14)',  border: 'rgba(245,158,11,0.25)',  label: 'Conference' },
  'workshop':    { color: '#14b8a6', bg: 'rgba(20,184,166,0.14)',  border: 'rgba(20,184,166,0.25)',  label: 'Workshop' },
  'meetup':      { color: '#10b981', bg: 'rgba(16,185,129,0.14)',  border: 'rgba(16,185,129,0.25)',  label: 'Meetup' },
  'trade-fair':  { color: '#a855f7', bg: 'rgba(168,85,247,0.14)', border: 'rgba(168,85,247,0.25)', label: 'Trade Fair' },
  'seminar':     { color: '#3b82f6', bg: 'rgba(59,130,246,0.14)',  border: 'rgba(59,130,246,0.25)',  label: 'Seminar' },
  'hackathon':   { color: '#ef4444', bg: 'rgba(239,68,68,0.14)',   border: 'rgba(239,68,68,0.25)',   label: 'Hackathon' },
  'alumni':      { color: '#ec4899', bg: 'rgba(236,72,153,0.14)',  border: 'rgba(236,72,153,0.25)',  label: 'Alumni' },
  'webinar':     { color: '#06b6d4', bg: 'rgba(6,182,212,0.14)',   border: 'rgba(6,182,212,0.25)',   label: 'Webinar' },
  'panel':       { color: '#8b5cf6', bg: 'rgba(139,92,246,0.14)',  border: 'rgba(139,92,246,0.25)',  label: 'Panel' },
  'open-day':    { color: '#84cc16', bg: 'rgba(132,204,22,0.14)',  border: 'rgba(132,204,22,0.25)',  label: 'Open Day' },
  'pitch':       { color: '#f97316', bg: 'rgba(249,115,22,0.14)',  border: 'rgba(249,115,22,0.25)',  label: 'Pitch Event' },
  'mentorship':  { color: '#d946ef', bg: 'rgba(217,70,239,0.14)',  border: 'rgba(217,70,239,0.25)',  label: 'Mentorship' },
  'association': { color: '#64748b', bg: 'rgba(100,116,139,0.14)', border: 'rgba(100,116,139,0.25)', label: 'Association' },
  'community':   { color: '#22c55e', bg: 'rgba(34,197,94,0.14)',   border: 'rgba(34,197,94,0.25)',   label: 'Community' },
  'awards':      { color: '#eab308', bg: 'rgba(234,179,8,0.14)',   border: 'rgba(234,179,8,0.25)',   label: 'Awards' },
  'training':    { color: '#0ea5e9', bg: 'rgba(14,165,233,0.14)',  border: 'rgba(14,165,233,0.25)',  label: 'Training' },
  'sport':       { color: '#16a34a', bg: 'rgba(22,163,74,0.14)',   border: 'rgba(22,163,74,0.25)',   label: 'Sports' },
  'cultural':    { color: '#e879f9', bg: 'rgba(232,121,249,0.14)', border: 'rgba(232,121,249,0.25)', label: 'Cultural' },
  'event':       { color: '#3b82f6', bg: 'rgba(59,130,246,0.14)',  border: 'rgba(59,130,246,0.25)',  label: 'Event' },
  'other':       { color: '#94a3b8', bg: 'rgba(148,163,184,0.14)', border: 'rgba(148,163,184,0.25)', label: 'Other' },
};

const LAST_EVENTS_FETCH_KEY = 'cc_last_events_fetch';
const EVENTS_CACHE_TTL = 3 * 60 * 60 * 1000; // 3 hours

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function NetworkScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { profile, contacts, savedEvents, saveEvent, unsaveEvent,
          addContact, updateContact, deleteContact } = useApp();

  // Feed state
  const [allEvents, setAllEvents] = useState<NetworkingEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<EventType>('all');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [showContactsModal, setShowContactsModal] = useState(false);

  // Contacts modal state
  const [contactFilter, setContactFilter] = useState<ContactFilterMode>('all');
  const [showAddContact, setShowAddContact] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [contactForm, setContactForm] = useState({
    name: '', company: '', howWeMet: 'Career Expo', notes: '',
    isWarmLead: false, needsFollowUp: false,
  });

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 84 : insets.bottom + 60;
  const s = styles(colors);

  // ── Fetch events ────────────────────────────────────────────────────────────

  const fetchEvents = useCallback(async (refreshing = false) => {
    if (refreshing) setIsRefreshing(true);
    else setIsLoading(true);
    setFetchError(null);
    try {
      const apiBase = getApiBase();
      const res = await fetch(
        `${apiBase}/api/ai/networking-events`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            city: profile?.city || 'Zambia',
            degree: profile?.currentDegree || '',
            preferredIndustries: profile?.preferredIndustries || '',
            goals: profile?.careerGoals || '',
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load events');
      const events: NetworkingEvent[] = Array.isArray(data) ? data : [];
      setAllEvents(events);
      AsyncStorage.setItem(LAST_EVENTS_FETCH_KEY, String(Date.now())).catch(() => {});
      if (events.length > 0 && Platform.OS !== 'web') {
        scheduleLocalNotification({
          title: '🗓️ Networking Events Found',
          body: `${events.length} event${events.length === 1 ? '' : 's'} near you — tap to explore.`,
          data: { screen: 'contacts' },
        }).catch(() => {});
      }
    } catch (err: any) {
      setFetchError(err.message || 'Could not load networking events');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [profile?.city, profile?.currentDegree, profile?.preferredIndustries, profile?.careerGoals]);

  const didAutoFetch = useRef(false);
  useEffect(() => {
    if (Platform.OS !== 'web') requestNotificationPermissions().catch(() => {});
    if (didAutoFetch.current) return;
    didAutoFetch.current = true;
    AsyncStorage.getItem(LAST_EVENTS_FETCH_KEY)
      .then(stored => {
        const lastTime = stored ? parseInt(stored, 10) : 0;
        if (Date.now() - lastTime > EVENTS_CACHE_TTL) fetchEvents();
      })
      .catch(() => fetchEvents());
  }, [fetchEvents]);

  // ── Filtered & sorted events ────────────────────────────────────────────────

  const displayedEvents = useMemo(() => {
    let list = allEvents;
    if (activeFilter !== 'all') {
      list = list.filter(e => e.eventType === activeFilter);
    }
    const sorted = [...list];
    if (sortBy === 'date') {
      sorted.sort((a, b) => {
        if (!a.dateIso && !b.dateIso) return 0;
        if (!a.dateIso) return 1;
        if (!b.dateIso) return -1;
        return new Date(a.dateIso).getTime() - new Date(b.dateIso).getTime();
      });
    } else if (sortBy === 'company') {
      sorted.sort((a, b) => a.organizer.localeCompare(b.organizer));
    } else if (sortBy === 'location') {
      sorted.sort((a, b) => a.location.localeCompare(b.location));
    } else if (sortBy === 'field') {
      sorted.sort((a, b) => {
        const aTag = (a.tags?.[0] ?? '').toLowerCase();
        const bTag = (b.tags?.[0] ?? '').toLowerCase();
        return aTag.localeCompare(bTag);
      });
    }
    return sorted;
  }, [allEvents, activeFilter, sortBy]);

  // ── Save/unsave ─────────────────────────────────────────────────────────────

  const isEventSaved = (id: string) => savedEvents.some(e => e.id === id);

  const handleToggleSave = (event: NetworkingEvent) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isEventSaved(event.id)) {
      unsaveEvent(event.id);
    } else {
      saveEvent({
        id: event.id, title: event.title, eventType: event.eventType,
        organizer: event.organizer, dateLabel: event.dateLabel,
        dateIso: event.dateIso, location: event.location,
        description: event.description, url: event.url,
        source: event.source, tags: event.tags, isOnline: event.isOnline,
      });
    }
  };

  // ── Contacts helpers ────────────────────────────────────────────────────────

  const resetContactForm = () => setContactForm({
    name: '', company: '', howWeMet: 'Career Expo', notes: '',
    isWarmLead: false, needsFollowUp: false,
  });

  const handleAddContact = async () => {
    if (!contactForm.name.trim() || !contactForm.company.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await addContact({ ...contactForm, name: contactForm.name.trim(), company: contactForm.company.trim() });
    resetContactForm();
    setShowAddContact(false);
  };

  const handleDeleteContact = (c: Contact) => {
    Alert.alert('Remove Contact', `Remove ${c.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        await deleteContact(c.id);
        if (selectedContact?.id === c.id) setSelectedContact(null);
      }},
    ]);
  };

  const handleToggleContactField = async (c: Contact, field: 'isWarmLead' | 'needsFollowUp') => {
    Haptics.selectionAsync();
    const update = { [field]: !c[field] };
    await updateContact(c.id, update);
    setSelectedContact(prev => prev?.id === c.id ? { ...prev, ...update } : prev);
  };

  const filteredContacts = useMemo(() => contacts.filter(c => {
    if (contactFilter === 'warm') return c.isWarmLead;
    if (contactFilter === 'followup') return c.needsFollowUp;
    return true;
  }).sort((a, b) => new Date(b.addedDate).getTime() - new Date(a.addedDate).getTime()),
  [contacts, contactFilter]);

  const followUpCount = contacts.filter(c => c.needsFollowUp).length;

  // ── Render event card ───────────────────────────────────────────────────────

  const renderEventCard = (event: NetworkingEvent) => {
    const meta = TYPE_META[event.eventType] ?? TYPE_META['event'];
    const saved = isEventSaved(event.id);

    return (
      <View key={event.id} style={s.eventCard}>
        {/* Top row: badge + save */}
        <View style={s.eventTopRow}>
          <View style={[s.typeBadge, { backgroundColor: meta.bg, borderColor: meta.border }]}>
            <View style={[s.typeDot, { backgroundColor: meta.color }]} />
            <Text style={[s.typeBadgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <Pressable
            onPress={() => handleToggleSave(event)}
            style={[s.saveBtn, saved && { backgroundColor: meta.bg, borderColor: meta.border }]}
            accessibilityLabel={saved ? 'Remove from saved' : 'Save event'}
            accessibilityRole="button"
          >
            <Feather name="bookmark" size={16} color={saved ? meta.color : colors.textMuted} />
          </Pressable>
        </View>

        {/* Title & Organiser */}
        <Text style={s.eventTitle} numberOfLines={2}>{event.title}</Text>
        <Text style={s.eventOrganiser} numberOfLines={1}>{event.organizer}</Text>

        {/* Date & Location */}
        <View style={s.eventMeta}>
          <View style={s.eventMetaRow}>
            <Feather name="calendar" size={13} color={colors.textMuted} />
            <Text style={s.eventMetaText} numberOfLines={1}>{event.dateLabel}</Text>
          </View>
          <View style={s.eventMetaRow}>
            <Feather name={event.isOnline ? 'monitor' : 'map-pin'} size={13} color={colors.textMuted} />
            <Text style={s.eventMetaText} numberOfLines={1}>{event.location}</Text>
          </View>
        </View>

        {/* Description */}
        {!!event.description && (
          <Text style={s.eventDesc} numberOfLines={2}>{event.description}</Text>
        )}

        {/* Tags */}
        {event.tags && event.tags.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }} contentContainerStyle={{ gap: 6 }}>
            {event.tags.slice(0, 5).map(tag => (
              <View key={tag} style={s.tagPill}>
                <Text style={s.tagText}>{tag}</Text>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Footer: source + action buttons */}
        <View style={s.eventFooter}>
          {!!event.source && (
            <View style={s.sourceRow}>
              <Feather name="globe" size={11} color={colors.textMuted} />
              <Text style={s.sourceText}>{event.source}</Text>
            </View>
          )}
          <View style={s.eventBtnsRow}>
            <Pressable
              onPress={() => {
                const q = encodeURIComponent(`${event.title} ${event.organizer}`);
                Linking.openURL(`https://www.google.com/search?q=${q}`);
              }}
              style={s.googleBtn}
              accessibilityLabel="Search on Google"
              accessibilityRole="link"
            >
              <Feather name="search" size={12} color={colors.textSecondary} />
              <Text style={s.googleBtnText}>Search</Text>
            </Pressable>
            {!!event.url && (
              <Pressable
                onPress={() => Linking.openURL(event.url!)}
                style={s.openBtn}
                accessibilityLabel="Open event"
                accessibilityRole="link"
              >
                <Text style={s.openBtnText}>Open</Text>
                <Feather name="external-link" size={12} color={colors.primary} />
              </Pressable>
            )}
          </View>
        </View>
      </View>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[s.screen, { paddingTop: topPad }]}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Network</Text>
          <Text style={s.subtitle}>Live events · Hackathons · Career fairs · Webinars</Text>
        </View>
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); fetchEvents(); }}
          style={[s.contactsIconBtn, { marginRight: 10 }]}
          disabled={isLoading || isRefreshing}
          accessibilityLabel="Refresh network events"
          accessibilityRole="button"
        >
          <Feather name="refresh-cw" size={20} color={(isLoading || isRefreshing) ? colors.textMuted : colors.primary} />
        </Pressable>
        <Pressable
          onPress={() => setShowContactsModal(true)}
          style={s.contactsIconBtn}
          accessibilityLabel={`My contacts${followUpCount > 0 ? `, ${followUpCount} need follow-up` : ''}`}
          accessibilityRole="button"
          android_ripple={{ color: colors.indigoBg, borderless: true, radius: 26 }}
        >
          <Feather name="users" size={22} color={colors.primary} />
          {followUpCount > 0 && (
            <View style={s.contactsBadge}>
              <Text style={s.contactsBadgeText}>{followUpCount > 9 ? '9+' : followUpCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* ── Filter chips + sort ──────────────────────────────────────── */}
      <View style={s.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingLeft: 20, paddingRight: 8 }}>
          {EVENT_FILTERS.map(f => (
            <Pressable
              key={f.key}
              style={[s.chip, activeFilter === f.key && s.chipActive]}
              onPress={() => { setActiveFilter(f.key); Haptics.selectionAsync(); }}
              accessibilityRole="button"
              accessibilityState={{ selected: activeFilter === f.key }}
            >
              <Text style={[s.chipText, activeFilter === f.key && s.chipTextActive]}>{f.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable
          onPress={() => setShowSortSheet(true)}
          style={s.sortBtn}
          accessibilityLabel="Sort events"
          accessibilityRole="button"
        >
          <Feather name="sliders" size={16} color={colors.textMuted} />
        </Pressable>
      </View>

      {/* ── Active sort label ────────────────────────────────────────── */}
      <View style={s.sortLabelRow}>
        <Feather name="arrow-up" size={11} color={colors.textMuted} />
        <Text style={s.sortLabel}>
          {SORT_OPTIONS.find(o => o.key === sortBy)?.label ?? 'Date'}
        </Text>
        {allEvents.length > 0 && (
          <Text style={s.eventCount}>· {displayedEvents.length} found</Text>
        )}
      </View>

      {/* ── Feed ────────────────────────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomPad, paddingTop: 4 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => fetchEvents(true)}
            tintColor={colors.primary}
          />
        }
      >
        {isLoading ? (
          // Skeleton cards
          Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={[s.eventCard, s.skeletonCard]}>
              <View style={[s.skeletonLine, { width: 80, height: 22, marginBottom: 14 }]} />
              <View style={[s.skeletonLine, { width: '80%', height: 20, marginBottom: 8 }]} />
              <View style={[s.skeletonLine, { width: '55%', height: 14, marginBottom: 16 }]} />
              <View style={[s.skeletonLine, { width: '70%', height: 13, marginBottom: 6 }]} />
              <View style={[s.skeletonLine, { width: '60%', height: 13 }]} />
            </View>
          ))
        ) : fetchError ? (
          <View style={s.emptyState}>
            <View style={[s.emptyIconBg, { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder }]}>
              <Feather name="wifi-off" size={28} color={colors.danger} />
            </View>
            <Text style={s.emptyTitle}>Could not load events</Text>
            <Text style={s.emptySubtitle}>{fetchError}</Text>
            <Pressable style={s.retryBtn} onPress={() => fetchEvents()} accessibilityRole="button">
              <Feather name="refresh-cw" size={14} color={colors.primary} />
              <Text style={s.retryBtnText}>Try again</Text>
            </Pressable>
          </View>
        ) : displayedEvents.length === 0 ? (
          <View style={s.emptyState}>
            <View style={s.emptyIconBg}>
              <Feather name="calendar" size={28} color={colors.primary} />
            </View>
            <Text style={s.emptyTitle}>
              {activeFilter !== 'all' ? 'No events in this category' : 'No events found'}
            </Text>
            <Text style={s.emptySubtitle}>
              {activeFilter !== 'all'
                ? 'Try a different filter or pull down to refresh.'
                : profile?.city
                  ? `No upcoming events found for ${profile.city}. Pull down to search again.`
                  : 'Add your city in your profile to get local results.'}
            </Text>
            <Pressable style={s.retryBtn} onPress={() => fetchEvents()} accessibilityRole="button">
              <Feather name="refresh-cw" size={14} color={colors.primary} />
              <Text style={s.retryBtnText}>Search again</Text>
            </Pressable>
          </View>
        ) : (
          displayedEvents.map(renderEventCard)
        )}
      </ScrollView>

      {/* ── Sort Sheet ──────────────────────────────────────────────── */}
      <Modal visible={showSortSheet} animationType="slide" transparent onRequestClose={() => setShowSortSheet(false)}>
        <Pressable style={s.sheetOverlay} onPress={() => setShowSortSheet(false)} />
        <View style={[s.sortSheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Sort by</Text>
          {SORT_OPTIONS.map(opt => (
            <Pressable
              key={opt.key}
              style={[s.sortOption, sortBy === opt.key && s.sortOptionActive]}
              onPress={() => { setSortBy(opt.key); Haptics.selectionAsync(); setShowSortSheet(false); }}
              accessibilityRole="radio"
              accessibilityState={{ checked: sortBy === opt.key }}
            >
              <View style={[s.sortOptionIcon, sortBy === opt.key && { backgroundColor: colors.indigoBg, borderColor: colors.indigoBorder }]}>
                <Feather name={opt.icon as any} size={16} color={sortBy === opt.key ? colors.primary : colors.textMuted} />
              </View>
              <Text style={[s.sortOptionText, sortBy === opt.key && { color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}>
                {opt.label}
              </Text>
              {sortBy === opt.key && <Feather name="check" size={16} color={colors.primary} />}
            </Pressable>
          ))}
        </View>
      </Modal>

      {/* ── Contacts Modal ──────────────────────────────────────────── */}
      <Modal visible={showContactsModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowContactsModal(false)}>
        <View style={[s.contactsModal, { backgroundColor: colors.background }]}>
          <View style={s.cmHeader}>
            <View style={s.sheetHandle} />
            <View style={s.cmTitleRow}>
              <Text style={s.cmTitle}>My Contacts</Text>
              <Pressable
                style={s.cmAddBtn}
                onPress={() => { resetContactForm(); setShowAddContact(true); }}
                accessibilityLabel="Add contact"
                accessibilityRole="button"
              >
                <Feather name="user-plus" size={18} color="#fff" />
              </Pressable>
            </View>
            <Text style={s.cmSubtitle}>{contacts.length} connection{contacts.length !== 1 ? 's' : ''}</Text>

            {/* Contact filters */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }} contentContainerStyle={{ gap: 8 }}>
              {([
                { key: 'all' as ContactFilterMode, label: `All (${contacts.length})` },
                { key: 'warm' as ContactFilterMode, label: 'Warm leads', count: contacts.filter(c => c.isWarmLead).length },
                { key: 'followup' as ContactFilterMode, label: 'Follow up', count: followUpCount },
              ]).map(f => (
                <Pressable
                  key={f.key}
                  style={[s.chip, contactFilter === f.key && s.chipActive]}
                  onPress={() => { setContactFilter(f.key); Haptics.selectionAsync(); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: contactFilter === f.key }}
                >
                  <Text style={[s.chipText, contactFilter === f.key && s.chipTextActive]}>{f.label}</Text>
                  {'count' in f && (f.count ?? 0) > 0 && (
                    <View style={[s.chipCount, contactFilter === f.key && { backgroundColor: colors.indigoBg }]}>
                      <Text style={[s.chipCountText, contactFilter === f.key && { color: colors.primary }]}>{f.count}</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
            {filteredContacts.length === 0 ? (
              <View style={[s.emptyState, { paddingTop: 40 }]}>
                <View style={[s.emptyIconBg, { backgroundColor: colors.blueBg, borderColor: colors.blueBorder }]}>
                  <Feather name="users" size={28} color={colors.blue} />
                </View>
                <Text style={s.emptyTitle}>{contactFilter !== 'all' ? 'No matches' : 'No contacts yet'}</Text>
                <Text style={s.emptySubtitle}>
                  {contactFilter !== 'all'
                    ? 'Try a different filter.'
                    : '80% of jobs are never advertised.\nStart logging your professional connections.'}
                </Text>
                {contactFilter === 'all' && (
                  <Pressable style={[s.retryBtn, { backgroundColor: colors.blueBg, borderColor: colors.blueBorder }]}
                    onPress={() => { resetContactForm(); setShowAddContact(true); }} accessibilityRole="button">
                    <Feather name="user-plus" size={14} color={colors.blue} />
                    <Text style={[s.retryBtnText, { color: colors.blue }]}>Add your first contact</Text>
                  </Pressable>
                )}
              </View>
            ) : filteredContacts.map(contact => (
              <Pressable
                key={contact.id}
                style={({ pressed }) => [s.contactCard, pressed && { opacity: 0.88 }]}
                onPress={() => { setSelectedContact(contact); setEditNotes(contact.notes || ''); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                accessibilityRole="button"
              >
                <View style={s.contactInitialBg}>
                  <Text style={s.contactInitialText}>{contact.name[0]?.toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.contactName}>{contact.name}</Text>
                  <Text style={s.contactCompany}>{contact.company}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
                    <View style={s.howMetPill}><Text style={s.howMetText}>{contact.howWeMet}</Text></View>
                    {contact.isWarmLead && (
                      <View style={s.warmPill}><Feather name="star" size={10} color="#f59e0b" /><Text style={s.warmText}>Warm lead</Text></View>
                    )}
                    {contact.needsFollowUp && (
                      <View style={s.followUpPill}><Feather name="mail" size={10} color={colors.primary} /><Text style={s.followUpText}>Follow up</Text></View>
                    )}
                  </View>
                </View>
                <Feather name="chevron-right" size={16} color={colors.textMuted} />
              </Pressable>
            ))}
          </ScrollView>

          <Pressable style={s.cmDoneBtn} onPress={() => setShowContactsModal(false)} accessibilityRole="button">
            <Text style={s.cmDoneText}>Done</Text>
          </Pressable>
        </View>
      </Modal>

      {/* ── Add Contact Sheet ───────────────────────────────────────── */}
      <Modal visible={showAddContact} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAddContact(false)}>
        <KeyboardAvoidingView style={[s.sheet, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <Pressable onPress={() => setShowAddContact(false)} style={s.sheetActionBtn} accessibilityRole="button">
              <Text style={s.sheetCancelText}>Cancel</Text>
            </Pressable>
            <Text style={s.sheetTitleText}>Add Contact</Text>
            <Pressable
              onPress={handleAddContact}
              style={[s.sheetActionBtn, (!contactForm.name.trim() || !contactForm.company.trim()) && { opacity: 0.4 }]}
              disabled={!contactForm.name.trim() || !contactForm.company.trim()}
              accessibilityRole="button"
            >
              <Text style={s.sheetSaveText}>Save</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={s.sheetBody} keyboardShouldPersistTaps="handled">
            <Text style={s.fieldLabel}>Name</Text>
            <TextInput value={contactForm.name} onChangeText={v => setContactForm(f => ({ ...f, name: v }))} placeholder="e.g. Thabo Dlamini" placeholderTextColor={colors.textMuted} style={s.field} autoFocus accessibilityLabel="Contact name" />
            <Text style={s.fieldLabel}>Company</Text>
            <TextInput value={contactForm.company} onChangeText={v => setContactForm(f => ({ ...f, company: v }))} placeholder="e.g. MTN Zambia" placeholderTextColor={colors.textMuted} style={s.field} accessibilityLabel="Contact company" />
            <Text style={s.fieldLabel}>How We Met</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }} contentContainerStyle={{ gap: 8 }}>
              {HOW_MET_OPTIONS.map(opt => (
                <Pressable key={opt} style={[s.chip, contactForm.howWeMet === opt && s.chipActive]}
                  onPress={() => setContactForm(f => ({ ...f, howWeMet: opt }))} accessibilityRole="radio">
                  <Text style={[s.chipText, contactForm.howWeMet === opt && s.chipTextActive]}>{opt}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={s.fieldLabel}>Notes <Text style={{ fontFamily: 'Inter_400Regular', color: colors.textMuted }}>(optional)</Text></Text>
            <TextInput value={contactForm.notes} onChangeText={v => setContactForm(f => ({ ...f, notes: v }))} placeholder="What did you discuss?" placeholderTextColor={colors.textMuted} style={[s.field, { minHeight: 90, textAlignVertical: 'top' }]} multiline />
            <View style={s.toggleCard}>
              <View style={s.toggleRow}>
                <View style={[s.toggleIconBg, { backgroundColor: 'rgba(245,158,11,0.14)', borderColor: 'rgba(245,158,11,0.25)' }]}>
                  <Feather name="star" size={14} color="#f59e0b" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.toggleLabel}>Warm Lead</Text>
                  <Text style={s.toggleHint}>They expressed genuine interest in helping you</Text>
                </View>
                <Switch value={contactForm.isWarmLead} onValueChange={v => setContactForm(f => ({ ...f, isWarmLead: v }))}
                  trackColor={{ false: colors.muted, true: 'rgba(245,158,11,0.5)' }} thumbColor={contactForm.isWarmLead ? '#f59e0b' : '#888'} />
              </View>
              <View style={[s.toggleRow, { borderTopWidth: 1, borderTopColor: colors.divider }]}>
                <View style={[s.toggleIconBg, { backgroundColor: colors.indigoBg, borderColor: colors.indigoBorder }]}>
                  <Feather name="mail" size={14} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.toggleLabel}>Needs Follow-Up</Text>
                  <Text style={s.toggleHint}>Remind yourself to reach out soon</Text>
                </View>
                <Switch value={contactForm.needsFollowUp} onValueChange={v => setContactForm(f => ({ ...f, needsFollowUp: v }))}
                  trackColor={{ false: colors.muted, true: 'rgba(99,102,241,0.5)' }} thumbColor={contactForm.needsFollowUp ? colors.primary : '#888'} />
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Contact Detail Sheet ────────────────────────────────────── */}
      <Modal visible={!!selectedContact} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedContact(null)}>
        {selectedContact && (
          <KeyboardAvoidingView style={[s.sheet, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <Pressable onPress={() => setSelectedContact(null)} style={s.sheetActionBtn} accessibilityRole="button">
                <Text style={s.sheetCancelText}>Done</Text>
              </Pressable>
              <Text style={s.sheetTitleText} numberOfLines={1}>{selectedContact.name}</Text>
              <Pressable onPress={() => handleDeleteContact(selectedContact)} style={s.sheetActionBtn} accessibilityRole="button">
                <Feather name="trash-2" size={18} color={colors.danger} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={s.sheetBody} keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                <View style={[s.contactInitialBg, { width: 60, height: 60, borderRadius: 30 }]}>
                  <Text style={[s.contactInitialText, { fontSize: 24 }]}>{selectedContact.name[0]?.toUpperCase()}</Text>
                </View>
                <View>
                  <Text style={[s.contactName, { fontSize: 18 }]}>{selectedContact.name}</Text>
                  <Text style={s.contactCompany}>{selectedContact.company}</Text>
                  <View style={[s.howMetPill, { marginTop: 6 }]}><Text style={s.howMetText}>{selectedContact.howWeMet}</Text></View>
                </View>
              </View>
              <View style={s.toggleCard}>
                <View style={s.toggleRow}>
                  <View style={[s.toggleIconBg, { backgroundColor: 'rgba(245,158,11,0.14)', borderColor: 'rgba(245,158,11,0.25)' }]}>
                    <Feather name="star" size={14} color="#f59e0b" />
                  </View>
                  <View style={{ flex: 1 }}><Text style={s.toggleLabel}>Warm Lead</Text><Text style={s.toggleHint}>They expressed genuine interest</Text></View>
                  <Switch value={selectedContact.isWarmLead} onValueChange={() => handleToggleContactField(selectedContact, 'isWarmLead')}
                    trackColor={{ false: colors.muted, true: 'rgba(245,158,11,0.5)' }} thumbColor={selectedContact.isWarmLead ? '#f59e0b' : '#888'} />
                </View>
                <View style={[s.toggleRow, { borderTopWidth: 1, borderTopColor: colors.divider }]}>
                  <View style={[s.toggleIconBg, { backgroundColor: colors.indigoBg, borderColor: colors.indigoBorder }]}>
                    <Feather name="mail" size={14} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}><Text style={s.toggleLabel}>Needs Follow-Up</Text><Text style={s.toggleHint}>Remind yourself to reach out</Text></View>
                  <Switch value={selectedContact.needsFollowUp} onValueChange={() => handleToggleContactField(selectedContact, 'needsFollowUp')}
                    trackColor={{ false: colors.muted, true: 'rgba(99,102,241,0.5)' }} thumbColor={selectedContact.needsFollowUp ? colors.primary : '#888'} />
                </View>
              </View>
              <Text style={[s.fieldLabel, { marginTop: 8 }]}>Notes</Text>
              <TextInput
                value={editNotes}
                onChangeText={setEditNotes}
                onBlur={() => updateContact(selectedContact.id, { notes: editNotes })}
                placeholder="What did you discuss?"
                placeholderTextColor={colors.textMuted}
                style={[s.field, { minHeight: 100, textAlignVertical: 'top' }]}
                multiline
              />
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = (colors: ReturnType<typeof useColors>) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16 },
  title: { fontSize: 30, fontFamily: 'Inter_700Bold', color: colors.text, letterSpacing: -0.8 },
  subtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textMuted, marginTop: 2 },
  contactsIconBtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: '#3730a3', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4 },
  contactsBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#ef4444', borderRadius: 8, minWidth: 16, height: 16, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  contactsBadgeText: { color: '#fff', fontSize: 9, fontFamily: 'Inter_700Bold' },
  filterRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 5 },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary, shadowColor: '#3730a3', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4, elevation: 3 },
  chipText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.textMuted },
  chipTextActive: { color: '#fff' },
  chipCount: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, backgroundColor: colors.muted },
  chipCountText: { fontSize: 10, fontFamily: 'Inter_700Bold', color: colors.textMuted },
  sortBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  sortLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 20, marginBottom: 12 },
  sortLabel: { fontSize: 12, fontFamily: 'Inter_500Medium', color: colors.textMuted },
  eventCount: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.textMuted },

  // Event cards
  eventCard: { backgroundColor: colors.card, borderRadius: 20, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 10, elevation: 5 },
  eventTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  typeDot: { width: 6, height: 6, borderRadius: 3 },
  typeBadgeText: { fontSize: 11, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  saveBtn: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 2 },
  eventTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', color: colors.text, letterSpacing: -0.3, lineHeight: 24, marginBottom: 4 },
  eventOrganiser: { fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.textSecondary, marginBottom: 14 },
  eventMeta: { gap: 6, marginBottom: 10 },
  eventMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eventMetaText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textMuted, flex: 1 },
  eventDesc: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textSecondary, lineHeight: 19, marginTop: 6 },
  tagPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border },
  tagText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: colors.textMuted },
  eventFooter: { flexDirection: 'column', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.divider },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  sourceText: { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.textMuted },
  eventBtnsRow: { flexDirection: 'row', gap: 8 },
  googleBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border },
  googleBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.textSecondary },
  openBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, backgroundColor: colors.primary, shadowColor: '#3730a3', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4, elevation: 3 },
  openBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#fff' },

  // Skeleton
  skeletonCard: { opacity: 0.5 },
  skeletonLine: { backgroundColor: colors.muted, borderRadius: 6 },

  // Empty / error
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIconBg: { width: 64, height: 64, borderRadius: 18, backgroundColor: colors.indigoBg, borderWidth: 1, borderColor: colors.indigoBorder, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: colors.text },
  emptySubtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textMuted, textAlign: 'center', lineHeight: 20, maxWidth: 260 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, backgroundColor: colors.primary, marginTop: 4, shadowColor: '#3730a3', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4 },
  retryBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#fff' },

  // Sort sheet
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sortSheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderTopWidth: 1, borderTopColor: colors.border },
  sheetHandle: { width: 36, height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', color: colors.text, marginBottom: 16, letterSpacing: -0.3 },
  sortOption: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 4, borderRadius: 14 },
  sortOptionActive: { backgroundColor: 'transparent' },
  sortOptionIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border },
  sortOptionText: { flex: 1, fontSize: 15, fontFamily: 'Inter_500Medium', color: colors.text },

  // Contacts modal
  contactsModal: { flex: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  cmHeader: { padding: 20, paddingBottom: 0 },
  cmTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  cmTitle: { fontSize: 24, fontFamily: 'Inter_700Bold', color: colors.text, letterSpacing: -0.5 },
  cmAddBtn: { width: 44, height: 44, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: '#3730a3', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.45, shadowRadius: 6, elevation: 5 },
  cmSubtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textMuted, marginTop: 4 },
  cmDoneBtn: { margin: 20, backgroundColor: colors.primary, borderRadius: 16, padding: 17, alignItems: 'center', shadowColor: '#3730a3', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 8, elevation: 6 },
  cmDoneText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#fff' },

  // Contact cards
  contactCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card, borderRadius: 18, padding: 14, marginBottom: 9, borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.22, shadowRadius: 8, elevation: 4 },
  contactInitialBg: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.indigoBg, borderWidth: 1, borderColor: colors.indigoBorder, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  contactInitialText: { fontSize: 20, fontFamily: 'Inter_700Bold', color: colors.primary },
  contactName: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: colors.text, marginBottom: 2 },
  contactCompany: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.textSecondary },
  howMetPill: { backgroundColor: colors.muted, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.border, alignSelf: 'flex-start' },
  howMetText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: colors.textMuted },
  warmPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: 'rgba(245,158,11,0.14)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)' },
  warmText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#f59e0b' },
  followUpPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: colors.indigoBg, borderWidth: 1, borderColor: colors.indigoBorder },
  followUpText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: colors.primary },

  // Shared sheet styles
  sheet: { flex: 1, paddingTop: 12 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.divider },
  sheetTitleText: { fontSize: 17, fontFamily: 'Inter_600SemiBold', color: colors.text, flex: 1, textAlign: 'center' },
  sheetActionBtn: { paddingHorizontal: 4, paddingVertical: 4, minWidth: 52 },
  sheetCancelText: { fontSize: 16, fontFamily: 'Inter_400Regular', color: colors.textSecondary },
  sheetSaveText: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: colors.primary, textAlign: 'right' },
  sheetBody: { padding: 20, paddingBottom: 60 },
  fieldLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.textSecondary, marginBottom: 8 },
  field: { backgroundColor: colors.muted, borderRadius: 14, padding: 16, fontSize: 15, fontFamily: 'Inter_400Regular', color: colors.text, borderWidth: 1, borderColor: colors.border, marginBottom: 18 },
  toggleCard: { backgroundColor: colors.muted, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: 18 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  toggleIconBg: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, flexShrink: 0 },
  toggleLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.text },
  toggleHint: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.textMuted, marginTop: 2 },
});

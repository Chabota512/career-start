import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type ApplicationStatus = 'Interested' | 'Applied' | 'Interviewing' | 'Offer' | 'Rejected' | 'Accepted';
export type ThemeOverride = 'system' | 'light' | 'dark';

export interface ProfileField {
  id: string;
  label: string;
  value: string;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  weeklyGoal?: number;
  currentDegree: string;
  institution?: string;
  yearOfStudy?: string;
  skills?: string;
  city?: string;
  preferredIndustries?: string;
  careerGoals: string;
  portfolioUrl?: string;
  linkedInUrl?: string;
  githubUrl?: string;
  profileImageUri?: string;
  profileFields?: ProfileField[];
}

export interface Application {
  id: string;
  companyName: string;
  role: string;
  status: ApplicationStatus;
  deadline?: string;
  notes?: string;
  appliedDate?: string;
  lastModified: string;
  createdDate?: string;
  draftedLetter?: string;
  researchSummary?: string;
  interviewQuestions?: { personal: string[]; company: string[]; experience: string[] };
}

export interface Contact {
  id: string;
  name: string;
  company: string;
  howWeMet: string;
  notes?: string;
  isWarmLead: boolean;
  needsFollowUp: boolean;
  addedDate: string;
}

export interface SavedEvent {
  id: string;
  title: string;
  eventType: string;
  organizer: string;
  dateLabel: string;
  dateIso?: string;
  location: string;
  description?: string;
  url?: string;
  source?: string;
  tags?: string[];
  isOnline?: boolean;
  savedAt: string;
}

export type DocCategory =
  | 'CV / Resume'
  | 'Cover Letter'
  | 'Certificate'
  | 'Academic Transcript'
  | 'Reference Letter'
  | 'Portfolio'
  | 'Other';

export interface StoredDocument {
  id: string;
  name: string;
  category: DocCategory;
  objectPath: string;
  contentType: string;
  size: number;
  uploadedAt: string;
  extractedText?: string;
}

interface AppContextType {
  profile: UserProfile | null;
  applications: Application[];
  contacts: Contact[];
  savedEvents: SavedEvent[];
  docs: StoredDocument[];
  isLoaded: boolean;
  themeOverride: ThemeOverride;
  setThemeOverride: (t: ThemeOverride) => Promise<void>;
  updateProfile: (p: UserProfile) => Promise<void>;
  addApplication: (data: Omit<Application, 'id' | 'lastModified'>) => Promise<Application>;
  updateApplication: (id: string, updates: Partial<Application>) => Promise<void>;
  deleteApplication: (id: string) => Promise<void>;
  addContact: (data: Omit<Contact, 'id' | 'addedDate'>) => Promise<Contact>;
  updateContact: (id: string, updates: Partial<Contact>) => Promise<void>;
  deleteContact: (id: string) => Promise<void>;
  saveEvent: (event: Omit<SavedEvent, 'savedAt'>) => Promise<void>;
  unsaveEvent: (id: string) => Promise<void>;
  addDoc: (doc: Omit<StoredDocument, 'id' | 'uploadedAt'>) => Promise<StoredDocument>;
  updateDoc: (id: string, updates: Partial<StoredDocument>) => Promise<void>;
  deleteDoc: (id: string) => Promise<void>;
  clearAllData: () => Promise<void>;
}

export const AppContext = createContext<AppContextType | null>(null);

const PROFILE_KEY = 'cc_profile';
const APPS_KEY = 'cc_applications';
const CONTACTS_KEY = 'cc_contacts';
const SAVED_EVENTS_KEY = 'cc_saved_events';
const DOCS_KEY = 'cc_documents';
const THEME_KEY = 'cc_theme';

export function genId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

function defaultProfile(): UserProfile {
  return { uid: genId(), displayName: 'You', currentDegree: '', careerGoals: '', weeklyGoal: 5 };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [savedEvents, setSavedEvents] = useState<SavedEvent[]>([]);
  const [docs, setDocs] = useState<StoredDocument[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [themeOverride, setThemeOverrideState] = useState<ThemeOverride>('system');

  useEffect(() => {
    (async () => {
      try {
        const [rawProfile, rawApps, rawContacts, rawEvents, rawDocs, rawTheme] = await Promise.all([
          AsyncStorage.getItem(PROFILE_KEY),
          AsyncStorage.getItem(APPS_KEY),
          AsyncStorage.getItem(CONTACTS_KEY),
          AsyncStorage.getItem(SAVED_EVENTS_KEY),
          AsyncStorage.getItem(DOCS_KEY),
          AsyncStorage.getItem(THEME_KEY),
        ]);
        let p: UserProfile = rawProfile ? JSON.parse(rawProfile) : defaultProfile();
        if (!rawProfile) await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(p));
        setProfile(p);
        setApplications(rawApps ? JSON.parse(rawApps) : []);
        setContacts(rawContacts ? JSON.parse(rawContacts) : []);
        setSavedEvents(rawEvents ? JSON.parse(rawEvents) : []);
        setDocs(rawDocs ? JSON.parse(rawDocs) : []);
        if (rawTheme === 'light' || rawTheme === 'dark' || rawTheme === 'system') {
          setThemeOverrideState(rawTheme);
        }
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  const saveApps = useCallback(async (apps: Application[]) => {
    setApplications(apps);
    await AsyncStorage.setItem(APPS_KEY, JSON.stringify(apps));
  }, []);

  const saveContacts = useCallback(async (ctcts: Contact[]) => {
    setContacts(ctcts);
    await AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(ctcts));
  }, []);

  const updateProfile = useCallback(async (p: UserProfile) => {
    setProfile(p);
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  }, []);

  const addApplication = useCallback(async (data: Omit<Application, 'id' | 'lastModified'>) => {
    const now = new Date().toISOString();
    const app: Application = { ...data, id: genId(), lastModified: now, createdDate: now };
    setApplications(prev => {
      const next = [app, ...prev];
      AsyncStorage.setItem(APPS_KEY, JSON.stringify(next));
      return next;
    });
    return app;
  }, []);

  const updateApplication = useCallback(async (id: string, updates: Partial<Application>) => {
    setApplications(prev => {
      const next = prev.map(a => a.id === id ? { ...a, ...updates, lastModified: new Date().toISOString() } : a);
      AsyncStorage.setItem(APPS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const deleteApplication = useCallback(async (id: string) => {
    setApplications(prev => {
      const next = prev.filter(a => a.id !== id);
      AsyncStorage.setItem(APPS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const addContact = useCallback(async (data: Omit<Contact, 'id' | 'addedDate'>) => {
    const contact: Contact = { ...data, id: genId(), addedDate: new Date().toISOString() };
    setContacts(prev => {
      const next = [contact, ...prev];
      AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(next));
      return next;
    });
    return contact;
  }, []);

  const updateContact = useCallback(async (id: string, updates: Partial<Contact>) => {
    setContacts(prev => {
      const next = prev.map(c => c.id === id ? { ...c, ...updates } : c);
      AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const deleteContact = useCallback(async (id: string) => {
    setContacts(prev => {
      const next = prev.filter(c => c.id !== id);
      AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const saveEvent = useCallback(async (event: Omit<SavedEvent, 'savedAt'>) => {
    const saved: SavedEvent = { ...event, savedAt: new Date().toISOString() };
    setSavedEvents(prev => {
      if (prev.some(e => e.id === event.id)) return prev;
      const next = [saved, ...prev];
      AsyncStorage.setItem(SAVED_EVENTS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const unsaveEvent = useCallback(async (id: string) => {
    setSavedEvents(prev => {
      const next = prev.filter(e => e.id !== id);
      AsyncStorage.setItem(SAVED_EVENTS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const addDoc = useCallback(async (data: Omit<StoredDocument, 'id' | 'uploadedAt'>) => {
    const doc: StoredDocument = { ...data, id: genId(), uploadedAt: new Date().toISOString() };
    setDocs(prev => {
      const next = [doc, ...prev];
      AsyncStorage.setItem(DOCS_KEY, JSON.stringify(next));
      return next;
    });
    return doc;
  }, []);

  const updateDoc = useCallback(async (id: string, updates: Partial<StoredDocument>) => {
    setDocs(prev => {
      const next = prev.map(d => d.id === id ? { ...d, ...updates } : d);
      AsyncStorage.setItem(DOCS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const deleteDoc = useCallback(async (id: string) => {
    setDocs(prev => {
      const next = prev.filter(d => d.id !== id);
      AsyncStorage.setItem(DOCS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setThemeOverride = useCallback(async (t: ThemeOverride) => {
    setThemeOverrideState(t);
    await AsyncStorage.setItem(THEME_KEY, t);
  }, []);

  const clearAllData = useCallback(async () => {
    const fresh = defaultProfile();
    await AsyncStorage.multiRemove([APPS_KEY, CONTACTS_KEY, SAVED_EVENTS_KEY, DOCS_KEY]);
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(fresh));
    setProfile(fresh);
    setApplications([]);
    setContacts([]);
    setSavedEvents([]);
    setDocs([]);
  }, []);

  return (
    <AppContext.Provider value={{
      profile, applications, contacts, savedEvents, docs, isLoaded,
      themeOverride, setThemeOverride,
      updateProfile,
      addApplication, updateApplication, deleteApplication,
      addContact, updateContact, deleteContact,
      saveEvent, unsaveEvent,
      addDoc, updateDoc, deleteDoc,
      clearAllData,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

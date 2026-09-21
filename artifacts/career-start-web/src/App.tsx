import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Compass,
  History,
  Info,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  UserRound,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

type Stage = "setup" | "briefing" | "interview" | "loading" | "feedback";
type View = "practice" | "history" | "profile" | "about";
type SessionStatus = "in_progress" | "completed";
type Verdict = "accepted" | "shortlisted" | "rejected";

type FormState = {
  companyName: string;
  role: string;
  degree: string;
  institution: string;
  yearOfStudy: string;
  skills: string;
  city: string;
  goals: string;
};

type AnswerFeedback = {
  question: string;
  answer: string;
  feedback: string;
  improvementAction: string;
  score: number;
};

type CoachingResult = {
  verdict: Verdict;
  overallScore: number;
  overallFeedback: string;
  strengths: string[];
  areasToImprove: string[];
  answerFeedback: AnswerFeedback[];
  recommendation: string;
};

type Session = FormState & {
  id: string;
  researchSummary: string;
  questions: string[];
  answers: string[];
  startedAt: string;
  updatedAt: string;
  currentIndex: number;
  status: SessionStatus;
  result?: CoachingResult;
};

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

const STORAGE_KEY = "career-start:practice-sessions";
const emptyForm: FormState = {
  companyName: "",
  role: "",
  degree: "",
  institution: "",
  yearOfStudy: "",
  skills: "",
  city: "Lusaka",
  goals: "",
};

const preparation = [
  ["Dress", "Choose clean, comfortable, role-appropriate clothing and test the full outfit before interview day."],
  ["Speaking", "Slow down, pause before answering, and use one specific example instead of trying to sound perfect."],
  ["Company research", "Know what the company does, one distinctive fact, the role you want, and why your interests fit."],
  ["CV evidence", "Prepare two honest examples from your CV, including what you personally did and what changed."],
  ["Your goals", "Be clear about what you want to learn and what you can contribute from day one."],
  ["Answer structure", "Use situation, task, action, result, then connect the lesson back to this role."],
] as const;

function readSessions(): Session[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function writeSessions(sessions: Session[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, 12)));
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Recently";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function buildResearch(form: FormState) {
  const city = form.city.trim() || "Zambia";
  const company = form.companyName.trim();
  const role = form.role.trim();
  const focus = form.skills.trim() || "communication, curiosity, and practical problem solving";
  return `${company} is the organisation you are preparing to meet for a ${role} conversation. For a Zambia-first practice run, pay attention to how the organisation creates value for people in ${city}, how teams collaborate, and what evidence would make your interest credible.\n\nUse one public source before a real interview to confirm its current work. Then connect your ${focus} to a specific problem this role may help solve. This is a preparation brief, not live company research.`;
}

function buildQuestions(form: FormState) {
  const company = form.companyName.trim();
  const role = form.role.trim();
  const skills = form.skills.trim() || "your strongest skills";
  const questions = [
    `Tell us about yourself and why you are interested in the ${role} opportunity at ${company}.`,
    `What have you learned through your ${form.degree.trim() || "studies"} that would help you contribute in this role?`,
    `Walk us through a project or responsibility where you used ${skills}. What did you personally do?`,
    "Tell us about a time something did not go to plan. How did you respond and what changed afterwards?",
    `How would you approach your first month in this role in ${form.city.trim() || "the team"}?`,
    "What question would you ask us to understand whether this is the right place for your growth?",
  ];
  return questions;
}

function buildFeedback(session: Session, answers: string[]): CoachingResult {
  const reviewed = session.questions.map((question, index) => {
    const answer = (answers[index] || "").trim();
    const words = answer.split(/\s+/).filter(Boolean).length;
    const hasEvidence = /because|result|learn|built|helped|led|improved|created|solved|organised/i.test(answer);
    const score = Math.min(10, Math.max(4.8, 5.1 + Math.min(words, 85) / 24 + (hasEvidence ? 1.35 : 0)));
    const rounded = Number(score.toFixed(1));
    const feedback = words < 18
      ? "You have a useful starting point, but the answer is too brief for a real interviewer to understand your contribution."
      : hasEvidence
        ? "You gave the answer a credible shape by pointing to action or learning. Keep the focus on your own decisions and the result."
        : "Your explanation is clear, but it needs one concrete example so the interviewer can trust the claim.";
    const improvementAction = index === 0
      ? "Try a 45-second introduction: present, past evidence, and why this role is the next honest step."
      : index === 2
        ? "Name the situation, your exact action, and a measurable or observable result."
        : "Add one specific detail: who was involved, what you did, and what you would repeat next time.";
    return { question, answer: answer || "No answer recorded.", feedback, improvementAction, score: rounded };
  });
  const overallScore = Number((reviewed.reduce((sum, item) => sum + item.score, 0) / reviewed.length).toFixed(1));
  const verdict: Verdict = overallScore >= 8.2 ? "accepted" : overallScore >= 6.7 ? "shortlisted" : "rejected";
  const verdictText = verdict === "accepted"
    ? "Strong practice signal"
    : verdict === "shortlisted"
      ? "Promising practice"
      : "More practice needed";
  return {
    verdict,
    overallScore,
    overallFeedback: `${verdictText}. Your strongest next step is to turn your good instincts into concise evidence: say what happened, what you did, and what you learned. A practice score is a coaching signal, never a hiring prediction.`,
    strengths: [
      "You showed up with a role-specific practice set rather than rehearsing generic answers.",
      session.skills.trim() ? `You can build on your stated skills in ${session.skills.trim()}.` : "You have a clear opportunity to make your skills more visible with examples.",
      "You completed an honest rehearsal and now have specific material to improve.",
    ],
    areasToImprove: [
      "Use one real example in every answer, even when the question feels broad.",
      "Make your personal contribution unmistakable when describing group work.",
      "Finish with the result or lesson so each answer lands with confidence.",
    ],
    answerFeedback: reviewed,
    recommendation: overallScore >= 7.5
      ? "Repeat the same set once more, but shorten each answer to its clearest evidence. Then ask someone you trust to listen for one missing detail."
      : "Repeat this set after writing three small evidence notes from your studies, projects, volunteering, or work. Do not invent experience; make ordinary experience specific.",
  };
}

function verdictLabel(verdict: Verdict) {
  return verdict === "accepted" ? "Strong practice signal" : verdict === "shortlisted" ? "Promising practice" : "More practice needed";
}

function App() {
  const [stage, setStage] = useState<Stage>("setup");
  const [view, setView] = useState<View>("practice");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [sessions, setSessions] = useState<Session[]>(() => readSessions());
  const [active, setActive] = useState<Session | null>(null);
  const [researchSummary, setResearchSummary] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [result, setResult] = useState<CoachingResult | null>(null);
  const [error, setError] = useState("");
  const [loadingMessage, setLoadingMessage] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef<Recognition | null>(null);

  const completedSessions = useMemo(
    () => sessions.filter((session) => session.status === "completed" && session.result),
    [sessions],
  );

  useEffect(() => () => {
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
  }, []);

  function updateForm(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function persistSession(next: Session) {
    setSessions((current) => {
      const updated = [next, ...current.filter((session) => session.id !== next.id)];
      writeSessions(updated);
      return updated;
    });
    setActive(next);
  }

  function prepareInterview(event?: FormEvent) {
    event?.preventDefault();
    if (!form.companyName.trim() || !form.role.trim()) {
      setError("Add the company and role before preparing the interview.");
      return;
    }
    setError("");
    setView("practice");
    setStage("loading");
    setLoadingMessage("Building a focused practice brief…");
    window.setTimeout(() => {
      setResearchSummary(buildResearch(form));
      setQuestions(buildQuestions(form));
      setStage("briefing");
    }, 650);
  }

  function beginInterview() {
    const now = new Date().toISOString();
    const next: Session = {
      ...form,
      companyName: form.companyName.trim(),
      role: form.role.trim(),
      id: `career-start-${Date.now()}`,
      researchSummary,
      questions,
      answers: [],
      startedAt: now,
      updatedAt: now,
      currentIndex: 0,
      status: "in_progress",
    };
    persistSession(next);
    setAnswers([]);
    setCurrentIndex(0);
    setCurrentAnswer("");
    setStage("interview");
  }

  function toggleReadAloud() {
    const question = questions[currentIndex];
    if (!question || !window.speechSynthesis) {
      setError("Read-aloud is not available in this browser. You can still read the question on screen.");
      return;
    }
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(question);
    utterance.rate = 0.92;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }

  function toggleSpeechInput() {
    const browserWindow = window as typeof window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Constructor = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
    if (!Constructor) {
      setError("Speech input is not available in this browser. You can still type your answer.");
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const recognition = new Constructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-ZM";
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) transcript += event.results[index][0].transcript;
      setCurrentAnswer(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => {
      setIsListening(false);
      setError("Speech input stopped. Check microphone permission or type your answer instead.");
    };
    recognitionRef.current = recognition;
    recognition.start();
    setError("");
    setIsListening(true);
  }

  function finishInterview(session: Session, finalAnswers: string[]) {
    setStage("loading");
    setLoadingMessage("Your coach is turning answers into useful next steps…");
    window.setTimeout(() => {
      const coaching = buildFeedback(session, finalAnswers);
      const completed: Session = {
        ...session,
        answers: finalAnswers,
        currentIndex: session.questions.length,
        updatedAt: new Date().toISOString(),
        status: "completed",
        result: coaching,
      };
      persistSession(completed);
      setResult(coaching);
      setStage("feedback");
    }, 800);
  }

  function submitAnswer() {
    if (!active || !currentAnswer.trim()) {
      setError("Write or speak an answer before moving on.");
      return;
    }
    recognitionRef.current?.stop();
    setIsListening(false);
    const nextAnswers = [...answers, currentAnswer.trim()];
    const nextIndex = currentIndex + 1;
    const nextSession: Session = {
      ...active,
      answers: nextAnswers,
      currentIndex: nextIndex,
      updatedAt: new Date().toISOString(),
    };
    persistSession(nextSession);
    setAnswers(nextAnswers);
    setCurrentAnswer("");
    setError("");
    if (nextIndex < questions.length) {
      setCurrentIndex(nextIndex);
    } else {
      finishInterview(nextSession, nextAnswers);
    }
  }

  function openSession(session: Session) {
    setView("practice");
    setForm({
      companyName: session.companyName,
      role: session.role,
      degree: session.degree,
      institution: session.institution,
      yearOfStudy: session.yearOfStudy,
      skills: session.skills,
      city: session.city,
      goals: session.goals,
    });
    setActive(session);
    setResearchSummary(session.researchSummary);
    setQuestions(session.questions);
    setAnswers(session.answers);
    setCurrentIndex(Math.min(session.currentIndex, session.questions.length));
    setCurrentAnswer("");
    setResult(session.result || null);
    setStage(session.status === "completed" ? "feedback" : "interview");
    setError("");
  }

  function startAgain() {
    if (!active) return;
    setQuestions(active.questions);
    setResearchSummary(active.researchSummary);
    setAnswers([]);
    setCurrentIndex(0);
    setCurrentAnswer("");
    setResult(null);
    setStage("briefing");
  }

  function resetPractice() {
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
    setActive(null);
    setQuestions([]);
    setAnswers([]);
    setResult(null);
    setCurrentAnswer("");
    setCurrentIndex(0);
    setError("");
    setForm(emptyForm);
    setStage("setup");
  }

  function deleteSession(sessionId: string) {
    if (!window.confirm("Delete this saved practice session? This cannot be undone.")) return;
    setSessions((current) => {
      const updated = current.filter((session) => session.id !== sessionId);
      writeSessions(updated);
      return updated;
    });
    if (active?.id === sessionId) resetPractice();
  }

  function navigate(nextView: View) {
    setView(nextView);
    if (nextView === "practice" && stage === "loading") setStage("setup");
  }

  return (
    <div className="app-frame">
      <header className="mobile-header">
        <button className="brand" onClick={() => navigate("practice")} data-testid="button-mobile-brand">
          <span className="brand-mark">CS</span><span className="brand-name">Career Start</span>
        </button>
        <span className="local-pill"><span className="local-dot" /> Private mode</span>
      </header>
      <aside className="rail">
        <button className="brand" onClick={() => navigate("practice")} data-testid="button-brand">
          <span className="brand-mark">CS</span><span className="brand-name">Career Start</span>
        </button>
        <p className="rail-kicker">ZAMBIA / PRACTICE STUDIO</p>
        <nav className="rail-nav" aria-label="Main navigation">
          <NavButton active={view === "practice"} icon={<Compass size={16} />} onClick={() => navigate("practice")} label="Mock interview" testId="nav-practice" />
          <NavButton active={view === "history"} icon={<History size={16} />} onClick={() => navigate("history")} label="Practice history" testId="nav-history" />
          <NavButton active={view === "profile"} icon={<UserRound size={16} />} onClick={() => navigate("profile")} label="My profile" testId="nav-profile" />
          <NavButton active={view === "about"} icon={<Info size={16} />} onClick={() => navigate("about")} label="About Career Start" testId="nav-about" />
        </nav>
        <div className="rail-spacer" />
        <div className="privacy-note">
          <ShieldCheck size={17} color="var(--teal)" />
          <strong>Private practice</strong>
          <p>Your sessions stay in this browser. No account, secrets, or remote API is needed.</p>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <span className="eyebrow">CAREER PREP / MOCK INTERVIEW</span>
            <h1>Practice with honesty, not an employer verdict.</h1>
          </div>
          <span className="local-pill"><span className="local-dot" /> Saved locally</span>
        </header>
        {error && <div className="error-banner" role="alert" data-testid="status-error"><CircleAlert size={17} /><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss message" data-testid="button-dismiss-error"><X size={16} /></button></div>}
        {view === "practice" && stage === "setup" && <Setup sessions={sessions} completedSessions={completedSessions} form={form} updateForm={updateForm} onPrepare={prepareInterview} onOpen={openSession} onDelete={deleteSession} />}
        {view === "practice" && stage === "briefing" && <Briefing company={form.companyName} role={form.role} summary={researchSummary} questions={questions} onBegin={beginInterview} onBack={resetPractice} />}
        {view === "practice" && stage === "interview" && active && <Interview company={active.companyName} role={active.role} questions={questions} answers={answers} currentIndex={currentIndex} currentAnswer={currentAnswer} setCurrentAnswer={setCurrentAnswer} isListening={isListening} isSpeaking={isSpeaking} onVoice={toggleSpeechInput} onRead={toggleReadAloud} onSubmit={submitAnswer} onQuit={() => { persistSession({ ...active, answers, currentIndex, updatedAt: new Date().toISOString() }); setStage("setup"); setActive(null); }} />}
        {view === "practice" && stage === "loading" && <Loading message={loadingMessage} />}
        {view === "practice" && stage === "feedback" && active && result && <Feedback session={active} result={result} onAgain={startAgain} onReset={resetPractice} />}
        {view === "history" && <HistoryView sessions={sessions} onOpen={openSession} onDelete={deleteSession} onStart={() => navigate("practice")} />}
        {view === "profile" && <ProfileView sessions={sessions} completedSessions={completedSessions} />}
        {view === "about" && <AboutView />}
      </main>
    </div>
  );
}

function NavButton({ active, icon, label, onClick, testId }: { active: boolean; icon: ReactNode; label: string; onClick: () => void; testId: string }) {
  return <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick} data-testid={`button-${testId}`} aria-current={active ? "page" : undefined}><span className="nav-icon">{icon}</span>{label}</button>;
}

function Setup({ sessions, completedSessions, form, updateForm, onPrepare, onOpen, onDelete }: { sessions: Session[]; completedSessions: Session[]; form: FormState; updateForm: (field: keyof FormState, value: string) => void; onPrepare: (event?: FormEvent) => void; onOpen: (session: Session) => void; onDelete: (sessionId: string) => void }) {
  return <section className="view-shell content-grid">
    <div className="primary-column">
      <div className="hero-card">
        <div className="hero-copy">
          <span className="hero-label">A better rehearsal</span>
          <h2>Walk into the interview with evidence, not guesses.</h2>
          <p>Career Start turns your context into a fixed, thoughtful practice set. You choose the company and role; the coach helps you find the next honest step.</p>
        </div>
      </div>
      <form className="panel" onSubmit={onPrepare}>
        <div className="panel-heading"><div><span className="eyebrow">START A SESSION</span><h3>Set the context</h3></div><span className="step-badge">01 / 03</span></div>
        <div className="form-grid">
          <Field label="Company" value={form.companyName} onChange={(value) => updateForm("companyName", value)} placeholder="e.g. Zanaco" required testId="company" />
          <Field label="Role or placement" value={form.role} onChange={(value) => updateForm("role", value)} placeholder="e.g. Software engineering intern" required testId="role" />
          <Field label="Degree / field" value={form.degree} onChange={(value) => updateForm("degree", value)} placeholder="e.g. BSc Computer Science" testId="degree" />
          <Field label="Institution" value={form.institution} onChange={(value) => updateForm("institution", value)} placeholder="e.g. UNZA" testId="institution" />
          <Field label="Year of study" value={form.yearOfStudy} onChange={(value) => updateForm("yearOfStudy", value)} placeholder="e.g. Final year" testId="year" />
          <Field label="City" value={form.city} onChange={(value) => updateForm("city", value)} placeholder="e.g. Lusaka" testId="city" />
          <Field label="Skills" value={form.skills} onChange={(value) => updateForm("skills", value)} placeholder="e.g. Python, research, teamwork" wide testId="skills" />
          <Field label="Career goals" value={form.goals} onChange={(value) => updateForm("goals", value)} placeholder="What do you want to learn or contribute?" wide area testId="goals" />
        </div>
        <div className="panel-footer"><span className="muted">Company context and questions are prepared before you start.</span><button className="primary-button" type="submit" data-testid="button-prepare-interview">Prepare interview <ArrowRight size={15} /></button></div>
      </form>
    </div>
    <aside className="secondary-column">
      <div className="side-panel">
        <div className="panel-heading"><div><span className="eyebrow">YOUR PRACTICE</span><h3>Saved sessions</h3></div><span className="count-badge">{completedSessions.length}</span></div>
        {sessions.length === 0 ? <p className="empty-copy">Completed coaching summaries and in-progress rehearsals will appear here and stay on this computer.</p> : <div className="session-list">{sessions.slice(0, 6).map((session) => <SessionRow key={session.id} session={session} onOpen={onOpen} onDelete={onDelete} />)}</div>}
      </div>
      <div className="side-panel mini-guidance"><span className="eyebrow">BEFORE YOU START</span><h3>Six things worth rehearsing</h3><p>Appearance, speaking, company knowledge, CV evidence, your goals, and a simple answer structure.</p></div>
    </aside>
  </section>;
}

function SessionRow({ session, onOpen, onDelete }: { session: Session; onOpen: (session: Session) => void; onDelete: (id: string) => void }) {
  return <div className="session-row">
    <button className="session-icon" onClick={() => onOpen(session)} aria-label={`Open ${session.companyName}`} data-testid={`button-open-session-${session.id}`}>{session.status === "completed" ? <Check size={14} /> : <Clock3 size={14} />}</button>
    <button onClick={() => onOpen(session)} style={{ textAlign: "left", background: "transparent", border: 0, padding: 0 }} data-testid={`button-resume-session-${session.id}`}><strong>{session.companyName}</strong><small>{session.role}<br />{session.status === "completed" ? `Score ${session.result?.overallScore}/10 · ` : "In progress · "}{formatDate(session.updatedAt)}</small></button>
    <button className="quiet-button" onClick={() => onDelete(session.id)} aria-label={`Delete ${session.companyName}`} data-testid={`button-delete-session-${session.id}`}><Trash2 size={14} /></button>
  </div>;
}

function Briefing({ company, role, summary, questions, onBegin, onBack }: { company: string; role: string; summary: string; questions: string[]; onBegin: () => void; onBack: () => void }) {
  return <section className="view-shell wide-section">
    <div className="section-intro"><button className="back-button" onClick={onBack} data-testid="button-change-context"><ArrowLeft size={14} /> Change context</button><span className="eyebrow">BRIEFING / {company}</span><h2>{role} practice plan</h2><p>Review the research and preparation checklist before starting. These {questions.length} questions are generated now and stay fixed throughout your practice session.</p></div>
    <div className="briefing-grid">
      <div className="research-card"><span className="card-icon"><BookOpen size={16} /></span><h3>Company context</h3><p data-testid="text-research-summary">{summary}</p></div>
      <div className="prep-card"><span className="card-icon"><Check size={16} /></span><h3>Preparation checklist</h3>{preparation.map(([title, text]) => <div className="check-row" key={title}><span><Check size={14} /></span><p><strong>{title}</strong>{text}</p></div>)}</div>
    </div>
    <div className="question-preview">
      <div className="panel-heading"><div><span className="eyebrow">FIXED QUESTION SET</span><h3>What you will practise</h3></div><span className="step-badge">{questions.length} questions</span></div>
      <div className="question-list">{questions.map((question, index) => <div className="question-preview-row" key={`${question}-${index}`} data-testid={`text-question-preview-${index}`}><span>Q{String(index + 1).padStart(2, "0")}</span><p>{question}</p></div>)}</div>
      <div className="panel-footer"><span className="muted">Type each answer or use speech input when your browser supports it.</span><button className="primary-button" onClick={onBegin} data-testid="button-start-practice">Start practice <ArrowRight size={15} /></button></div>
    </div>
  </section>;
}

function Interview({ company, role, questions, answers, currentIndex, currentAnswer, setCurrentAnswer, isListening, isSpeaking, onVoice, onRead, onSubmit, onQuit }: { company: string; role: string; questions: string[]; answers: string[]; currentIndex: number; currentAnswer: string; setCurrentAnswer: (value: string) => void; isListening: boolean; isSpeaking: boolean; onVoice: () => void; onRead: () => void; onSubmit: () => void; onQuit: () => void }) {
  const progress = Math.round((currentIndex / questions.length) * 100);
  const words = currentAnswer.trim().split(/\s+/).filter(Boolean).length;
  return <section className="view-shell interview-section">
    <div className="interview-bar"><div><span className="eyebrow">LIVE PRACTICE / {company}</span><h2>{role}</h2></div><div className="interview-meta"><span>Question {Math.min(currentIndex + 1, questions.length)} of {questions.length}</span><button className="quiet-button" onClick={onQuit} data-testid="button-end-session">End session</button></div></div>
    <div className="progress-line" aria-label={`${progress}% complete`}><span style={{ width: `${progress}%` }} /></div>
    <div className="transcript" data-testid="region-interview-transcript">
      {answers.map((answer, index) => <div className="qa-block" key={`${questions[index]}-${index}`}><div className="question-line"><span>Q{index + 1}</span><p>{questions[index]}</p></div><div className="answer-line"><span>A</span><p>{answer}</p></div></div>)}
      {questions[currentIndex] && <div className="current-question"><div className="question-line"><span>Q{String(currentIndex + 1).padStart(2, "0")}</span><p data-testid="text-current-question">{questions[currentIndex]}</p><button className={`icon-button ${isSpeaking ? "active" : ""}`} onClick={onRead} title={isSpeaking ? "Stop reading" : "Read question aloud"} aria-label={isSpeaking ? "Stop reading question" : "Read question aloud"} data-testid="button-read-aloud">{isSpeaking ? <VolumeX size={15} /> : <Volume2 size={15} />}</button></div><p className="coach-prompt">Take a breath. Use a real example, then explain what changed because of your action.</p></div>}
    </div>
    <div className="answer-composer">
      <div className="composer-toolbar"><span className="muted">Your answer</span><span className="muted">{words} words</span></div>
      <textarea value={currentAnswer} onChange={(event) => setCurrentAnswer(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") onSubmit(); }} placeholder={isListening ? "Listening… speak naturally" : "Type your answer, or use the microphone…"} autoFocus data-testid="input-interview-answer" />
      <div className="composer-footer"><button className={`secondary-button ${isListening ? "recording" : ""}`} onClick={onVoice} data-testid="button-speech-input">{isListening ? <><MicOff size={14} /> Stop listening</> : <><Mic size={14} /> Use speech input</>}</button><span className="muted">Ctrl / Cmd + Enter to submit</span><button className="primary-button" onClick={onSubmit} data-testid="button-submit-answer">{currentIndex + 1 === questions.length ? "Get coaching" : "Next question"} <Send size={14} /></button></div>
    </div>
  </section>;
}

function Feedback({ session, result, onAgain, onReset }: { session: Session; result: CoachingResult; onAgain: () => void; onReset: () => void }) {
  return <section className="view-shell feedback-section">
    <div className="feedback-header"><div><span className="eyebrow">COACHING SUMMARY / {session.companyName}</span><h2>Now make the next attempt better.</h2><p>{session.role} · Completed {formatDate(session.updatedAt)}</p></div><div className="score-card"><span>Practice score</span><strong>{result.overallScore}<small>/10</small></strong><em>{verdictLabel(result.verdict)}</em></div></div>
    <div className="honesty-banner"><span>i</span><p><strong>AI coaching only — not an employer verdict or hiring decision.</strong> Use this as practice guidance, not a prediction of what a real employer will decide.</p></div>
    <div className="feedback-grid"><div className="feedback-main"><div className="feedback-card"><span className="eyebrow">OVERALL COACHING</span><p className="large-copy" data-testid="text-overall-feedback">{result.overallFeedback}</p></div><div className="feedback-columns"><div className="feedback-card"><h3>What worked</h3>{result.strengths.map((item, index) => <p className="bullet-row" key={index}><span className="good"><Check size={11} /></span>{item}</p>)}</div><div className="feedback-card"><h3>What to improve</h3>{result.areasToImprove.map((item, index) => <p className="bullet-row" key={index}><span className="warn">!</span>{item}</p>)}</div></div></div><aside className="recommendation-card"><span className="card-icon"><Target size={16} /></span><span className="eyebrow">NEXT REHEARSAL</span><h3>One focused action</h3><p>{result.recommendation}</p></aside></div>
    <div className="answer-review"><div className="panel-heading"><div><span className="eyebrow">ANSWER BY ANSWER</span><h3>Specific feedback you can use</h3></div><span className="step-badge">{result.answerFeedback.length} reviewed</span></div>{result.answerFeedback.map((item, index) => <article className="answer-feedback" key={`${item.question}-${index}`}><div className="answer-feedback-head"><span>Q{String(index + 1).padStart(2, "0")}</span><strong>{item.score}/10</strong></div><h4>{item.question}</h4><div className="your-answer"><span>YOUR ANSWER</span><p>{item.answer}</p></div><p className="feedback-copy">{item.feedback}</p><div className="action-callout"><span>TRY THIS NEXT</span><p>{item.improvementAction}</p></div></article>)}</div>
    <div className="actions-row"><button className="primary-button" onClick={onAgain} data-testid="button-repeat-session">Practice this set again <RotateCcw size={14} /></button><button className="secondary-button" onClick={onReset} data-testid="button-new-company">New company</button></div>
  </section>;
}

function Loading({ message }: { message: string }) {
  return <div className="view-shell loading-state" data-testid="status-loading"><div className="loading-orbit" /><span className="eyebrow">PLEASE WAIT</span><h2>{message || "Preparing your session…"}</h2><p>Your progress is kept locally while we work.</p></div>;
}

function Field({ label, value, onChange, placeholder, required, wide, area, testId }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; required?: boolean; wide?: boolean; area?: boolean; testId: string }) {
  return <label className={`field ${wide ? "wide" : ""}`}><span>{label}{required && <b> *</b>}</span>{area ? <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={3} data-testid={`input-${testId}`} /> : <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} data-testid={`input-${testId}`} />}</label>;
}

function HistoryView({ sessions, onOpen, onDelete, onStart }: { sessions: Session[]; onOpen: (session: Session) => void; onDelete: (id: string) => void; onStart: () => void }) {
  return <section className="view-shell history-view"><div className="view-title"><span className="eyebrow">YOUR PRACTICE</span><h2>History that helps you move.</h2><p>Reopen a session to continue where you stopped, revisit coaching, or repeat a fixed question set without starting from zero.</p></div>{sessions.length === 0 ? <div className="about-card"><Clock3 size={22} color="var(--yellow)" /><h3>No sessions yet.</h3><p>Your first rehearsal will appear here automatically. It stays in this browser, ready when you are.</p><button className="primary-button" onClick={onStart} data-testid="button-history-empty">Go to practice <ArrowRight size={14} /></button></div> : <div className="history-list">{sessions.map((session) => <div className="history-card" key={session.id}><div><span className="eyebrow">{session.status === "completed" ? "COMPLETED" : "IN PROGRESS"}</span><h3>{session.companyName} · {session.role}</h3><p>{session.city || "Zambia"} · Updated {formatDate(session.updatedAt)}</p></div><div className="history-actions">{session.result && <div className="history-score"><strong>{session.result.overallScore}/10</strong><span>practice score</span></div>}<button className="secondary-button" onClick={() => onOpen(session)} data-testid={`button-history-open-${session.id}`}>{session.status === "completed" ? "Review" : "Continue"} <ChevronRight size={13} /></button><button className="quiet-button" onClick={() => onDelete(session.id)} aria-label={`Delete ${session.companyName} session`} data-testid={`button-history-delete-${session.id}`}><Trash2 size={14} /></button></div></div>)}</div>}</section>;
}

function ProfileView({ sessions, completedSessions }: { sessions: Session[]; completedSessions: Session[] }) {
  const average = completedSessions.length ? (completedSessions.reduce((sum, session) => sum + (session.result?.overallScore || 0), 0) / completedSessions.length).toFixed(1) : "—";
  const companies = new Set(sessions.map((session) => session.companyName)).size;
  return <section className="view-shell profile-view"><div className="view-title"><span className="eyebrow">YOUR PRACTICE PROFILE</span><h2>Small reps build real confidence.</h2><p>This is a private snapshot of your preparation habits. It is not a public profile and nothing here is sent to an employer.</p></div><div className="profile-card"><div className="card-icon"><Sparkles size={16} /></div><h3>Keep your evidence close.</h3><p className="empty-copy">Before your next real application, collect three honest examples from class, work, volunteering, or a personal project. Career Start will help you practise saying them clearly.</p><div className="profile-grid"><div className="profile-stat"><strong>{sessions.length}</strong><span>sessions saved</span></div><div className="profile-stat"><strong>{completedSessions.length}</strong><span>completed rehearsals</span></div><div className="profile-stat"><strong>{average}</strong><span>average practice score</span></div><div className="profile-stat"><strong>{companies}</strong><span>companies explored</span></div></div></div></section>;
}

function AboutView() {
  return <section className="view-shell about-view"><div className="view-title"><span className="eyebrow">WHY CAREER START</span><h2>A calm coach for the uncertain middle.</h2><p>Built for students and early-career candidates in Zambia who want to prepare honestly for real conversations.</p></div><div className="about-card"><BriefcaseBusiness size={24} color="var(--yellow)" /><h3>Practice is not pretending.</h3><p>Career Start gives you a private place to find your words before the stakes are high. It does not invent experience, promise a job, or replace company research. It helps you notice what is already true and say it with more clarity.</p><p>Everything in this first browser build is deterministic and local. Your context, answers, and coaching notes stay in your browser unless you choose to share them yourself.</p><div className="about-points"><div className="about-point"><strong>01 / Honest</strong><span>No inflated claims. Use the experience you actually have.</span></div><div className="about-point"><strong>02 / Zambia-first</strong><span>Start with your city, institution, goals, and the context you know.</span></div><div className="about-point"><strong>03 / One next step</strong><span>Leave each rehearsal knowing what to practise next.</span></div></div></div></section>;
}

export default App;
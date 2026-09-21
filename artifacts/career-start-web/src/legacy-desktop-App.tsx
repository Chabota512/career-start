import { useEffect, useMemo, useRef, useState } from "react";
import AuthGate from "./AuthGate";

type Stage = "setup" | "briefing" | "interview" | "loading" | "feedback";
type SessionStatus = "in_progress" | "completed";

type AnswerFeedback = {
  question: string;
  answer: string;
  feedback: string;
  improvementAction?: string;
  score: number;
};

type CoachingResult = {
  verdict: "accepted" | "shortlisted" | "rejected";
  overallScore: number;
  overallFeedback: string;
  strengths: string[];
  areasToImprove: string[];
  answerFeedback: AnswerFeedback[];
  recommendation: string;
};

type Session = {
  id: string;
  companyName: string;
  role: string;
  degree: string;
  institution: string;
  yearOfStudy: string;
  skills: string;
  city: string;
  goals: string;
  researchSummary: string;
  questions: string[];
  answers: string[];
  startedAt: string;
  updatedAt: string;
  currentIndex: number;
  status: SessionStatus;
  result?: CoachingResult;
};

type FormState = Omit<Session, "id" | "researchSummary" | "questions" | "answers" | "startedAt" | "updatedAt" | "currentIndex" | "status" | "result">;

type SpeechRecognitionConstructor = new () => SpeechRecognition;
type SpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const STORAGE_KEY = "career-compass:desktop-interview-sessions";
const DEFAULT_API = "http://localhost:8080";
const API_BASE = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API).replace(/\/$/, "");

const preparation = [
  ["Dress", "Choose clean, comfortable, role-appropriate clothing and test the full outfit before interview day."],
  ["Speaking", "Slow down, pause before answering, make your point clearly, and use a specific example instead of trying to sound perfect."],
  ["Company research", "Know what the company does, one recent or distinctive fact, the role you want, and why your interests fit that work."],
  ["CV", "Prepare two honest examples from your CV, including what you personally did and the result. Do not claim tools or experience you cannot explain."],
  ["Application letter", "Re-read the letter or motivation statement you submitted so your spoken reasons and goals match what the employer will see."],
  ["Answer structure", "Use situation, task, action, result, then connect the lesson back to this role. This is a practice structure, not a script."],
] as const;

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

function readSessions(): Session[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSessions(sessions: Session[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, 12)));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<T>;
}

function InterviewApp() {
  const [stage, setStage] = useState<Stage>("setup");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [sessions, setSessions] = useState<Session[]>(readSessions);
  const [active, setActive] = useState<Session | null>(null);
  const [researchSummary, setResearchSummary] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [result, setResult] = useState<CoachingResult | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const completedSessions = useMemo(() => sessions.filter((session) => session.status === "completed" && session.result), [sessions]);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
  }, []);

  function updateForm(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function persistSession(next: Session) {
    setSessions((current) => {
      const nextSessions = [next, ...current.filter((session) => session.id !== next.id)];
      saveSessions(nextSessions);
      return nextSessions;
    });
    setActive(next);
  }

  async function prepareInterview() {
    if (!form.companyName.trim() || !form.role.trim()) {
      setError("Add the company and role before preparing the interview.");
      return;
    }
    setError("");
    setStage("loading");
    setStatus("Researching the company and preparing a fixed practice set…");
    try {
      const [research, generated] = await Promise.all([
        postJson<{ summary: string }>("/api/ai/research-company", { companyName: form.companyName.trim() }),
        postJson<{ personal?: string[]; company?: string[]; experience?: string[] }>("/api/ai/interview-questions", {
          companyName: form.companyName.trim(),
          role: form.role.trim(),
          degree: form.degree,
          goals: form.goals,
          institution: form.institution,
          yearOfStudy: form.yearOfStudy,
          skills: form.skills,
        }),
      ]);
      const nextQuestions = [...(generated.personal || []), ...(generated.company || []), ...(generated.experience || [])].slice(0, 8);
      if (!nextQuestions.length) throw new Error("No questions were returned.");
      setResearchSummary(research.summary || "No company summary was returned.");
      setQuestions(nextQuestions);
      setStage("briefing");
    } catch (err) {
      setError(err instanceof Error ? `${err.message}. Check that the API server is running.` : "Could not prepare the interview.");
      setStage("setup");
    }
  }

  function beginInterview() {
    const now = new Date().toISOString();
    const next: Session = {
      ...form,
      companyName: form.companyName.trim(),
      role: form.role.trim(),
      id: `desktop-interview-${Date.now()}`,
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
    if (!question || !window.speechSynthesis) return;
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
    const Constructor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Constructor) {
      setError("Speech input is not available in this Electron environment. You can still type your answer.");
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
    recognition.lang = "en-US";
    recognition.onresult = (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => {
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

  async function submitAnswer() {
    if (!active || !currentAnswer.trim()) {
      setError("Answer the question before moving on.");
      return;
    }
    recognitionRef.current?.stop();
    setIsListening(false);
    const nextAnswers = [...answers, currentAnswer.trim()];
    const nextIndex = currentIndex + 1;
    const nextSession = { ...active, answers: nextAnswers, currentIndex: nextIndex, updatedAt: new Date().toISOString() };
    persistSession(nextSession);
    setAnswers(nextAnswers);
    setCurrentAnswer("");
    setError("");
    if (nextIndex < questions.length) {
      setCurrentIndex(nextIndex);
      return;
    }
    await finishInterview(nextSession, nextAnswers);
  }

  async function finishInterview(session: Session, finalAnswers: string[]) {
    setStage("loading");
    setStatus("Your AI coach is preparing answer-level feedback…");
    try {
      const coaching = await postJson<CoachingResult>("/api/ai/interview-verdict", {
        companyName: session.companyName,
        role: session.role,
        degree: session.degree || "General",
        goals: session.goals,
        institution: session.institution,
        yearOfStudy: session.yearOfStudy,
        skills: session.skills,
        city: session.city,
        questions: session.questions,
        answers: finalAnswers,
        researchSummary: session.researchSummary,
      });
      const completed = { ...session, answers: finalAnswers, currentIndex: session.questions.length, updatedAt: new Date().toISOString(), status: "completed" as const, result: coaching };
      persistSession(completed);
      setResult(coaching);
      setActive(completed);
      setStage("feedback");
    } catch (err) {
      setError(err instanceof Error ? `${err.message}. Your answers are saved; you can try feedback again.` : "Could not load coaching feedback.");
      setStage("interview");
    }
  }

  function openSession(session: Session) {
    setForm({ companyName: session.companyName, role: session.role, degree: session.degree, institution: session.institution, yearOfStudy: session.yearOfStudy, skills: session.skills, city: session.city, goals: session.goals });
    setActive(session);
    setResearchSummary(session.researchSummary);
    setQuestions(session.questions);
    setAnswers(session.answers);
    setCurrentIndex(session.currentIndex);
    setResult(session.result || null);
    setStage(session.status === "completed" ? "feedback" : "interview");
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

  function reset() {
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
    setActive(null);
    setQuestions([]);
    setAnswers([]);
    setResult(null);
    setCurrentAnswer("");
    setCurrentIndex(0);
    setError("");
    setStage("setup");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">CC</span><span>Career Compass</span></div>
        <div className="side-kicker">Desktop coaching studio</div>
        <nav>
          <button className="nav-item active"><span>✦</span> Mock interview</button>
          <button className="nav-item" onClick={() => setError("Company and application tools are coming into the Electron shell next.")}><span>▦</span> Applications</button>
          <button className="nav-item" onClick={() => setError("Profile tools are coming into the Electron shell next.")}><span>◎</span> My profile</button>
        </nav>
        <div className="sidebar-note"><strong>Private practice</strong><span>Sessions stay on this computer unless you choose to send an answer to the coaching API.</span></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div><span className="eyebrow">CAREER PREP / MOCK INTERVIEW</span><h1>Practice with honesty, not an employer verdict.</h1></div><span className="api-pill"><i /> API {API_BASE}</span></header>
        {error && <div className="error-banner" role="alert">{error}<button onClick={() => setError("")}>×</button></div>}
        {stage === "setup" && <Setup sessions={sessions} completedSessions={completedSessions} form={form} updateForm={updateForm} onPrepare={prepareInterview} onOpen={openSession} />}
        {stage === "briefing" && <Briefing company={form.companyName} role={form.role} summary={researchSummary} questions={questions} onBegin={beginInterview} onBack={reset} />}
        {stage === "interview" && active && <Interview company={active.companyName} role={active.role} questions={questions} answers={answers} currentIndex={currentIndex} currentAnswer={currentAnswer} setCurrentAnswer={setCurrentAnswer} isListening={isListening} isSpeaking={isSpeaking} onVoice={toggleSpeechInput} onRead={toggleReadAloud} onSubmit={submitAnswer} onQuit={reset} />}
        {stage === "loading" && <Loading message={status} />}
        {stage === "feedback" && active && result && <Feedback session={active} result={result} onAgain={startAgain} onReset={reset} />}
      </main>
    </div>
  );
}

function Setup({ sessions, completedSessions, form, updateForm, onPrepare, onOpen }: { sessions: Session[]; completedSessions: Session[]; form: FormState; updateForm: (field: keyof FormState, value: string) => void; onPrepare: () => void; onOpen: (session: Session) => void }) {
  return <section className="content-grid">
    <div className="primary-column">
      <div className="hero-card"><div className="hero-copy"><span className="hero-label">A better rehearsal</span><h2>Walk into the interview with evidence, not guesses.</h2><p>We will prepare up to eight questions before you start. This is a fixed practice set, so the question list will not change based on your answers.</p></div><div className="hero-orbit"><span>Q</span><span>A</span><span>↗</span></div></div>
      <div className="panel"><div className="panel-heading"><div><span className="eyebrow">START A SESSION</span><h3>Set the context</h3></div><span className="step-badge">01 / 03</span></div>
        <div className="form-grid">
          <Field label="Company" value={form.companyName} onChange={(v) => updateForm("companyName", v)} placeholder="e.g. Zambia National Commercial Bank" required />
          <Field label="Role or placement" value={form.role} onChange={(v) => updateForm("role", v)} placeholder="e.g. Software Engineering Intern" required />
          <Field label="Degree / field" value={form.degree} onChange={(v) => updateForm("degree", v)} placeholder="e.g. BSc Computer Science" />
          <Field label="Institution" value={form.institution} onChange={(v) => updateForm("institution", v)} placeholder="e.g. UNZA" />
          <Field label="Year of study" value={form.yearOfStudy} onChange={(v) => updateForm("yearOfStudy", v)} placeholder="e.g. Final year" />
          <Field label="City" value={form.city} onChange={(v) => updateForm("city", v)} placeholder="e.g. Lusaka" />
          <Field label="Skills" value={form.skills} onChange={(v) => updateForm("skills", v)} placeholder="e.g. Python, research, teamwork" wide />
          <Field label="Career goals" value={form.goals} onChange={(v) => updateForm("goals", v)} placeholder="What do you want to learn or contribute?" wide area />
        </div>
        <div className="panel-footer"><span className="muted">Company research and questions are generated before the session.</span><button className="primary-button" onClick={onPrepare}>Prepare interview <span>→</span></button></div>
      </div>
    </div>
    <aside className="secondary-column"><div className="side-panel"><div className="panel-heading"><div><span className="eyebrow">YOUR PRACTICE</span><h3>Saved sessions</h3></div><span className="count-badge">{completedSessions.length}</span></div>{sessions.length === 0 ? <p className="muted">Completed coaching summaries will appear here and stay on this computer.</p> : <div className="session-list">{sessions.slice(0, 6).map((session) => <button className="session-row" key={session.id} onClick={() => onOpen(session)}><span className="session-icon">{session.status === "completed" ? "✓" : "…"}</span><span><strong>{session.companyName}</strong><small>{session.role}<br />{session.status === "completed" ? `Score ${session.result?.overallScore}/10 · ` : "In progress · "}{formatDate(session.updatedAt)}</small></span><span className="arrow">›</span></button>)}</div>}</div><div className="side-panel mini-guidance"><span className="eyebrow">BEFORE YOU START</span><h3>Six things worth rehearsing</h3><p>Appearance, speaking, company knowledge, CV evidence, your letter, and answer structure all matter.</p></div></aside>
  </section>;
}

function Briefing({ company, role, summary, questions, onBegin, onBack }: { company: string; role: string; summary: string; questions: string[]; onBegin: () => void; onBack: () => void }) {
  return <section className="wide-section"><div className="section-intro"><button className="back-button" onClick={onBack}>← Change context</button><span className="eyebrow">BRIEFING / {company}</span><h2>{role} practice plan</h2><p>Review the research and preparation checklist before starting. The {questions.length} questions below are generated now and stay fixed throughout this practice session.</p></div><div className="briefing-grid"><div className="research-card"><span className="card-icon">⌕</span><h3>Company context</h3><p>{summary}</p></div><div className="prep-card"><span className="card-icon">✓</span><h3>Preparation checklist</h3>{preparation.map(([title, text]) => <div className="check-row" key={title}><span>✓</span><p><strong>{title}</strong>{text}</p></div>)}</div></div><div className="question-preview"><div className="panel-heading"><div><span className="eyebrow">FIXED QUESTION SET</span><h3>What you will practise</h3></div><span className="step-badge">{questions.length} questions</span></div><div className="question-list">{questions.map((question, index) => <div className="question-preview-row" key={`${question}-${index}`}><span>Q{String(index + 1).padStart(2, "0")}</span><p>{question}</p></div>)}</div><div className="panel-footer"><span className="muted">You can type or use desktop speech input for each answer.</span><button className="primary-button" onClick={onBegin}>Start practice <span>→</span></button></div></div></section>;
}

function Interview({ company, role, questions, answers, currentIndex, currentAnswer, setCurrentAnswer, isListening, isSpeaking, onVoice, onRead, onSubmit, onQuit }: { company: string; role: string; questions: string[]; answers: string[]; currentIndex: number; currentAnswer: string; setCurrentAnswer: (value: string) => void; isListening: boolean; isSpeaking: boolean; onVoice: () => void; onRead: () => void; onSubmit: () => void; onQuit: () => void }) {
  const progress = Math.round((currentIndex / questions.length) * 100);
  return <section className="interview-section"><div className="interview-bar"><div><span className="eyebrow">LIVE PRACTICE / {company}</span><h2>{role}</h2></div><div className="interview-meta"><span>Question {currentIndex + 1} of {questions.length}</span><button className="quiet-button" onClick={onQuit}>End session</button></div></div><div className="progress-line"><span style={{ width: `${progress}%` }} /></div><div className="transcript">{answers.map((answer, index) => <div className="qa-block" key={index}><div className="question-line"><span>Q{index + 1}</span><p>{questions[index]}</p></div><div className="answer-line"><span>A</span><p>{answer}</p></div></div>)}<div className="current-question"><div className="question-line"><span>Q{String(currentIndex + 1).padStart(2, "0")}</span><p>{questions[currentIndex]}</p><button className={`icon-button ${isSpeaking ? "active" : ""}`} onClick={onRead} title="Read question aloud">{isSpeaking ? "■" : "🔊"}</button></div><p className="coach-prompt">Take a breath. Use a real example, then explain what changed because of your action.</p></div></div><div className="answer-composer"><div className="composer-toolbar"><span className="muted">Your answer</span><span className="muted">{currentAnswer.trim().split(/\s+/).filter(Boolean).length} words</span></div><textarea value={currentAnswer} onChange={(event) => setCurrentAnswer(event.target.value)} placeholder={isListening ? "Listening… speak naturally" : "Type your answer, or use the microphone…"} autoFocus /><div className="composer-footer"><button className={`secondary-button ${isListening ? "recording" : ""}`} onClick={onVoice}>{isListening ? "■ Stop listening" : "◉ Use speech input"}</button><span className="muted">Speech stays in this session.</span><button className="primary-button" onClick={onSubmit}>{currentIndex + 1 === questions.length ? "Get coaching" : "Next question"} <span>→</span></button></div></div></section>;
}

function Feedback({ session, result, onAgain, onReset }: { session: Session; result: CoachingResult; onAgain: () => void; onReset: () => void }) {
  const label = result.verdict === "accepted" ? "Strong practice signal" : result.verdict === "shortlisted" ? "Promising practice" : "More practice needed";
  return <section className="feedback-section"><div className="feedback-header"><div><span className="eyebrow">COACHING SUMMARY / {session.companyName}</span><h2>Now make the next attempt better.</h2><p>{session.role} · Completed {formatDate(session.updatedAt)}</p></div><div className="score-card"><span>Practice score</span><strong>{result.overallScore}<small>/10</small></strong><em>{label}</em></div></div><div className="honesty-banner"><span>i</span><p><strong>AI coaching only — not an employer verdict or hiring decision.</strong> Use this as practice guidance, not a prediction of what a real employer will decide.</p></div><div className="feedback-grid"><div className="feedback-main"><div className="feedback-card"><span className="eyebrow">OVERALL COACHING</span><p className="large-copy">{result.overallFeedback}</p></div><div className="feedback-columns"><div className="feedback-card"><h3>What worked</h3>{result.strengths.map((item, index) => <p className="bullet-row" key={index}><span className="good">✓</span>{item}</p>)}</div><div className="feedback-card"><h3>What to improve</h3>{result.areasToImprove.map((item, index) => <p className="bullet-row" key={index}><span className="warn">!</span>{item}</p>)}</div></div></div><aside className="recommendation-card"><span className="card-icon">↗</span><span className="eyebrow">NEXT REHEARSAL</span><h3>One focused action</h3><p>{result.recommendation}</p></aside></div><div className="answer-review"><div className="panel-heading"><div><span className="eyebrow">ANSWER BY ANSWER</span><h3>Specific feedback you can use</h3></div><span className="step-badge">{result.answerFeedback.length} reviewed</span></div>{result.answerFeedback.map((item, index) => <article className="answer-feedback" key={`${item.question}-${index}`}><div className="answer-feedback-head"><span>Q{String(index + 1).padStart(2, "0")}</span><strong>{item.score}/10</strong></div><h4>{item.question}</h4><div className="your-answer"><span>YOUR ANSWER</span><p>{item.answer}</p></div><p className="feedback-copy">{item.feedback}</p>{item.improvementAction && <div className="action-callout"><span>TRY THIS NEXT</span><p>{item.improvementAction}</p></div>}</article>)}</div><div className="actions-row"><button className="primary-button" onClick={onAgain}>Practice this set again <span>↻</span></button><button className="secondary-button" onClick={onReset}>New company</button></div></section>;
}

function Loading({ message }: { message: string }) { return <div className="loading-state"><div className="loader" /><span className="eyebrow">PLEASE WAIT</span><h2>{message || "Preparing your session…"}</h2><p>Your progress is kept locally while we work.</p></div>; }

function Field({ label, value, onChange, placeholder, required, wide, area }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; required?: boolean; wide?: boolean; area?: boolean }) { return <label className={`field ${wide ? "wide" : ""}`}><span>{label}{required && <b> *</b>}</span>{area ? <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={3} /> : <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />}</label>; }

function App() {
  return (
    <AuthGate>
      <InterviewApp />
    </AuthGate>
  );
}

export default App;

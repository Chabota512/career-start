import { Router } from "express";
import { ai } from "@workspace/integrations-gemini-ai";
import {
  DiscoverCompaniesBody,
  DraftLetterBody,
  ResearchCompanyBody,
  StarFeedbackBody,
  InterviewQuestionsBody,
  ProfileChatBody,
  FindNetworkingEventsBody,
  InterviewVerdictBody,
  ParseProfileFromCvBody,
} from "@workspace/api-zod";

const router = Router();

// ─── External search helpers ──────────────────────────────────────────────────

async function fetchSerperEvents(query: string): Promise<string> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return "";
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, gl: "zm", hl: "en", num: 10 }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return "";
  const data = (await res.json()) as { organic?: { title: string; link: string; snippet: string; date?: string }[] };
  return (data.organic ?? [])
    .map((r, i) => `[Serper ${i + 1}] ${r.title}\nURL: ${r.link}\n${r.date ? "Date: " + r.date + "\n" : ""}${r.snippet}`)
    .join("\n---\n");
}

async function fetchEventbriteEvents(city: string, query: string): Promise<string> {
  const key = process.env.EVENTBRITE_API_KEY;
  if (!key) return "";
  const today = new Date().toISOString().split("T")[0];
  const locationParam = city && city.toLowerCase() !== "zambia"
    ? `${city}, Zambia`
    : "Lusaka, Zambia";
  const url = new URL("https://www.eventbriteapi.com/v3/events/search/");
  url.searchParams.set("q", query);
  url.searchParams.set("location.address", locationParam);
  url.searchParams.set("start_date.range_start", `${today}T00:00:00`);
  url.searchParams.set("expand", "venue");
  url.searchParams.set("page_size", "15");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return "";
  const data = (await res.json()) as {
    events?: {
      name: { text: string };
      description?: { text: string };
      url: string;
      start: { local: string };
      venue?: { name: string; address?: { city: string; country: string } };
      is_online_event: boolean;
    }[];
  };
  return (data.events ?? [])
    .map((e, i) => {
      const loc = e.is_online_event
        ? "Online"
        : [e.venue?.name, e.venue?.address?.city, e.venue?.address?.country].filter(Boolean).join(", ");
      return `[Eventbrite ${i + 1}] ${e.name.text}\nDate: ${e.start.local}\nLocation: ${loc}\nURL: ${e.url}\n${e.description?.text?.slice(0, 200) ?? ""}`;
    })
    .join("\n---\n");
}

async function fetchTavilyEvents(query: string): Promise<string> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return "";
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query,
      search_depth: "advanced",
      max_results: 10,
      include_domains: [
        "eventbrite.com", "meetup.com", "lusakatimes.com", "dailymail.co.zm",
        "times.co.zm", "znbc.co.zm", "zica.co.zm", "eiz.org.zm",
        "unza.zm", "cbu.ac.zm", "topfloor.co.zm", "africarena.com",
        "careersafrica.com", "linkedin.com",
      ],
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return "";
  const data = (await res.json()) as { results?: { title: string; url: string; content: string; published_date?: string }[] };
  return (data.results ?? [])
    .map((r, i) => `[Tavily ${i + 1}] ${r.title}\nURL: ${r.url}\n${r.published_date ? "Published: " + r.published_date + "\n" : ""}${r.content.slice(0, 300)}`)
    .join("\n---\n");
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.post("/ai/discover-companies", async (req, res) => {
  const parsed = DiscoverCompaniesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { locationText, latitude, longitude, degree, institution, yearOfStudy, skills, city, preferredIndustries, goals, documentsContext } = parsed.data;

  const profileLines = [
    institution && `Institution: ${institution}`,
    yearOfStudy && `Year of study: ${yearOfStudy}`,
    skills && `Key skills: ${skills}`,
    city && `Home city: ${city}`,
    preferredIndustries && `Preferred industries/sectors: ${preferredIndustries}`,
    goals && `Career goals: ${goals}`,
  ].filter(Boolean).join('\n');

  const docsSection = documentsContext
    ? `\nAdditional context from the student's uploaded documents (CV, certificates, etc.):\n${documentsContext}\n`
    : '';

  const coordsNote = latitude != null && longitude != null
    ? ` (GPS coordinates: ${latitude.toFixed(4)}, ${longitude.toFixed(4)})`
    : '';

  const isZambia = /zambia|lusaka|ndola|kitwe|livingstone|chipata|kabwe|chingola|mufulira|solwezi/i.test(locationText);

  const locationGuidance = isZambia
    ? `Focus on organisations actually operating in or near ${locationText}, Zambia. Include a diverse mix: private companies, NGOs/non-profits, government ministries/agencies, hospitals and health bodies, universities and research institutions, and reputable SMEs. Prioritise organisations with known WIL, graduate trainee, or internship programmes. Where relevant, mention alignment with Zambian professional bodies such as EIZ (Engineering Institution of Zambia), ZICA (Zambia Institute of Chartered Accountants), ICTAZ (ICT Association of Zambia), ZIPS (Zambia Institute of Purchasing and Supply), or LAZ (Law Association of Zambia).`
    : `Focus on organisations operating in or near ${locationText} that offer WIL placements, graduate programmes, or internships. Include a diverse mix: private companies, NGOs, government bodies, hospitals and health organisations, universities and research bodies. Mention any local professional bodies or accreditation relevant to the student's degree. Also include any well-known remote/online opportunities relevant to students in this region.`;

  const prompt = `You are a career advisor helping a student find Work-Integrated Learning (WIL) placement opportunities.

Student profile:
Degree: ${degree}
${profileLines}
Target location: ${locationText}${coordsNote}
${docsSection}
List 8 real organisations that are known to offer WIL placements, graduate programmes, or internships relevant to this student's degree and goals. Prioritise organisations that align with the student's preferred industries if provided. Cast a wide net — include companies, NGOs, government agencies, hospitals, universities, and any other type of organisation where a student could gain meaningful work experience. ${locationGuidance}

Return ONLY a valid JSON array with no markdown, no code fences, no explanation. Each object must have:
- name: string (organisation name)
- description: string (2–3 sentences: what the organisation does, why it suits this student's profile, and any WIL/graduate programme details)
- fitScore: string (one of: "Excellent Fit", "Strong Fit", "Good Fit")
- website: string | null (official website URL, or null if unknown)
- address: string | null (physical street address or area/suburb — be as specific as possible, or null if unknown)
- phone: string | null (main contact phone number including country code where known, or null)
- email: string | null (general contact or HR/recruitment email, or null if unknown)
- linkedin: string | null (LinkedIn company page URL, or null)
- facebook: string | null (Facebook page URL, or null)
- twitter: string | null (Twitter/X profile URL, or null)

Include as many contact fields as you know. It is better to include a field you are reasonably confident about than to leave it null.

Example format:
[{"name":"Zambeef Products Plc","description":"...","fitScore":"Excellent Fit","website":"https://www.zambeef.co.zm","address":"Plot 4736, Manda Hill, Lusaka","phone":"+260 211 374 000","email":"hr@zambeef.co.zm","linkedin":"https://www.linkedin.com/company/zambeef","facebook":"https://www.facebook.com/zambeef","twitter":null}]`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    const text = response.text ?? "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      req.log.error({ text }, "Gemini returned no JSON array for discover-companies");
      res.status(500).json({ error: "AI returned an unexpected format" });
      return;
    }
    const companies = JSON.parse(jsonMatch[0]);
    res.json(companies);
  } catch (err) {
    req.log.error({ err }, "discover-companies failed");
    res.status(500).json({ error: "Failed to discover companies" });
  }
});

router.post("/ai/draft-letter", async (req, res) => {
  const parsed = DraftLetterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { companyName, role, degree, goals, institution, yearOfStudy, skills, portfolioUrl, userDraft, letterType, studentName, studentPhone, studentEmail, studentCity, cvContent } = parsed.data;

  const profileLines = [
    institution && `Institution: ${institution}`,
    yearOfStudy && `Year of study: ${yearOfStudy}`,
    skills && `Key skills and strengths: ${skills}`,
    studentCity && `City: ${studentCity}`,
  ].filter(Boolean).join('\n');

  const portfolioLine = portfolioUrl
    ? `The student has a digital portfolio / GitHub at: ${portfolioUrl} — include a mention of this naturally in the letter.`
    : "";

  const draftLine = userDraft
    ? `The student has written an initial draft below. Polish it, keeping their voice, but improve structure, clarity, and professional tone:\n\n${userDraft}`
    : "Write a complete letter from scratch.";

  // Determine opportunity type label
  const opportunityLabel =
    letterType === 'attachment' ? 'industrial attachment' :
    letterType === 'internship' ? 'internship' :
    letterType === 'graduate' ? 'graduate programme' :
    'work-integrated learning (WIL) placement';

  const subjectLine = letterType === 'attachment'
    ? `RE: APPLICATION FOR INDUSTRIAL ATTACHMENT`
    : letterType === 'internship'
    ? `RE: APPLICATION FOR INTERNSHIP`
    : letterType === 'graduate'
    ? `RE: APPLICATION FOR GRADUATE PROGRAMME`
    : `RE: APPLICATION FOR WIL PLACEMENT`;

  // Student header block
  const today = new Date().toLocaleDateString('en-ZM', { day: 'numeric', month: 'long', year: 'numeric' });
  const studentHeader = [
    studentName || '',
    institution || '',
    studentCity || '',
    studentPhone || '',
    studentEmail || '',
    today,
  ].filter(Boolean).join('\n');

  const prompt = `You are a Zambian career counsellor helping a student write a professional ${opportunityLabel} application letter.

Student details:
${studentHeader}

Application details:
Company / Organisation: ${companyName}
Role / Department: ${role}
Degree: ${degree}
${profileLines}
Career goals: ${goals}
${portfolioLine}
${cvContent ? `\nStudent's CV / document content (use specific details from this to strengthen the letter — real experience, skills, and achievements):\n${cvContent}\n` : ''}
Generate a complete, properly formatted Zambian professional letter that looks like this structure:
1. Student's details (name, institution, city, phone, email) — one item per line at the top
2. Date (already provided above)
3. Blank line
4. "The Human Resource Manager" then company name on the next line then city on the next line
5. Blank line
6. "Dear Sir/Madam,"
7. Blank line
8. "${subjectLine}"
9. Blank line
10. Body paragraphs (3–4 paragraphs):
   - Opening: state purpose and the ${opportunityLabel} you are applying for, mention your degree and institution
   - Middle: describe your relevant skills, knowledge, and what makes you a good candidate; if skills are listed, weave the most relevant ones in naturally
   - If yearOfStudy is provided, mention your current year naturally
   - Closing: express enthusiasm, mention availability, invite them to contact you
11. Blank line
12. "Yours sincerely," or "Yours faithfully,"
13. Student name (in CAPS)

Zambian professional standards:
- Use British English spelling (e.g. "organisation", "programme", "favour", "endeavour")
- Keep the tone formal but warm and enthusiastic — not stiff
- Use "industrial attachment" (not just "internship") when this is an attachment letter
- Reference the specific degree naturally (e.g. "my degree in Electrical/Electronics Engineering")
- If the student mentioned TEVETA qualifications or certificates, include them
- Do not use bullet points or markdown in the letter body

${draftLine}

Return ONLY the letter text, formatted exactly as described. Do not add any explanation, JSON, or markdown. Start with the student's name at the very top.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    res.json({ letter: response.text ?? "" });
  } catch (err) {
    req.log.error({ err }, "draft-letter failed");
    res.status(500).json({ error: "Failed to draft letter" });
  }
});

router.post("/ai/research-company", async (req, res) => {
  const parsed = ResearchCompanyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { companyName } = parsed.data;

  const prompt = `You are a Zambian career advisor. Write a concise research summary about "${companyName}" specifically in the Zambian context.

Cover these sections (use plain text headings, no markdown symbols):

Overview
What the company does, its size, and its presence in Zambia.

Industry & Sector
The industry they operate in and any relevant Zambian regulatory bodies or sector bodies.

Culture & Values
Known workplace culture, values, and what they look for in candidates.

WIL / Graduate Programmes
Any known Work-Integrated Learning placements, graduate programmes, bursaries, or internships offered in Zambia.

Interview Tips
2–3 specific tips for someone interviewing at this company in Zambia.

Keep the summary practical and useful for a student applying for a WIL placement. Write in plain paragraphs — no bullet points, no markdown.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    res.json({ summary: response.text ?? "" });
  } catch (err) {
    req.log.error({ err }, "research-company failed");
    res.status(500).json({ error: "Failed to research company" });
  }
});

router.post("/ai/star-feedback", async (req, res) => {
  const parsed = StarFeedbackBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { question, situation, task, action, result } = parsed.data;

  const prompt = `You are an experienced Zambian interview coach evaluating a STAR-format interview answer.

Interview question: "${question}"

The candidate's answer:
Situation: ${situation}
Task: ${task}
Action: ${action}
Result: ${result}

Provide structured, honest feedback covering:
1. Overall impression (1–2 sentences)
2. What worked well (be specific)
3. What to improve (be specific and constructive)
4. A suggested stronger version of the Result, showing impact with numbers or concrete outcomes where possible
5. A score out of 10 with brief justification

Keep your tone encouraging but direct. This is for a Zambian student preparing for WIL placement interviews.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    res.json({ feedback: response.text ?? "" });
  } catch (err) {
    req.log.error({ err }, "star-feedback failed");
    res.status(500).json({ error: "Failed to get STAR feedback" });
  }
});

router.post("/ai/interview-questions", async (req, res) => {
  const parsed = InterviewQuestionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { companyName, role, degree, goals, institution, yearOfStudy, skills, researchSummary, cvContent: cvContentQ } = parsed.data;

  const profileLines = [
    institution && `Institution: ${institution}`,
    yearOfStudy && `Year of study: ${yearOfStudy}`,
    skills && `Key skills: ${skills}`,
  ].filter(Boolean).join('\n');

  const researchContext = researchSummary
    ? `Company research summary:\n${researchSummary}\n\n`
    : "";

  const prompt = `You are a Zambian interview coach preparing a student for a WIL placement interview.

Company: ${companyName}
Role: ${role}
Student profile:
Degree: ${degree}
${profileLines}
Goals: ${goals}
${cvContentQ ? `\nStudent's CV / document content (tailor experience and skill-based questions to probe what is actually on their CV):\n${cvContentQ}\n` : ''}${researchContext}
Generate 15 realistic interview questions this student is likely to face, split into three categories. Where skills are provided, include questions that specifically probe those skills in the experience category.

Return ONLY a valid JSON object with no markdown, no code fences. Format:
{
  "personal": ["question 1", "question 2", "question 3", "question 4", "question 5"],
  "company": ["question 1", "question 2", "question 3", "question 4", "question 5"],
  "experience": ["question 1", "question 2", "question 3", "question 4", "question 5"]
}

personal: questions about the student's background, motivation, strengths, weaknesses, and goals (include at least one about why they want a WIL placement specifically)
company: questions about their knowledge of ${companyName} and the Zambian industry context
experience: questions about their academic projects, teamwork, problem-solving, and relevant technical skills for the ${role} role`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    const text = response.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      req.log.error({ text }, "Gemini returned no JSON for interview-questions");
      res.status(500).json({ error: "AI returned an unexpected format" });
      return;
    }
    const questions = JSON.parse(jsonMatch[0]);
    res.json(questions);
  } catch (err) {
    req.log.error({ err }, "interview-questions failed");
    res.status(500).json({ error: "Failed to generate interview questions" });
  }
});

router.post("/ai/parse-profile-from-cv", async (req, res) => {
  const parsed = ParseProfileFromCvBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { cvContent } = parsed.data;

  const prompt = `You are a career data parser for a Zambian student app. Extract structured profile information from the CV text below.

Return ONLY a valid JSON object with no markdown, no code fences, no explanation. All values must be strings. Use "" for any field not found.

Required fields:
- displayName: full name of the person
- currentDegree: e.g. "BSc Computer Science", "BA Accounting", "Diploma in Nursing"
- institution: university or college name (e.g. "University of Zambia", "CBU", "Cavendish University")
- yearOfStudy: e.g. "3rd Year", "Final Year", "Graduate", "2nd Year"
- skills: comma-separated list of all technical and soft skills mentioned
- city: home city or location (e.g. "Lusaka", "Ndola", "Kitwe")
- preferredIndustries: industries mentioned or implied by the degree/experience (e.g. "Engineering, Mining, Construction")
- careerGoals: summary of career objective or goals if stated
- portfolioUrl: any GitHub, LinkedIn, portfolio, or personal website URL found
- profileFields: array of objects {"label": "...", "value": "..."} capturing ALL additional detail — one entry per job/internship/project/award/language/certification/course. Use descriptive labels like "Internship at Zambia National Commercial Bank", "Academic Project: Water Pump Design", "Languages", "Awards", "EIZ Membership".

CV TEXT:
${cvContent}

Return the JSON object now:`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    const text = response.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      req.log.error({ text }, "parse-profile-from-cv: no JSON returned");
      res.json({ displayName: "", currentDegree: "", institution: "", yearOfStudy: "", skills: "", city: "", preferredIndustries: "", careerGoals: "", portfolioUrl: "", profileFields: [] });
      return;
    }
    res.json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    req.log.error({ err }, "parse-profile-from-cv failed");
    res.status(500).json({ error: "Failed to parse CV" });
  }
});

router.post("/ai/profile-chat", async (req, res) => {
  const parsed = ProfileChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { messages, existingProfile, cvContent } = parsed.data;

  // Build a context block from whatever the user already filled in
  const knownFields: string[] = [];
  if (existingProfile) {
    if (existingProfile.displayName) knownFields.push(`Full Name: ${existingProfile.displayName}`);
    if (existingProfile.currentDegree) knownFields.push(`Degree: ${existingProfile.currentDegree}`);
    if (existingProfile.institution) knownFields.push(`Institution: ${existingProfile.institution}`);
    if (existingProfile.yearOfStudy) knownFields.push(`Year of Study: ${existingProfile.yearOfStudy}`);
    if (existingProfile.skills) knownFields.push(`Skills: ${existingProfile.skills}`);
    if (existingProfile.city) knownFields.push(`City: ${existingProfile.city}`);
    if (existingProfile.preferredIndustries) knownFields.push(`Preferred Industries: ${existingProfile.preferredIndustries}`);
    if (existingProfile.careerGoals) knownFields.push(`Career Goals: ${existingProfile.careerGoals}`);
    if (existingProfile.portfolioUrl) knownFields.push(`Portfolio / GitHub: ${existingProfile.portfolioUrl}`);
    if (existingProfile.profileFields) {
      for (const pf of existingProfile.profileFields) {
        if (pf.label && pf.value) knownFields.push(`${pf.label}: ${pf.value}`);
      }
    }
  }

  const existingContext = knownFields.length > 0
    ? `\nEXISTING PROFILE DATA (already known — do NOT ask about these again unless you want to confirm or go deeper):\n${knownFields.join("\n")}\n`
    : "";

  const cvSection = cvContent
    ? `\nCV / RESUME DOCUMENT (the student has uploaded this — treat everything in it as already known. Do NOT ask about name, degree, institution, skills, experience, or any other detail visible in the CV. Acknowledge you've read it and only ask about things that are genuinely missing or that you want to explore more deeply):\n${cvContent.slice(0, 3000)}\n`
    : "";

  const isNewConversation = messages.length === 0;

  const openingHint = cvContent
    ? ` The student has uploaded their CV — you already have a lot of information about them. Greet them warmly, briefly mention what you've seen in their CV (name, degree, key experience), and ask ONE focused question about something important that is missing or that you want to explore more deeply (e.g. career goals, preferred industries, or a specific experience). Do NOT ask for their name — you can see it.`
    : knownFields.length > 0
    ? ` You already know some things about this person from their existing profile — greet them by name if you know it, acknowledge what you already know, and ask about the most important missing information first.`
    : ` Warmly introduce yourself and ask for their full name to get started.`;

  const systemPrompt = `You are Career Compass AI, a warm, curious, and encouraging career assistant. Your job is to have a natural conversation and learn as much as possible about the person — their background, qualifications, experience, skills, and goals — so you can help them find the best internship, attachment, and work placement opportunities in Zambia.

Be genuinely curious. Don't stick to a rigid script. Based on what the person shares, ask thoughtful follow-up questions. The goal is to build a rich, personalised profile that captures who they really are.
${existingContext}${cvSection}
Topics to explore naturally (not as a checklist — weave them into genuine conversation):
- Their full name
- Whether they're a student, working professional, recent graduate, or something else
- Their current degree or highest qualification and field of study
- Their university, college, or training institution (e.g. UNZA, CBU, Mulungushi, Cavendish, Northrise, Evelyn Hone College)
- Their current year of study (if applicable)
- Any previous qualifications, diplomas, certificates, or short courses (including TEVETA qualifications)
- Work experience, internships, attachments, or volunteer work (encourage details)
- Technical skills — software, tools, programming languages, equipment, systems
- Soft skills and personal strengths — leadership, teamwork, communication, etc.
- Languages they speak (very relevant in Zambia's multilingual context — English, Nyanja, Bemba, Tonga, Lozi, and more)
- Extracurricular activities, clubs, societies, or community involvement
- Academic projects or research they're proud of
- Awards, bursaries, achievements, or recognition they've received
- Industry sectors and company types they're most interested in
- Career goals — what kind of internship, attachment, or job they're looking for and why
- Their location / home city (e.g. Lusaka, Ndola, Kitwe, Livingstone, Chipata)
- Online presence — GitHub, LinkedIn, portfolio, or personal website URL

Rules:
- Ask ONE question at a time
- Never number questions or show a list of topics
- Be warm, specific, and encouraging in your questions
- If someone gives a short answer, follow up to get more detail
- Use Zambian context naturally (industrial attachments, TEVETA qualifications, EIZ, ZICA, ICTAZ, ZIPS, LAZ, specific Zambian universities and colleges, industries, etc.)
- Accept all forms of natural language and interpret correctly (e.g. "second year computer science at UNZA" → Year of Study: 2nd Year, Degree: BSc Computer Science, Institution: University of Zambia)
- If you already know a piece of information from the existing profile, acknowledge it naturally and skip asking for it
- Continue the conversation until you have a good, well-rounded picture of the person

When you feel you have gathered enough information (typically after 18–26 exchanges. Do NOT wrap up early — always ask follow-up questions that dig deeper into what the student shares. If they mention a skill, ask about a project where they used it. If they mention an industry, ask what draws them to it. If they mention any experience, ask about their proudest moment in it. Build a rich, layered picture, not a shallow checklist), write a warm, personalised closing message that summarises a key strength or insight about the person. Then, on its OWN LINE at the very end of your response, output exactly:
PROFILE_COMPLETE:{"displayName":"...","currentDegree":"...","institution":"...","yearOfStudy":"...","skills":"...","city":"...","preferredIndustries":"...","careerGoals":"...","portfolioUrl":"...","profileFields":[{"label":"...","value":"..."},...]}

The profileFields array must contain ALL information collected — from the conversation AND from the existing profile data. Be thorough — include every detail. Use clear, readable labels. Examples of good labels:
"Full Name", "City", "Current Degree", "Institution", "Year of Study", "Previous Qualification", "Work Experience", "Internship at [Company]", "Technical Skills", "Soft Skills", "Languages", "Extracurriculars", "Academic Project", "Awards & Achievements", "Career Goals", "Preferred Industries", "Portfolio / GitHub", "LinkedIn", "Certifications"

If a person held multiple jobs or internships, create one profileField entry per position with a descriptive label like "Internship at Deloitte" or "Part-time Work: Retail".

Make sure:
- The JSON is valid with double quotes throughout
- All values are strings (never null or arrays in the JSON)
- displayName, currentDegree, institution, yearOfStudy, skills, city, preferredIndustries, careerGoals, portfolioUrl are always included (use "" if not provided)
- profileFields captures everything — it is the complete profile record

AFTER EVERY SINGLE RESPONSE (including partial ones before the conversation is complete), also output on a SEPARATE LINE:
PARTIAL_PROFILE:{"displayName":"...","currentDegree":"...","institution":"...","yearOfStudy":"...","skills":"...","city":"...","preferredIndustries":"...","careerGoals":"...","portfolioUrl":"...","profileFields":[{"label":"...","value":"..."},...]}

This must appear after every response — it is a live snapshot of everything collected so far (merge in the existing profile data too). Use "" for fields not yet gathered. Keep the JSON on ONE LINE.`;

  const conversationLines: string[] = [];
  for (const msg of messages) {
    if (msg.role === "assistant") {
      conversationLines.push(`Career Compass AI: ${msg.content}`);
    } else {
      conversationLines.push(`Student: ${msg.content}`);
    }
  }

  const openingInstruction = isNewConversation
    ? `This is the START of the conversation. Generate your opening greeting message now.${openingHint}`
    : `Continue as Career Compass AI (write only your next response, nothing else):`;

  const prompt = isNewConversation
    ? `${systemPrompt}\n\n${openingInstruction}`
    : `${systemPrompt}\n\nCONVERSATION SO FAR:\n${conversationLines.join("\n")}\n\nContinue as Career Compass AI (write only your next response, nothing else):`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    let text = response.text ?? "";

    // Extract PARTIAL_PROFILE (present in every response)
    let partialProfile: Record<string, unknown> | null = null;
    const partialMarker = "PARTIAL_PROFILE:";
    const partialIdx = text.indexOf(partialMarker);
    if (partialIdx !== -1) {
      const partialJsonStr = text.slice(partialIdx + partialMarker.length).split("\n")[0].trim();
      try {
        partialProfile = JSON.parse(partialJsonStr);
      } catch {
        req.log.warn({ partialJsonStr }, "Failed to parse PARTIAL_PROFILE JSON");
      }
      // Strip the PARTIAL_PROFILE line from the visible text
      text = text.slice(0, partialIdx).trim();
    }

    // Check for PROFILE_COMPLETE
    const marker = "PROFILE_COMPLETE:";
    const markerIndex = text.indexOf(marker);
    if (markerIndex !== -1) {
      const reply = text.slice(0, markerIndex).trim();
      const jsonStr = text.slice(markerIndex + marker.length).split("\n")[0].trim();
      try {
        const profileData = JSON.parse(jsonStr);
        res.json({ reply, isComplete: true, profileData, partialProfile: profileData });
        return;
      } catch {
        req.log.warn({ jsonStr }, "Failed to parse PROFILE_COMPLETE JSON");
      }
    }

    res.json({ reply: text, isComplete: false, partialProfile });
  } catch (err) {
    req.log.error({ err }, "profile-chat failed");
    res.status(500).json({ error: "Failed to get AI response" });
  }
});

// ─── NETWORKING EVENTS ────────────────────────────────────────────────────────
// Data sources (in priority order):
//   1. Eventbrite API     — real structured SA event listings
//   2. Serper.dev         — live Google Search results for SA events
//   3. Tavily             — AI-powered deep search across SA-specific domains
//   4. Gemini grounding   — fallback; Gemini searches the web via Google Search
// All external calls run in parallel. Failures are silent — Gemini grounding
// handles the load if the other sources are unavailable.
// ─────────────────────────────────────────────────────────────────────────────

router.post("/ai/networking-events", async (req, res) => {
  const parsed = FindNetworkingEventsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { city, degree, preferredIndustries, goals } = parsed.data;
  const today = new Date().toISOString().split("T")[0];

  const profileContext = [
    degree && `Field of study / degree: ${degree}`,
    preferredIndustries && `Industries of interest: ${preferredIndustries}`,
    goals && `Career goals: ${goals}`,
  ].filter(Boolean).join("\n");

  const locationContext = city && city.toLowerCase() !== "zambia"
    ? `Primary location: ${city}, Zambia. Also include events elsewhere in Zambia and relevant African or international events the student could attend or join online.`
    : `Primary location: Zambia (Lusaka, Ndola, Kitwe, Livingstone, Chipata, Kabwe, Kasama, Solwezi, and other cities). Also include relevant international events accessible online.`;

  const searchQuery = [
    "career networking events",
    city && city.toLowerCase() !== "zambia" ? city : "Zambia",
    degree ? degree.split(" ").slice(-2).join(" ") : "",
    "2025 2026",
  ].filter(Boolean).join(" ");

  // Fetch from all external APIs in parallel — failures are silently ignored
  const [serperResult, eventbriteResult, tavilyResult] = await Promise.allSettled([
    fetchSerperEvents(searchQuery),
    fetchEventbriteEvents(city ?? "", "career networking professional development"),
    fetchTavilyEvents(`career networking events Zambia ${city ?? ""} 2025 2026`),
  ]);

  const serperData = serperResult.status === "fulfilled" ? serperResult.value : "";
  const eventbriteData = eventbriteResult.status === "fulfilled" ? eventbriteResult.value : "";
  const tavilyData = tavilyResult.status === "fulfilled" ? tavilyResult.value : "";

  const externalContext = [
    eventbriteData && `=== EVENTBRITE LISTINGS ===\n${eventbriteData}`,
    serperData && `=== GOOGLE SEARCH RESULTS (Serper) ===\n${serperData}`,
    tavilyData && `=== WEB SEARCH RESULTS (Tavily) ===\n${tavilyData}`,
  ].filter(Boolean).join("\n\n");

  const eventTypes = [
    "career-expo (Career Expos & Job Fairs)",
    "conference (Conferences & Summits)",
    "workshop (Workshops & Short Courses)",
    "meetup (Networking Meetups & Socials)",
    "trade-fair (Trade Fairs & Business Exhibitions)",
    "seminar (Seminars & Talks)",
    "hackathon (Hackathons & Innovation Competitions)",
    "alumni (Alumni Events & Reunions)",
    "webinar (Webinars & Virtual Events)",
    "panel (Panel Discussions & Industry Forums)",
    "open-day (Open Days & Company Site Visits)",
    "pitch (Pitch Competitions & Startup Demo Days)",
    "mentorship (Mentorship Sessions & Coaching)",
    "association (Professional & Industry Association Events)",
    "community (Community, CSR & Volunteer Events)",
    "awards (Awards Ceremonies & Gala Dinners)",
    "training (Professional Training & Certification Programmes)",
    "sport (Sports & Social Networking Events)",
    "cultural (Cultural, Arts & Social Events)",
    "other (Any opportunity not listed above)",
  ].join("\n");

  const prompt = `Today is ${today}. You are a career opportunities assistant helping a Zambian student find REAL, upcoming networking and professional development opportunities.

Student profile:
${profileContext || "General student seeking WIL placement or graduate opportunities in Zambia"}
${locationContext}
${externalContext ? `\nREAL EVENT DATA FROM LIVE SEARCHES (use this as your primary source — prefer these over your training data):\n${externalContext}\n` : ""}
IMPORTANT INSTRUCTIONS:
- Use the real event data above as your PRIMARY source. Fill in any missing details from your knowledge.
- If no real data was provided above, search the internet NOW for real events and opportunities.
- Prioritise Zambia (Lusaka, Ndola, Kitwe, Livingstone, Chipata, Kabwe, Kasama, Solwezi, etc.) but include any African or international events that are valuable.
- Cast a WIDE net — do not limit results to only what matches the student's exact degree.
- Search across: Facebook Events Zambia, LinkedIn Events, Eventbrite, Meetup.com, Lusaka Times (lusakatimes.com), Daily Mail Zambia (dailymail.co.zm), Times of Zambia (times.co.zm), ZNBC (znbc.co.zm), ZICA (zica.co.zm), EIZ (eiz.org.zm), ICTAZ, university career portals (UNZA, CBU, Mulungushi University, Cavendish University, Northrise University, Evelyn Hone College), TopFloor (topfloor.co.zm), AfricArena, AfricaCom, company career pages, and any other relevant Zambian or African platform.
- Include opportunities the student may not have thought to look for: hackathons, alumni events, webinars, startup pitch competitions, professional association meetings, mentorship programmes, open days, awards dinners, trade fairs, volunteer/community events, training courses, bursary info sessions, and more.
- For online/virtual events, mark isOnline as true.

Return ONLY a valid JSON array (no markdown, no code fences, no explanation). Each object must have exactly these fields:
- id: unique lowercase slug string derived from title
- title: exact official name of the event/opportunity
- eventType: one of the following strings only — ${eventTypes.split("\n").map(t => '"' + t.split(" ")[0] + '"').join(", ")}
- organizer: name of the hosting organisation, company, or institution
- dateLabel: human-readable date (e.g. "Sat, 17 May 2025" or "15–17 May 2025" or "Ongoing" for programmes)
- dateIso: ISO 8601 string (e.g. "2025-05-17T09:00:00") or "" if unknown
- location: full venue + city (e.g. "Mulungushi Conference Centre, Lusaka" or "Online / Zoom")
- description: 1–2 sentences explaining what it is and why it matters for the student
- url: a direct, working URL to the event page or registration (must be a real URL, not a homepage)
- source: platform where you found it (e.g. "Eventbrite", "Serper", "Lusaka Times", "LinkedIn")
- tags: array of 3–5 keyword strings relevant to Zambia and the event (e.g. ["technology", "networking", "Lusaka", "startups"])
- isOnline: true if virtual, false if in-person

Only include events happening AFTER today (${today}). Return 8–15 diverse results. If local events are limited, supplement with high-value African or international online events. Return [] only if absolutely nothing real is found.`;

  try {
    const useGrounding = !externalContext;
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      ...(useGrounding && { config: { tools: [{ googleSearch: {} }] } }),
    });
    const text = response.text ?? "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      req.log.warn({ text: text.slice(0, 300) }, "networking-events: no JSON array in response");
      res.json([]);
      return;
    }
    const events = JSON.parse(jsonMatch[0]);
    res.json(Array.isArray(events) ? events : []);
  } catch (err) {
    req.log.error({ err }, "networking-events failed");
    res.status(500).json({ error: "Failed to load networking events" });
  }
});

// ─── INTERVIEW VERDICT ────────────────────────────────────────────────────────

router.post("/ai/interview-verdict", async (req, res) => {
  const parsed = InterviewVerdictBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const {
    companyName, role, degree, goals, institution, yearOfStudy,
    skills, city, questions, answers, researchSummary, cvContent: cvContentV,
  } = parsed.data;

  const profileLines = [
    institution && `Institution: ${institution}`,
    yearOfStudy && `Year of study: ${yearOfStudy}`,
    skills && `Key skills: ${skills}`,
    city && `City: ${city}`,
  ].filter(Boolean).join("\n");

  const qaTranscript = questions
    .map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${answers[i] ?? "(no answer provided)"}`)
    .join("\n\n");

  const contextSection = researchSummary
    ? `\nCompany context (from prior research):\n${researchSummary.slice(0, 800)}\n`
    : "";

  const prompt = `You are a senior HR/recruitment panel at ${companyName} evaluating a mock WIL/internship interview.

Company: ${companyName}
Role applied for: ${role}

Student profile:
Degree: ${degree}
${profileLines}
Career goals: ${goals}
${cvContentV ? `Student's CV / document content (use this to assess whether answers align with claimed experience and qualifications):\n${cvContentV}\n` : ''}${contextSection}
Interview transcript:
${qaTranscript}

Evaluate this interview STRICTLY and HONESTLY — this feedback is meant to genuinely prepare the student for real interviews. Do not soften criticism. Do not give unearned praise.

Assess across:
1. Relevance and depth of answers to the specific role
2. Communication clarity and structure
3. Knowledge of their field and awareness of the Zambian industry context
4. Career clarity, enthusiasm, and motivation
5. Overall fit for a WIL/internship/graduate programme at ${companyName}

Return ONLY valid JSON (no markdown, no code fences, no explanation):
{
  "verdict": "accepted" | "shortlisted" | "rejected",
  "overallScore": <integer 1–10>,
  "overallFeedback": "<2–3 honest sentences on overall performance>",
  "strengths": ["<specific strength observed>", ...],
  "areasToImprove": ["<specific, actionable area to improve>", ...],
  "answerFeedback": [
    {
      "question": "<the question text>",
      "answer": "<the student's answer>",
      "feedback": "<honest 1–2 sentence feedback on this answer>",
      "score": <integer 1–10>
    }
  ],
  "recommendation": "<A personal, specific, actionable recommendation for this student to improve their real interview chances>"
}

Scoring thresholds: "accepted" = overall score 8–10, "shortlisted" = 6–7, "rejected" = 1–5.
Be realistic — most first attempts result in "shortlisted" or "rejected". Only "accepted" if answers were genuinely impressive.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    const text = response.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      req.log.error({ text: text.slice(0, 300) }, "interview-verdict: no JSON in response");
      res.status(500).json({ error: "AI returned an unexpected format" });
      return;
    }
    const result = JSON.parse(jsonMatch[0]);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "interview-verdict failed");
    res.status(500).json({ error: "Failed to evaluate interview" });
  }
});

export default router;

import { GoogleGenAI } from "@google/genai";

const directKey = process.env.GEMINI_API_KEY;
const replitBaseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
const replitApiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

if (!directKey && !replitBaseUrl) {
  throw new Error(
    "Either GEMINI_API_KEY or AI_INTEGRATIONS_GEMINI_BASE_URL must be set.",
  );
}

export const ai = directKey
  ? new GoogleGenAI({ apiKey: directKey })
  : new GoogleGenAI({
      apiKey: replitApiKey!,
      httpOptions: {
        apiVersion: "",
        baseUrl: replitBaseUrl!,
      },
    });

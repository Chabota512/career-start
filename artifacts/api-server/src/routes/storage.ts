import { Router, type IRouter, type Request, type Response } from "express";
import { ai } from "@workspace/integrations-gemini-ai";

const router: IRouter = Router();

const GEMINI_SUPPORTED_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/html",
  "text/csv",
  "text/xml",
  "text/rtf",
  "text/markdown",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/heic",
  "image/heif",
]);

/**
 * POST /storage/extract-content
 *
 * Accept base64-encoded file content and use Gemini to extract career-relevant
 * text from it. Files are stored locally on the device; the server only needs
 * the content for AI extraction.
 */
router.post("/storage/extract-content", async (req: Request, res: Response) => {
  const { fileContent, contentType, category } = req.body ?? {};
  if (
    !fileContent || typeof fileContent !== "string" ||
    !contentType || typeof contentType !== "string" ||
    !category || typeof category !== "string"
  ) {
    res.status(400).json({ error: "fileContent, contentType, and category are required" });
    return;
  }
  const normalizedType = contentType.toLowerCase().split(";")[0].trim();

  if (!GEMINI_SUPPORTED_TYPES.has(normalizedType)) {
    res.json({
      extractedText: `[This file type (${contentType}) cannot be automatically read in-app. The document has been saved to your library.]`,
    });
    return;
  }

  const estimatedSizeMB = (fileContent.length * 0.75) / (1024 * 1024);
  if (estimatedSizeMB > 7.5) {
    res.json({ extractedText: "[File too large to extract automatically — max 7.5 MB supported.]" });
    return;
  }

  try {
    const prompt = `You are helping a career guidance app for Zambian students. This is a ${category} document. Extract ALL career-relevant information.

Return a structured plain-text summary including every detail that would help personalise job matching, letter drafting, or interview preparation:
- Full name and contact details (if present)
- Educational qualifications: degrees, institutions, years attended, grades/GPA, key courses
- Work experience, internships, WIL placements: company, role, dates, responsibilities, achievements
- Technical skills, software, tools, programming languages
- Soft skills and competencies
- Certifications and professional memberships (EIZ, ZICA, ICTAZ, LAZ, etc.)
- Awards, achievements, extracurricular activities, leadership roles
- Career objective or personal statement
- Portfolio links, GitHub, LinkedIn (if present)
- Any other detail useful for job applications, letter writing, or interview preparation

Format as clear plain text with section headings. Only include what is actually in the document. Be thorough and factual.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: normalizedType, data: fileContent } },
            { text: prompt },
          ],
        },
      ],
    });

    res.json({ extractedText: response.text ?? "" });
  } catch (err) {
    req.log.error({ err }, "extract-content failed");
    res.json({
      extractedText:
        "[Could not automatically read this document. You can still view it in the document viewer.]",
    });
  }
});

export default router;

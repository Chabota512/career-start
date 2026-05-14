import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
  ExtractDocumentContentBody,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";
import { ai } from "@workspace/integrations-gemini-ai";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const GEMINI_SUPPORTED_TYPES = new Set([
  'application/pdf',
  'text/plain', 'text/html', 'text/csv', 'text/xml', 'text/rtf', 'text/markdown',
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
  'image/bmp', 'image/heic', 'image/heif',
]);

/**
 * POST /storage/extract-content
 *
 * Download a stored file and use Gemini to extract career-relevant text from it.
 */
router.post("/storage/extract-content", async (req: Request, res: Response) => {
  const parsed = ExtractDocumentContentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { objectPath, contentType, category } = parsed.data;
  const normalizedType = contentType.toLowerCase().split(";")[0].trim();

  if (!GEMINI_SUPPORTED_TYPES.has(normalizedType)) {
    res.json({
      extractedText: `[This file type (${contentType}) cannot be automatically read in-app. The document has been saved to your library.]`,
    });
    return;
  }

  try {
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const [buffer] = await objectFile.download();

    const fileSizeMB = buffer.length / (1024 * 1024);
    if (fileSizeMB > 7.5) {
      res.json({ extractedText: "[File too large to extract automatically — max 7.5 MB supported.]" });
      return;
    }

    const base64Data = buffer.toString("base64");

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
            { inlineData: { mimeType: normalizedType, data: base64Data } },
            { text: prompt },
          ],
        },
      ],
    });

    res.json({ extractedText: response.text ?? "" });
  } catch (err) {
    req.log.error({ err }, "extract-content failed");
    res.json({
      extractedText: "[Could not automatically read this document. You can still view it in the document viewer.]",
    });
  }
});

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 */
router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    // --- Protected route example (uncomment when using replit-auth) ---
    // if (!req.isAuthenticated()) {
    //   res.status(401).json({ error: "Unauthorized" });
    //   return;
    // }
    // const canAccess = await objectStorageService.canAccessObjectEntity({
    //   userId: req.user.id,
    //   objectFile,
    //   requestedPermission: ObjectPermission.READ,
    // });
    // if (!canAccess) {
    //   res.status(403).json({ error: "Forbidden" });
    //   return;
    // }

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;

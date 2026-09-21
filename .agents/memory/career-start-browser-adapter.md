---
name: Career Start browser adapter
description: Product-level decision for the browser version of Career Start.
---

The browser version should keep the core interview-practice flow usable without requiring Supabase credentials or a remote AI service. Browser storage is the default persistence layer, with deterministic local preparation, question generation, and coaching fallback until a server-backed sync path is intentionally added.

**Why:** The source project was a desktop prototype with optional Supabase and local API assumptions; requiring those services would make the web preview unusable for first-time users.

**How to apply:** Preserve local-first behavior when extending the practice flow. Add account sync or server-backed AI as an additive enhancement rather than making the core browser experience fail when those services are unavailable.
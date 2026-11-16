# Cognify OpenParser OCR

The course document flow sends PDF, JPG/JPEG, and PNG bytes directly from Cognify's server to OpenParser. It uses `POST /extract/async` for one file and `POST /extract/batch` for multiple files, with OCR model `paddleocr-vl-1.6`, a configurable extraction LLM, category-specific schemas, and field grounding. Textbooks/class notes, past questions, and syllabuses have distinct schemas. Extract processes the file through OCR and returns both the parsed document and structured fields. The complete provider response is retained. OpenParser bills extraction LLM usage separately from OCR pages; see its [document extraction API](https://www.openparser.dev/document-extraction-api) and [API overview](https://www.openparser.dev/api).

## Configuration and local run

Copy `.env.example` to `.env.local`. Set `OPENPARSER_API_KEY`; `OPENPARSER_BASE_URL` defaults to `https://api.openparser.dev`. MongoDB URI/database and Cognify auth settings are also required. The API key is read only in server code and the worker.

`npm run dev` starts both Next.js and the MongoDB/OpenParser polling worker. In production, run the Next.js application and `npm run worker:materials` as separate long-running processes.

The worker polls `GET /jobs/{id}` and saves each child result against its `client_item_id`. The browser never calls OpenParser. Retrying an ambiguous submission with the same selected files and request key reuses the same OpenParser idempotency key. For failed files, students can reselect only those original files in order; Cognify verifies their hashes and retries those document records while preserving successful results.

Default limits are eight files, 10 MiB per file, and 50 MiB combined. OpenParser documents PDF, PNG, and JPEG support, a 50 MiB per-file cap, and batches up to 100 files; Cognify stays below those provider limits. Uploads are signature-checked server-side. The original binary is not retained by Cognify after the request; the file hash, name, MIME type, order and size are retained for audit and idempotency.

## MongoDB records

- `uploadSessions`: authenticated student/course/topic IDs, category, progress/status, stable idempotency key, provider job ID and timestamps.
- `uploadedDocuments`: one record per original file, ordered by `fileIndex`, including content hash, stable `openParserClientItemId`, provider document ID, status and safe errors.
- `ocrDocumentResults`: one upserted result per uploaded document with provider/model/output format, the complete provider Extract response as nested BSON JSON, the structured `output`, and text/Markdown projections from `parsed_document`.
- `ocrPages`: page-level BSON payloads only when the full parse response is too large for MongoDB's 16 MiB document limit. Oversized complete responses are stored as UTF-8 JSON in MongoDB GridFS with a pointer on the result; nothing is silently truncated.

The student view renders textbook sections, question papers and parts, and syllabus hierarchies in separate layouts. Markdown tables and code are formatted; inline and display LaTeX is rendered with KaTeX. Full OCR transcription remains available alongside the categorized extraction. The complete raw provider JSON key/value table is returned only in development mode. Production retrieval omits raw JSON while preserving the canonical MongoDB result and structured extraction. All result endpoints verify the signed-in student's ownership. This stage displays source material only; it does not produce answers or teaching explanations.

## Automated and real integration checks

Run `npm test` for mocked OpenParser client checks, then `npx tsc --noEmit --incremental false` and `node --check scripts/material-worker.mjs`.

To run the real integration harness, configure `.env` or `.env.local` with MongoDB and an OpenParser API key, then run `node scripts/test-openparser-live.mjs`. It starts the Next app and worker, uploads the supplied `NUMBER BASES 2.pdf`, verifies the live job and MongoDB result, and removes temporary test records afterward. OCR wording varies by source scan/model; do not use a hardcoded expected transcript. The separate client tests mock fetch and do not claim a live OCR result.

The legacy course-documents route still uses its pre-existing Cloudinary flow; this separate OpenParser upload path does not require Cloudinary.

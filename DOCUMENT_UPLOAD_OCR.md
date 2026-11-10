# Cognify private documents and PaddleOCR

## Architecture

- Authenticated course document APIs verify the signed-in user's course ownership.
- Original PDFs and images are stored as authenticated Cloudinary assets. The application issues short-lived signed URLs only after checking ownership.
- MongoDB stores document metadata, OCR pages, past-question records, and persistent processing jobs. A unique document/file/page key makes page writes retry-safe.
- A separate Node worker claims queued or expired jobs, sends images or rendered PDF pages to the private FastAPI PaddleOCR service, and persists results and progress.
- OCR output is reviewable in the course document viewer. Corrections are saved separately so the original extraction remains available.

## Configure and run

1. Copy `.env.example` to `.env.local`. Fill in MongoDB, Cloudinary, and `OCR_SERVICE_URL`. Generate separate random secrets for `AUTH_SECRET` and `OCR_API_TOKEN` (for example, with `openssl rand -base64 48`). The API token must match in the app worker and OCR service environments. Keep these values server-side.
2. Install a PaddlePaddle CPU or CUDA build compatible with the host, then install the Python packages in `services/ocr/requirements.txt`. From `services/ocr`, run `uvicorn app:app --host "$OCR_API_HOST" --port "$OCR_API_PORT"`. Keep the service on a private network. `/health` is public; `/v1/ocr` and `/v1/pdf/page` require the bearer token.
3. Run `npm run dev` for the app and `npm run worker:ocr` in a separate process. The worker polls MongoDB continuously. Use Node 20.6 or later for the `--env-file` option.
4. In Cognify, create or open a course, choose **Manage documents**, and upload PDF/JPG/PNG/WEBP material. Defaults are 20 MiB per file, 10 files per upload, and 200 PDF pages; configure limits in `.env.local` for deployment.

## PaddleOCR behavior and limits

The service extracts printed text, line confidence, and bounding boxes where PaddleOCR returns them. PDF pages are rendered at 2x scale and processed in source order. Past-question parsing is heuristic: it records detected question numbers/options and source page references, but does not invent answer keys. Users should review OCR output; handwriting, formulas, tables, and diagrams are not guaranteed. The formula model setting is reserved but no formula model is configured by this endpoint.

PaddleOCR model downloads may occur at first start. For controlled or offline deployments, configure a compatible local model path and review its license. The exact model output and deployment credentials were not available here, so a real Cloudinary/MongoDB/PaddleOCR end-to-end run remains to be done in the configured environment.

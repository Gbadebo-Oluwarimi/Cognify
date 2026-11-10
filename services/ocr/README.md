# Cognify PaddleOCR service

This private FastAPI process handles one image page or one PDF page at a time. It has no MongoDB or Cloudinary connection; Cognify's persistent Node worker owns file access, job state, and result storage.

## Run

Use Python 3.10–3.12 in a virtual environment. Install the PaddlePaddle CPU/CUDA build that matches the host, then install `requirements.txt`. PaddleOCR may download model weights on first use. For controlled or offline deployments, configure compatible local model weights and check their licenses.

Set `OCR_API_TOKEN` to the same server-only value configured for the Cognify worker. Then, from this directory, run:

```sh
uvicorn app:app --host "${OCR_API_HOST:-127.0.0.1}" --port "${OCR_API_PORT:-8001}"
```

`GET /health` is a public health check. `POST /v1/ocr` accepts a multipart `file` image (JPEG, PNG, or WEBP); `POST /v1/pdf/page` accepts a multipart PDF `file` and one-based `page_number`. Both processing routes require `Authorization: Bearer <OCR_API_TOKEN>`. Keep the service on a private network and use TLS if traffic leaves the host.

The service returns extracted text, per-line confidence and boxes when provided by PaddleOCR, raw engine output, and a review warning. PDF pages are rendered with PyMuPDF. Layout, tables, handwriting, formula extraction, and diagram understanding are not configured or guaranteed. Validate response behavior against the selected PaddleOCR build and model before production rollout.

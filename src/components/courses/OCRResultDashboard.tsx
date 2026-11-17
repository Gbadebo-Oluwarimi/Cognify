"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, Braces, CheckCircle2, CircleAlert, FileText, Layers3, ListTree, ScanText } from "lucide-react";
import { MathMarkdown, OCRStructuredContent } from "@/components/courses/OCRStructuredContent";

type Result = { status: string; extractedText: string | null; markdown: string | null; extractedData: unknown; pageCount: number; pages: any[]; rawResponse?: unknown };
type Document = { id: string; filename: string; fileIndex: number; mimeType: string; fileSize: number; status: string; errorMessage: string | null; result: Result | null };
type Detail = { session: { id: string; title: string; category: string; status: string; progress: number; createdAt: string; completedAt: string | null; errorMessage: string | null; openParserJobId: string | null }; course: { id: string; name: string }; topic: { id: string; name: string }; documents: Document[] };
type Tab = "structured" | "transcription" | "pages" | "raw";

const label = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/^\w/, char => char.toUpperCase());
const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const asList = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

function flattenRows(value: unknown, path = "", rows: Array<{ path: string; value: string }> = []) {
  if (Array.isArray(value)) value.forEach((item, index) => flattenRows(item, `${path}[${index}]`, rows));
  else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => flattenRows(item, path ? `${path}.${key}` : key, rows));
  else rows.push({ path, value: value === null ? "null" : String(value) });
  return rows;
}

function countReviewItems(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((count, item) => count + countReviewItems(item), 0);
  if (!value || typeof value !== "object") return 0;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.reduce((count, [key, item]) => count + (key === "needsReview" && item === true ? 1 : key === "reviewItems" && Array.isArray(item) ? item.length : countReviewItems(item)), 0);
}

function contentCount(category: string, data: unknown): number {
  const value = asRecord(data);
  if (category === "PAST_QUESTION") return asList(value.questions).length;
  if (category === "SYLLABUS") return asList(value.papers).reduce<number>((total, paperValue) => total + asList(asRecord(paperValue).sections).reduce<number>((subTotal, sectionValue) => subTotal + asList(asRecord(sectionValue).topics).length, 0), 0);
  return asList(value.sections).length;
}

function getPageBody(page: any): string {
  const data = asRecord(page?.pageData ?? page);
  if (typeof data.markdown === "string") return data.markdown;
  if (typeof data.text === "string") return data.text;
  return asList(data.elements).map(element => {
    const item = asRecord(element);
    return typeof item.markdown === "string" ? item.markdown : typeof item.text === "string" ? item.text : "";
  }).filter(Boolean).join("\n\n");
}

function StructuredTab({ category, data }: { category: string; data: unknown }) {
  if (data == null) return <div className="ocr-dashboard-empty"><ScanText size={20}/><b>Structured extraction isn’t available for this upload</b><span>This document was processed before category-specific extraction was enabled. Its complete OCR transcription is available in the Transcription tab.</span></div>;
  return <OCRStructuredContent category={category} data={data}/>;
}

export function OCRResultDashboard({ detail, onBack }: { detail: Detail; onBack: () => void }) {
  const [activeDocumentId, setActiveDocumentId] = useState(detail.documents[0]?.id ?? "");
  const [tab, setTab] = useState<Tab>("structured");
  const document = detail.documents.find(item => item.id === activeDocumentId) ?? detail.documents[0];
  const result = document?.result;
  const pageCount = detail.documents.reduce((count, item) => count + (item.result?.pageCount ?? 0), 0);
  const completedCount = detail.documents.filter(item => item.status === "COMPLETED").length;
  const reviewCount = detail.documents.reduce((count, item) => count + countReviewItems(item.result?.extractedData), 0);
  const structuredCount = detail.documents.reduce((count, item) => count + contentCount(detail.session.category, item.result?.extractedData), 0);
  const hasRaw = result?.rawResponse !== undefined;
  const tabs = useMemo(() => [
    { id: "structured" as const, title: "Structured content", icon: <ListTree size={15}/> },
    { id: "transcription" as const, title: "Full transcription", icon: <ScanText size={15}/> },
    { id: "pages" as const, title: "Pages", icon: <Layers3 size={15}/> },
    ...(hasRaw ? [{ id: "raw" as const, title: "Raw JSON", icon: <Braces size={15}/> }] : []),
  ], [hasRaw]);

  useEffect(() => { setTab(result?.extractedData != null ? "structured" : "transcription"); }, [activeDocumentId, result?.extractedData]);

  const statusTone = detail.session.status === "COMPLETED" ? "complete" : detail.session.status === "PARTIALLY_COMPLETED" ? "partial" : "failed";

  return <main className="page-content learning-materials-page ocr-dashboard-page">
    <div className="ocr-dashboard-topline">
      <button className="workspace-back" onClick={onBack}><ArrowLeft size={14}/>Back to course materials</button>
      <span className={`ocr-dashboard-status ${statusTone}`}><i/>{label(detail.session.status)}</span>
    </div>

    <header className="ocr-dashboard-hero">
      <div className="ocr-dashboard-breadcrumb"><span>{detail.course.name}</span><b>/</b><span>{detail.topic.name}</span><b>/</b><span>{label(detail.session.category)}</span></div>
      <div className="ocr-dashboard-title-row"><div><span className="ocr-dashboard-eyebrow"><BookOpen size={13}/> OCR DOCUMENT DASHBOARD</span><h1>{detail.session.title}</h1><p>Source content extracted with OpenParser and saved to Cognify.</p></div><div className="ocr-dashboard-hero-icon"><FileText size={24}/></div></div>
      <div className="ocr-dashboard-stats">
        <article><span>Documents</span><b>{detail.documents.length}</b><small>In this upload session</small></article>
        <article><span>Completed</span><b>{completedCount}<small> / {detail.documents.length}</small></b><small>Document extraction status</small></article>
        <article><span>Pages processed</span><b>{pageCount}</b><small>Across completed documents</small></article>
        <article><span>{detail.session.category === "PAST_QUESTION" ? "Questions" : detail.session.category === "SYLLABUS" ? "Topics" : "Sections"}</span><b>{structuredCount}</b><small>Structured source content</small></article>
        <article className={reviewCount ? "needs-review" : "review-clear"}><span>Review items</span><b>{reviewCount}</b><small>{reviewCount ? "OCR content to check" : "No extraction flags"}</small></article>
      </div>
    </header>

    {detail.session.errorMessage && <p className="ocr-dashboard-alert"><CircleAlert size={15}/>{detail.session.errorMessage}</p>}
    <div className="ocr-dashboard-layout">
      <aside className="ocr-dashboard-sidebar">
        <section className="ocr-dashboard-panel ocr-document-list-panel"><header><div><span className="ocr-dashboard-eyebrow">SOURCE FILES</span><h2>Documents</h2></div><span className="ocr-count-pill">{detail.documents.length}</span></header>
          <div className="ocr-dashboard-document-list">{detail.documents.map(item => <button key={item.id} className={`ocr-dashboard-document ${item.id === document?.id ? "selected" : ""}`} onClick={() => setActiveDocumentId(item.id)}><span className="ocr-file-icon"><FileText size={16}/></span><span className="ocr-file-copy"><b>{item.filename}</b><small>{item.result?.pageCount ?? 0} pages · {(item.fileSize / 1024 / 1024).toFixed(1)} MiB</small></span><span className={`ocr-file-status ${item.status.toLowerCase()}`}>{item.status === "COMPLETED" ? <CheckCircle2 size={15}/> : item.status === "FAILED" ? <CircleAlert size={15}/> : <i/>}</span></button>)}</div>
        </section>
        <section className="ocr-dashboard-panel ocr-dashboard-source-panel"><span className="ocr-dashboard-eyebrow">SESSION DETAILS</span><dl><div><dt>Category</dt><dd>{label(detail.session.category)}</dd></div><div><dt>Topic</dt><dd>{detail.topic.name}</dd></div><div><dt>Created</dt><dd>{new Date(detail.session.createdAt).toLocaleDateString()}</dd></div><div><dt>Provider</dt><dd>OpenParser</dd></div></dl><p>Original uploaded files are not retained by Cognify.</p></section>
      </aside>

      <section className="ocr-dashboard-panel ocr-dashboard-content-panel">
        {document ? <>
          <header className="ocr-selected-document-header"><div className="ocr-selected-document-title"><span className="ocr-file-icon large"><FileText size={18}/></span><div><span className="ocr-dashboard-eyebrow">DOCUMENT {document.fileIndex + 1} OF {detail.documents.length}</span><h2>{document.filename}</h2><p>{label(document.status)} · {document.mimeType} · {document.result?.pageCount ?? 0} page(s)</p></div></div><span className={`ocr-dashboard-status compact ${document.status === "COMPLETED" ? "complete" : document.status === "FAILED" ? "failed" : "partial"}`}><i/>{label(document.status)}</span></header>
          {document.errorMessage && <p className="ocr-dashboard-alert"><CircleAlert size={15}/>{document.errorMessage}</p>}
          <nav className="ocr-dashboard-tabs" aria-label="OCR result sections">{tabs.map(item => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{item.icon}{item.title}{item.id === "pages" && result?.pages.length ? <small>{result.pages.length}</small> : null}</button>)}</nav>
          <div className="ocr-dashboard-tab-content">
            {!result ? <div className="ocr-dashboard-empty"><ScanText size={20}/><b>No OCR output for this file</b><span>{document.errorMessage || "This file does not have a completed extraction result."}</span></div> : tab === "structured" ? <StructuredTab category={detail.session.category} data={result.extractedData}/> : tab === "transcription" ? <div className="ocr-transcription-view"><div className="ocr-tab-intro"><b>Full source transcription</b><span>OCR text as returned by OpenParser. Math notation is rendered when provided in LaTeX delimiters.</span></div><MathMarkdown>{result.markdown || result.extractedText || "OpenParser did not return transcription text for this file."}</MathMarkdown></div> : tab === "pages" ? <div className="ocr-pages-view">{result.pages.length ? result.pages.map((page, index) => <article className="ocr-page-card" key={page.pageNumber ?? page.number ?? index}><header><div><span className="ocr-dashboard-eyebrow">SOURCE PAGE</span><h3>Page {page.pageNumber ?? page.number ?? page.page_number ?? index + 1}</h3></div><span>{asList(asRecord(page.pageData ?? page).elements).length || "—"} elements</span></header><MathMarkdown>{getPageBody(page) || "No separate text was returned for this page. Check the full transcription tab."}</MathMarkdown></article>) : <div className="ocr-dashboard-empty"><Layers3 size={20}/><b>No separate page records</b><span>The full OCR transcription is available in the previous tab.</span></div>}</div> : <div className="ocr-raw-json-view"><div className="ocr-tab-intro"><b>OpenParser raw response</b><span>Complete provider response stored with this document.</span></div><div className="ocr-raw-table-wrap"><table className="ocr-raw-table"><thead><tr><th>Field path</th><th>Value</th></tr></thead><tbody>{flattenRows(result.rawResponse).map((row, index) => <tr key={`${row.path}-${index}`}><td>{row.path || "(root)"}</td><td>{row.value}</td></tr>)}</tbody></table></div></div>}
          </div>
        </> : <div className="ocr-dashboard-empty"><FileText size={20}/><b>No documents in this session</b></div>}
      </section>
    </div>
    <footer className="ocr-dashboard-footer"><span>OCR output is source material and may need review. Cognify has not generated explanations or answers.</span><button onClick={onBack}><ArrowLeft size={14}/>Back to course materials</button></footer>
  </main>;
}

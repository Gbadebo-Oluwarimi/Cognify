"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BookOpen, FileImage, FileText, LoaderCircle, Plus, RefreshCw } from "lucide-react";
import type { Course } from "@/components/courses/CoursesPanel";
import { OCRResultDashboard } from "@/components/courses/OCRResultDashboard";

type Topic = { id: string; name: string; description: string };
type UploadedFile = { id: string; filename: string; fileIndex: number; mimeType: string; fileSize: number; status: string; errorMessage: string | null };
type UploadSession = { id: string; topicId: string; category: string; title: string; status: string; progress: number; createdAt: string; completedFileCount: number; failedFileCount: number; errorMessage: string | null; retryRequestId: string | null; documents: UploadedFile[] };
type Payload = { topics: Topic[]; sessions: UploadSession[] };
type OCRResultDocument = UploadedFile & { result: { status: string; extractedText: string | null; markdown: string | null; extractedData: unknown; pageCount: number; pages: any[]; rawResponse?: unknown } | null };
type Detail = { session: { id: string; title: string; category: string; status: string; progress: number; createdAt: string; completedAt: string | null; errorMessage: string | null; openParserJobId: string | null }; course: { id: string; name: string }; topic: { id: string; name: string }; documents: OCRResultDocument[] };

const categories = ["TEXTBOOK", "CLASS_NOTE", "PAST_QUESTION", "SYLLABUS", "OTHER"];
const fileLimit = 10 * 1024 * 1024;
const sessionLimit = 50 * 1024 * 1024;
const activeStatuses = new Set(["SUBMITTING", "SUBMITTED", "PROCESSING"]);
const label = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/^\w/, char => char.toUpperCase());
const requestKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function CourseLearningMaterialsPanel({ course, onBack }: { course: Course; onBack: () => void }) {
  const [data, setData] = useState<Payload>({ topics: [], sessions: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [topicId, setTopicId] = useState("");
  const [newTopic, setNewTopic] = useState(false);
  const [topicName, setTopicName] = useState("");
  const [category, setCategory] = useState("TEXTBOOK");
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [addTopicOpen, setAddTopicOpen] = useState(false);
  const [standaloneTopicName, setStandaloneTopicName] = useState("");
  const requestId = useRef("");
  const retryInput = useRef<HTMLInputElement>(null);
  const retryRequestId = useRef("");
  const retryTarget = useRef<UploadSession | null>(null);
  const [retrying, setRetrying] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/courses/${course.id}/materials`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load course uploads");
      setData(result);
      setError("");
      if (!topicId && result.topics.length) setTopicId(result.topics[0].id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load course uploads"); }
    finally { setLoading(false); }
  }, [course.id, topicId]);

  useEffect(() => { void refresh(); }, [refresh]);
  const isProcessing = useMemo(() => data.sessions.some(session => activeStatuses.has(session.status)), [data.sessions]);
  useEffect(() => {
    if (!isProcessing) return;
    const timer = window.setInterval(() => { void refresh(); }, 3000);
    return () => window.clearInterval(timer);
  }, [isProcessing, refresh]);
  const sessionTotal = files.reduce((sum, file) => sum + file.size, 0);

  function replaceFiles(next: File[]) {
    setFiles(next);
    requestId.current = requestKey();
    setError("");
  }

  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    const next = [...files, ...Array.from(incoming)];
    if (next.length > 8) { setError("Choose no more than 8 files per upload."); return; }
    if (next.some(file => !["application/pdf", "image/jpeg", "image/png"].includes(file.type) && !/\.(pdf|jpe?g|png)$/i.test(file.name))) {
      setError("Only PDF, JPG, JPEG, and PNG files are supported."); return;
    }
    if (next.some(file => file.size > fileLimit)) { setError("Each file must be 10 MiB or smaller."); return; }
    if (next.reduce((sum, file) => sum + file.size, 0) > sessionLimit) { setError("The combined file size must not exceed 50 MiB."); return; }
    replaceFiles(next);
  }

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((!topicId && !newTopic) || (newTopic && topicName.trim().length < 2) || !files.length) return;
    setBusy(true); setError("");
    const form = new FormData();
    form.set("category", category);
    form.set("topicId", newTopic ? "" : topicId);
    form.set("topicName", newTopic ? topicName.trim() : "");
    form.set("title", title.trim());
    form.set("requestId", requestId.current || (requestId.current = requestKey()));
    files.forEach(file => form.append("files", file));
    try {
      const response = await fetch(`/api/courses/${course.id}/materials`, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not submit files to OpenParser");
      setFiles([]); setTitle(""); setTopicName(""); setNewTopic(false); requestId.current = "";
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not submit files to OpenParser"); }
    finally { setBusy(false); }
  }

  async function createTopic(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(`/api/courses/${course.id}/topics`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: standaloneTopicName }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not create topic");
      setStandaloneTopicName(""); setAddTopicOpen(false); setNewTopic(false); setTopicId(result.topic.id);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create topic"); }
    finally { setBusy(false); }
  }

  async function openSession(id: string) {
    setDetailBusy(true); setError("");
    try {
      const response = await fetch(`/api/upload-sessions/${id}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load OCR result");
      setDetail(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load OCR result"); }
    finally { setDetailBusy(false); }
  }

  async function retryFailedFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    const target = retryTarget.current;
    if (!target || !selected.length) return;
    if (selected.length !== target.documents.filter(doc => doc.status === "FAILED").length) {
      setError(`Select all failed files for “${target.title}”, in the order shown.`); return;
    }
    setRetrying(true); setError("");
    const form = new FormData();
    form.set("requestId", retryRequestId.current || (retryRequestId.current = requestKey()));
    selected.forEach(file => form.append("files", file));
    try {
      const response = await fetch(`/api/upload-sessions/${target.id}/retry`, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not retry failed files");
      retryTarget.current = null; retryRequestId.current = "";
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not retry failed files"); }
    finally { setRetrying(false); }
  }

  const sessionsForTopic = data.sessions.filter(session => !topicId || session.topicId === topicId);

  if (detail) return <OCRResultDashboard key={detail.session.id} detail={detail} onBack={() => setDetail(null)} />;

  return <main className="page-content learning-materials-page">
    <button className="workspace-back" onClick={onBack}><ArrowLeft size={14}/>Back to courses</button>
    <div className="page-title"><div><h1>{course.title}</h1><p>{course.subject} · Extract and organize source content with OpenParser PaddleOCR-VL.</p></div></div>
    {error && <p className="demo-feedback" role="alert">{error}</p>}
    <input ref={retryInput} hidden type="file" multiple accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" onChange={retryFailedFiles}/>
    <section className="workspace-section">
      <div className="workspace-section-heading"><div><span className="section-eyebrow">NEW OCR UPLOAD</span><h2><FileImage size={15}/> Upload up to 8 files</h2><p>OCR starts after you submit. Each file remains a separate source and keeps its original order.</p></div></div>
      <form className="material-upload-form" onSubmit={upload}>
        <label className="study-form-field"><span>Topic</span><div className="material-topic-row"><select className="study-text-input" value={newTopic ? "__new__" : topicId} onChange={event => { requestId.current = ""; if (event.target.value === "__new__") setNewTopic(true); else { setNewTopic(false); setTopicId(event.target.value); } }}><option value="" disabled>Select a topic</option>{data.topics.map(topic => <option key={topic.id} value={topic.id}>{topic.name}</option>)}<option value="__new__">+ Create a new topic</option></select>{!newTopic && <button type="button" className="workspace-outline" onClick={() => { requestId.current = ""; setNewTopic(true); }}><Plus size={13}/>New topic</button>}</div></label>
        {newTopic && <label className="study-form-field"><span>New topic name</span><input className="study-text-input" value={topicName} maxLength={120} onChange={event => { requestId.current = ""; setTopicName(event.target.value); }} placeholder="Cell Structure" required minLength={2}/></label>}
        <label className="study-form-field"><span>Document category</span><select className="study-text-input" value={category} onChange={event => { requestId.current = ""; setCategory(event.target.value); }}>{categories.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>
        <label className="study-form-field"><span>Upload title <small>(optional)</small></span><input className="study-text-input" value={title} maxLength={180} onChange={event => { requestId.current = ""; setTitle(event.target.value); }} placeholder="Uses the first filename by default"/></label>
        <label className="study-form-field"><span>PDF, JPG/JPEG or PNG files</span><input className="study-text-input" type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" multiple onChange={event => { addFiles(event.target.files); event.target.value = ""; }}/><small className="field-hint">Up to 8 files · 10 MiB each · 50 MiB combined · original files are not retained by Cognify after submission.</small></label>
        {files.length > 0 && <ol className="material-file-list">{files.map((file, index) => <li key={`${file.name}-${index}`}><span className="file-order">{index + 1}</span><span><FileText size={13}/> {file.name}</span><small>{file.type || "Unknown type"} · {(file.size / 1024 / 1024).toFixed(1)} MiB</small><label className="workspace-outline file-replace">Replace<input type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" onChange={event => { const replacement = event.target.files?.[0]; if (!replacement) return; const next = files.map((item, i) => i === index ? replacement : item); replaceFiles(next); event.target.value = ""; }}/></label><button type="button" onClick={() => replaceFiles(files.filter((_, i) => i !== index))} aria-label={`Remove ${file.name}`}>Remove</button></li>)}</ol>}
        {files.length > 0 && <small className="field-hint">{files.length} file(s) · {(sessionTotal / 1024 / 1024).toFixed(1)} / 50 MiB</small>}
        <footer className="study-modal-footer"><button className="study-primary" disabled={busy || !files.length || (!topicId && !newTopic) || (newTopic && topicName.trim().length < 2)}>{busy ? <><LoaderCircle size={14}/>Submitting…</> : <><BookOpen size={14}/>Upload and analyse</>}</button></footer>
      </form>
    </section>

    <section className="workspace-section">
      <div className="workspace-section-heading"><div><span className="section-eyebrow">COURSE TOPICS</span><h2>Topics and OCR sessions</h2></div><div className="material-topic-actions"><button className="workspace-outline" onClick={() => setAddTopicOpen(value => !value)}><Plus size={13}/>Create topic</button><button className="workspace-outline" onClick={() => void refresh()}><RefreshCw size={13}/>Refresh</button></div></div>
      {addTopicOpen && <form className="material-create-topic" onSubmit={createTopic}><label className="study-form-field"><span>Topic name</span><input className="study-text-input" value={standaloneTopicName} onChange={event => setStandaloneTopicName(event.target.value)} minLength={2} maxLength={120} required placeholder="Cell Structure"/></label><button className="study-primary" disabled={busy || standaloneTopicName.trim().length < 2}>{busy ? "Saving…" : "Save topic"}</button></form>}
      {loading ? <p className="demo-feedback">Loading topics and OCR sessions…</p> : data.topics.length === 0 ? <div className="notes-empty"><BookOpen size={19}/><b>No topics yet</b><span>Create a topic to organize course OCR documents.</span></div> : <>
        <div className="material-topic-tabs">{data.topics.map(topic => <button key={topic.id} className={topic.id === topicId ? "selected" : ""} onClick={() => setTopicId(topic.id)}>{topic.name}<small>{data.sessions.filter(session => session.topicId === topic.id).length}</small></button>)}</div>
        {sessionsForTopic.length === 0 ? <p className="demo-feedback">No OCR uploads for this topic yet.</p> : <div className="material-session-list">{sessionsForTopic.map(session => <article className="material-session" key={session.id}><header><div><b>{session.title}</b><span>{label(session.category)} · {label(session.status)}{activeStatuses.has(session.status) ? ` · ${session.progress}%` : ""}</span></div><div className="material-topic-actions">{session.documents.some(doc => ["COMPLETED", "FAILED"].includes(doc.status)) && <button className="workspace-outline" onClick={() => void openSession(session.id)} disabled={detailBusy}>{detailBusy ? "Loading…" : "View OCR result"}</button>}{session.documents.some(doc => doc.status === "FAILED") && !activeStatuses.has(session.status) && <button className="workspace-outline" disabled={retrying} onClick={() => { retryTarget.current = session; retryRequestId.current = session.status === "SUBMISSION_RETRYABLE" && session.retryRequestId ? session.retryRequestId : requestKey(); retryInput.current?.click(); }}>{retrying ? "Preparing retry…" : `Retry ${session.documents.filter(doc => doc.status === "FAILED").length} failed file(s)`}</button>}</div></header>{activeStatuses.has(session.status) && <progress value={session.progress} max={100}/ >}{session.errorMessage && <p className="session-error">{session.errorMessage}</p>}{session.documents.some(doc => doc.status === "FAILED") && <small className="field-hint">Choose the failed source files in this order: {session.documents.filter(doc => doc.status === "FAILED").map((doc, index) => `${index + 1}. ${doc.filename}`).join(" · ")}. Cognify verifies each file before retrying.</small>}<ol>{session.documents.map(doc => <li key={doc.id}><span>{doc.fileIndex + 1}. {doc.filename} · {(doc.fileSize / 1024 / 1024).toFixed(1)} MiB</span><b className={`image-status ${doc.status.toLowerCase()}`}>{label(doc.status)}</b>{doc.errorMessage && <small>{doc.errorMessage}</small>}</li>)}</ol></article>)}</div>}
      </>}
    </section>

  </main>;
}

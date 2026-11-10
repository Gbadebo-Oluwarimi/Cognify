"use client";

import { useState } from "react";
import { Archive, BookOpen, ChevronRight, Plus, X } from "lucide-react";
import { CourseDocumentsPanel } from "@/components/documents/CourseDocumentsPanel";

export type Course = {
  id: string;
  title: string;
  subject: string;
  examinationBody: "WAEC";
  examinationYear: number | null;
  description: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

type Props = { courses: Course[]; loading: boolean; error: string; onRefresh: () => void };

export function CoursesPanel({ courses, loading, error, onRefresh }: Props) {
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Course | null>(null);
  const [editing, setEditing] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  async function submitCourse(event: React.FormEvent<HTMLFormElement>, method: "POST" | "PATCH") {
    event.preventDefault();
    if (method === "PATCH" && !selected) return;
    setBusy(true);
    setFormError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(method === "POST" ? "/api/courses" : `/api/courses/${selected!.id}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: data.get("title"), subject: data.get("subject"), examinationYear: data.get("year"), description: data.get("description") }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save course");
      if (method === "POST") setCreating(false);
      else { setSelected(result.course); setEditing(false); }
      onRefresh();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not save course");
    } finally {
      setBusy(false);
    }
  }

  async function archive(course: Course) {
    if (!window.confirm(`Archive ${course.title}?`)) return;
    const response = await fetch(`/api/courses/${course.id}`, { method: "DELETE" });
    if (response.ok) { setSelected(null); onRefresh(); }
  }

  if (selected && showDocuments) {
    return <CourseDocumentsPanel course={selected} onBack={() => setShowDocuments(false)} />;
  }

  return <div className="page-content">
    <div className="page-title"><div><h1>My Courses</h1><p>Your WAEC courses, saved to your account.</p></div><button className="primary-button" onClick={() => setCreating(true)}><Plus size={15}/>Create a course</button></div>
    {error && <p className="demo-feedback" role="alert">{error}</p>}
    {loading ? <p className="demo-feedback">Loading your courses…</p> : courses.length === 0 ? <section className="settings-panel"><h2>No courses yet</h2><p>Create a course to organize your WAEC preparation.</p><button className="primary-button" onClick={() => setCreating(true)}><Plus size={15}/>Create your first course</button></section> : <div className="subject-grid">{courses.map(course => <article className="subject-card" key={course.id}><div className="subject-icon"><BookOpen size={18}/></div><div className="subject-card-head"><h3>{course.title}</h3><button aria-label={`Archive ${course.title}`} onClick={() => archive(course)}><Archive size={16}/></button></div><p>{course.subject} · WAEC {course.examinationYear || "Year not set"}</p><button className="text-link" onClick={() => { setSelected(course); setEditing(false); setFormError(""); }}>Open course<ChevronRight size={14}/></button></article>)}</div>}
    {creating && <div className="study-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setCreating(false); }}><section className="study-modal" role="dialog" aria-modal="true"><header className="study-modal-header"><div><span className="study-modal-kicker">YOUR LEARNING PLAN</span><h2>Create a course</h2><p>Choose a subject and examination year. You can create another course for the same subject.</p></div><button className="study-close" onClick={() => setCreating(false)} aria-label="Close"><X size={16}/></button></header><CourseForm onSubmit={event => submitCourse(event, "POST")} busy={busy} error={formError} submitLabel="Create course" onCancel={() => setCreating(false)}/></section></div>}
    {selected && <div className="study-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}><section className="study-modal" role="dialog" aria-modal="true"><header className="study-modal-header"><div><span className="study-modal-kicker">WAEC {selected.examinationYear || "Year not set"}</span><h2>{selected.title}</h2><p>{selected.description || "Manage the learning materials and OCR pages for this course."}</p></div><button className="study-close" onClick={() => setSelected(null)} aria-label="Close"><X size={16}/></button></header>{editing ? <CourseForm key={selected.id} course={selected} onSubmit={event => submitCourse(event, "PATCH")} busy={busy} error={formError} submitLabel="Save changes" onCancel={() => setEditing(false)}/> : <div className="study-modal-form"><p className="demo-feedback">Course ID: {selected.id}</p><div className="study-modal-footer"><button className="study-secondary" onClick={() => archive(selected)}>Archive course</button><button className="study-secondary" onClick={() => setShowDocuments(true)}>Manage documents</button><button className="study-primary" onClick={() => setEditing(true)}>Edit course</button></div></div>}</section></div>}
  </div>;
}

function CourseForm({ course, onSubmit, busy, error, submitLabel, onCancel }: { course?: Course; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; busy: boolean; error: string; submitLabel: string; onCancel: () => void }) {
  return <form className="study-modal-form" onSubmit={onSubmit}><label className="study-form-field"><span>Course title</span><input className="study-text-input" name="title" required minLength={2} maxLength={120} defaultValue={course?.title} placeholder="Mathematics – WAEC 2027"/></label><label className="study-form-field"><span>Subject</span><input className="study-text-input" name="subject" required minLength={2} maxLength={80} defaultValue={course?.subject} placeholder="Mathematics"/></label><label className="study-form-field"><span>Examination year</span><input className="study-text-input" name="year" type="number" min="2020" max="2100" required defaultValue={course?.examinationYear ?? ""} placeholder="2027"/></label><label className="study-form-field"><span>Description <small>(optional)</small></span><textarea className="study-textarea" name="description" maxLength={500} defaultValue={course?.description}/></label>{error && <p className="study-form-error" role="alert">{error}</p>}<footer className="study-modal-footer"><button type="button" className="study-secondary" onClick={onCancel}>Cancel</button><button className="study-primary" disabled={busy}>{busy ? "Saving…" : submitLabel}</button></footer></form>;
}

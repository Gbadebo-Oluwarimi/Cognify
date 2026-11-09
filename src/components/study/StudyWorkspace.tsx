"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, FileText, MoreHorizontal, Plus, Search, ShieldCheck, Upload, X } from "lucide-react";
import { createId, formatUploadDate, getMockSyllabusTopics, StudyNote, StudyWorkspace as WorkspaceModel, SyllabusTopic, TopicVerification, verifyTopicAgainstSyllabus } from "@/lib/study-workspaces";

type CreatePayload = { subject: string; syllabusFile: File; noteFile: File; noteTitle: string; noteTopicId: string };
type NotePayload = { title: string; file: File; selectedTopic: string; topicId: string | null; description: string; status: StudyNote["verificationStatus"]; confidence: number; matchedTopicId: string | null; suggestedTopicId: string | null; message: string };

function fileType(file: File): "PDF" | "DOC" | "DOCX" {
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext === "doc" ? "DOC" : ext === "docx" ? "DOCX" : "PDF";
}

function StatusBadge({ status }: { status: StudyNote["verificationStatus"] | "SYLLABUS" }) {
  if (status === "SYLLABUS") return <span className="verification-badge matched"><ShieldCheck size={13}/>Syllabus topic</span>;
  const labels = { MATCHED: "Matched", POSSIBLE_MATCH: "Possible match", NOT_FOUND: "Supplementary" };
  return <span className={`verification-badge ${status.toLowerCase()}`}><i/>{labels[status]}</span>;
}

export function CreateStudyModal({ onClose, onCreate, existingSubjects, initialSubject }: {
  onClose: () => void; onCreate: (payload: CreatePayload) => void; existingSubjects: string[]; initialSubject?: string;
}) {
  const [subject, setSubject] = useState(initialSubject ?? "");
  const [query, setQuery] = useState(initialSubject ?? "");
  const [menuOpen, setMenuOpen] = useState(false);
  const [syllabus, setSyllabus] = useState<File | null>(null);
  const [note, setNote] = useState<File | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteTopicId, setNoteTopicId] = useState("");
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  useModalLifecycle(onClose);
  const options = useMemo(() => ["English Language", "Mathematics", "Biology", "Chemistry", "Physics", "Agricultural Science", "Economics", "Government", "Literature in English", "Geography", "Commerce", "Accounting"].filter(s => s.toLowerCase().includes(query.toLowerCase())), [query]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    if (!subject) return setError("Choose a subject to continue.");
    if (existingSubjects.includes(subject)) return setError(`A ${subject} workspace already exists. Open it to add another note.`);
    if (!syllabus) return setError("Upload the official WAEC syllabus PDF.");
    if (!note) return setError("Upload your first study note.");
    if (!noteTopicId) return setError("Choose a syllabus topic for your first note.");
    if (!syllabus.name.toLowerCase().endsWith(".pdf")) return setError("The WAEC syllabus must be a PDF file.");
    if (!/\.(pdf|doc|docx)$/i.test(note.name)) return setError("Study notes must be PDF, DOC or DOCX files.");
    setProcessing(true);
    window.setTimeout(() => { setProcessing(false); onCreate({ subject, syllabusFile: syllabus, noteFile: note, noteTitle: noteTitle.trim() || note.name.replace(/\.[^.]+$/, ""), noteTopicId }); }, 250);
  };
  return <div className="study-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><section className="study-modal create-study-modal" role="dialog" aria-modal="true" aria-labelledby="create-study-heading"><header className="study-modal-header"><div><span className="study-modal-kicker">NEW STUDY WORKSPACE</span><h2 id="create-study-heading">Create a New Study</h2><p>Set up your subject, upload its WAEC syllabus and add your first study material.</p></div><button type="button" className="study-close" onClick={onClose} aria-label="Close"><X size={17}/></button></header>
    <form onSubmit={submit} className="study-modal-form"><div className="study-form-field"><label htmlFor="study-subject">Subject <b>*</b></label><div className="subject-combobox"><Search size={15}/><input id="study-subject" value={menuOpen ? query : subject} placeholder="Search and select a subject" onFocus={()=>{setQuery("");setMenuOpen(true);}} onChange={e=>{setQuery(e.target.value);setSubject("");setNoteTopicId("");setMenuOpen(true);}} aria-expanded={menuOpen} aria-controls="subject-options"/><ChevronDown size={15}/>{menuOpen&&<div className="subject-options" id="subject-options">{options.map(option=><button type="button" key={option} disabled={existingSubjects.includes(option)} onClick={()=>{setSubject(option);setQuery(option);setNoteTopicId("");setMenuOpen(false);}}>{option}<span>{existingSubjects.includes(option)?"Workspace exists":""}</span></button>)}{options.length===0&&<p>No matching subjects</p>}</div>}</div>{subject&&existingSubjects.includes(subject)&&<span className="field-hint warn">This subject already has a workspace. Open it from My Subjects.</span>}</div>
      <div className="study-form-field"><label>Upload WAEC Syllabus <b>*</b></label><p className="field-hint">Upload the official syllabus that will guide this study workspace.</p><label className={`study-dropzone compact ${syllabus?"has-file":""}`}><input type="file" accept="application/pdf,.pdf" onChange={e=>setSyllabus(e.target.files?.[0]??null)}/>{syllabus?<><FileText size={18}/><span className="selected-file"><b>{syllabus.name}</b><small>{(syllabus.size/1024/1024).toFixed(2)} MB · PDF</small></span><button type="button" className="remove-file" onClick={e=>{e.preventDefault();setSyllabus(null);}} aria-label="Remove syllabus"><X size={14}/></button></>:<><Upload size={18}/><span><b>Choose syllabus PDF</b><small>PDF only · saved as this workspace’s reference</small></span></>}</label></div>
      <div className="study-form-field"><label>Upload Your First Study Note <b>*</b></label><p className="field-hint">Your first note will be linked to a topic in the selected syllabus.</p><label className={`study-dropzone compact ${note?"has-file":""}`}><input type="file" accept="application/pdf,.pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={e=>{const f=e.target.files?.[0]??null;setNote(f);if(f&&!noteTitle)setNoteTitle(f.name.replace(/\.[^.]+$/, ""));}}/>{note?<><FileText size={18}/><span className="selected-file"><b>{note.name}</b><small>{(note.size/1024/1024).toFixed(2)} MB · {fileType(note)}</small></span><button type="button" className="remove-file" onClick={e=>{e.preventDefault();setNote(null);}} aria-label="Remove study note"><X size={14}/></button></>:<><Upload size={18}/><span><b>Choose your first study note</b><small>PDF, DOC or DOCX</small></span></>}</label>{note&&<label className="study-subfield">Note title<input value={noteTitle} onChange={e=>setNoteTitle(e.target.value)} placeholder="Give your note a title"/></label>}{subject&&<label className="study-subfield">First note topic <b>*</b><select value={noteTopicId} onChange={e=>setNoteTopicId(e.target.value)}><option value="">Choose a syllabus topic</option>{getMockSyllabusTopics(subject).map(topic=><option key={topic.id} value={topic.id}>{topic.section} · {topic.title}</option>)}</select></label>}</div>
      <div className="mock-processing-note"><CircleAlert size={15}/><span>Topic extraction is simulated in this demo. The syllabus file is saved as a reference, but its contents are not read.</span></div>{error&&<p className="study-form-error" role="alert">{error}</p>}<footer className="study-modal-footer"><button type="button" className="study-secondary" onClick={onClose}>Cancel</button><button type="submit" className="study-primary" disabled={processing}>{processing?"Preparing workspace…":"Create Study Workspace"}</button></footer>
    </form></section></div>;
}

export function StudyWorkspaceView({ workspace, onBack, onAddNote, onReplaceSyllabus, onDeleteNote }: {
  workspace: WorkspaceModel; onBack: () => void; onAddNote: (payload: NotePayload) => void; onReplaceSyllabus: (file: File) => void; onDeleteNote: (noteId: string) => void;
}) {
  const [noteModal, setNoteModal] = useState(false);
  const [replaceModal, setReplaceModal] = useState(false);
  const [viewSyllabus, setViewSyllabus] = useState(false);
  const [viewNote, setViewNote] = useState<StudyNote | null>(null);
  const [topicFilter, setTopicFilter] = useState<string | null>(null);
  const [moreNoteId, setMoreNoteId] = useState<string | null>(null);
  const grouped = useMemo(() => workspace.topics.map(topic => ({ topic, notes: workspace.notes.filter(note => note.topicId === topic.id) })), [workspace]);
  const sections = [...new Set(workspace.topics.map(topic => topic.section))];
  const visibleNotes = topicFilter ? workspace.notes.filter(note => note.topicId === topicFilter) : workspace.notes;
  const supplementaryNotes = visibleNotes.filter(note => !note.topicId);
  const noteGroups = sections.map(section => ({
    section,
    topics: grouped.filter(group => group.topic.section === section).map(group => ({ ...group, notes: group.notes.filter(note => visibleNotes.some(visible => visible.id === note.id)) })).filter(group => group.notes.length > 0),
  })).filter(group => group.topics.length > 0);
  return <div className="workspace-scroll">
    <div className="workspace-page">
      <button className="workspace-back" onClick={onBack}><ChevronLeft size={16}/>My Subjects</button>
      <header className="workspace-heading"><div><div className="workspace-title-line"><h1>{workspace.subject} Study Workspace</h1><span className="workspace-saved"><CheckCircle2 size={14}/>Syllabus saved</span></div><p>Study with your WAEC syllabus as the guide for every note.</p></div><button className="study-primary add-note-button" onClick={()=>setNoteModal(true)}><Plus size={16}/>Add Study Note</button></header>
      <div className="workspace-stats"><article><span>SUBJECT</span><b>{workspace.subject}</b></article><article><span>STUDY NOTES</span><b>{workspace.notes.length}</b></article><article><span>SYLLABUS TOPICS</span><b>{workspace.topics.length}</b></article><article><span>LAST UPDATED</span><b>{workspace.updatedAt}</b></article></div>

      <section className="workspace-section syllabus-card">
        <div className="workspace-section-heading"><div><span className="section-eyebrow">REFERENCE DOCUMENT</span><h2>WAEC Syllabus</h2><p>This saved syllabus guides verification for every note in this workspace.</p></div><StatusBadge status="SYLLABUS"/></div>
        <div className="syllabus-file"><div className="syllabus-file-icon"><FileText size={18}/></div><div className="syllabus-file-meta"><b>{workspace.syllabusDocument.fileName}</b><span>PDF · Uploaded {workspace.syllabusDocument.uploadedAt} · {sections.length} sections · {workspace.topics.length} sample topics</span></div><button className="workspace-outline" onClick={()=>setViewSyllabus(true)}>View syllabus</button><button className="workspace-outline replace" onClick={()=>setReplaceModal(true)}>Replace syllabus</button></div>
        <p className="mock-disclosure"><CircleAlert size={14}/>Sample topics below are demonstration data, not extracted from this PDF.</p>
      </section>

      <section className="workspace-section topics-section">
        <div className="workspace-section-heading"><div><span className="section-eyebrow">SYLLABUS MAP</span><h2>Topics <span className="count-chip">{workspace.topics.length}</span></h2><p>Choose a topic to filter its study notes.</p></div><button className={`workspace-outline ${topicFilter===null?"selected":""}`} onClick={()=>setTopicFilter(null)}>All topics</button></div>
        <div className="topic-sections">{sections.map(section=><div className="topic-section-group" key={section}><h3>{section}</h3><div className="topic-list">{grouped.filter(row=>row.topic.section===section).map(({topic,notes})=><button className={`topic-row ${topicFilter===topic.id?"chosen":""}`} key={topic.id} onClick={()=>setTopicFilter(topicFilter===topic.id?null:topic.id)}><span className="topic-check"><Check size={13}/></span><span className="topic-title"><b>{topic.title}</b><small>Study progress · Not started</small></span><span className="topic-note-count">{notes.length} {notes.length===1?"note":"notes"}</span><StatusBadge status="MATCHED"/><ChevronRight className="topic-chevron" size={15}/></button>)}</div></div>)}</div>
      </section>

      <section className="workspace-section notes-section">
        <div className="workspace-section-heading"><div><span className="section-eyebrow">YOUR DOCUMENTS</span><h2>Uploaded Study Notes <span className="count-chip">{visibleNotes.length}</span></h2><p>{topicFilter?"Notes linked to the selected syllabus topic.":"Notes grouped under their syllabus topics."}</p></div>{topicFilter&&<button className="workspace-outline" onClick={()=>setTopicFilter(null)}>Clear filter</button>}</div>
        {visibleNotes.length===0?<div className="notes-empty"><FileText size={22}/><b>{topicFilter?"No notes under this topic yet.":"Your first note will appear here."}</b><span>Add study notes and they’ll be grouped against this syllabus.</span><button className="study-secondary" onClick={()=>setNoteModal(true)}>Add Study Note</button></div>:<div className="notes-groups">{noteGroups.map(({section,topics})=><div className="note-topic-group" key={section}><h3>{section}</h3>{topics.map(({topic,notes})=><div className="note-topic" key={topic.id}><div className="note-topic-heading"><b>{topic.title}</b><span>{notes.length} {notes.length===1?"note":"notes"}</span></div>{notes.map(note=><NoteRow key={note.id} note={note} onView={()=>setViewNote(note)} onMore={()=>setMoreNoteId(moreNoteId===note.id?null:note.id)} moreOpen={moreNoteId===note.id} onDelete={()=>{onDeleteNote(note.id);setMoreNoteId(null);}}/>)}</div>)}</div>)}</div>}
        {supplementaryNotes.length>0&&<div className="supplementary-notes"><div className="note-topic-heading"><b>Supplementary, unverified notes</b><span>{supplementaryNotes.length} {supplementaryNotes.length===1?"note":"notes"}</span></div>{supplementaryNotes.map(note=><NoteRow key={note.id} note={note} onView={()=>setViewNote(note)} onMore={()=>setMoreNoteId(moreNoteId===note.id?null:note.id)} moreOpen={moreNoteId===note.id} onDelete={()=>onDeleteNote(note.id)}/>)}</div>}
      </section>
    </div>
    {noteModal&&<AddNoteModal workspace={workspace} onClose={()=>setNoteModal(false)} onAdd={payload=>{onAddNote(payload);setNoteModal(false);}}/>}
    {replaceModal&&<ReplaceSyllabusModal currentName={workspace.syllabusDocument.fileName} onClose={()=>setReplaceModal(false)} onReplace={file=>{onReplaceSyllabus(file);setReplaceModal(false);}}/>}
    {viewSyllabus&&<InfoModal title="Saved WAEC Syllabus" fileName={workspace.syllabusDocument.fileName} detail={`Uploaded ${workspace.syllabusDocument.uploadedAt} · ${sections.length} sample sections · ${workspace.topics.length} sample topics`} note="The PDF is stored as a local document reference. Text extraction is not enabled in this prototype." onClose={()=>setViewSyllabus(false)}/>}
    {viewNote&&<NoteInfoModal note={viewNote} onClose={()=>setViewNote(null)}/>}
  </div>;
}

function NoteRow({note,onView,onMore,moreOpen,onDelete}:{note:StudyNote;onView:()=>void;onMore:()=>void;moreOpen:boolean;onDelete:()=>void}){
  return <article className="workspace-note-row"><div className="workspace-note-icon"><FileText size={16}/></div><div className="workspace-note-main"><b>{note.title}</b><span>{note.fileName} · {note.fileType} · {note.uploadedAt}</span></div><StatusBadge status={note.verificationStatus}/><button className="workspace-outline view-note" onClick={onView}>View</button><div className="note-more-wrap"><button className="note-more" onClick={onMore} aria-label={`More options for ${note.title}`}><MoreHorizontal size={18}/></button>{moreOpen&&<div className="note-more-menu"><button onClick={onView}>View details</button><button className="danger-action" onClick={onDelete}>Remove note</button></div>}</div></article>;
}

function AddNoteModal({workspace,onClose,onAdd}:{workspace:WorkspaceModel;onClose:()=>void;onAdd:(payload:NotePayload)=>void}){
  const [query,setQuery]=useState("");const [topic,setTopic]=useState<SyllabusTopic|null>(null);const [customTopic,setCustomTopic]=useState("");const [manual,setManual]=useState(false);const [open,setOpen]=useState(false);const [title,setTitle]=useState("");const [file,setFile]=useState<File|null>(null);const [description,setDescription]=useState("");const [error,setError]=useState("");const [confirmedPossible,setConfirmedPossible]=useState(false);
  useModalLifecycle(onClose);
  const options=workspace.topics.filter(t=>`${t.title} ${t.section}`.toLowerCase().includes(query.toLowerCase()));
  const selectedText=manual?customTopic:topic?.title??"";
  const verification:TopicVerification=verifyTopicAgainstSyllabus(selectedText,workspace.topics);
  const valid=!!title.trim()&&!!file&&!!selectedText.trim()&&(verification.status==="MATCHED"||(verification.status==="POSSIBLE_MATCH"&&confirmedPossible));
  const submit=(supplementary=false)=>{setError("");if(!selectedText.trim())return setError("Select a topic or enter its name.");if(!title.trim())return setError("Add a title for this study note.");if(!file)return setError("Choose a PDF, DOC or DOCX file.");if(!/\.(pdf|doc|docx)$/i.test(file.name))return setError("Study notes must be PDF, DOC or DOCX files.");if(verification.status==="POSSIBLE_MATCH"&&!confirmedPossible&&!supplementary)return setError("Confirm the suggested syllabus topic or keep this note as supplementary.");const matched=verification.status==="MATCHED"?verification.matchedTopic:verification.status==="POSSIBLE_MATCH"&&confirmedPossible?verification.suggestedTopic:null;const noteStatus=supplementary?"NOT_FOUND":matched?"MATCHED":verification.status;onAdd({title:title.trim(),file,selectedTopic:selectedText,topicId:matched?.id??null,description:description.trim(),status:noteStatus,confidence:matched?verification.confidence:0,matchedTopicId:matched?.id??null,suggestedTopicId:verification.suggestedTopic?.id??null,message:supplementary?"This note is saved as supplementary material and is not verified against the WAEC syllabus.":matched?"This topic is included in your WAEC syllabus.":verification.message});};
  return <div className="study-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="study-modal add-note-modal" role="dialog" aria-modal="true" aria-labelledby="add-note-heading"><header className="study-modal-header compact-header"><div><span className="study-modal-kicker">{workspace.subject.toUpperCase()} WORKSPACE</span><h2 id="add-note-heading">Add Study Note</h2><p>Choose a topic from this workspace’s saved WAEC syllabus.</p></div><button className="study-close" onClick={onClose} aria-label="Close"><X size={17}/></button></header><div className="add-note-form"><div className="study-form-field"><label>Topic <b>*</b></label>{manual?<div className="manual-topic-field"><input autoFocus value={customTopic} onChange={e=>{setCustomTopic(e.target.value);setConfirmedPossible(false);}} placeholder="Enter the topic name"/><button className="text-button" onClick={()=>{setManual(false);setCustomTopic("");setTopic(null);}}>Choose from syllabus</button></div>:<div className="subject-combobox"><Search size={15}/><input value={open?query:topic?.title??""} placeholder="Search syllabus topics" onFocus={()=>{setQuery("");setOpen(true);}} onChange={e=>{setQuery(e.target.value);setTopic(null);setOpen(true);}} aria-expanded={open}/><ChevronDown size={15}/>{open&&<div className="subject-options topic-options">{options.map(t=><button type="button" key={t.id} onClick={()=>{setTopic(t);setQuery(t.title);setOpen(false);setConfirmedPossible(false);}}><span>{t.title}<small>{t.section}</small></span><CheckCircle2 size={14}/></button>)}{options.length===0&&<p>No matching topics in this syllabus.</p>}</div>}</div>}<button className="text-button manual-link" onClick={()=>{setManual(true);setTopic(null);setOpen(false);setQuery("");}}>Enter a topic name instead</button></div>
    {selectedText&&<VerificationPanel verification={verification} selectedText={selectedText} onUseSuggestion={()=>{if(verification.suggestedTopic){setTopic(verification.suggestedTopic);setCustomTopic("");setManual(false);setQuery(verification.suggestedTopic.title);setConfirmedPossible(false);}}} onConfirmSuggestion={()=>setConfirmedPossible(true)} confirmedPossible={confirmedPossible}/>}
    <div className="study-form-field"><label>Note title <b>*</b></label><input className="study-text-input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Cell structure class notes"/></div><div className="study-form-field"><label>Study note file <b>*</b></label><label className={`study-dropzone note-dropzone ${file?"has-file":""}`}><input type="file" accept="application/pdf,.pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={e=>setFile(e.target.files?.[0]??null)}/>{file?<><FileText size={17}/><span className="selected-file"><b>{file.name}</b><small>{fileType(file)} · {(file.size/1024/1024).toFixed(2)} MB</small></span><button type="button" className="remove-file" onClick={e=>{e.preventDefault();setFile(null);}} aria-label="Remove file"><X size={14}/></button></>:<><Upload size={17}/><span><b>Choose a note file</b><small>PDF, DOC or DOCX</small></span></>}</label></div><div className="study-form-field"><label>Description <span className="optional-label">Optional</span></label><textarea className="study-textarea" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Add a short description" rows={2}/></div>
    {error&&<p className="study-form-error" role="alert">{error}</p>}<footer className="study-modal-footer"><button className="study-secondary" onClick={onClose}>Cancel</button>{verification.status==="NOT_FOUND"&&selectedText?<button className="supplementary-button" disabled={!title.trim()||!file} onClick={()=>submit(true)}>Keep as supplementary</button>:<button className="study-primary" disabled={!valid} onClick={()=>submit(false)}>Add Study Note</button>}</footer></div></section></div>;
}

function VerificationPanel({verification,selectedText,onUseSuggestion,onConfirmSuggestion,confirmedPossible}:{verification:TopicVerification;selectedText:string;onUseSuggestion:()=>void;onConfirmSuggestion:()=>void;confirmedPossible:boolean}){
  if(verification.status==="MATCHED")return <div className="verification-panel is-matched"><CheckCircle2 size={17}/><div><b>MATCHED · {verification.matchedTopic?.title}</b><span>This topic is included in your WAEC syllabus.</span></div></div>;
  if(verification.status==="POSSIBLE_MATCH")return <div className="verification-panel is-possible"><CircleAlert size={17}/><div><b>POSSIBLE MATCH</b><span>We found “{verification.suggestedTopic?.title}” in your syllabus. Confirm to attach this note to that topic.</span>{confirmedPossible?<strong className="confirmation-text">Confirmed: note will be grouped under {verification.suggestedTopic?.title}.</strong>:<div className="suggestion-actions"><button onClick={onUseSuggestion}>Use suggested topic</button><button onClick={onConfirmSuggestion}>Confirm this match</button></div>}</div></div>;
  return <div className="verification-panel is-not-found"><CircleAlert size={17}/><div><b>NOT FOUND</b><span>This topic was not found in your uploaded WAEC syllabus.</span><small>Review “{selectedText}”, select a syllabus topic, or keep the note as supplementary material.</small></div></div>;
}

function ReplaceSyllabusModal({currentName,onClose,onReplace}:{currentName:string;onClose:()=>void;onReplace:(f:File)=>void}){
  const [file,setFile]=useState<File|null>(null);const [error,setError]=useState("");
  useModalLifecycle(onClose);
  return <div className="study-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="study-modal replace-modal" role="dialog" aria-modal="true" aria-labelledby="replace-heading"><header className="study-modal-header compact-header"><div><span className="study-modal-kicker">UPDATE REFERENCE</span><h2 id="replace-heading">Replace WAEC Syllabus</h2><p>The current reference is <b>{currentName}</b>. Replacing it updates this workspace’s syllabus topics.</p></div><button type="button" className="study-close" onClick={onClose} aria-label="Close"><X size={17}/></button></header><label className={`study-dropzone note-dropzone ${file?"has-file":""}`}><input type="file" accept="application/pdf,.pdf" onChange={e=>setFile(e.target.files?.[0]??null)}/>{file?<><FileText size={17}/><span className="selected-file"><b>{file.name}</b><small>PDF · {(file.size/1024/1024).toFixed(2)} MB</small></span></>:<><Upload size={17}/><span><b>Choose replacement syllabus</b><small>PDF only · processing results are mocked</small></span></>}</label><div className="mock-processing-note"><CircleAlert size={15}/><span>This explicit action replaces the saved file reference. It does not run PDF extraction.</span></div>{error&&<p className="study-form-error">{error}</p>}<footer className="study-modal-footer"><button className="study-secondary" onClick={onClose}>Cancel</button><button className="study-primary" disabled={!file} onClick={()=>file?.name.toLowerCase().endsWith(".pdf")?onReplace(file):setError("Choose a PDF syllabus first.")}>Replace syllabus</button></footer></section></div>;
}

function InfoModal({title,fileName,detail,note,onClose}:{title:string;fileName:string;detail:string;note:string;onClose:()=>void}){
  useModalLifecycle(onClose);
  return <div className="study-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="study-modal info-modal" role="dialog" aria-modal="true" aria-labelledby="info-heading"><header className="study-modal-header compact-header"><div><span className="study-modal-kicker">DOCUMENT REFERENCE</span><h2 id="info-heading">{title}</h2></div><button className="study-close" onClick={onClose} aria-label="Close"><X size={17}/></button></header><div className="info-file-card"><FileText size={19}/><div><b>{fileName}</b><span>{detail}</span></div></div><div className="mock-processing-note"><CircleAlert size={15}/><span>{note}</span></div><footer className="study-modal-footer"><button className="study-primary" onClick={onClose}>Done</button></footer></section></div>;
}

function NoteInfoModal({note,onClose}:{note:StudyNote;onClose:()=>void}){
  useModalLifecycle(onClose);
  const statusCopy=note.verificationStatus==="MATCHED"?"This topic is included in your WAEC syllabus.":note.verificationStatus==="POSSIBLE_MATCH"?"The topic was a possible match and was confirmed by the student.":"This note is supplementary and has not been verified as a syllabus topic.";
  return <div className="study-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="study-modal info-modal" role="dialog" aria-modal="true" aria-labelledby="note-info-heading"><header className="study-modal-header compact-header"><div><span className="study-modal-kicker">STUDY NOTE</span><h2 id="note-info-heading">{note.title}</h2></div><button className="study-close" onClick={onClose} aria-label="Close"><X size={17}/></button></header><div className="info-file-card"><FileText size={19}/><div><b>{note.fileName}</b><span>{note.fileType} · Added {note.uploadedAt}</span></div><StatusBadge status={note.verificationStatus}/></div><div className="note-detail-field"><span>Selected topic</span><b>{note.selectedTopic}</b></div>{note.description&&<div className="note-detail-field"><span>Description</span><p>{note.description}</p></div>}<div className="verification-panel is-neutral"><CheckCircle2 size={16}/><div><b>{note.verificationStatus.replace("_"," ")}</b><span>{statusCopy}</span></div></div><p className="mock-disclosure"><CircleAlert size={14}/>Document contents are not stored or processed in this prototype.</p><footer className="study-modal-footer"><button className="study-primary" onClick={onClose}>Done</button></footer></section></div>;
}

function useModalLifecycle(onClose:()=>void){
  useEffect(()=>{const handle=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose();};window.addEventListener("keydown",handle);document.body.classList.add("modal-open");return()=>{window.removeEventListener("keydown",handle);document.body.classList.remove("modal-open");};},[onClose]);
}

export function createWorkspaceFromFiles({subject,syllabusFile,noteFile,noteTitle,noteTopicId}:CreatePayload,studentId="demo-student"):WorkspaceModel{
  const now=formatUploadDate();const topics=getMockSyllabusTopics(subject);const firstTopic=topics.find(topic=>topic.id===noteTopicId)??topics[0];const verification=verifyTopicAgainstSyllabus(firstTopic.title,topics);
  const firstNote:StudyNote={id:createId("note"),title:noteTitle,fileName:noteFile.name,fileType:fileType(noteFile),uploadedAt:now,selectedTopic:firstTopic.title,topicId:firstTopic.id,description:"",verificationStatus:"MATCHED",confidence:verification.confidence,matchedSyllabusTopicId:firstTopic.id,suggestedTopicId:null,verificationMessage:"This topic is included in your WAEC syllabus."};
  return{id:createId("workspace"),studentId,subjectId:subject.toLowerCase().replace(/[^a-z0-9]+/g,"-"),subject,syllabusDocument:{id:createId("syllabus"),fileName:syllabusFile.name,fileType:"PDF",uploadedAt:now,processingStatus:"MOCK_RESULTS"},topics,notes:[firstNote],createdAt:now,updatedAt:now};
}

export function addNoteToWorkspace(workspace:WorkspaceModel,payload:NotePayload):WorkspaceModel{
  const now=formatUploadDate();const note:StudyNote={id:createId("note"),title:payload.title,fileName:payload.file.name,fileType:fileType(payload.file),uploadedAt:now,selectedTopic:payload.selectedTopic,topicId:payload.topicId,description:payload.description,verificationStatus:payload.status,confidence:payload.confidence,matchedSyllabusTopicId:payload.matchedTopicId,suggestedTopicId:payload.suggestedTopicId,verificationMessage:payload.message};
  return{...workspace,notes:[note,...workspace.notes],updatedAt:now};
}

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownToLine, ArrowLeft, Bell, BookOpen, BookText, BriefcaseBusiness,
  CalendarDays, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Clock3,
  File, FileCheck2, FileText, FlaskConical, GraduationCap, Home, Languages,
  LayoutDashboard, LockKeyhole, LogOut, Mail, MoreHorizontal, Search, Settings,
  ShieldCheck, SlidersHorizontal, Sparkles, Upload, UserRound, Users, X, Eye, EyeOff,
  Calculator, Atom, Landmark, Leaf, Globe2, BookMarked, ClipboardList, Plus,
} from "lucide-react";
import { StudyWorkspace as WorkspaceModel, verifyTopicAgainstSyllabus, getMockSyllabusTopics } from "@/lib/study-workspaces";
import { addNoteToWorkspace, createWorkspaceFromFiles, CreateStudyModal, StudyWorkspaceView } from "@/components/study/StudyWorkspace";

type Role = "student" | "teacher";
type PageId = "Dashboard" | "My Subjects" | "Past Questions" | "Syllabus" | "My Materials" | "History" | "Notifications" | "General Settings";
type DialogKind = "practice" | "upload" | null;
const teacherActions: { icon: typeof Home; label: string }[] = [
  { icon: BookText, label: "Upload Past Questions" }, { icon: GraduationCap, label: "Upload Syllabus" },
  { icon: BookOpen, label: "Manage Subjects" }, { icon: FileText, label: "View Uploaded Materials" },
];

const studentNav: { label: PageId; icon: typeof Home }[] = [
  { label: "Dashboard", icon: Home }, { label: "My Subjects", icon: BookOpen },
  { label: "Past Questions", icon: BookText }, { label: "Syllabus", icon: GraduationCap },
  { label: "My Materials", icon: BriefcaseBusiness },
];
const teacherNav: { label: PageId; icon: typeof Home }[] = [
  { label: "Dashboard", icon: Home }, { label: "Past Questions", icon: BookText },
  { label: "Syllabus", icon: GraduationCap }, { label: "My Subjects", icon: BookOpen },
  { label: "My Materials", icon: BriefcaseBusiness },
];
const subjects = [
  { name: "English Language", topics: 18, resources: 24, icon: Languages },
  { name: "Mathematics", topics: 22, resources: 31, icon: Calculator },
  { name: "Biology", topics: 16, resources: 19, icon: Leaf },
  { name: "Chemistry", topics: 15, resources: 18, icon: FlaskConical },
  { name: "Physics", topics: 17, resources: 16, icon: Atom },
  { name: "Agricultural Science", topics: 14, resources: 12, icon: Leaf },
  { name: "Economics", topics: 13, resources: 15, icon: Activity },
  { name: "Government", topics: 12, resources: 11, icon: Landmark },
  { name: "Literature in English", topics: 14, resources: 13, icon: BookMarked },
  { name: "Geography", topics: 16, resources: 14, icon: Globe2 },
  { name: "Commerce", topics: 13, resources: 10, icon: BriefcaseBusiness },
  { name: "Accounting", topics: 18, resources: 17, icon: ClipboardList },
];
const questions = [
  { subject: "Mathematics", year: "2024", type: "WASSCE", paper: "Paper 2 · Theory", scheme: "Available", date: "12 Oct 2025" },
  { subject: "English Language", year: "2024", type: "WASSCE", paper: "Paper 1 · Objective", scheme: "Available", date: "08 Oct 2025" },
  { subject: "Biology", year: "2023", type: "WASSCE", paper: "Paper 2 · Theory", scheme: "Available", date: "02 Oct 2025" },
  { subject: "Chemistry", year: "2023", type: "WASSCE", paper: "Paper 1 · Objective", scheme: "Pending", date: "28 Sep 2025" },
  { subject: "Physics", year: "2022", type: "WASSCE", paper: "Paper 2 · Theory", scheme: "Available", date: "19 Sep 2025" },
  { subject: "Economics", year: "2022", type: "WASSCE", paper: "Paper 2 · Theory", scheme: "Available", date: "12 Sep 2025" },
];
const syllabuses = [
  { subject: "Mathematics", body: "WAEC", year: "2025–2029", sections: 8, topics: 46, updated: "12 Oct 2025" },
  { subject: "English Language", body: "WAEC", year: "2025–2029", sections: 6, topics: 32, updated: "10 Oct 2025" },
  { subject: "Biology", body: "WAEC", year: "2025–2029", sections: 7, topics: 41, updated: "02 Oct 2025" },
  { subject: "Chemistry", body: "WAEC", year: "2025–2029", sections: 6, topics: 37, updated: "28 Sep 2025" },
  { subject: "Physics", body: "WAEC", year: "2025–2029", sections: 7, topics: 39, updated: "19 Sep 2025" },
];
const materials = [
  { name: "Algebra revision notes.pdf", subject: "Mathematics", topic: "Algebra", date: "12 Oct 2025", size: "2.4 MB", kind: "PDF" },
  { name: "Cell structure summary.pdf", subject: "Biology", topic: "Cell Biology", date: "10 Oct 2025", size: "1.8 MB", kind: "PDF" },
  { name: "Acids and bases notes.pdf", subject: "Chemistry", topic: "Inorganic Chemistry", date: "08 Oct 2025", size: "3.1 MB", kind: "PDF" },
  { name: "Comprehension practice.docx", subject: "English Language", topic: "Comprehension", date: "04 Oct 2025", size: "860 KB", kind: "DOC" },
  { name: "Motion and forces.pdf", subject: "Physics", topic: "Mechanics", date: "01 Oct 2025", size: "2.0 MB", kind: "PDF" },
];
const activityItems = [
  ["Opened Biology syllabus", "Reviewed Cell Structure and Organisation", "Today, 10:42 AM", "Syllabus"],
  ["Viewed Mathematics past questions", "Opened the 2024 WASSCE Paper 2", "Today, 9:18 AM", "Past questions"],
  ["Uploaded Chemistry notes", "Acids and Bases revision notes.pdf", "Yesterday, 4:36 PM", "Materials"],
  ["Completed a practice activity", "Mathematics · Algebra · 18/20 correct", "Yesterday, 2:11 PM", "Practice"],
  ["Opened English Language syllabus", "Reviewed Comprehension", "06 Oct 2025, 11:08 AM", "Syllabus"],
];
const notificationsSeed = [
  { title: "New Mathematics past questions available", body: "The 2024 WASSCE Paper 2 has been added to your library.", time: "Today · 9:15 AM", unread: true },
  { title: "Biology syllabus updated", body: "A new revision to the Cell Biology section is ready to view.", time: "Yesterday · 3:40 PM", unread: true },
  { title: "Your study material was uploaded successfully", body: "Algebra revision notes.pdf is now in My Materials.", time: "08 Oct · 11:22 AM", unread: false },
  { title: "New revision materials available", body: "Explore recently added resources for English Language.", time: "06 Oct · 8:00 AM", unread: false },
];

function DocumentArt({ tone = "" }: { tone?: string }) {
  return <div className={`document-art ${tone}`} aria-hidden="true"><span className="fold" /><span className="doc-lines"><i /><i /><i /><i /><i /><i /></span></div>;
}

function AppSidebar({ role, page, onNavigate, onRole, onSignOut, unread }: {
  role: Role; page: PageId; onNavigate: (p: PageId) => void; onRole: (r: Role) => void; onSignOut: () => void; unread: number;
}) {
  const [filter, setFilter] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const nav = role === "student" ? studentNav : teacherNav;
  const visibleNav = nav.filter(item => item.label.toLowerCase().includes(filter.toLowerCase()));
  const secondary: { label: PageId; icon: typeof Home }[] = [{ label: "History", icon: Clock3 }, { label: "Notifications", icon: Bell }];
  return <aside className="sidebar">
    <button className="brand" onClick={() => onNavigate("Dashboard")}><span className="brand-mark"><BookOpen size={17} fill="currentColor" /></span><span>WAEC Prep</span></button>
    <label className="search"><Search size={15} /><input aria-label="Filter navigation" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search" /></label>
    <p className="nav-caption section-caption">Main</p>
    <nav className="nav-main" aria-label="Main navigation">{visibleNav.map(({ label, icon: Icon }) => <button className={`nav-link ${page === label ? "active" : ""}`} onClick={() => onNavigate(label)} key={label}><Icon size={16} strokeWidth={1.7} /><span>{label === "My Subjects" && role === "teacher" ? "Subjects" : label === "My Materials" && role === "teacher" ? "Uploaded Materials" : label}</span></button>)}</nav>
    <p className="nav-caption other-caption">Other</p>
    <nav className="nav-secondary" aria-label="Other navigation">{secondary.map(({ label, icon: Icon }) => <button className={`nav-link ${page === label ? "active" : ""}`} onClick={() => onNavigate(label)} key={label}><Icon size={16} strokeWidth={1.7} /><span>{label}</span>{label === "Notifications" && unread > 0 && <b className="nav-unread" />}</button>)}</nav>
    <div className="settings-group"><p className="nav-caption">Settings</p><button className={`nav-link ${page === "General Settings" ? "active" : ""}`} onClick={() => onNavigate("General Settings")}><Settings size={16} strokeWidth={1.7} /><span>General Settings</span></button></div>
    <div className="profile-wrap"><button className="profile" onClick={() => setProfileOpen(!profileOpen)} aria-expanded={profileOpen}><div className="avatar"><UserRound size={15} /></div><span>{role === "student" ? "Student Account" : "Teacher Account"}</span><ChevronDown className="profile-chevron" size={15} /></button>
      {profileOpen && <div className="profile-menu"><button onClick={() => { onRole(role === "student" ? "teacher" : "student"); setProfileOpen(false); onNavigate("Dashboard"); }}><Users size={15} />Switch to {role === "student" ? "teacher" : "student"} demo</button><button onClick={() => { setProfileOpen(false); onSignOut(); }}><LogOut size={15} />Sign out</button></div>}
    </div>
  </aside>;
}

function Metric({ icon: Icon, label, score, change, tone }: { icon: typeof Home; label: string; score: string; change: string; tone: string }) {
  return <article className="metric"><div className="metric-label"><Icon size={15} strokeWidth={1.8} /><span>{label}</span></div><div className="metric-score"><i className={tone} /><strong>{score}</strong></div><p>{change}</p></article>;
}

function DashboardView({ role, onDialog, onNavigate, workspaces, onOpenWorkspace, onCreateWorkspace }: { role: Role; onDialog: (d: DialogKind) => void; onNavigate: (p: PageId) => void; workspaces: WorkspaceModel[]; onOpenWorkspace: (id:string)=>void; onCreateWorkspace:()=>void }) {
  const isTeacher = role === "teacher";
  const metrics = isTeacher ? [
    [BookOpen, "Total Subjects", "12", "Across your learning library", "green"],
    [BookText, "Past Questions", "48", "+6 uploaded this month", "blue"],
    [GraduationCap, "Syllabuses", "12", "All core subjects covered", "green"],
    [FileText, "Study Materials", "36", "+4 uploaded this month", "red"],
  ] as const : [
    [Activity, "Overall Performance", "78%", "+6% from last week", "green"],
    [Calculator, "Mathematics", "82%", "+4% from last week", "blue"],
    [Languages, "English Language", "74%", "+2% from last week", "red"],
    [FlaskConical, "Biology", "76%", "+5% from last week", "green"],
  ] as const;
  const plan = [{ title: "Mathematics – Algebra", detail: "Practice equations" }, { title: "Biology – Cell Structure", detail: "Review 12 key terms" }, { title: "Chemistry – Acids & Bases", detail: "Read your study notes" }, { title: "English – Comprehension", detail: "Complete one passage" }];
  return <div className="dashboard-content">
    <section className="welcome"><div><h1>Welcome back, {isTeacher ? "Teacher" : "Student"}</h1><p>{isTeacher ? "Manage your educational resources and support your students’ preparation." : "Every study session brings you closer to your WAEC goal."}</p></div><div className="welcome-actions">{!isTeacher && <button className="primary-button" onClick={() => onDialog("upload")}><Upload size={16} />Upload Study Material</button>}{isTeacher && <button className="primary-button" onClick={() => onDialog("upload")}><Upload size={16} />Upload a resource</button>}</div></section>
    <section className="performance"><h2>{isTeacher ? "Teaching Overview" : "Performance Overview"} <CircleHelp size={14} /></h2><div className="metrics-grid">{metrics.map(([icon, label, score, change, tone]) => <Metric key={label} icon={icon} label={label} score={score} change={change} tone={tone} />)}</div></section>
    {isTeacher ? <>
      <section className="teacher-quick"><div className="section-heading"><h2>Quick Actions</h2><span>Manage your learning resources</span></div><div className="quick-grid">{teacherActions.map(({icon:Icon,label}) => <button className="quick-action" key={label} onClick={() => label === "Manage Subjects" ? onNavigate("My Subjects") : label === "View Uploaded Materials" ? onNavigate("My Materials") : onDialog("upload")}><Icon size={17}/><span>{label}</span><ChevronRight size={15}/></button>)}</div></section>
      <section className="recent-section"><h2>Recent Uploads</h2><div className="activity-list">{materials.slice(0,3).map((item,i)=><ActivityRow key={item.name} title={`${item.subject} ${i===0?"past questions":i===1?"syllabus":"study materials"}`} detail={`${item.name} · Added ${item.date}`} onMore={()=>onDialog("upload")} />)}</div></section>
    </> : <>
      <section className="study-section"><h2>Your Weekly Study Plan <CircleHelp size={14} /></h2><div className="study-grid">{plan.map((item,i)=><article className="study-item" key={item.title}><DocumentArt tone={`tone-${i+1}`} /><h3>{item.title}</h3><p>{item.detail}</p></article>)}</div></section>
      {workspaces.length>0&&<section className="my-workspaces-section"><div className="section-heading"><h2>My Study Workspaces</h2><button className="text-link" onClick={onCreateWorkspace}><Plus size={14}/>Create another study</button></div><div className="workspace-shortcuts">{workspaces.map(w=><button className="workspace-shortcut" key={w.id} onClick={()=>onOpenWorkspace(w.id)}><span className="shortcut-icon"><BookOpen size={17}/></span><span><b>{w.subject} Study Workspace</b><small>{w.notes.length} study {w.notes.length===1?"note":"notes"} · Updated {w.updatedAt}</small></span><ChevronRight size={16}/></button>)}</div></section>}
      <section className="recent-section"><h2>Recent Activities</h2><div className="activity-list">{[["Mathematics – Algebra Practice","Completed 20 questions · 18 correct"],["Biology – Cell Biology Revision","Reviewed Cell Structure study material"],["English Language – Comprehension Practice","Completed a WAEC past question"]].map(([title,detail])=><ActivityRow key={title} title={title} detail={detail} onMore={()=>onNavigate("History")} />)}</div></section>
    </>}
  </div>;
}

function ActivityRow({ title, detail, onMore }: { title: string; detail: string; onMore: () => void }) {
  const [open, setOpen] = useState(false);
  return <article className="activity-row"><FileText size={16} strokeWidth={1.8} /><div className="activity-copy"><h3>{title}</h3><p>{detail}</p></div><div className="row-menu-wrap"><button className="more-button" aria-label={`More options for ${title}`} onClick={() => setOpen(!open)}><MoreHorizontal size={18} /></button>{open && <div className="row-menu"><button onClick={()=>{onMore();setOpen(false);}}>View details</button><button onClick={()=>{setOpen(false);}}>Dismiss</button></div>}</div></article>;
}

function PageTitle({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return <div className="page-title"><div><h1>{title}</h1><p>{text}</p></div>{action}</div>;
}

function LibraryPage({ page, role, onDialog, workspaces, onOpenWorkspace, onCreateWorkspace }: { page: PageId; role: Role; onDialog: (d: DialogKind) => void; workspaces: WorkspaceModel[]; onOpenWorkspace: (id:string)=>void; onCreateWorkspace:(subject?:string)=>void }) {
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("All subjects");
  const [yearFilter, setYearFilter] = useState("All years");
  const teacher = role === "teacher";
  const action = <button className="primary-button" onClick={() => onDialog("upload")}><Upload size={15} />{teacher ? `Upload ${page === "Past Questions" ? "Past Questions" : page === "Syllabus" ? "Syllabus" : "Material"}` : "Add study material"}</button>;
  if (page === "My Subjects") return <div className="page-content"><PageTitle title={teacher ? "Subjects" : "My Subjects"} text={teacher ? "Organise the subjects and resources you teach." : "Browse your WAEC subjects and keep track of your progress."} action={teacher ? <button className="secondary-button" onClick={()=>onDialog("upload")}><Sparkles size={15}/>Manage subjects</button> : <button className="primary-button" onClick={()=>onCreateWorkspace()}><Plus size={15}/>Create a New Study</button>}/>{!teacher&&<div className="subject-search-row"><label className="table-search"><Search size={15}/><input placeholder="Search your subjects" value={search} onChange={e=>setSearch(e.target.value)}/></label><span>{workspaces.length} study {workspaces.length===1?"workspace":"workspaces"}</span></div>}<div className="subject-grid">{subjects.filter(s=>s.name.toLowerCase().includes(search.toLowerCase())).map((s,i)=>{const Icon=s.icon;const workspace=workspaces.find(w=>w.subject===s.name);return <article className="subject-card" key={s.name}><div className="subject-icon"><Icon size={18}/></div><div className="subject-card-head"><h3>{s.name}</h3><button aria-label={`Options for ${s.name}`} onClick={()=>teacher?onDialog("upload"):workspace?onOpenWorkspace(workspace.id):onCreateWorkspace(s.name)}><MoreHorizontal size={18}/></button></div><p>{s.topics} topics <span>·</span> {s.resources} resources</p>{!teacher&&<div className="progress-line"><i style={{width:`${[68,54,42,37,25,18,30,22,17,26,15,32][i]}%`}}/></div>}<button className="text-link" onClick={()=>teacher?onDialog("practice"):workspace?onOpenWorkspace(workspace.id):onCreateWorkspace(s.name)}>{teacher?"Open subject":workspace?"Open study workspace":"Create study workspace"}<ChevronRight size={14}/></button></article>;})}</div></div>;
  if (page === "Past Questions") {
    const list=questions.filter(q=>(subjectFilter==="All subjects"||q.subject===subjectFilter)&&(yearFilter==="All years"||q.year===yearFilter)&&`${q.subject} ${q.year} ${q.paper}`.toLowerCase().includes(search.toLowerCase()));
    return <div className="page-content"><PageTitle title="Past Questions" text={teacher?"Manage past examination papers for your students.":"Explore WAEC past papers by subject and year."} action={teacher?action:<button className="primary-button" onClick={()=>onDialog("practice")}><ClipboardList size={15}/>Take a practice test</button>}/><div className="library-toolbar"><label className="table-search"><Search size={15}/><input placeholder="Search questions" value={search} onChange={e=>setSearch(e.target.value)}/></label><label className="select-wrap"><SlidersHorizontal size={14}/><select value={subjectFilter} onChange={e=>setSubjectFilter(e.target.value)}><option>All subjects</option>{subjects.map(s=><option key={s.name}>{s.name}</option>)}</select></label><label className="select-wrap"><CalendarDays size={14}/><select value={yearFilter} onChange={e=>setYearFilter(e.target.value)}><option>All years</option>{["2024","2023","2022"].map(y=><option key={y}>{y}</option>)}</select></label></div><div className="table-wrap"><table><thead><tr><th>Subject</th><th>Year</th><th>Exam type</th><th>Paper</th><th>Marking scheme</th><th>Uploaded</th><th></th></tr></thead><tbody>{list.map((q,i)=><tr key={`${q.subject}-${q.year}`}><td><span className="table-primary">{q.subject}</span></td><td>{q.year}</td><td>{q.type}</td><td>{q.paper}</td><td><span className={`status-pill ${q.scheme==="Available"?"ok":"pending"}`}>{q.scheme}</span></td><td>{q.date}</td><td><button className="row-action" onClick={()=>onDialog("practice")}>{teacher?"Edit":"View"}<ChevronRight size={13}/></button></td></tr>)}</tbody></table>{list.length===0&&<div className="empty-state">No past questions match these filters.</div>}</div><div className="mobile-records">{list.map(q=><article className="record-card" key={`${q.subject}-${q.year}`}><div><b>{q.subject}</b><span>{q.year} · {q.type}</span></div><p>{q.paper} <span className={`status-pill ${q.scheme==="Available"?"ok":"pending"}`}>{q.scheme}</span></p><button className="row-action" onClick={()=>onDialog("practice")}>{teacher?"Edit":"View paper"}<ChevronRight size={13}/></button></article>)}</div></div>;
  }
  if (page === "Syllabus") {
    const list=syllabuses.filter(s=>(subjectFilter==="All subjects"||s.subject===subjectFilter)&&`${s.subject} ${s.body}`.toLowerCase().includes(search.toLowerCase()));
    return <div className="page-content"><PageTitle title="Syllabus" text={teacher?"Keep subject syllabuses accurate and up to date.":"Explore the topics and learning objectives for each subject."} action={teacher?action:undefined}/><div className="library-toolbar"><label className="table-search"><Search size={15}/><input placeholder="Search syllabus" value={search} onChange={e=>setSearch(e.target.value)}/></label><label className="select-wrap"><SlidersHorizontal size={14}/><select value={subjectFilter} onChange={e=>setSubjectFilter(e.target.value)}><option>All subjects</option>{subjects.map(s=><option key={s.name}>{s.name}</option>)}</select></label></div><div className="table-wrap"><table><thead><tr><th>Subject</th><th>Exam body</th><th>Years</th><th>Sections</th><th>Topics</th><th>Last updated</th><th></th></tr></thead><tbody>{list.map(s=><tr key={s.subject}><td><span className="table-primary">{s.subject}</span></td><td>{s.body}</td><td>{s.year}</td><td>{s.sections}</td><td>{s.topics}</td><td>{s.updated}</td><td><button className="row-action" onClick={()=>onDialog("practice")}>View syllabus<ChevronRight size={13}/></button></td></tr>)}</tbody></table></div><div className="mobile-records">{list.map(s=><article className="record-card" key={s.subject}><div><b>{s.subject}</b><span>{s.body} · {s.year}</span></div><p>{s.sections} sections · {s.topics} topics</p><button className="row-action" onClick={()=>onDialog("practice")}>View syllabus<ChevronRight size={13}/></button></article>)}</div></div>;
  }
  if (page === "My Materials") {
    const list=materials.filter(m=>`${m.name} ${m.subject} ${m.topic}`.toLowerCase().includes(search.toLowerCase()));
    return <div className="page-content"><PageTitle title={teacher?"Uploaded Materials":"My Materials"} text={teacher?"Review the learning resources you have shared.":"Your personal collection of study notes and revision resources."} action={action}/><div className="library-toolbar"><label className="table-search"><Search size={15}/><input placeholder="Search materials" value={search} onChange={e=>setSearch(e.target.value)}/></label><label className="select-wrap"><SlidersHorizontal size={14}/><select><option>All file types</option><option>PDF</option><option>DOC</option></select></label></div><div className="table-wrap"><table><thead><tr><th>File name</th><th>Subject</th><th>Topic</th><th>Type</th><th>Uploaded</th><th>Size</th><th></th></tr></thead><tbody>{list.map(m=><tr key={m.name}><td><span className="file-name"><FileText size={16}/>{m.name}</span></td><td>{m.subject}</td><td>{m.topic}</td><td>{m.kind}</td><td>{m.date}</td><td>{m.size}</td><td><button className="icon-button" aria-label={`Download ${m.name}`} onClick={()=>window.alert("Demo only: the sample file is not attached for download.")}><ArrowDownToLine size={16}/></button></td></tr>)}</tbody></table></div><div className="mobile-records">{list.map(m=><article className="record-card" key={m.name}><div className="file-name"><FileText size={16}/><b>{m.name}</b></div><p>{m.subject} · {m.topic}</p><span className="record-muted">{m.kind} · {m.date} · {m.size}</span><button className="row-action" onClick={()=>window.alert("Demo only: the sample file is not attached for download.")}>Download<ArrowDownToLine size={14}/></button></article>)}</div></div>;
  }
  return null;
}

function HistoryPage() {
  return <div className="page-content"><PageTitle title="History" text="A record of your recent learning activity."/><div className="history-list">{activityItems.map(([title,detail,time,kind])=><article className="history-row" key={title}><div className="history-icon"><Clock3 size={16}/></div><div className="activity-copy"><h3>{title}</h3><p>{detail}</p></div><span className="history-kind">{kind}</span><time>{time}</time></article>)}</div></div>;
}

function NotificationsPage({ items, onRead, onAllRead }: { items: typeof notificationsSeed; onRead: (i:number)=>void; onAllRead:()=>void }) {
  return <div className="page-content"><PageTitle title="Notifications" text="Updates and reminders to help you stay on track." action={<button className="secondary-button" onClick={onAllRead}><Check size={15}/>Mark all as read</button>}/><div className="notification-list">{items.map((n,i)=><article className={`notification-row ${n.unread?"unread":""}`} key={n.title}><span className="notification-dot"/><div className="activity-copy"><h3>{n.title}</h3><p>{n.body}</p><time>{n.time}</time></div>{n.unread&&<button className="text-link" onClick={()=>onRead(i)}>Mark read</button>}</article>)}</div></div>;
}

function SettingsPage({ role }: { role: Role }) {
  const [toggles,setToggles]=useState([true,true,false]);
  const [feedback,setFeedback]=useState("");
  return <div className="page-content"><PageTitle title="General Settings" text="Manage your account and application preferences."/>{feedback&&<p className="demo-feedback">{feedback}</p>}<div className="settings-layout"><section className="settings-panel"><div className="settings-panel-heading"><div><h2>Profile information</h2><p>Update your name and contact details.</p></div><button className="secondary-button" onClick={()=>setFeedback("Profile editing is a frontend demo; changes are not saved.")}>Edit profile</button></div><div className="profile-fields"><label>Full name<input defaultValue={role==="student"?"Student Account":"Teacher Account"}/></label><label>Email address<input defaultValue={role==="student"?"student@example.com":"teacher@example.com"}/></label><label>Account type<input value={role==="student"?"Student":"Teacher"} readOnly/></label></div></section><section className="settings-panel"><div className="settings-panel-heading"><div><h2>Account preferences</h2><p>Choose how you want to use WAEC Prep.</p></div></div><div className="setting-item"><div><b>Dark appearance</b><span>Use the dark theme across the app.</span></div><span className="fixed-toggle">On</span></div><div className="setting-item"><div><b>Email study reminders</b><span>Receive a reminder for your weekly study plan.</span></div><Toggle value={toggles[0]} onClick={()=>setToggles(t=>t.map((v,i)=>i===0?!v:v))}/></div><div className="setting-item"><div><b>New resource notifications</b><span>Get updates when materials are added.</span></div><Toggle value={toggles[1]} onClick={()=>setToggles(t=>t.map((v,i)=>i===1?!v:v))}/></div><div className="setting-item"><div><b>Weekly progress summary</b><span>Receive a summary of your learning progress.</span></div><Toggle value={toggles[2]} onClick={()=>setToggles(t=>t.map((v,i)=>i===2?!v:v))}/></div></section><section className="settings-panel security-panel"><div className="settings-panel-heading"><div><h2>Password & security</h2><p>Keep your account secure.</p></div><button className="secondary-button" onClick={()=>setFeedback("Password updates are not connected in this demo.")}><LockKeyhole size={14}/>Change password</button></div><div className="security-note"><ShieldCheck size={17}/><span>Demo account security settings are for display only.</span></div></section></div></div>;
}

function Toggle({ value, onClick }: { value: boolean; onClick:()=>void }) { return <button className={`toggle ${value?"on":""}`} role="switch" aria-checked={value} onClick={onClick}><i/></button>; }

function PracticeModal({ onClose }: { onClose:()=>void }) {
  const [message,setMessage]=useState("");
  useEffect(()=>{const handle=(e:KeyboardEvent)=>{if(e.key==="Escape")onClose();};window.addEventListener("keydown",handle);document.body.classList.add("modal-open");return()=>{window.removeEventListener("keydown",handle);document.body.classList.remove("modal-open");};},[onClose]);
  const criteria=[["Number of Questions","40 multiple-choice and structured questions"],["Duration","1 hour 30 minutes"],["Topics Covered","Algebra, geometry, statistics and number"],["Examination Format","WAEC-style practice questions"]];
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="practice-modal" role="dialog" aria-modal="true" aria-labelledby="practice-title"><div className="modal-banner"><button className="modal-close-icon" onClick={onClose} aria-label="Close dialog"><X size={17}/></button></div><div className="modal-body"><h2 id="practice-title">WAEC Mathematics Practice Test</h2><p className="modal-description">This practice test helps you assess your understanding of Mathematics topics covered in the WAEC syllabus.</p><h3>Test information</h3><ul className="assessment-list">{criteria.map(([title,desc])=><li key={title}><CheckCircle2 size={16}/><div><b>{title}</b><span>{desc}</span></div></li>)}</ul>{message&&<p className="demo-feedback">{message}</p>}<div className="modal-footer"><button className="modal-secondary" onClick={onClose}>Close</button><button className="modal-primary" onClick={()=>setMessage("Demo only: the practice test player is not part of this UI phase.")}>Start Practice Test</button></div></div></section></div>;
}

function UploadModal({ onClose, role }: { onClose:()=>void; role:Role }) {
  const [sent,setSent]=useState(false);
  useEffect(()=>{const handle=(e:KeyboardEvent)=>{if(e.key==="Escape")onClose();};window.addEventListener("keydown",handle);document.body.classList.add("modal-open");return()=>{window.removeEventListener("keydown",handle);document.body.classList.remove("modal-open");};},[onClose]);
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="upload-modal" role="dialog" aria-modal="true" aria-labelledby="upload-title"><div className="upload-modal-head"><h2 id="upload-title">{sent?"Demo upload complete":"Upload study material"}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X size={17}/></button></div>{sent?<div className="upload-success"><span><Check size={22}/></span><p>Demo complete. No file was sent or stored.</p><button className="primary-button" onClick={onClose}>Done</button></div>:<><p className="upload-intro">Add a resource to your {role==="teacher"?"class library":"personal study library"}. This is a frontend demonstration; no file is sent or stored.</p><label className="upload-drop"><Upload size={22}/><b>Choose a file to upload</b><span>PDF or DOCX · up to 20 MB</span><input type="file" accept=".pdf,.doc,.docx" onChange={e=>e.currentTarget.dataset.selected=e.target.files?.[0]?.name??""}/></label><div className="profile-fields"><label>Subject<select defaultValue="Mathematics">{subjects.map(s=><option key={s.name}>{s.name}</option>)}</select></label><label>Topic<input placeholder="e.g. Algebra"/></label></div><div className="modal-footer"><button className="modal-secondary" onClick={onClose}>Cancel</button><button className="modal-primary" onClick={()=>setSent(true)}>Add to materials</button></div></>}</section></div>;
}

function AuthScreen({ onEnter }: { onEnter:(r:Role)=>void }) {
  const [role,setRole]=useState<Role>("student"); const [mode,setMode]=useState<"signin"|"signup"|"forgot">("signin"); const [show,setShow]=useState(false); const [loading,setLoading]=useState(false); const [notice,setNotice]=useState("");
  const submit=(e:React.FormEvent)=>{e.preventDefault();setLoading(true);setNotice("");window.setTimeout(()=>{setLoading(false);if(mode==="forgot"){setNotice("If the address is registered, a password reset link will be sent.");}else{onEnter(role);}},450);};
  return <main className="auth-shell"><section className="auth-card"><div className="auth-brand"><span className="brand-mark"><BookOpen size={18} fill="currentColor"/></span>WAEC Prep</div><div className="auth-heading"><h1>{mode==="forgot"?"Reset your password":mode==="signup"?`Create your ${role} account`:role==="teacher"?"Welcome back, Teacher":"Welcome back"}</h1><p>{mode==="forgot"?"Enter your email and we’ll send a reset link.":mode==="signup"?"Create an account to get started with WAEC Prep.":role==="teacher"?"Manage learning materials and help students prepare for their examinations.":"Continue your WAEC preparation and stay on track towards your goals."}</p></div>
    {mode!=="forgot"&&<div className="role-selector" role="tablist" aria-label="Choose account type">{(["student","teacher"] as Role[]).map(r=><button className={role===r?"selected":""} onClick={()=>setRole(r)} key={r}>{r==="student"?<GraduationCap size={15}/>:<Users size={15}/>}<span>{r[0].toUpperCase()+r.slice(1)}</span></button>)}</div>}
    {notice&&<div className="auth-notice"><CheckCircle2 size={16}/>{notice}</div>}
    <form className="auth-form" onSubmit={submit}>{mode==="signup"&&<label>Full name<input required autoComplete="name" placeholder="Your name"/></label>}<label>Email address<span className="auth-input"><Mail size={15}/><input required type="email" autoComplete="email" placeholder="you@example.com"/></span></label>{mode!=="forgot"&&<label>Password<span className="auth-input"><LockKeyhole size={15}/><input required minLength={6} type={show?"text":"password"} autoComplete={mode==="signup"?"new-password":"current-password"} placeholder="Enter your password"/><button type="button" aria-label={show?"Hide password":"Show password"} onClick={()=>setShow(!show)}>{show?<EyeOff size={15}/>:<Eye size={15}/>}</button></span></label>}{mode==="signin"&&<div className="auth-options"><label className="remember"><input type="checkbox" defaultChecked/>Remember me</label><button type="button" className="inline-link" onClick={()=>{setMode("forgot");setNotice("")}}>Forgot password?</button></div>}<button className="auth-submit" disabled={loading}>{loading?"Please wait…":mode==="forgot"?"Send reset link":mode==="signup"?"Create account":"Sign in"}</button></form>
    <p className="auth-switch">{mode==="signin"?"New to WAEC Prep? ":mode==="signup"?"Already have an account? ":"Remembered your password? "}<button className="inline-link" onClick={()=>{setMode(mode==="signin"?"signup":"signin");setNotice(mode==="forgot"?"":"")}}>{mode==="signin"?"Create an account":"Sign in"}</button></p><div className="auth-divider"><span>OR</span></div><button className="demo-access" onClick={()=>onEnter(role)}><Sparkles size={15}/>Continue with {role} demo access</button><p className="demo-credentials">Demo sign-in: use any valid email and a password of 6+ characters.</p></section><footer className="auth-foot">A focused place to prepare for your WAEC examinations.</footer></main>;
}

export default function HomePage() {
  const [role,setRole]=useState<Role>("student"); const [page,setPage]=useState<PageId>("Dashboard"); const [dialog,setDialog]=useState<DialogKind>(null); const [authenticated,setAuthenticated]=useState(true); const [notifications,setNotifications]=useState(notificationsSeed);
  const [workspaces,setWorkspaces]=useState<WorkspaceModel[]>([]); const [storageLoaded,setStorageLoaded]=useState(false); const [selectedWorkspaceId,setSelectedWorkspaceId]=useState<string|null>(null); const [createStudyOpen,setCreateStudyOpen]=useState(false); const [initialSubject,setInitialSubject]=useState<string|undefined>(undefined);
  useEffect(()=>{try{const raw=window.localStorage.getItem("waec-prep-study-workspaces-v1");if(raw){const parsed=JSON.parse(raw);if(Array.isArray(parsed))setWorkspaces(parsed);}}catch{window.localStorage.removeItem("waec-prep-study-workspaces-v1");}finally{setStorageLoaded(true);}},[]);
  useEffect(()=>{if(storageLoaded){try{window.localStorage.setItem("waec-prep-study-workspaces-v1",JSON.stringify(workspaces));}catch{ /* local prototype storage may be unavailable in private browsing */ }}},[storageLoaded,workspaces]);
  const unread=notifications.filter(n=>n.unread).length;
  const closeDialog=()=>setDialog(null);
  const navigate=(nextPage:PageId)=>{setSelectedWorkspaceId(null);setPage(nextPage);};
  const openCreateStudy=(subject?:string)=>{setInitialSubject(subject);setCreateStudyOpen(true);};
  const openWorkspace=(id:string)=>{setSelectedWorkspaceId(id);setPage("My Subjects");};
  const createWorkspace=(payload:Parameters<typeof createWorkspaceFromFiles>[0])=>{const exists=workspaces.find(w=>w.studentId==="demo-student"&&w.subject===payload.subject);if(exists){setCreateStudyOpen(false);openWorkspace(exists.id);return;}const workspace=createWorkspaceFromFiles(payload);setWorkspaces(list=>[workspace,...list]);setCreateStudyOpen(false);openWorkspace(workspace.id);};
  const addWorkspaceNote=(workspaceId:string,payload:Parameters<typeof addNoteToWorkspace>[1])=>setWorkspaces(list=>list.map(w=>w.id===workspaceId?addNoteToWorkspace(w,payload):w));
  const replaceWorkspaceSyllabus=(workspaceId:string,file:File)=>setWorkspaces(list=>list.map(w=>{if(w.id!==workspaceId)return w;const topics=getMockSyllabusTopics(w.subject);const notes=w.notes.map(note=>{const match=verifyTopicAgainstSyllabus(note.selectedTopic,topics);if(match.status==="MATCHED"&&match.matchedTopic)return{...note,topicId:match.matchedTopic.id,matchedSyllabusTopicId:match.matchedTopic.id,verificationStatus:"MATCHED" as const,confidence:match.confidence,verificationMessage:match.message,suggestedTopicId:null};if(match.status==="POSSIBLE_MATCH")return{...note,topicId:null,matchedSyllabusTopicId:null,verificationStatus:"POSSIBLE_MATCH" as const,confidence:match.confidence,verificationMessage:match.message,suggestedTopicId:match.suggestedTopic?.id??null};return{...note,topicId:null,matchedSyllabusTopicId:null,verificationStatus:"NOT_FOUND" as const,confidence:0,verificationMessage:match.message,suggestedTopicId:null};});return{...w,syllabusDocument:{...w.syllabusDocument,id:`syllabus-${Date.now()}`,fileName:file.name,uploadedAt:new Date().toLocaleDateString("en-NG",{day:"numeric",month:"short",year:"numeric"}),processingStatus:"MOCK_RESULTS" as const},topics,notes,updatedAt:new Date().toLocaleDateString("en-NG",{day:"numeric",month:"short",year:"numeric"})};}));
  const removeWorkspaceNote=(workspaceId:string,noteId:string)=>setWorkspaces(list=>list.map(w=>w.id===workspaceId?{...w,notes:w.notes.filter(n=>n.id!==noteId),updatedAt:new Date().toLocaleDateString("en-NG",{day:"numeric",month:"short",year:"numeric"})}:w));
  const selectedWorkspace=workspaces.find(w=>w.id===selectedWorkspaceId)??null;
  const pageTitle=selectedWorkspace?`${selectedWorkspace.subject} Study Workspace`:page==="My Subjects"&&role==="teacher"?"Subjects":page==="My Materials"&&role==="teacher"?"Uploaded Materials":page;
  const handleDashboardDialog=(kind:DialogKind)=>{if(kind==="upload"&&role==="student")openCreateStudy();else setDialog(kind);};
  return !authenticated?<AuthScreen onEnter={r=>{setRole(r);setPage("Dashboard");setAuthenticated(true);}}/>:<div className="app-shell"><AppSidebar role={role} page={selectedWorkspace?"My Subjects":page} onNavigate={navigate} onRole={r=>{setRole(r);setSelectedWorkspaceId(null);}} onSignOut={()=>setAuthenticated(false)} unread={unread}/><main className="main-area"><header className="topbar"><div className="current-page">{selectedWorkspace?<BookOpen size={15} strokeWidth={1.7}/>:<LayoutDashboard size={15} strokeWidth={1.7}/>}<span>{pageTitle}</span></div><div className="topbar-actions">{role==="student"&&<button className="topbar-test" onClick={()=>setDialog("practice")}><ClipboardList size={15}/>Take a new test</button>}<button className="mobile-avatar" aria-label="Open profile" onClick={()=>navigate("General Settings")}><UserRound size={16}/></button></div></header>
      {selectedWorkspace?<StudyWorkspaceView workspace={selectedWorkspace} onBack={()=>{setSelectedWorkspaceId(null);setPage("My Subjects");}} onAddNote={payload=>addWorkspaceNote(selectedWorkspace.id,payload)} onReplaceSyllabus={file=>replaceWorkspaceSyllabus(selectedWorkspace.id,file)} onDeleteNote={id=>removeWorkspaceNote(selectedWorkspace.id,id)}/>:page==="Dashboard"?<DashboardView role={role} onDialog={handleDashboardDialog} onNavigate={navigate} workspaces={workspaces.filter(w=>w.studentId==="demo-student")} onOpenWorkspace={openWorkspace} onCreateWorkspace={()=>openCreateStudy()}/>:page==="History"?<HistoryPage/>:page==="Notifications"?<NotificationsPage items={notifications} onRead={i=>setNotifications(ns=>ns.map((n,j)=>j===i?{...n,unread:false}:n))} onAllRead={()=>setNotifications(ns=>ns.map(n=>({...n,unread:false})))}/>:page==="General Settings"?<SettingsPage role={role}/>:<LibraryPage page={page} role={role} onDialog={setDialog} workspaces={workspaces.filter(w=>w.studentId==="demo-student")} onOpenWorkspace={openWorkspace} onCreateWorkspace={openCreateStudy}/>}</main>
      {dialog==="practice"&&<PracticeModal onClose={closeDialog}/>} {dialog==="upload"&&<UploadModal onClose={closeDialog} role={role}/>} {createStudyOpen&&<CreateStudyModal onClose={()=>setCreateStudyOpen(false)} onCreate={createWorkspace} initialSubject={initialSubject} existingSubjects={workspaces.filter(w=>w.studentId==="demo-student").map(w=>w.subject)}/>}
    </div>;
}

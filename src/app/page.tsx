import {
  Activity, Bell, BookOpen, BookText, BriefcaseBusiness, ChevronDown,
  ChevronRight, CircleHelp, Clock3, File, FileText, FlaskConical,
  GraduationCap, Home, Languages, LayoutDashboard, MoreHorizontal,
  Search, Settings, Sparkles, Upload, UserRound, Calculator,
} from "lucide-react";

const navMain = [
  { label: "Dashboard", icon: Home, active: true },
  { label: "Past Questions", icon: BookText },
  { label: "Syllabus", icon: GraduationCap },
  { label: "Subjects", icon: BookOpen },
  { label: "My Materials", icon: BriefcaseBusiness },
];

const metrics = [
  { label: "Overall Performance", score: "78%", change: "+6% from last week", color: "green", icon: Activity },
  { label: "Mathematics", score: "82%", change: "+4% from last week", color: "blue", icon: Calculator },
  { label: "English Language", score: "74%", change: "+2% from last week", color: "red", icon: Languages },
  { label: "Biology", score: "76%", change: "+5% from last week", color: "green", icon: FlaskConical },
];

const studyPlan = [
  { title: "Mathematics – Algebra", detail: "Practice equations", tone: "one" },
  { title: "Biology – Cell Structure", detail: "Review 12 key terms", tone: "two" },
  { title: "Chemistry – Acids & Bases", detail: "Read your study notes", tone: "three" },
  { title: "English – Comprehension", detail: "Complete one passage", tone: "four" },
];

const activities = [
  { title: "Mathematics Algebra Practice", detail: "Completed 20 questions · 18 correct" },
  { title: "Biology – Cell Biology Revision", detail: "Reviewed Cell Structure study material" },
  { title: "English Language – Comprehension Practice", detail: "Completed a WAEC past question" },
];

function DocumentArt({ tone }: { tone: string }) {
  return (
    <div className={`document-art ${tone}`} aria-hidden="true">
      <span className="fold" />
      <span className="doc-lines"><i /><i /><i /><i /><i /><i /></span>
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><BookOpen size={17} fill="currentColor" /></span><span>WAEC Prep</span></div>
      <label className="search"><Search size={15} /><input aria-label="Search" placeholder="Search" /></label>
      <nav className="nav-main" aria-label="Main navigation">
        {navMain.map(({ label, icon: Icon, active }) => <a className={`nav-link ${active ? "active" : ""}`} href="#" key={label}><Icon size={16} strokeWidth={1.7} /><span>{label}</span></a>)}
      </nav>
      <div className="nav-secondary">
        <a className="nav-link" href="#"><Clock3 size={16} strokeWidth={1.7} /><span>History</span></a>
        <a className="nav-link" href="#"><Bell size={16} strokeWidth={1.7} /><span>Notifications</span></a>
      </div>
      <div className="settings-group"><p className="nav-caption">Settings</p><a className="nav-link" href="#"><Settings size={16} strokeWidth={1.7} /><span>General Settings</span></a></div>
      <button className="profile" aria-label="Open student profile"><div className="avatar"><UserRound size={16} /></div><span>Student Account</span><ChevronRight className="profile-chevron" size={15} /></button>
    </aside>
  );
}

export default function Dashboard() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-area">
        <header className="topbar"><LayoutDashboard size={15} strokeWidth={1.7} /><span>Dashboard</span></header>
        <div className="dashboard-content">
          <section className="welcome">
            <div><h1>Welcome back, Student</h1><p>Every study session brings you closer to your WAEC goal.</p></div>
            <button className="primary-button"><Upload size={16} strokeWidth={2} />Upload Study Material</button>
          </section>

          <section className="performance" aria-labelledby="performance-title">
            <h2 id="performance-title">Performance Overview <CircleHelp size={14} /></h2>
            <div className="metrics-grid">
              {metrics.map(({ label, score, change, color, icon: Icon }) => <article className="metric" key={label}>
                <div className="metric-label"><Icon size={15} strokeWidth={1.8} /><span>{label}</span></div>
                <div className="metric-score"><i className={color} /><strong>{score}</strong></div>
                <p>{change}</p>
              </article>)}
            </div>
          </section>

          <section className="study-section" aria-labelledby="study-title">
            <h2 id="study-title">Your Weekly Study Plan <CircleHelp size={14} /></h2>
            <div className="study-grid">
              {studyPlan.map(({ title, detail, tone }) => <article className="study-item" key={title}><DocumentArt tone={tone} /><h3>{title}</h3><p>{detail}</p></article>)}
            </div>
          </section>

          <section className="recent-section" aria-labelledby="recent-title">
            <h2 id="recent-title">Recent Activities</h2>
            <div className="activity-list">
              {activities.map(({ title, detail }) => <article className="activity-row" key={title}><FileText size={16} strokeWidth={1.8} /><div className="activity-copy"><h3>{title}</h3><p>{detail}</p></div><button className="more-button" aria-label={`More options for ${title}`}><MoreHorizontal size={18} /></button></article>)}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

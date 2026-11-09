export type VerificationStatus = "MATCHED" | "POSSIBLE_MATCH" | "NOT_FOUND";

export type SyllabusTopic = {
  id: string;
  section: string;
  title: string;
  description: string;
  aliases: string[];
};

export type StudyNote = {
  id: string;
  title: string;
  fileName: string;
  fileType: "PDF" | "DOC" | "DOCX";
  uploadedAt: string;
  selectedTopic: string;
  topicId: string | null;
  description: string;
  verificationStatus: VerificationStatus;
  confidence: number;
  matchedSyllabusTopicId: string | null;
  suggestedTopicId: string | null;
  verificationMessage: string;
};

export type StudyWorkspace = {
  id: string;
  studentId: string;
  subjectId: string;
  subject: string;
  syllabusDocument: {
    id: string;
    fileName: string;
    fileType: "PDF";
    uploadedAt: string;
    processingStatus: "MOCK_RESULTS";
  };
  topics: SyllabusTopic[];
  notes: StudyNote[];
  createdAt: string;
  updatedAt: string;
};

type TopicSeed = { section: string; title: string; description?: string; aliases?: string[] };

// Curated demo topics stand in for extraction results until a syllabus parser is connected.
const demoTopicSeeds: Record<string, TopicSeed[]> = {
  "Biology": [
    { section: "A. Diversity of Living Organisms", title: "Classification of Living Things", aliases: ["classification"] },
    { section: "B. Form and Functions", title: "Cell Structure and Organisation", aliases: ["cell structure", "structure of the cell", "cell organisation"] },
    { section: "B. Form and Functions", title: "Nutrition", aliases: ["plant and animal nutrition"] },
    { section: "B. Form and Functions", title: "Transport Systems", aliases: ["transport in plants", "transport in animals"] },
    { section: "B. Form and Functions", title: "Respiration", aliases: ["cellular respiration"] },
    { section: "B. Form and Functions", title: "Excretion", aliases: ["excretory system"] },
    { section: "C. Ecology", title: "Ecological Management", aliases: ["ecosystem management"] },
    { section: "D. Heredity and Evolution", title: "Genetics and Variation", aliases: ["genetics", "inheritance", "heredity"] },
    { section: "D. Heredity and Evolution", title: "Evolution", aliases: ["natural selection"] },
  ],
  "Mathematics": [
    { section: "A. Number and Numeration", title: "Number Bases", aliases: ["number systems"] },
    { section: "A. Number and Numeration", title: "Fractions, Decimals and Percentages", aliases: ["fractions", "percentages"] },
    { section: "B. Algebraic Processes", title: "Algebraic Expressions", aliases: ["algebra"] },
    { section: "B. Algebraic Processes", title: "Linear Equations and Inequalities", aliases: ["linear equations", "equations"] },
    { section: "C. Geometry and Mensuration", title: "Plane Geometry", aliases: ["geometry"] },
    { section: "C. Geometry and Mensuration", title: "Trigonometry", aliases: ["trigonometric ratios"] },
    { section: "D. Statistics and Probability", title: "Statistics and Data Representation", aliases: ["statistics", "data handling"] },
  ],
  "English Language": [
    { section: "A. Lexis and Structure", title: "Lexis and Structure", aliases: ["grammar", "vocabulary and grammar"] },
    { section: "B. Comprehension and Summary", title: "Comprehension", aliases: ["reading comprehension", "comprehension passages"] },
    { section: "B. Comprehension and Summary", title: "Summary Writing", aliases: ["summary"] },
    { section: "C. Oral English", title: "Oral English", aliases: ["speech work", "phonetics"] },
    { section: "D. Continuous Writing", title: "Essay Writing", aliases: ["letter writing", "formal letter", "informal letter"] },
  ],
  "Chemistry": [
    { section: "A. Basic Concepts", title: "Atomic Structure", aliases: ["structure of the atom"] },
    { section: "B. Chemical Reactions", title: "Acids, Bases and Salts", aliases: ["acids and bases", "neutralisation"] },
    { section: "B. Chemical Reactions", title: "Chemical Bonding", aliases: ["ionic and covalent bonding"] },
    { section: "C. States of Matter", title: "Gas Laws", aliases: ["gases"] },
    { section: "D. Organic Chemistry", title: "Hydrocarbons", aliases: ["alkanes and alkenes"] },
  ],
  "Physics": [
    { section: "A. Mechanics", title: "Motion", aliases: ["linear motion", "kinematics"] },
    { section: "A. Mechanics", title: "Forces and Equilibrium", aliases: ["forces"] },
    { section: "B. Heat and Energy", title: "Heat Transfer", aliases: ["thermal energy"] },
    { section: "C. Waves", title: "Sound Waves", aliases: ["sound"] },
    { section: "D. Electricity and Magnetism", title: "Electric Circuits", aliases: ["circuits"] },
  ],
  "Agricultural Science": [
    { section: "A. Basic Agriculture", title: "Soil Science", aliases: ["soil"] },
    { section: "B. Crop Production", title: "Crop Improvement", aliases: ["crop breeding"] },
    { section: "C. Animal Production", title: "Animal Nutrition", aliases: ["livestock feeding"] },
    { section: "D. Agricultural Economics", title: "Farm Management", aliases: ["farm records"] },
  ],
  "Economics": [
    { section: "A. Basic Economic Concepts", title: "Demand and Supply", aliases: ["market forces"] },
    { section: "B. Production", title: "Factors of Production", aliases: ["land labour capital enterprise"] },
    { section: "C. National Economy", title: "National Income", aliases: ["gross domestic product", "gdp"] },
    { section: "D. Public Finance", title: "Taxation", aliases: ["tax"] },
  ],
  "Government": [
    { section: "A. Elements of Government", title: "Constitutional Development", aliases: ["constitutions"] },
    { section: "B. Political Systems", title: "Systems of Government", aliases: ["government systems"] },
    { section: "C. Public Administration", title: "The Civil Service", aliases: ["public service"] },
    { section: "D. International Relations", title: "International Organisations", aliases: ["united nations", "un"] },
  ],
  "Literature in English": [
    { section: "A. Prose", title: "Prose Fiction", aliases: ["prose"] },
    { section: "B. Drama", title: "Elements of Drama", aliases: ["dramatic techniques"] },
    { section: "C. Poetry", title: "Poetic Devices", aliases: ["figures of speech"] },
    { section: "D. Literary Appreciation", title: "Themes and Characterisation", aliases: ["themes", "characters"] },
  ],
  "Geography": [
    { section: "A. Physical Geography", title: "Weather and Climate", aliases: ["climate"] },
    { section: "B. Human Geography", title: "Population", aliases: ["population studies"] },
    { section: "C. Regional Geography", title: "West Africa", aliases: ["west african geography"] },
    { section: "D. Map Work", title: "Map Reading and Interpretation", aliases: ["map reading"] },
  ],
  "Commerce": [
    { section: "A. Trade", title: "Home and Foreign Trade", aliases: ["international trade"] },
    { section: "B. Business Units", title: "Forms of Business Organisation", aliases: ["business organisation"] },
    { section: "C. Aids to Trade", title: "Banking and Finance", aliases: ["banking"] },
    { section: "D. Marketing", title: "Advertising and Sales Promotion", aliases: ["advertising"] },
  ],
  "Accounting": [
    { section: "A. Principles of Accounting", title: "Accounting Concepts", aliases: ["accounting principles"] },
    { section: "B. Financial Statements", title: "Final Accounts", aliases: ["financial statements"] },
    { section: "C. Bookkeeping", title: "Ledger Accounts", aliases: ["ledgers"] },
    { section: "D. Public Sector Accounting", title: "Government Accounting", aliases: ["public sector accounts"] },
  ],
};

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function getMockSyllabusTopics(subject: string): SyllabusTopic[] {
  const seeds = demoTopicSeeds[subject] ?? [
    { section: `A. ${subject}`, title: `${subject} Concepts`, aliases: ["core concepts"] },
    { section: `A. ${subject}`, title: `${subject} Applications` },
    { section: `B. ${subject}`, title: `${subject} Methods and Principles` },
  ];
  return seeds.map((topic, index) => ({
    id: `${slug(subject)}-topic-${index + 1}`,
    section: topic.section,
    title: topic.title,
    description: topic.description ?? `Key WAEC learning objectives for ${topic.title.toLowerCase()}.`,
    aliases: topic.aliases ?? [],
  }));
}

export function normaliseTopic(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function tokenSimilarity(a: string, b: string): number {
  const aa = new Set(normaliseTopic(a).split(" ").filter(token => token.length > 2));
  const bb = new Set(normaliseTopic(b).split(" ").filter(token => token.length > 2));
  if (!aa.size || !bb.size) return 0;
  const intersection = [...aa].filter(token => bb.has(token)).length;
  return intersection / new Set([...aa, ...bb]).size;
}

export type TopicVerification = {
  status: VerificationStatus;
  confidence: number;
  matchedTopic: SyllabusTopic | null;
  suggestedTopic: SyllabusTopic | null;
  message: string;
};

/** Prototype matcher: deterministic, conservative, and replaceable by a real syllabus service. */
export function verifyTopicAgainstSyllabus(selectedTopic: string, topics: SyllabusTopic[]): TopicVerification {
  const query = normaliseTopic(selectedTopic);
  if (!query) return { status: "NOT_FOUND", confidence: 0, matchedTopic: null, suggestedTopic: null, message: "Choose or enter a topic to check it against the saved syllabus." };
  for (const topic of topics) {
    const candidates = [topic.title, ...topic.aliases].map(normaliseTopic);
    if (candidates.some(candidate => candidate === query || (query.length >= 6 && (candidate.includes(query) || query.includes(candidate))))) {
      return { status: "MATCHED", confidence: 0.96, matchedTopic: topic, suggestedTopic: null, message: "This topic is included in your WAEC syllabus." };
    }
  }
  const ranked = topics.map(topic => ({ topic, score: Math.max(...[topic.title, ...topic.aliases].map(candidate => tokenSimilarity(query, candidate))) })).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (best && best.score >= 0.45) {
    return { status: "POSSIBLE_MATCH", confidence: Math.min(0.89, Number(best.score.toFixed(2))), matchedTopic: null, suggestedTopic: best.topic, message: "A similar topic appears in your syllabus. Confirm the suggested topic before adding this note." };
  }
  return { status: "NOT_FOUND", confidence: 0, matchedTopic: null, suggestedTopic: null, message: "This topic was not found in your uploaded WAEC syllabus." };
}

export function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatUploadDate(date = new Date()): string {
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

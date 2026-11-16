/**
 * A source-faithful schema for OpenParser's Extract endpoint. The schema
 * descriptions carry the extraction rules so the provider can parse the file
 * and return a structured document in the same job.
 */
export function textbookExtractionSchema(sourceDocumentId: string) {
  const pageSource = {
    type: "object",
    additionalProperties: false,
    properties: {
      documentId: { type: "string", const: sourceDocumentId, description: "Use this exact Cognify source document ID." },
      pageNumber: { type: ["integer", "null"], description: "Printed or parsed source page number when explicitly available; otherwise null." },
    },
    required: ["documentId", "pageNumber"],
  };
  const block = {
    type: "object",
    additionalProperties: false,
    properties: {
      type: { type: "string", enum: ["PARAGRAPH", "DEFINITION", "IMPORTANT_CONCEPT", "EXAMPLE", "LIST", "EQUATION", "DIAGRAM_REFERENCE", "TABLE_REFERENCE", "SUMMARY", "INCOMPLETE"], description: "Choose a type only when supported by the source; otherwise use PARAGRAPH." },
      content: { type: "string", description: "Faithfully preserve source wording and meaning. Represent formulas with LaTeX wrapped in $...$ or $$...$$ (or \\(...\\) and \\[...\\]) so they render as math. Do not add outside facts, silently correct uncertain OCR, or omit repetitive explanations. Mark incomplete source text as incomplete." },
      source: pageSource,
      needsReview: { type: "boolean", description: "True when OCR is uncertain, source page is unclear, or the block cannot be confidently classified." },
    },
    required: ["type", "content", "source", "needsReview"],
  };
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string", description: "Main topic title found in the source; use an empty string if absent." },
      subject: { type: "string", description: "Subject name only when explicitly present in the source; use an empty string if absent." },
      introduction: { type: ["string", "null"], description: "Introduction from the source, or null when none is present. Never invent one." },
      sections: {
        type: "array",
        description: "Organize all source content in its original logical order. Do not shorten or discard explanations.",
        items: {
          type: "object", additionalProperties: false,
          properties: {
            title: { type: "string", description: "Source heading, or empty string if there is no heading." },
            order: { type: "integer", minimum: 1, description: "One-based source order." },
            blocks: { type: "array", items: block },
          },
          required: ["title", "order", "blocks"],
        },
      },
      diagrams: {
        type: "array", description: "Only source-referenced diagrams. Preserve the source image reference when identified, OCR description, and visible labels. Do not invent labels.",
        items: {
          type: "object", additionalProperties: false,
          properties: { imageReference: { type: ["string", "null"] }, description: { type: "string" }, labels: { type: "array", items: { type: "string" } }, source: pageSource, needsReview: { type: "boolean" } },
          required: ["imageReference", "description", "labels", "source", "needsReview"],
        },
      },
      tables: {
        type: "array", description: "Preserve each source table's column headings, row relationships, and source order. Do not convert it to unrelated prose.",
        items: {
          type: "object", additionalProperties: false,
          properties: { headers: { type: "array", items: { type: "string" } }, rows: { type: "array", items: { type: "array", items: { type: "string" } } }, source: pageSource, needsReview: { type: "boolean" } },
          required: ["headers", "rows", "source", "needsReview"],
        },
      },
      reviewItems: { type: "array", description: "Uncertain OCR, missing page context, incomplete text, or unclassifiable content that needs human review.", items: { type: "string" } },
      processingNotes: { type: "array", description: "Notes about source incompleteness or ordering only; do not add outside knowledge.", items: { type: "string" } },
    },
    required: ["title", "subject", "introduction", "sections", "diagrams", "tables", "reviewItems", "processingNotes"],
  };
}

function sourceRef(sourceDocumentId: string) {
  return {
    type: "object", additionalProperties: false,
    properties: {
      documentId: { type: "string", const: sourceDocumentId, description: "Use this exact Cognify source document ID." },
      pageNumber: { type: ["integer", "null"], description: "Source page number when explicitly available; otherwise null." },
    },
    required: ["documentId", "pageNumber"],
  };
}

export function pastQuestionExtractionSchema(sourceDocumentId: string) {
  const source = sourceRef(sourceDocumentId);
  const part = {
    type: "object", additionalProperties: false,
    properties: {
      label: { type: "string", description: "Printed sub-question label, such as (a)(i), if present." },
      prompt: { type: "string", description: "Exact question wording; preserve mathematical notation and write formulas in renderable LaTeX delimiters $...$ or $$...$$ (or \\(...\\) and \\[...\\])." },
      marks: { type: ["string", "null"], description: "Marks printed beside this part, or null if absent." },
      source, needsReview: { type: "boolean" },
    },
    required: ["label", "prompt", "marks", "source", "needsReview"],
  };
  return {
    type: "object", additionalProperties: false,
    properties: {
      title: { type: "string", description: "Past-question paper title printed in the source; empty string if absent." },
      subject: { type: "string", description: "Subject printed in the source; empty string if absent." },
      examinationBody: { type: ["string", "null"], description: "Examination body only when printed in the source." },
      examinationYear: { type: ["string", "null"], description: "Year only when printed in the source." },
      instructions: { type: ["string", "null"], description: "Candidate instructions copied from the source, or null if absent." },
      questions: {
        type: "array", description: "Extract questions in their original order. Do not answer, solve, explain, or create questions.",
        items: {
          type: "object", additionalProperties: false,
          properties: {
            number: { type: "string", description: "Question number as printed." },
            prompt: { type: "string", description: "Question stem, preserving source wording and writing formulas in renderable LaTeX delimiters $...$ or $$...$$ (or \\(...\\) and \\[...\\])." },
            parts: { type: "array", items: part },
            options: { type: "array", items: { type: "object", additionalProperties: false, properties: { label: { type: "string" }, text: { type: "string" } }, required: ["label", "text"] } },
            marks: { type: ["string", "null"], description: "Total marks printed for the question, or null if absent." },
            source, needsReview: { type: "boolean" },
          },
          required: ["number", "prompt", "parts", "options", "marks", "source", "needsReview"],
        },
      },
      diagrams: { type: "array", items: { type: "object", additionalProperties: false, properties: { description: { type: "string" }, labels: { type: "array", items: { type: "string" } }, source, needsReview: { type: "boolean" } }, required: ["description", "labels", "source", "needsReview"] } },
      reviewItems: { type: "array", items: { type: "string" } },
    },
    required: ["title", "subject", "examinationBody", "examinationYear", "instructions", "questions", "diagrams", "reviewItems"],
  };
}

export function syllabusExtractionSchema(sourceDocumentId: string) {
  const source = sourceRef(sourceDocumentId);
  const topic = {
    type: "object", additionalProperties: false,
    properties: {
      title: { type: "string", description: "Topic heading copied from the syllabus." },
      subtopics: { type: "array", items: { type: "string" }, description: "Subtopic labels copied from the source, in order." },
      learningObjectives: { type: "array", items: { type: "string" }, description: "Objectives only when explicitly printed. Do not infer or add objectives." },
      practicalActivities: { type: "array", items: { type: "string" }, description: "Practical activities only when explicitly printed." },
      source, needsReview: { type: "boolean" },
    },
    required: ["title", "subtopics", "learningObjectives", "practicalActivities", "source", "needsReview"],
  };
  return {
    type: "object", additionalProperties: false,
    properties: {
      title: { type: "string", description: "Syllabus title printed in the source; empty string if absent." },
      examinationBody: { type: ["string", "null"], description: "Examination body only when stated in the source." },
      examinationYear: { type: ["string", "null"], description: "Year/version only when stated in the source." },
      subject: { type: "string", description: "Subject named in the source; empty string if absent." },
      papers: {
        type: "array", description: "Preserve the syllabus paper and section hierarchy in its original order.",
        items: {
          type: "object", additionalProperties: false,
          properties: {
            title: { type: "string", description: "Paper or component name as printed." },
            sections: { type: "array", items: { type: "object", additionalProperties: false, properties: { title: { type: "string" }, topics: { type: "array", items: topic }, source, needsReview: { type: "boolean" } }, required: ["title", "topics", "source", "needsReview"] } },
            source, needsReview: { type: "boolean" },
          },
          required: ["title", "sections", "source", "needsReview"],
        },
      },
      reviewItems: { type: "array", items: { type: "string" } },
      processingNotes: { type: "array", items: { type: "string" } },
    },
    required: ["title", "examinationBody", "examinationYear", "subject", "papers", "reviewItems", "processingNotes"],
  };
}

export function extractionSchemaForCategory(category: string, sourceDocumentId: string) {
  if (category === "PAST_QUESTION") return pastQuestionExtractionSchema(sourceDocumentId);
  if (category === "SYLLABUS") return syllabusExtractionSchema(sourceDocumentId);
  return textbookExtractionSchema(sourceDocumentId);
}

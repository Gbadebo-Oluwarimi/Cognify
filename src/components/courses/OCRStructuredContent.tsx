"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

type JsonRecord = Record<string, unknown>;
const record = (value: unknown): JsonRecord => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const string = (value: unknown) => typeof value === "string" ? value : "";
const titleCase = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/^\w/, char => char.toUpperCase());

function normalizeMath(value: string) {
  return value
    .replace(/\\\[([\s\S]+?)\\\]/g, (_match, expression: string) => `$$\n${expression}\n$$`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_match, expression: string) => `$${expression}$`);
}

export function MathMarkdown({ children, className = "" }: { children: string; className?: string }) {
  if (!children) return null;
  return <div className={`ocr-markdown ${className}`}>
    <ReactMarkdown remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }]]} rehypePlugins={[rehypeKatex]} components={{
      table: ({ children: tableChildren }) => <div className="ocr-markdown-table-wrap"><table>{tableChildren}</table></div>,
      a: ({ href, children: linkChildren }) => <a href={href} target="_blank" rel="noreferrer">{linkChildren}</a>,
      pre: ({ children: codeChildren }) => <pre className="ocr-code-block">{codeChildren}</pre>,
      code: ({ children: codeChildren, className: codeClass }) => codeClass ? <code className={codeClass}>{codeChildren}</code> : <code className="ocr-inline-code">{codeChildren}</code>,
    }}>{normalizeMath(children)}</ReactMarkdown>
  </div>;
}

function SourceLine({ source }: { source: unknown }) {
  const item = record(source);
  const page = item.pageNumber ?? item.page_number;
  if (page == null && !item.documentId) return null;
  return <span className="ocr-source-chip">Source{page != null ? ` · page ${String(page)}` : ""}</span>;
}

function ReviewFlag({ value }: { value: unknown }) {
  return value ? <span className="ocr-review-flag">Review source</span> : null;
}

function ContentBlock({ value }: { value: unknown }) {
  const block = record(value);
  const type = string(block.type) || "PARAGRAPH";
  const content = string(block.content ?? block.text ?? block.prompt);
  return <article className="ocr-content-block">
    <header><span className="ocr-block-type">{titleCase(type)}</span><SourceLine source={block.source}/><ReviewFlag value={block.needsReview}/></header>
    <MathMarkdown>{content}</MathMarkdown>
  </article>;
}

function TextbookView({ data }: { data: JsonRecord }) {
  return <div className="ocr-structured-document">
    {(data.title || data.subject) && <div className="ocr-document-heading"><h3>{string(data.title) || "Extracted material"}</h3>{data.subject && <p>{string(data.subject)}</p>}</div>}
    {typeof data.introduction === "string" && data.introduction && <section className="ocr-introduction"><h4>Introduction</h4><MathMarkdown>{data.introduction}</MathMarkdown></section>}
    {list(data.sections).map((sectionValue, index) => {
      const section = record(sectionValue);
      return <section className="ocr-topic-section" key={`${string(section.title)}-${index}`}><h4>{string(section.title) || `Section ${index + 1}`}</h4>{list(section.blocks).map((block, blockIndex) => <ContentBlock key={blockIndex} value={block}/>)}</section>;
    })}
    {list(data.diagrams).length > 0 && <section className="ocr-topic-section"><h4>Diagrams</h4>{list(data.diagrams).map((item, index) => { const diagram = record(item); return <article className="ocr-reference-card" key={index}><b>{string(diagram.description) || `Diagram ${index + 1}`}</b><p>{list(diagram.labels).map(string).filter(Boolean).join(" · ") || "No labels were confidently identified."}</p><footer><SourceLine source={diagram.source}/><ReviewFlag value={diagram.needsReview}/></footer></article>; })}</section>}
    {list(data.tables).length > 0 && <section className="ocr-topic-section"><h4>Tables</h4>{list(data.tables).map((item, index) => { const table = record(item); return <div className="ocr-extracted-table" key={index}><table><thead><tr>{list(table.headers).map((cell, cellIndex) => <th key={cellIndex}><MathMarkdown>{string(cell)}</MathMarkdown></th>)}</tr></thead><tbody>{list(table.rows).map((row, rowIndex) => <tr key={rowIndex}>{list(row).map((cell, cellIndex) => <td key={cellIndex}><MathMarkdown>{string(cell)}</MathMarkdown></td>)}</tr>)}</tbody></table><footer><SourceLine source={table.source}/><ReviewFlag value={table.needsReview}/></footer></div>; })}</section>}
    {list(data.reviewItems).length > 0 && <ReviewItems values={list(data.reviewItems)}/>}
  </div>;
}

function PastQuestionView({ data }: { data: JsonRecord }) {
  const questions = list(data.questions);
  return <div className="ocr-structured-document">
    <div className="ocr-document-heading"><h3>{string(data.title) || "Past questions"}</h3><p>{[data.subject, data.examinationBody, data.examinationYear].map(string).filter(Boolean).join(" · ")}</p></div>
    {typeof data.instructions === "string" && data.instructions && <section className="ocr-instructions"><b>Instructions</b><MathMarkdown>{data.instructions}</MathMarkdown></section>}
    {questions.map((value, index) => {
      const question = record(value);
      return <article className="ocr-question-card" key={`${string(question.number)}-${index}`}>
        <header><h4>Question {string(question.number) || index + 1}</h4><div><SourceLine source={question.source}/><ReviewFlag value={question.needsReview}/></div></header>
        {question.prompt && <MathMarkdown className="ocr-question-prompt">{string(question.prompt)}</MathMarkdown>}
        {list(question.parts).map((partValue, partIndex) => { const part = record(partValue); return <div className="ocr-question-part" key={partIndex}><div className="ocr-question-part-title"><b>{string(part.label) || `Part ${partIndex + 1}`}</b>{part.marks && <span>{string(part.marks)} marks</span>}</div><MathMarkdown>{string(part.prompt)}</MathMarkdown><footer><SourceLine source={part.source}/><ReviewFlag value={part.needsReview}/></footer></div>; })}
        {list(question.options).length > 0 && <ol className="ocr-answer-options" type="A">{list(question.options).map((optionValue, optionIndex) => { const option = record(optionValue); return <li key={optionIndex}><b>{string(option.label)}</b><MathMarkdown>{string(option.text)}</MathMarkdown></li>; })}</ol>}
        {question.marks && <span className="ocr-marks">{string(question.marks)} marks</span>}
      </article>;
    })}
    {questions.length === 0 && <EmptyExtraction message="No question blocks were confidently extracted. Check the full OCR text below."/>}
    {list(data.diagrams).map((value, index) => { const diagram = record(value); return <article className="ocr-reference-card" key={index}><b>{string(diagram.description) || `Question diagram ${index + 1}`}</b><p>{list(diagram.labels).map(string).filter(Boolean).join(" · ")}</p><footer><SourceLine source={diagram.source}/><ReviewFlag value={diagram.needsReview}/></footer></article>; })}
    {list(data.reviewItems).length > 0 && <ReviewItems values={list(data.reviewItems)}/>}
  </div>;
}

function SyllabusView({ data }: { data: JsonRecord }) {
  return <div className="ocr-structured-document">
    <div className="ocr-document-heading"><h3>{string(data.title) || "Syllabus"}</h3><p>{[data.subject, data.examinationBody, data.examinationYear].map(string).filter(Boolean).join(" · ")}</p></div>
    {list(data.papers).map((paperValue, paperIndex) => {
      const paper = record(paperValue);
      return <section className="ocr-syllabus-paper" key={paperIndex}><header><h4>{string(paper.title) || `Paper ${paperIndex + 1}`}</h4><div><SourceLine source={paper.source}/><ReviewFlag value={paper.needsReview}/></div></header>
        {list(paper.sections).map((sectionValue, sectionIndex) => { const section = record(sectionValue); return <section className="ocr-syllabus-section" key={sectionIndex}><h5>{string(section.title) || `Section ${sectionIndex + 1}`}</h5>{list(section.topics).map((topicValue, topicIndex) => { const topic = record(topicValue); return <article className="ocr-syllabus-topic" key={topicIndex}><header><b>{string(topic.title) || `Topic ${topicIndex + 1}`}</b><div><SourceLine source={topic.source}/><ReviewFlag value={topic.needsReview}/></div></header>{list(topic.subtopics).length > 0 && <div><span className="ocr-detail-label">Subtopics</span><ul>{list(topic.subtopics).map((item, index) => <li key={index}><MathMarkdown>{string(item)}</MathMarkdown></li>)}</ul></div>}{list(topic.learningObjectives).length > 0 && <div><span className="ocr-detail-label">Learning objectives</span><ul>{list(topic.learningObjectives).map((item, index) => <li key={index}><MathMarkdown>{string(item)}</MathMarkdown></li>)}</ul></div>}{list(topic.practicalActivities).length > 0 && <div><span className="ocr-detail-label">Practical activities</span><ul>{list(topic.practicalActivities).map((item, index) => <li key={index}><MathMarkdown>{string(item)}</MathMarkdown></li>)}</ul></div>}</article>; })}<footer><SourceLine source={section.source}/><ReviewFlag value={section.needsReview}/></footer></section>; })}
      </section>;
    })}
    {list(data.papers).length === 0 && <EmptyExtraction message="No syllabus sections were confidently extracted. Check the full OCR text below."/>}
    {list(data.reviewItems).length > 0 && <ReviewItems values={list(data.reviewItems)}/>}
    {list(data.processingNotes).length > 0 && <section className="ocr-review-items"><h4>Processing notes</h4><ul>{list(data.processingNotes).map((item, index) => <li key={index}><MathMarkdown>{string(item)}</MathMarkdown></li>)}</ul></section>}
  </div>;
}

function ReviewItems({ values }: { values: unknown[] }) {
  return <section className="ocr-review-items"><h4>Needs review</h4><ul>{values.map((value, index) => <li key={index}><MathMarkdown>{string(value)}</MathMarkdown></li>)}</ul></section>;
}

function EmptyExtraction({ message }: { message: string }) {
  return <p className="ocr-empty-extraction">{message}</p>;
}

export function OCRStructuredContent({ category, data }: { category: string; data: unknown }) {
  const value = record(data);
  if (category === "PAST_QUESTION") return <PastQuestionView data={value}/>;
  if (category === "SYLLABUS") return <SyllabusView data={value}/>;
  return <TextbookView data={value}/>;
}

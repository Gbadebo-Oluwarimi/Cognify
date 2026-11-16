import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { BSON, GridFSBucket, MongoClient, ObjectId } from "mongodb";

try { process.loadEnvFile?.(".env.local"); } catch { /* .env is also accepted for local development. */ }
try { process.loadEnvFile?.(".env"); } catch { /* Environment may be injected by the caller. */ }
for (const name of ["OPENPARSER_API_KEY", "MONGODB_URI", "MONGODB_DATABASE", "AUTH_SECRET"]) {
  if (!process.env[name]) throw new Error(`${name} is required for the live OpenParser integration check`);
}

const pdfPath = process.argv[2] || "/home/gbadebo-oluwarimi/Downloads/NUMBER BASES 2.pdf";
const pdf = await readFile(pdfPath);
if (pdf.length > 10 * 1024 * 1024 || !pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("The live integration sample must be a PDF under 10 MiB");
const mongo = new MongoClient(process.env.MONGODB_URI);
await mongo.connect();
const db = mongo.db(process.env.MONGODB_DATABASE);
const bucket = new GridFSBucket(db, { bucketName: "ocrRawResponses" });
const userId = new ObjectId();
const courseId = new ObjectId();
const topicId = new ObjectId();
const authToken = randomBytes(32).toString("base64url");
const tokenHash = createHmac("sha256", process.env.AUTH_SECRET).update(authToken).digest("hex");
const testEmail = `openparser-live-${randomUUID()}@cognify.invalid`;
const created = [];
let appProcess;
let workerProcess;

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function waitForApp(url, cookie) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { headers: { Cookie: cookie }, signal: AbortSignal.timeout(3000) });
      if (response.status === 200) return;
    } catch { /* Next.js is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 800));
  }
  throw new Error("Next.js did not become ready for the live integration check");
}

async function clean() {
  if (workerProcess && workerProcess.exitCode === null) workerProcess.kill("SIGTERM");
  if (appProcess && appProcess.exitCode === null) appProcess.kill("SIGTERM");
  const results = await db.collection("ocrDocumentResults").find({ sessionId: { $in: created } }).toArray().catch(() => []);
  for (const result of results) {
    if (result.rawResponseStorage?.fileId) await bucket.delete(result.rawResponseStorage.fileId).catch(() => undefined);
  }
  const pages = await db.collection("ocrPages").find({ sessionId: { $in: created } }).toArray().catch(() => []);
  for (const page of pages) if (page.rawPageFileId) await bucket.delete(page.rawPageFileId).catch(() => undefined);
  await Promise.allSettled([
    db.collection("ocrPages").deleteMany({ sessionId: { $in: created } }),
    db.collection("ocrDocumentResults").deleteMany({ sessionId: { $in: created } }),
    db.collection("uploadedDocuments").deleteMany({ uploadSessionId: { $in: created } }),
    db.collection("uploadSessions").deleteMany({ _id: { $in: created } }),
    db.collection("sessions").deleteOne({ tokenHash }),
    db.collection("topics").deleteOne({ _id: topicId }),
    db.collection("courses").deleteOne({ _id: courseId }),
    db.collection("users").deleteOne({ _id: userId }),
  ]);
  await mongo.close();
}

try {
  await db.collection("users").insertOne({ _id: userId, fullName: "OpenParser Integration Test", email: testEmail, accountStatus: "active", createdAt: new Date() });
  await db.collection("courses").insertOne({ _id: courseId, studentId: String(userId), title: "Temporary OpenParser Integration", subject: "Mathematics", status: "active", createdAt: new Date(), updatedAt: new Date() });
  await db.collection("topics").insertOne({ _id: topicId, studentId: String(userId), courseId, name: "Temporary Number Bases Test", description: "", createdAt: new Date(), updatedAt: new Date() });
  await db.collection("sessions").insertOne({ tokenHash, userId, expiresAt: new Date(Date.now() + 10 * 60_000), createdAt: new Date() });

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const cookie = `cognify_session=${authToken}`;
  appProcess = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(port)], { cwd: process.cwd(), env: process.env, stdio: "ignore" });
  workerProcess = spawn(process.execPath, ["scripts/material-worker.mjs"], { cwd: process.cwd(), env: process.env, stdio: "ignore" });
  await waitForApp(`${base}/api/courses/${courseId}/materials`, cookie);

  const form = new FormData();
  form.set("category", "TEXTBOOK");
  form.set("topicId", String(topicId));
  form.set("requestId", randomUUID());
  form.set("title", "NUMBER BASES 2 PDF live OCR check");
  form.append("files", new Blob([pdf], { type: "application/pdf" }), "NUMBER BASES 2.pdf");
  const submitted = await fetch(`${base}/api/courses/${courseId}/materials`, { method: "POST", headers: { Cookie: cookie }, body: form, signal: AbortSignal.timeout(60_000) });
  const uploadBody = await submitted.json();
  if (submitted.status !== 202) throw new Error(`Cognify upload returned HTTP ${submitted.status}: ${uploadBody.error ?? "unknown error"}`);
  const sessionId = new ObjectId(uploadBody.uploadSession.id);
  created.push(sessionId);
  process.stdout.write(`Submitted real sample PDF to OpenParser batch job ${uploadBody.uploadSession.openParserJobId ?? "accepted"}.\n`);

  let detail;
  const deadline = Date.now() + 6 * 60_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${base}/api/upload-sessions/${sessionId}`, { headers: { Cookie: cookie } });
    const responseText = await response.text();
    try { detail = JSON.parse(responseText); }
    catch {
      if (response.status >= 500) { await new Promise(resolve => setTimeout(resolve, 1500)); continue; }
      throw new Error(`Cognify result retrieval returned a non-JSON response (HTTP ${response.status})`);
    }
    if (!response.ok) throw new Error(`Cognify result retrieval returned HTTP ${response.status}`);
    if (["COMPLETED", "PARTIALLY_COMPLETED", "FAILED"].includes(detail.session.status)) break;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  if (!detail || !["COMPLETED", "PARTIALLY_COMPLETED", "FAILED"].includes(detail.session.status)) throw new Error("Timed out waiting for OpenParser OCR to complete");
  const document = detail.documents[0];
  if (document.status !== "COMPLETED" || !document.result?.rawResponse) throw new Error(`OCR did not complete with a raw parsed document (status: ${document.status})`);
  const raw = document.result.rawResponse;
  const parsed = raw.parsed_document ?? raw.parsedDocument ?? raw;
  const text = `${parsed.text ?? ""}\n${parsed.markdown ?? ""}\n${JSON.stringify(parsed.elements ?? parsed.blocks ?? [])}\n${JSON.stringify(raw.output ?? "")}`;
  if (!document.result.extractedData || typeof document.result.extractedData !== "object") throw new Error("OpenParser Extract did not return its structured output");
  const databaseCopy = await db.collection("ocrDocumentResults").findOne({ sessionId, uploadedDocumentId: new ObjectId(document.id) });
  if (!databaseCopy || databaseCopy.status !== "COMPLETED" || BSON.calculateObjectSize(databaseCopy) > 16 * 1024 * 1024) throw new Error("The complete OCR result was not safely persisted in MongoDB");
  process.stdout.write(`LIVE OCR + EXTRACT PASS: status=${detail.session.status}, pages=${document.result.pageCount}, elements=${Array.isArray(parsed.elements) ? parsed.elements.length : Array.isArray(parsed.blocks) ? parsed.blocks.length : 0}, structuredOutputStored=true, rawJSONStored=true\n`);
  process.stdout.write(`Recognition checks: heading=${/number bases?/i.test(text)}, workedExample=${/worked\s+examples?/i.test(text)}, exercise=${/exercises?/i.test(text)}, baseNotation=${/(?:[01]{2,}\s*(?:₂|_2|base\s*2)|base\s*\(?2\)?)/i.test(text)}\n`);
} finally {
  await clean();
}

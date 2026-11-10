import { Db, MongoClient } from "mongodb";

declare global { var cognifyMongoPromise: Promise<MongoClient> | undefined }
let localPromise: Promise<MongoClient> | undefined;
function getClient() {
  const uri = process.env.MONGODB_URI;
  if (!uri || !process.env.MONGODB_DATABASE) throw new Error("MONGODB_URI and MONGODB_DATABASE must be configured");
  if (process.env.NODE_ENV !== "production" && global.cognifyMongoPromise) return global.cognifyMongoPromise;
  if (process.env.NODE_ENV === "production" && localPromise) return localPromise;
  const promise = new MongoClient(uri).connect();
  if (process.env.NODE_ENV !== "production") global.cognifyMongoPromise = promise;
  else localPromise = promise;
  void promise.catch(() => {
    if (process.env.NODE_ENV !== "production" && global.cognifyMongoPromise === promise) global.cognifyMongoPromise = undefined;
    if (process.env.NODE_ENV === "production" && localPromise === promise) localPromise = undefined;
  });
  return promise;
}

export async function getDb(): Promise<Db> { return (await getClient()).db(process.env.MONGODB_DATABASE!); }

let indexesPromise: Promise<void> | undefined;
export async function ensureIndexes(): Promise<void> {
  if (!indexesPromise) indexesPromise = (async () => {
    const db = await getDb();
    await Promise.all([
      db.collection("users").createIndex({ email: 1 }, { unique: true, name: "email_unique" }),
      db.collection("sessions").createIndex({ tokenHash: 1 }, { unique: true, name: "session_token_unique" }),
      db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "session_expiry" }),
      db.collection("courses").createIndex({ studentId: 1, status: 1, updatedAt: -1 }, { name: "student_courses" }),
      db.collection("courses").createIndex({ studentId: 1, migratedWorkspaceId: 1 }, { unique: true, partialFilterExpression: { migratedWorkspaceId: { $exists: true } }, name: "migrated_workspace_course" }),
      db.collection("studyWorkspaces").createIndex({ studentId: 1, courseId: 1 }, { unique: true, name: "student_course_workspace" }),
      db.collection("studyWorkspaces").createIndex({ studentId: 1, legacyId: 1 }, { unique: true, name: "student_legacy_workspace" }),
      db.collection("authRateLimits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "auth_rate_expiry" }),
      db.collection("authRateLimits").createIndex({ bucketKey: 1 }, { unique: true, name: "auth_rate_bucket" }),
      db.collection("documents").createIndex({ studentId: 1, courseId: 1, documentType: 1, createdAt: -1 }, { name: "course_documents" }),
      db.collection("documents").createIndex({ studentId: 1, _id: 1 }, { name: "owned_documents" }),
      db.collection("ocrPages").createIndex({ documentId: 1, sourceFileId: 1, pageNumber: 1 }, { unique: true, name: "ocr_page_identity" }),
      db.collection("ocrPages").createIndex({ documentId: 1, pageNumber: 1 }, { name: "document_pages" }),
      db.collection("ocrPages").createIndex({ studentId: 1, courseId: 1, status: 1 }, { name: "student_ocr_status" }),
      db.collection("processingJobs").createIndex({ status: 1, createdAt: 1 }, { name: "queued_jobs" }),
      db.collection("processingJobs").createIndex({ leaseUntil: 1 }, { name: "job_lease" }),
      db.collection("processingJobs").createIndex({ documentId: 1, jobType: 1 }, { unique: true, name: "document_ocr_job" }),
      db.collection("pastQuestions").createIndex({ documentId: 1, sourceFileId: 1, sourcePageNumbers: 1, questionNumber: 1 }, { name: "question_source" }),
      db.collection("pastQuestions").createIndex({ studentId: 1, courseId: 1, extractionStatus: 1 }, { name: "student_questions" }),
    ]);
  })().catch(error => { indexesPromise = undefined; throw error; });
  return indexesPromise;
}

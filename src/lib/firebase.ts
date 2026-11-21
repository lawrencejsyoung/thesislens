import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
  Firestore,
} from "firebase/firestore";
import { CompleteAnalysisResult } from "./types";

const LOCAL_STORAGE_KEY = "thesislens_saved_memos_v1";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
}

let cachedApp: FirebaseApp | null = null;
let cachedDb: Firestore | null = null;

function getDb(): Firestore | null {
  if (!isFirebaseConfigured()) return null;
  if (!cachedApp) {
    cachedApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  }
  if (!cachedDb) {
    cachedDb = getFirestore(cachedApp);
  }
  return cachedDb;
}

export async function saveMemo(result: CompleteAnalysisResult): Promise<"firestore" | "local"> {
  // Always keep a local copy for instant responsiveness
  if (typeof window !== "undefined") {
    try {
      const existing = loadLocalMemos();
      const filtered = existing.filter((m) => m.id !== result.id);
      const updated = [result, ...filtered].slice(0, 15);
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore storage quota issues
    }
  }

  const db = getDb();
  if (db) {
    try {
      await addDoc(collection(db, "investment_memos"), {
        ...result,
        // Strip large base64 attachments before storing in Firestore
        request: {
          ...result.request,
          attachmentBase64: undefined,
        },
      });
      return "firestore";
    } catch {
      return "local";
    }
  }

  return "local";
}

export function loadLocalMemos(): CompleteAnalysisResult[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CompleteAnalysisResult[];
  } catch {
    return [];
  }
}

export async function listSavedMemos(): Promise<{
  memos: CompleteAnalysisResult[];
  source: "firestore" | "local";
}> {
  const db = getDb();
  if (db) {
    try {
      const q = query(
        collection(db, "investment_memos"),
        orderBy("createdAt", "desc"),
        limit(15)
      );
      const snap = await getDocs(q);
      const memos = snap.docs.map((d) => d.data() as CompleteAnalysisResult);
      if (memos.length > 0) {
        return { memos, source: "firestore" };
      }
    } catch {
      // fall through to local
    }
  }

  return { memos: loadLocalMemos(), source: "local" };
}

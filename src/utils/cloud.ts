/**
 * Cloud account layer (Firebase Auth + Firestore).
 * LocalStorage stays the primary store; the cloud is an explicit mirror
 * controlled by the user (upload / download in CloudAccountModal).
 * Big arrays are chunked by serialized size (Firestore doc limit = 1 MiB).
 */
import { initializeApp } from 'firebase/app';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, onAuthStateChanged, type User
} from 'firebase/auth';
import {
  getFirestore, doc, getDoc, setDoc, collection, getDocs, writeBatch
} from 'firebase/firestore';
import { AppState, Word, HistItem } from '../types';

const firebaseConfig = {
  apiKey: "AIzaSyCIKs70oQ93JdjZawuM78EPYXb1yLwSaqU",
  authDomain: "wortbuch-ca6e1.firebaseapp.com",
  projectId: "wortbuch-ca6e1",
  storageBucket: "wortbuch-ca6e1.firebasestorage.app",
  messagingSenderId: "343074765360",
  appId: "1:343074765360:web:78d37d3f72de4a4f088bf5"
};

let initialized = false;
function ensureInit() {
  if (!initialized) { initializeApp(firebaseConfig); initialized = true; }
}

/** Subscribes to auth changes; returns an unsubscribe function. */
export function onCloudUserChanged(cb: (u: User | null) => void): () => void {
  ensureInit();
  return onAuthStateChanged(getAuth(), u => cb(u));
}

function friendly(e: any): string {
  const c = String(e?.code || '');
  if (c.includes('popup-closed') || c.includes('cancelled-popup')) return 'پنجرهٔ ورود گوگل بسته شد.';
  if (c.includes('unauthorized-domain')) return 'دامنهٔ این سایت در Firebase مجاز نیست (Authentication ← Settings ← Authorized domains).';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found') || c.includes('invalid-login-credentials')) return 'ایمیل یا رمز عبور درست نیست.';
  if (c.includes('email-already-in-use')) return 'این ایمیل قبلاً ثبت شده؛ «ورود» را بزن.';
  if (c.includes('weak-password')) return 'رمز عبور ضعیف است (حداقل ۶ کاراکتر).';
  if (c.includes('too-many-requests')) return 'تلاش‌های زیاد؛ کمی صبر کن و دوباره امتحان کن.';
  if (c.includes('network')) return 'اینترنت در دسترس نیست.';
  return e?.message || 'خطای نامشخص در اتصال ابری.';
}

export async function signInWithGoogle(): Promise<User> {
  ensureInit();
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(getAuth(), provider);
  return cred.user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  ensureInit();
  const cred = await signInWithEmailAndPassword(getAuth(), email.trim(), password);
  return cred.user;
}

export async function registerWithEmail(email: string, password: string): Promise<User> {
  ensureInit();
  const cred = await createUserWithEmailAndPassword(getAuth(), email.trim(), password);
  return cred.user;
}

export async function signOutCloud(): Promise<void> {
  ensureInit();
  await signOut(getAuth());
}

function chunkBySize<T>(items: T[], maxBytes = 550000): T[][] {
  const chunks: T[][] = [];
  let cur: T[] = [];
  let size = 2;
  for (const it of items) {
    const s = JSON.stringify(it).length + 1;
    if (cur.length && size + s > maxBytes) { chunks.push(cur); cur = []; size = 2; }
    cur.push(it); size += s;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

export interface CloudMeta {
  words: number;
  hist: number;
  updatedAt: number;
}

/** Replaces the whole cloud mirror with the given state. */
export async function uploadStateToCloud(user: User, state: AppState): Promise<void> {
  ensureInit();
  const db = getFirestore();

  // remove previous chunks (both collections)
  for (const col of ['words', 'hist'] as const) {
    const snap = await getDocs(collection(db, 'users', user.uid, col));
    if (!snap.empty) {
      const del = writeBatch(db);
      snap.forEach(d => del.delete(d.ref));
      await del.commit();
    }
  }

  // write new chunks (batched; max 500 ops per batch)
  let batch = writeBatch(db);
  let ops = 0;
  const flush = async () => { if (ops > 0) { await batch.commit(); batch = writeBatch(db); ops = 0; } };
  chunkBySize(state.words).forEach((items, i) => { batch.set(doc(db, 'users', user.uid, 'words', `c${i}`), { i, items }); ops++; });
  chunkBySize(state.hist).forEach((items, i) => { batch.set(doc(db, 'users', user.uid, 'hist', `c${i}`), { i, items }); ops++; });
  await flush();

  await setDoc(doc(db, 'users', user.uid, 'meta', 'main'), {
    v: state.v, sv: state.sv, set: state.set, daily: state.daily,
    words: state.words.length, hist: state.hist.length, updatedAt: Date.now()
  });
}

/** Metadata of the cloud mirror (null = cloud is empty). */
export async function fetchCloudMeta(user: User): Promise<CloudMeta | null> {
  ensureInit();
  const snap = await getDoc(doc(getFirestore(), 'users', user.uid, 'meta', 'main'));
  if (!snap.exists()) return null;
  const d = snap.data() as any;
  return { words: +d.words || 0, hist: +d.hist || 0, updatedAt: +d.updatedAt || 0 };
}

/** Downloads the cloud mirror and reassembles the AppState (null = empty). */
export async function downloadStateFromCloud(user: User): Promise<AppState | null> {
  ensureInit();
  const db = getFirestore();
  const metaSnap = await getDoc(doc(db, 'users', user.uid, 'meta', 'main'));
  if (!metaSnap.exists()) return null;
  const meta = metaSnap.data() as any;

  const collect = async (col: string): Promise<any[]> => {
    const snap = await getDocs(collection(db, 'users', user.uid, col));
    const parts: { i: number; items: any[] }[] = [];
    snap.forEach(d => { const v = d.data(); parts.push({ i: +v.i || 0, items: Array.isArray(v.items) ? v.items : [] }); });
    parts.sort((a, b) => a.i - b.i);
    return parts.flatMap(p => p.items);
  };

  const words = (await collect('words')) as Word[];
  const hist = (await collect('hist')) as HistItem[];
  return {
    v: meta.v || 1, sv: meta.sv || 1,
    words, hist,
    set: meta.set || {}, daily: meta.daily || { d: '', n: 0, r: 0 }
  } as AppState;
}

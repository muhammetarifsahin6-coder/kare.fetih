import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  User,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocs,
   getFirestore,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { MatchState, PlayerProfile } from '../game/types';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

if (typeof window !== 'undefined') {
  testConnection();
}

export function subscribeToAuth(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle(): Promise<User | null> {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export async function syncProfileToCloud(profile: PlayerProfile): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const safeProfileId = `${user.uid}_${profile.profileId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  const path = `profiles/${safeProfileId}`;
  try {
    await setDoc(doc(db, 'profiles', safeProfileId), {
      ownerId: user.uid,
      profileId: safeProfileId,
      name: profile.name.slice(0, 40),
      color: profile.colorKey.slice(0, 20),
      totalMatches: Math.max(0, Math.floor(profile.totalMatches)),
      wins: Math.max(0, Math.floor(profile.wins)),
      losses: Math.max(0, Math.floor(profile.losses)),
      draws: Math.max(0, Math.floor(profile.draws)),
      fullConquestWins: Math.max(0, Math.floor(profile.fullConquestWins)),
      turnLimitedWins: Math.max(0, Math.floor(profile.turnLimitedWins)),
      totalConqueredTiles: Math.max(0, Math.floor(profile.totalConqueredTiles)),
      eliminationsCaused: Math.max(0, Math.floor(profile.eliminationsCaused)),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncSavedMatchToCloud(match: MatchState): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const safeMatchId = match.matchId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  const path = `savedMatches/${safeMatchId}`;
  const payload = JSON.stringify(match);
  if (payload.length > 195000) return;

  try {
    await setDoc(doc(db, 'savedMatches', safeMatchId), {
      ownerId: user.uid,
      matchId: safeMatchId,
      boardSize: match.boardSize,
      status: match.status === 'playing' ? 'active' : 'completed',
      turnNumber: match.turnNumber,
      statePayload: payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchCloudSavedMatches(): Promise<MatchState[]> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return [];

  const path = 'savedMatches';
  try {
    const q = query(collection(db, 'savedMatches'), where('ownerId', '==', user.uid));
    const snap = await getDocs(q);
    const matches: MatchState[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.status === 'active' && typeof data.statePayload === 'string') {
        try {
          matches.push(JSON.parse(data.statePayload) as MatchState);
        } catch {
          // Ignore malformed payload
        }
      }
    });
    return matches;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function deleteCloudSavedMatch(matchId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;
  const safeMatchId = matchId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  const path = `savedMatches/${safeMatchId}`;
  try {
    await deleteDoc(doc(db, 'savedMatches', safeMatchId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function updateCloudMatchStatus(matchId: string, match: MatchState): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;
  const safeMatchId = matchId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  const path = `savedMatches/${safeMatchId}`;
  try {
    await updateDoc(doc(db, 'savedMatches', safeMatchId), {
      status: match.status === 'playing' ? 'active' : 'completed',
      turnNumber: match.turnNumber,
      statePayload: JSON.stringify(match),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

import { FieldValue, type DocumentData } from 'firebase-admin/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { adminDb } from './firebaseAdmin.ts';

const PROJECT_ID = firebaseConfig.projectId;
const DATABASE_ID = firebaseConfig.firestoreDatabaseId || '(default)';
const API_KEY = firebaseConfig.apiKey;
const DOCS_ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;

let adminAccessChecked = false;
let adminAccessOk = false;

export async function probeAdminSdkAccess(): Promise<boolean> {
  if (adminAccessChecked) return adminAccessOk;
  try {
    await adminDb.collection('test').doc('connection').get();
    adminAccessOk = true;
  } catch {
    adminAccessOk = false;
  }
  adminAccessChecked = true;
  return adminAccessOk;
}

// Marker helpers so routes can express atomic increments/arrayUnion portably
export interface IncrementOp {
  __op: 'increment';
  by: number;
}
export interface ArrayUnionOp {
  __op: 'arrayUnion';
  elements: unknown[];
}

export function incrementVal(by: number): any {
  return { __op: 'increment', by } as IncrementOp;
}

export function arrayUnionVal(...elements: unknown[]): any {
  return { __op: 'arrayUnion', elements } as ArrayUnionOp;
}

function isIncrementOp(v: any): v is IncrementOp {
  return v && typeof v === 'object' && v.__op === 'increment';
}

function isArrayUnionOp(v: any): v is ArrayUnionOp {
  return v && typeof v === 'object' && v.__op === 'arrayUnion';
}

function toAdminValue(v: any): any {
  if (isIncrementOp(v)) return FieldValue.increment(v.by);
  if (isArrayUnionOp(v)) return FieldValue.arrayUnion(...v.elements);
  if (Array.isArray(v)) return v.map(toAdminValue);
  if (v && typeof v === 'object') {
    const out: Record<string, any> = {};
    for (const [k, val] of Object.entries(v)) {
      if (val !== undefined) out[k] = toAdminValue(val);
    }
    return out;
  }
  return v;
}

function toFsValue(v: any): any {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return { integerValue: String(v) };
    return { doubleValue: v };
  }
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(toFsValue) } };
  }
  if (typeof v === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, val] of Object.entries(v)) {
      if (val !== undefined && !isIncrementOp(val) && !isArrayUnionOp(val)) {
        fields[k] = toFsValue(val);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

function fromFsValue(v: any): any {
  if (!v || typeof v !== 'object') return undefined;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return Boolean(v.booleanValue);
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return String(v.stringValue);
  if ('timestampValue' in v) return String(v.timestampValue);
  if ('arrayValue' in v) {
    return Array.isArray(v.arrayValue?.values) ? v.arrayValue.values.map(fromFsValue) : [];
  }
  if ('mapValue' in v) {
    const out: Record<string, any> = {};
    const fields = v.mapValue?.fields || {};
    for (const [k, val] of Object.entries(fields)) {
      out[k] = fromFsValue(val);
    }
    return out;
  }
  return undefined;
}

function fromFsDocument(docJson: any): { id: string; data: DocumentData } {
  const name = String(docJson.name || '');
  const id = name.split('/').pop() || '';
  const data: Record<string, any> = {};
  const fields = docJson.fields || {};
  for (const [k, val] of Object.entries(fields)) {
    data[k] = fromFsValue(val);
  }
  return { id, data };
}

function buildHeaders(idToken?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  return headers;
}

function docUrl(docPath: string, params?: Record<string, string | string[]>): string {
  const url = new URL(`${DOCS_ROOT}/${docPath}`);
  if (!params) {
    url.searchParams.set('key', API_KEY);
    return url.toString();
  }
  url.searchParams.set('key', API_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      v.forEach((item) => url.searchParams.append(k, item));
    } else {
      url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

export interface WhereClause {
  field: string;
  op: '==' | 'in' | '>=' | '<=';
  value: any;
}

const OP_MAP: Record<WhereClause['op'], string> = {
  '==': 'EQUAL',
  in: 'IN',
  '>=': 'GREATER_THAN_OR_EQUAL',
  '<=': 'LESS_THAN_OR_EQUAL',
};

export interface QueryOptions {
  where?: WhereClause[];
  orderBy?: { field: string; dir?: 'asc' | 'desc' };
  limit?: number;
}

export async function dbGetDoc<T = DocumentData>(
  docPath: string,
  idToken?: string
): Promise<{ exists: boolean; id: string; data: T | null }> {
  const useAdmin = await probeAdminSdkAccess();
  if (useAdmin) {
    const snap = await adminDb.doc(docPath).get();
    return {
      exists: snap.exists,
      id: snap.id,
      data: snap.exists ? (snap.data() as T) : null,
    };
  }

  const res = await fetch(docUrl(docPath), { headers: buildHeaders(idToken) });
  if (res.status === 404) {
    return { exists: false, id: docPath.split('/').pop() || '', data: null };
  }
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Firestore GET ${docPath} failed (${res.status}): ${txt}`);
  }
  const json = await res.json();
  const parsed = fromFsDocument(json);
  return { exists: true, id: parsed.id, data: parsed.data as T };
}

export async function dbQueryCollection<T = DocumentData>(
  collectionPath: string,
  opts: QueryOptions = {},
  idToken?: string
): Promise<Array<{ id: string; data: T }>> {
  const useAdmin = await probeAdminSdkAccess();
  if (useAdmin) {
    let ref: FirebaseFirestore.Query = adminDb.collection(collectionPath);
    if (opts.where) {
      for (const w of opts.where) {
        ref = ref.where(w.field, w.op, w.value);
      }
    }
    if (opts.orderBy) {
      ref = ref.orderBy(opts.orderBy.field, opts.orderBy.dir || 'asc');
    }
    if (opts.limit) {
      ref = ref.limit(opts.limit);
    }
    const snap = await ref.get();
    return snap.docs.map((d) => ({ id: d.id, data: d.data() as T }));
  }

  const parts = collectionPath.split('/').filter(Boolean);
  const collectionId = parts.pop()!;
  const parentPath = parts.join('/');
  const endpoint = parentPath ? `${DOCS_ROOT}/${parentPath}:runQuery?key=${API_KEY}` : `${DOCS_ROOT}:runQuery?key=${API_KEY}`;

  const structuredQuery: any = {
    from: [{ collectionId }],
  };

  if (opts.where && opts.where.length > 0) {
    const filters = opts.where.map((w) => ({
      fieldFilter: {
        field: { fieldPath: w.field },
        op: OP_MAP[w.op],
        value: toFsValue(w.value),
      },
    }));
    structuredQuery.where =
      filters.length === 1
        ? filters[0]
        : { compositeFilter: { op: 'AND', filters } };
  }

  if (opts.orderBy) {
    structuredQuery.orderBy = [
      {
        field: { fieldPath: opts.orderBy.field },
        direction: opts.orderBy.dir === 'desc' ? 'DESCENDING' : 'ASCENDING',
      },
    ];
  }

  if (opts.limit) {
    structuredQuery.limit = opts.limit;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: buildHeaders(idToken),
    body: JSON.stringify({ structuredQuery }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Firestore query ${collectionPath} failed (${res.status}): ${txt}`);
  }
  const rows: any[] = await res.json();
  const out: Array<{ id: string; data: T }> = [];
  for (const r of rows) {
    if (r.document) {
      const parsed = fromFsDocument(r.document);
      out.push({ id: parsed.id, data: parsed.data as T });
    }
  }
  return out;
}

function splitFieldsAndTransforms(data: Record<string, any>) {
  const fields: Record<string, any> = {};
  const fieldPaths: string[] = [];
  const fieldTransforms: any[] = [];

  for (const [k, val] of Object.entries(data)) {
    if (val === undefined) continue;
    if (isIncrementOp(val)) {
      fieldTransforms.push({ fieldPath: k, increment: toFsValue(val.by) });
    } else if (isArrayUnionOp(val)) {
      fieldTransforms.push({
        fieldPath: k,
        appendMissingElements: { values: val.elements.map(toFsValue) },
      });
    } else {
      fields[k] = toFsValue(val);
      fieldPaths.push(k);
    }
  }
  return { fields, fieldPaths, fieldTransforms };
}

async function commitFieldsAndTransforms(
  docPath: string,
  data: Record<string, any>,
  requireExists: boolean,
  idToken?: string
): Promise<void> {
  const { fields, fieldPaths, fieldTransforms } = splitFieldsAndTransforms(data);
  const docName = `projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/${docPath}`;
  const writes: any[] = [];

  if (fieldPaths.length > 0) {
    const w: any = {
      update: { name: docName, fields },
      updateMask: { fieldPaths },
    };
    if (requireExists) w.currentDocument = { exists: true };
    writes.push(w);
  }
  if (fieldTransforms.length > 0) {
    const w: any = {
      transform: { document: docName, fieldTransforms },
    };
    if (requireExists && fieldPaths.length === 0) {
      w.currentDocument = { exists: true };
    }
    writes.push(w);
  }

  if (writes.length === 0) return;

  const res = await fetch(`${DOCS_ROOT}:commit?key=${API_KEY}`, {
    method: 'POST',
    headers: buildHeaders(idToken),
    body: JSON.stringify({ writes }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Firestore COMMIT ${docPath} failed (${res.status}): ${txt}`);
  }
}

export async function dbSetDoc(
  docPath: string,
  data: Record<string, any>,
  opts: { merge?: boolean } = {},
  idToken?: string
): Promise<void> {
  const useAdmin = await probeAdminSdkAccess();
  if (useAdmin) {
    await adminDb.doc(docPath).set(toAdminValue(data), { merge: Boolean(opts.merge) });
    return;
  }

  const hasOps = Object.values(data).some((v) => isIncrementOp(v) || isArrayUnionOp(v));
  if (opts.merge && hasOps) {
    await commitFieldsAndTransforms(docPath, data, false, idToken);
    return;
  }

  const { fields, fieldPaths } = splitFieldsAndTransforms(data);
  const url = opts.merge
    ? docUrl(docPath, { 'updateMask.fieldPaths': fieldPaths })
    : docUrl(docPath);

  const res = await fetch(url, {
    method: 'PATCH',
    headers: buildHeaders(idToken),
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Firestore SET ${docPath} failed (${res.status}): ${txt}`);
  }
}

export async function dbUpdateDoc(
  docPath: string,
  data: Record<string, any>,
  idToken?: string
): Promise<void> {
  const useAdmin = await probeAdminSdkAccess();
  if (useAdmin) {
    await adminDb.doc(docPath).update(toAdminValue(data));
    return;
  }

  const hasOps = Object.values(data).some((v) => isIncrementOp(v) || isArrayUnionOp(v));
  if (hasOps) {
    await commitFieldsAndTransforms(docPath, data, true, idToken);
    return;
  }

  const { fields, fieldPaths } = splitFieldsAndTransforms(data);
  const res = await fetch(
    docUrl(docPath, {
      'updateMask.fieldPaths': fieldPaths,
      'currentDocument.exists': 'true',
    }),
    {
      method: 'PATCH',
      headers: buildHeaders(idToken),
      body: JSON.stringify({ fields }),
    }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Firestore UPDATE ${docPath} failed (${res.status}): ${txt}`);
  }
}

export async function dbDeleteDoc(docPath: string, idToken?: string): Promise<void> {
  const useAdmin = await probeAdminSdkAccess();
  if (useAdmin) {
    await adminDb.doc(docPath).delete();
    return;
  }
  const res = await fetch(docUrl(docPath), {
    method: 'DELETE',
    headers: buildHeaders(idToken),
  });
  if (!res.ok && res.status !== 404) {
    const txt = await res.text();
    throw new Error(`Firestore DELETE ${docPath} failed (${res.status}): ${txt}`);
  }
}

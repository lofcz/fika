import type DexieType from 'dexie';
import type { EntityTable } from 'dexie';
import type { Patch } from 'immer';
import { databaseId } from '@/store/main';
import type { Slide, SlideTemplate, SlideTheme } from '@/types/slides';
import { LOCALSTORAGE_KEY_DISCARDED_DB } from '@/configs/storage';

export interface writingBoardImg {
  id: string;
  dataURL: string;
}

export interface Snapshot {
  id: number;
  index: number;
  title?: string;
  theme?: SlideTheme;
  viewportSize?: number;
  viewportRatio?: number;
  viewportWidthInches?: number;
  templates?: SlideTemplate[];
  slides?: Slide[];
  patches?: Patch[];
  inversePatches?: Patch[];
}

export type FikaDatabase = DexieType & {
  snapshots: EntityTable<Snapshot, 'id'>;
  writingBoardImgs: EntityTable<writingBoardImg, 'id'>;
};

const databaseNamePrefix = 'Fika';
const createdAt = Date.now();

let cachedDb: FikaDatabase | null = null;
let dbPromise: Promise<FikaDatabase> | null = null;

/** Lazily load Dexie and open the session database on first actual use. */
export async function getDb(): Promise<FikaDatabase> {
  if (cachedDb) return cachedDb;
  if (!dbPromise) {
    dbPromise = import('dexie').then(({ default: Dexie }) => {
      const instance = new Dexie(`${databaseNamePrefix}_${databaseId}_${createdAt}`) as FikaDatabase;
      instance.version(2).stores({
        snapshots: '++id',
        writingBoardImgs: 'id',
      });
      cachedDb = instance;
      return instance;
    }).catch(error => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

export const deleteDiscardedDB = async () => {
  const { default: Dexie } = await import('dexie');
  const now = Date.now();
  const localStorageDiscardedDB = localStorage.getItem(LOCALSTORAGE_KEY_DISCARDED_DB);
  const localStorageDiscardedDBList: string[] = localStorageDiscardedDB ? JSON.parse(localStorageDiscardedDB) : [];
  const databaseNames = await Dexie.getDatabaseNames();
  const discardedDBNames = databaseNames.filter(name => {
    if (name.indexOf(databaseNamePrefix) === -1) return false;
    const [prefix, id, time] = name.split('_');
    if (prefix !== databaseNamePrefix || !id || !time) return true;
    if (localStorageDiscardedDBList.includes(id)) return true;
    if (now - +time >= 1000 * 60 * 60 * 12) return true;
    return false;
  });
  for (const name of discardedDBNames) Dexie.delete(name);
  localStorage.removeItem(LOCALSTORAGE_KEY_DISCARDED_DB);
};

const snapshotsProxy = {
  clear() {
    return cachedDb ? cachedDb.snapshots.clear() : getDb().then(real => real.snapshots.clear());
  },
  add(entry: Omit<Snapshot, 'id'>) {
    return cachedDb ? cachedDb.snapshots.add(entry) : getDb().then(real => real.snapshots.add(entry));
  },
  get(key: number) {
    return cachedDb ? cachedDb.snapshots.get(key) : getDb().then(real => real.snapshots.get(key));
  },
  bulkGet(keys: number[]) {
    return cachedDb ? cachedDb.snapshots.bulkGet(keys) : getDb().then(real => real.snapshots.bulkGet(keys));
  },
  put(entry: Snapshot) {
    return cachedDb ? cachedDb.snapshots.put(entry) : getDb().then(real => real.snapshots.put(entry));
  },
  update(key: number, changes: Partial<Snapshot>) {
    return cachedDb ? cachedDb.snapshots.update(key, changes) : getDb().then(real => real.snapshots.update(key, changes));
  },
  delete(key: number) {
    return cachedDb ? cachedDb.snapshots.delete(key) : getDb().then(real => real.snapshots.delete(key));
  },
  bulkDelete(keys: number[]) {
    return cachedDb ? cachedDb.snapshots.bulkDelete(keys) : getDb().then(real => real.snapshots.bulkDelete(keys));
  },
  orderBy(index: string) {
    return {
      primaryKeys() {
        return cachedDb
          ? cachedDb.snapshots.orderBy(index).primaryKeys()
          : getDb().then(real => real.snapshots.orderBy(index).primaryKeys());
      },
      toArray() {
        return cachedDb
          ? cachedDb.snapshots.orderBy(index).toArray()
          : getDb().then(real => real.snapshots.orderBy(index).toArray());
      },
    };
  },
};

const writingBoardImgsProxy = {
  clear() {
    return cachedDb ? cachedDb.writingBoardImgs.clear() : getDb().then(real => real.writingBoardImgs.clear());
  },
  add(entry: writingBoardImg) {
    return cachedDb ? cachedDb.writingBoardImgs.add(entry) : getDb().then(real => real.writingBoardImgs.add(entry));
  },
  put(entry: writingBoardImg) {
    return cachedDb ? cachedDb.writingBoardImgs.put(entry) : getDb().then(real => real.writingBoardImgs.put(entry));
  },
  update(keyOrObject: string | writingBoardImg, changes: Partial<writingBoardImg>) {
    return cachedDb
      ? cachedDb.writingBoardImgs.update(keyOrObject, changes)
      : getDb().then(real => real.writingBoardImgs.update(keyOrObject, changes));
  },
  get(key: string) {
    return cachedDb ? cachedDb.writingBoardImgs.get(key) : getDb().then(real => real.writingBoardImgs.get(key));
  },
  delete(key: string) {
    return cachedDb ? cachedDb.writingBoardImgs.delete(key) : getDb().then(real => real.writingBoardImgs.delete(key));
  },
  where(index: string) {
    return {
      equals(value: string) {
        return {
          toArray() {
            return cachedDb
              ? cachedDb.writingBoardImgs.where(index).equals(value).toArray()
              : getDb().then(real => real.writingBoardImgs.where(index).equals(value).toArray());
          },
          first() {
            return cachedDb
              ? cachedDb.writingBoardImgs.where(index).equals(value).first()
              : getDb().then(real => real.writingBoardImgs.where(index).equals(value).first());
          },
          delete() {
            return cachedDb
              ? cachedDb.writingBoardImgs.where(index).equals(value).delete()
              : getDb().then(real => real.writingBoardImgs.where(index).equals(value).delete());
          },
        };
      },
    };
  },
  toArray() {
    return cachedDb ? cachedDb.writingBoardImgs.toArray() : getDb().then(real => real.writingBoardImgs.toArray());
  },
};

/**
 * Lazy Dexie facade. Keeps the existing `db` call contract (and test mocks)
 * while deferring `import('dexie')` and IndexedDB open until first access.
 * Once resolved, `cachedDb` serves calls synchronously inside Dexie transactions.
 */
export const db = {
  snapshots: snapshotsProxy,
  writingBoardImgs: writingBoardImgsProxy,
  async transaction<T>(mode: 'r' | 'rw', table: unknown, fn: () => Promise<T> | T): Promise<T> {
    const real = await getDb();
    const realTable = table === snapshotsProxy
      ? real.snapshots
      : table === writingBoardImgsProxy
        ? real.writingBoardImgs
        : table;
    return real.transaction(mode, realTable as EntityTable<Snapshot, 'id'>, fn);
  },
};

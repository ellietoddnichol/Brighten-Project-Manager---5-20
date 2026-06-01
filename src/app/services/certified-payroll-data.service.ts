import { Injectable, NgZone, inject, signal } from '@angular/core';
import { Observable, BehaviorSubject, from } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import {
  AdpPayrollDetail,
  CertifiedPayrollEntry,
  CertifiedPayrollException,
  CertifiedPayrollExport,
  CertifiedPayrollTask,
  CertifiedPayrollWeek,
  EmployeePayrollInfo,
  StoredClassificationRate,
  StoredFringeRate,
} from '../models/certified-payroll.types';
import { auth, db } from '../firebase';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

function forFirestore<T extends Record<string, unknown>>(data: T): T {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  ) as T;
}

@Injectable({ providedIn: 'root' })
export class CertifiedPayrollDataService {
  private ngZone = inject(NgZone);

  private weeksSubject = new BehaviorSubject<CertifiedPayrollWeek[]>([]);
  private entriesSubject = new BehaviorSubject<CertifiedPayrollEntry[]>([]);
  private exceptionsSubject = new BehaviorSubject<CertifiedPayrollException[]>([]);
  private tasksSubject = new BehaviorSubject<CertifiedPayrollTask[]>([]);
  private exportsSubject = new BehaviorSubject<CertifiedPayrollExport[]>([]);
  private employeeInfoSubject = new BehaviorSubject<EmployeePayrollInfo[]>([]);
  private adpDetailsSubject = new BehaviorSubject<AdpPayrollDetail[]>([]);
  private classificationRatesSubject = new BehaviorSubject<StoredClassificationRate[]>([]);
  private fringeRatesSubject = new BehaviorSubject<StoredFringeRate[]>([]);

  initialized = signal(false);

  constructor() {
    auth.onAuthStateChanged(user => {
      if (user) {
        this.listen('certified-payroll-weeks', this.weeksSubject);
        this.listen('certified-payroll-entries', this.entriesSubject);
        this.listen('certified-payroll-exceptions', this.exceptionsSubject);
        this.listen('certified-payroll-tasks', this.tasksSubject);
        this.listen('certified-payroll-exports', this.exportsSubject);
        this.listen('employee-payroll-info', this.employeeInfoSubject);
        this.listen('adp-payroll-details', this.adpDetailsSubject);
        this.listen('classification-rates', this.classificationRatesSubject);
        this.listen('fringe-rates', this.fringeRatesSubject);
        this.initialized.set(true);
      } else {
        this.ngZone.run(() => {
          this.weeksSubject.next([]);
          this.entriesSubject.next([]);
          this.exceptionsSubject.next([]);
          this.tasksSubject.next([]);
          this.exportsSubject.next([]);
          this.employeeInfoSubject.next([]);
          this.adpDetailsSubject.next([]);
          this.classificationRatesSubject.next([]);
          this.fringeRatesSubject.next([]);
          this.initialized.set(false);
        });
      }
    });
  }

  private listen<T extends { id: string }>(
    collectionName: string,
    subject: BehaviorSubject<T[]>,
  ): void {
    const user = auth.currentUser;
    if (!user) return;

    onSnapshot(
      query(collection(db, collectionName), where('ownerId', '==', user.uid)),
      snapshot => {
        this.ngZone.run(() => {
          subject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as T)));
        });
      },
      error => console.error(`Firestore ${collectionName}:`, error),
    );
  }

  getWeeks(): Observable<CertifiedPayrollWeek[]> { return this.weeksSubject.asObservable(); }
  getWeeksSnapshot(): CertifiedPayrollWeek[] { return this.weeksSubject.value; }
  getEntries(): Observable<CertifiedPayrollEntry[]> { return this.entriesSubject.asObservable(); }
  getEntriesSnapshot(): CertifiedPayrollEntry[] { return this.entriesSubject.value; }
  getExceptions(): Observable<CertifiedPayrollException[]> { return this.exceptionsSubject.asObservable(); }
  getExceptionsSnapshot(): CertifiedPayrollException[] { return this.exceptionsSubject.value; }
  getTasks(): Observable<CertifiedPayrollTask[]> { return this.tasksSubject.asObservable(); }
  getTasksSnapshot(): CertifiedPayrollTask[] { return this.tasksSubject.value; }
  getExports(): Observable<CertifiedPayrollExport[]> { return this.exportsSubject.asObservable(); }
  getEmployeePayrollInfo(): Observable<EmployeePayrollInfo[]> { return this.employeeInfoSubject.asObservable(); }
  getEmployeePayrollInfoSnapshot(): EmployeePayrollInfo[] { return this.employeeInfoSubject.value; }
  getAdpPayrollDetails(): Observable<AdpPayrollDetail[]> { return this.adpDetailsSubject.asObservable(); }
  getAdpPayrollDetailsSnapshot(): AdpPayrollDetail[] { return this.adpDetailsSubject.value; }
  getClassificationRates(): Observable<StoredClassificationRate[]> { return this.classificationRatesSubject.asObservable(); }
  getFringeRates(): Observable<StoredFringeRate[]> { return this.fringeRatesSubject.asObservable(); }

  async upsertWeek(week: Partial<CertifiedPayrollWeek> & Pick<CertifiedPayrollWeek, 'id' | 'projectId' | 'weekEnding'>): Promise<CertifiedPayrollWeek> {
    const ownerId = auth.currentUser?.uid;
    if (!ownerId) throw new Error('Sign in before saving certified payroll weeks.');

    const existing = this.weeksSubject.value.find(w => w.id === week.id);
    const payload = forFirestore({
      ...week,
      id: week.id,
      ownerId,
      updatedAt: serverTimestamp(),
      ...(existing ? {} : { createdAt: serverTimestamp() }),
    });

    await setDoc(doc(db, 'certified-payroll-weeks', week.id), payload, { merge: true });
    return { ...existing, ...week, ownerId } as CertifiedPayrollWeek;
  }

  async upsertEntry(entry: Partial<CertifiedPayrollEntry> & Pick<CertifiedPayrollEntry, 'id' | 'weekId' | 'projectId' | 'weekEnding' | 'employeeName' | 'classification'>): Promise<void> {
    const ownerId = auth.currentUser?.uid;
    if (!ownerId) throw new Error('Sign in before saving certified payroll entries.');

    const existing = this.entriesSubject.value.find(e => e.id === entry.id);
    await setDoc(doc(db, 'certified-payroll-entries', entry.id), forFirestore({
      ...entry,
      id: entry.id,
      ownerId,
      updatedAt: serverTimestamp(),
      ...(existing ? {} : { createdAt: serverTimestamp() }),
    }), { merge: true });
  }

  async batchUpsertEntries(entries: Array<Partial<CertifiedPayrollEntry> & Pick<CertifiedPayrollEntry, 'id' | 'weekId' | 'projectId' | 'weekEnding' | 'employeeName' | 'classification'>>): Promise<void> {
    const ownerId = auth.currentUser?.uid;
    if (!ownerId || !entries.length) return;

    const BATCH_SIZE = 400;
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      for (const entry of entries.slice(i, i + BATCH_SIZE)) {
        const ref = doc(db, 'certified-payroll-entries', entry.id);
        batch.set(ref, forFirestore({
          ...entry,
          id: entry.id,
          ownerId,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        }), { merge: true });
      }
      await batch.commit();
    }
  }

  async upsertException(exception: Partial<CertifiedPayrollException> & Pick<CertifiedPayrollException, 'id' | 'projectId' | 'type' | 'message'>): Promise<void> {
    const ownerId = auth.currentUser?.uid;
    if (!ownerId) throw new Error('Sign in before saving exceptions.');

    const existing = this.exceptionsSubject.value.find(e => e.id === exception.id);
    await setDoc(doc(db, 'certified-payroll-exceptions', exception.id), forFirestore({
      resolved: false,
      severity: 'error',
      ...exception,
      id: exception.id,
      ownerId,
      updatedAt: serverTimestamp(),
      ...(existing ? {} : { createdAt: serverTimestamp() }),
    }), { merge: true });
  }

  async batchReplaceExceptions(
    projectId: string,
    weekId: string | undefined,
    exceptions: Array<Partial<CertifiedPayrollException> & Pick<CertifiedPayrollException, 'id' | 'projectId' | 'type' | 'message'>>,
  ): Promise<void> {
    const ownerId = auth.currentUser?.uid;
    if (!ownerId) return;

    const stale = this.exceptionsSubject.value.filter(e =>
      e.projectId === projectId
      && !e.resolved
      && (weekId ? e.weekId === weekId : !e.weekId),
    );

    const batch = writeBatch(db);
    for (const item of stale) {
      batch.update(doc(db, 'certified-payroll-exceptions', item.id), forFirestore({ resolved: true, updatedAt: serverTimestamp() }));
    }
    for (const ex of exceptions) {
      batch.set(doc(db, 'certified-payroll-exceptions', ex.id), forFirestore({
        resolved: false,
        severity: ex.severity ?? 'error',
        ...ex,
        ownerId,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      }), { merge: true });
    }
    await batch.commit();
  }

  createTask(task: Partial<CertifiedPayrollTask>): Observable<CertifiedPayrollTask> {
    return from((async () => {
      const id = uuidv4();
      const ownerId = auth.currentUser?.uid;
      if (!ownerId) throw new Error('Sign in before creating tasks.');

      const newTask = forFirestore({
        ...task,
        id,
        ownerId,
        autoGenerated: task.autoGenerated ?? true,
        category: 'certified-payroll' as const,
        status: task.status ?? 'Not Started',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'certified-payroll-tasks', id), newTask);
      return newTask as unknown as CertifiedPayrollTask;
    })());
  }

  updateTask(id: string, updates: Partial<CertifiedPayrollTask>): Observable<CertifiedPayrollTask> {
    return from((async () => {
      await updateDoc(doc(db, 'certified-payroll-tasks', id), forFirestore({
        ...updates,
        updatedAt: serverTimestamp(),
      }));
      const current = this.tasksSubject.value.find(t => t.id === id);
      return { ...current, ...updates } as CertifiedPayrollTask;
    })());
  }

  createExport(record: Partial<CertifiedPayrollExport>): Observable<CertifiedPayrollExport> {
    return from((async () => {
      const id = uuidv4();
      const ownerId = auth.currentUser?.uid;
      if (!ownerId) throw new Error('Sign in before exporting.');

      const payload = forFirestore({
        ...record,
        id,
        ownerId,
        createdAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'certified-payroll-exports', id), payload);
      return payload as unknown as CertifiedPayrollExport;
    })());
  }

  async upsertEmployeePayrollInfo(info: Partial<EmployeePayrollInfo> & Pick<EmployeePayrollInfo, 'id' | 'employeeKey' | 'employeeName'>): Promise<void> {
    const ownerId = auth.currentUser?.uid;
    if (!ownerId) throw new Error('Sign in before saving employee payroll info.');

    await setDoc(doc(db, 'employee-payroll-info', info.id), forFirestore({
      ...info,
      ownerId,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    }), { merge: true });
  }

  async upsertAdpPayrollDetail(detail: Partial<AdpPayrollDetail> & Pick<AdpPayrollDetail, 'id' | 'employeeKey' | 'employeeName'>): Promise<void> {
    const ownerId = auth.currentUser?.uid;
    if (!ownerId) throw new Error('Sign in before saving ADP payroll details.');

    await setDoc(doc(db, 'adp-payroll-details', detail.id), forFirestore({
      ...detail,
      ownerId,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    }), { merge: true });
  }

  async seedRatesIfEmpty(
    classificationRates: StoredClassificationRate[],
    fringeRates: StoredFringeRate[],
  ): Promise<void> {
    const ownerId = auth.currentUser?.uid;
    if (!ownerId) return;
    if (this.classificationRatesSubject.value.length) return;

    const batch = writeBatch(db);
    for (const rate of classificationRates) {
      batch.set(doc(db, 'classification-rates', rate.id), forFirestore({
        ...rate,
        ownerId,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      }), { merge: true });
    }
    for (const rate of fringeRates) {
      batch.set(doc(db, 'fringe-rates', rate.id), forFirestore({
        ...rate,
        ownerId,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      }), { merge: true });
    }
    await batch.commit();
  }
}

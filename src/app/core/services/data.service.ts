import { Injectable, NgZone, inject } from '@angular/core';
import { Observable, BehaviorSubject, from, firstValueFrom } from 'rxjs';
import { Project, Task, PO, ChangeOrder, Billing, ScheduleMilestone, Document, ProjectBudgetLine, ProjectFolder, ProjectFile, RequiredDocument, ProjectIssue, ProjectTask, Employee, TimeEntry } from '@app/models/types';
import { ChangeRequest, DailyLog, FieldIssue, Rfi, Submittal } from '@app/models/project-controls.types';
import { ProjectLaborActual } from '@app/models/labor-actual.types';
import { Subcontractor, ProjectSubcontractor, SubcontractorDocument, SubcontractorInvoice } from '@app/models/subcontractor.types';
import {
  ForemanBonusPayment,
  ForemanBonusPolicy,
  ForemanBonusRecord,
  ProjectForemanAssignment,
} from '@app/models/foreman-bonus.types';
import { LaborCodeMapping } from '@app/models/labor-code-mapping.types';
import { ARRecord, PayAppLine, ProjectFinancial } from '@app/models/financial.types';
import { findProjectMatches, pickCanonicalProject } from '@features/projects/utils/project-dedupe';
import localforage from 'localforage';
import { v4 as uuidv4 } from 'uuid';
import { db, auth } from '@app/firebase';
import { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, serverTimestamp, writeBatch } from 'firebase/firestore';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}

/** Firestore rejects undefined field values — strip them before every write. */
function forFirestore<T extends Record<string, unknown>>(data: T): T {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  ) as T;
}

@Injectable({ providedIn: 'root' })
export class DataService {
  private ngZone = inject(NgZone);
  private fileStore = localforage.createInstance({ name: 'brighten-files' });

  private projectsSubject = new BehaviorSubject<Project[]>([]);
  private posSubject = new BehaviorSubject<PO[]>([]);
  private changeOrdersSubject = new BehaviorSubject<ChangeOrder[]>([]);
  private tasksSubject = new BehaviorSubject<Task[]>([]);
  private billingsSubject = new BehaviorSubject<Billing[]>([]);
  private milestonesSubject = new BehaviorSubject<ScheduleMilestone[]>([]);
  private documentsSubject = new BehaviorSubject<Document[]>([]);
  private budgetLinesSubject = new BehaviorSubject<ProjectBudgetLine[]>([]);
  private projectFoldersSubject = new BehaviorSubject<ProjectFolder[]>([]);
  private projectFilesSubject = new BehaviorSubject<ProjectFile[]>([]);
  private requiredDocumentsSubject = new BehaviorSubject<RequiredDocument[]>([]);
  private projectIssuesSubject = new BehaviorSubject<ProjectIssue[]>([]);
  private projectTasksSubject = new BehaviorSubject<ProjectTask[]>([]);
  private changeRequestsSubject = new BehaviorSubject<ChangeRequest[]>([]);
  private rfisSubject = new BehaviorSubject<Rfi[]>([]);
  private submittalsSubject = new BehaviorSubject<Submittal[]>([]);
  private dailyLogsSubject = new BehaviorSubject<DailyLog[]>([]);
  private fieldIssuesSubject = new BehaviorSubject<FieldIssue[]>([]);
  private payAppLinesSubject = new BehaviorSubject<PayAppLine[]>([]);
  private arRecordsSubject = new BehaviorSubject<ARRecord[]>([]);
  private projectFinancialsSubject = new BehaviorSubject<ProjectFinancial[]>([]);
  private employeesSubject = new BehaviorSubject<Employee[]>([]);
  private timeEntriesSubject = new BehaviorSubject<TimeEntry[]>([]);
  private projectLaborActualsSubject = new BehaviorSubject<ProjectLaborActual[]>([]);
  private subcontractorsSubject = new BehaviorSubject<Subcontractor[]>([]);
  private projectSubcontractorsSubject = new BehaviorSubject<ProjectSubcontractor[]>([]);
  private subcontractorDocumentsSubject = new BehaviorSubject<SubcontractorDocument[]>([]);
  private subcontractorInvoicesSubject = new BehaviorSubject<SubcontractorInvoice[]>([]);
  private foremanBonusPoliciesSubject = new BehaviorSubject<ForemanBonusPolicy[]>([]);
  private projectForemanAssignmentsSubject = new BehaviorSubject<ProjectForemanAssignment[]>([]);
  private foremanBonusRecordsSubject = new BehaviorSubject<ForemanBonusRecord[]>([]);
  private foremanBonusPaymentsSubject = new BehaviorSubject<ForemanBonusPayment[]>([]);
  private laborCodeMappingsSubject = new BehaviorSubject<LaborCodeMapping[]>([]);
  private projectsSnapshotReady = false;
  private projectsSnapshotWaiters: Array<(projects: Project[]) => void> = [];

  constructor() {
    this.setupListeners();
  }

  private setupListeners() {
    auth.onAuthStateChanged(user => {
      if (user) {
        onSnapshot(query(collection(db, 'projects'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            const projects = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Project));
            this.projectsSubject.next(projects);
            // Wait for server snapshot — the first cache-only callback is often empty.
            if (!snapshot.metadata.fromCache || projects.length > 0) {
              this.markProjectsSnapshotReady(projects);
            }
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'projects'));

        setTimeout(() => {
          if (!this.projectsSnapshotReady) {
            this.markProjectsSnapshotReady(this.projectsSubject.value);
          }
        }, 8000);

        onSnapshot(query(collection(db, 'pos'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            this.posSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PO)));
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'pos'));

        onSnapshot(query(collection(db, 'change-orders'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            this.changeOrdersSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ChangeOrder)));
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'change-orders'));

        onSnapshot(query(collection(db, 'tasks'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            this.tasksSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Task)));
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'tasks'));

        onSnapshot(query(collection(db, 'billings'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            this.billingsSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Billing)));
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'billings'));
        
        onSnapshot(query(collection(db, 'milestones'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            this.milestonesSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ScheduleMilestone)));
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'milestones'));
        
        onSnapshot(query(collection(db, 'documents'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            this.documentsSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Document)));
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'documents'));

        onSnapshot(query(collection(db, 'budget-lines'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            this.budgetLinesSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ProjectBudgetLine)));
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'budget-lines'));

        onSnapshot(query(collection(db, 'project-folders'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            this.projectFoldersSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ProjectFolder)));
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'project-folders'));
        
        onSnapshot(query(collection(db, 'project-files'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            this.projectFilesSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ProjectFile)));
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'project-files'));
        
        onSnapshot(query(collection(db, 'required-documents'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            this.requiredDocumentsSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as RequiredDocument)));
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'required-documents'));

        onSnapshot(query(collection(db, 'project-issues'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            this.projectIssuesSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ProjectIssue)));
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'project-issues'));

        onSnapshot(query(collection(db, 'project-tasks'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            this.projectTasksSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ProjectTask)));
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'project-tasks'));

        onSnapshot(query(collection(db, 'change-requests'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            this.changeRequestsSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ChangeRequest)));
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'change-requests'));

        onSnapshot(query(collection(db, 'rfis'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            this.rfisSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Rfi)));
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'rfis'));

        onSnapshot(query(collection(db, 'submittals'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            this.submittalsSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Submittal)));
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'submittals'));

        onSnapshot(query(collection(db, 'daily-logs'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            this.dailyLogsSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as DailyLog)));
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'daily-logs'));

        onSnapshot(query(collection(db, 'field-issues'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            this.fieldIssuesSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as FieldIssue)));
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'field-issues'));

        onSnapshot(query(collection(db, 'pay-app-lines'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            this.payAppLinesSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PayAppLine)));
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'pay-app-lines'));

        onSnapshot(query(collection(db, 'ar-records'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            this.arRecordsSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ARRecord)));
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'ar-records'));

        onSnapshot(query(collection(db, 'employees'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            this.employeesSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Employee)));
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'employees'));

        onSnapshot(query(collection(db, 'time-entries'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            this.timeEntriesSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TimeEntry)));
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'time-entries'));

        onSnapshot(query(collection(db, 'project-labor-actuals'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            this.projectLaborActualsSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ProjectLaborActual)));
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'project-labor-actuals'));

        onSnapshot(query(collection(db, 'subcontractors'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            this.subcontractorsSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Subcontractor)));
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'subcontractors'));

        onSnapshot(query(collection(db, 'project-subcontractors'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            this.projectSubcontractorsSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ProjectSubcontractor)));
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'project-subcontractors'));

        onSnapshot(query(collection(db, 'subcontractor-documents'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            this.subcontractorDocumentsSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SubcontractorDocument)));
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'subcontractor-documents'));

        onSnapshot(query(collection(db, 'subcontractor-invoices'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            this.subcontractorInvoicesSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SubcontractorInvoice)));
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'subcontractor-invoices'));

        onSnapshot(query(collection(db, 'foreman-bonus-policies'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            this.foremanBonusPoliciesSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ForemanBonusPolicy)));
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'foreman-bonus-policies'));

        onSnapshot(query(collection(db, 'project-foreman-assignments'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            this.projectForemanAssignmentsSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ProjectForemanAssignment)));
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'project-foreman-assignments'));

        onSnapshot(query(collection(db, 'foreman-bonus-records'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            this.foremanBonusRecordsSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ForemanBonusRecord)));
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'foreman-bonus-records'));

        onSnapshot(query(collection(db, 'foreman-bonus-payments'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            this.foremanBonusPaymentsSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ForemanBonusPayment)));
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'foreman-bonus-payments'));

        onSnapshot(query(collection(db, 'labor-code-mappings'), where('ownerId', '==', user.uid)), snapshot => {
          this.ngZone.run(() => {
            this.laborCodeMappingsSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as LaborCodeMapping)));
          });
        }, error => handleFirestoreError(error, OperationType.LIST, 'labor-code-mappings'));
      } else {
        this.ngZone.run(() => {
          this.projectsSubject.next([]);
          this.posSubject.next([]);
          this.changeOrdersSubject.next([]);
          this.tasksSubject.next([]);
          this.billingsSubject.next([]);
          this.milestonesSubject.next([]);
          this.documentsSubject.next([]);
          this.budgetLinesSubject.next([]);
          this.projectFoldersSubject.next([]);
          this.projectFilesSubject.next([]);
          this.requiredDocumentsSubject.next([]);
          this.projectIssuesSubject.next([]);
          this.projectTasksSubject.next([]);
          this.changeRequestsSubject.next([]);
          this.rfisSubject.next([]);
          this.submittalsSubject.next([]);
          this.dailyLogsSubject.next([]);
          this.fieldIssuesSubject.next([]);
          this.payAppLinesSubject.next([]);
          this.arRecordsSubject.next([]);
          this.projectFinancialsSubject.next([]);
          this.employeesSubject.next([]);
          this.timeEntriesSubject.next([]);
          this.projectLaborActualsSubject.next([]);
          this.subcontractorsSubject.next([]);
          this.projectSubcontractorsSubject.next([]);
          this.subcontractorDocumentsSubject.next([]);
          this.subcontractorInvoicesSubject.next([]);
          this.foremanBonusPoliciesSubject.next([]);
          this.projectForemanAssignmentsSubject.next([]);
          this.foremanBonusRecordsSubject.next([]);
          this.foremanBonusPaymentsSubject.next([]);
          this.laborCodeMappingsSubject.next([]);
          this.projectsSnapshotReady = false;
          this.projectsSnapshotWaiters = [];
        });
      }
    });
  }

  getProjects(): Observable<Project[]> { 
    return this.projectsSubject.asObservable();
  }

  getProjectsSnapshot(): Project[] {
    return this.projectsSubject.value;
  }

  private markProjectsSnapshotReady(projects: Project[]): void {
    this.projectsSnapshotReady = true;
    const waiters = this.projectsSnapshotWaiters.splice(0);
    for (const resolve of waiters) {
      resolve(projects);
    }
  }

  /** Wait until Firestore has delivered the first server projects snapshot for this session. */
  waitForProjectsLoaded(settleMs = 0): Promise<Project[]> {
    const resolveWithSettle = (projects: Project[]) => {
      if (settleMs <= 0) {
        return Promise.resolve(projects);
      }
      return new Promise<Project[]>(resolve => {
        setTimeout(() => resolve(this.projectsSubject.value), settleMs);
      });
    };

    if (this.projectsSnapshotReady) {
      return resolveWithSettle(this.projectsSubject.value);
    }

    return new Promise(resolve => {
      this.projectsSnapshotWaiters.push(projects => {
        void resolveWithSettle(projects).then(resolve);
      });
    });
  }
  
  createProject(p: Partial<Project>): Observable<Project> { 
    return from((async () => {
      const matches = findProjectMatches(this.projectsSubject.value, {
        projectNumber: p.projectNumber,
        seedProjectId: p.seedProjectId,
        masterSheetJobId: p.masterSheetJobId,
      });
      if (matches.length) {
        const existing = pickCanonicalProject(matches);
        throw new Error(
          `Job #${p.projectNumber ?? existing.projectNumber} already exists (${existing.projectName}). Sync or update instead of creating a duplicate.`,
        );
      }

      const id = uuidv4();
      const newProject = { 
        ...p, 
        id,
        ownerId: auth.currentUser?.uid,
        createdAt: serverTimestamp(), 
        updatedAt: serverTimestamp() 
      };
      try {
        await setDoc(doc(db, 'projects', id), forFirestore(newProject));
        return newProject as unknown as Project;
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `projects/${id}`);
        throw error;
      }
    })());
  }

  updateProject(id: string, updates: Partial<Project>): Observable<Project> {
    return from((async () => {
      try {
        await updateDoc(doc(db, 'projects', id), forFirestore({
          ...updates,
          updatedAt: serverTimestamp()
        }));
        const current = this.projectsSubject.value.find(x => x.id === id);
        return { ...current, ...updates } as Project;
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `projects/${id}`);
        throw error;
      }
    })());
  }

  deleteProject(id: string): Observable<void> {
    return from((async () => {
      try {
        await deleteDoc(doc(db, 'projects', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `projects/${id}`);
        throw error;
      }
    })());
  }

  /** Move child records from a duplicate project onto the canonical project. */
  async reassignProjectReferences(fromProjectId: string, toProjectId: string): Promise<number> {
    let moved = 0;

    for (const po of this.posSubject.value.filter(x => x.projectId === fromProjectId)) {
      await firstValueFrom(this.updatePO(po.id, { projectId: toProjectId }));
      moved++;
    }
    for (const co of this.changeOrdersSubject.value.filter(x => x.projectId === fromProjectId)) {
      await firstValueFrom(this.updateChangeOrder(co.id, { projectId: toProjectId }));
      moved++;
    }
    for (const billing of this.billingsSubject.value.filter(x => x.projectId === fromProjectId)) {
      await firstValueFrom(this.updateBilling(billing.id, { projectId: toProjectId }));
      moved++;
    }
    for (const milestone of this.milestonesSubject.value.filter(x => x.projectId === fromProjectId)) {
      await firstValueFrom(this.updateMilestone(milestone.id, { projectId: toProjectId }));
      moved++;
    }
    for (const task of this.tasksSubject.value.filter(x => x.projectId === fromProjectId)) {
      await firstValueFrom(this.updateTask(task.id, { projectId: toProjectId }));
      moved++;
    }
    for (const line of this.budgetLinesSubject.value.filter(x => x.projectId === fromProjectId)) {
      await firstValueFrom(this.updateBudgetLine(line.id, { projectId: toProjectId }));
      moved++;
    }
    for (const folder of this.projectFoldersSubject.value.filter(x => x.projectId === fromProjectId)) {
      await firstValueFrom(this.updateProjectFolder(folder.id, { projectId: toProjectId }));
      moved++;
    }
    for (const file of this.projectFilesSubject.value.filter(x => x.projectId === fromProjectId)) {
      await firstValueFrom(this.updateProjectFile(file.id, { projectId: toProjectId }));
      moved++;
    }
    for (const doc of this.requiredDocumentsSubject.value.filter(x => x.projectId === fromProjectId)) {
      await firstValueFrom(this.updateRequiredDocument(doc.id, { projectId: toProjectId }));
      moved++;
    }
    for (const issue of this.projectIssuesSubject.value.filter(x => x.projectId === fromProjectId)) {
      await firstValueFrom(this.updateProjectIssue(issue.id, { projectId: toProjectId }));
      moved++;
    }
    for (const task of this.projectTasksSubject.value.filter(x => x.projectId === fromProjectId)) {
      await firstValueFrom(this.updateProjectTask(task.id, { projectId: toProjectId }));
      moved++;
    }

    return moved;
  }

  getTasks(): Observable<Task[]> { 
    return this.tasksSubject.asObservable();
  }
  
  createTask(t: Partial<Task>): Observable<Task> { 
    return from((async () => {
        const id = uuidv4();
        const newTask = {
            ...t,
            id,
            ownerId: auth.currentUser?.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };
        try {
            await setDoc(doc(db, 'tasks', id), forFirestore(newTask));
            return newTask as unknown as Task;
        } catch (error) {
            handleFirestoreError(error, OperationType.CREATE, `tasks/${id}`);
            throw error;
        }
    })());
  }

  updateTask(id: string, updates: Partial<Task>): Observable<Task> {
    return from((async () => {
      await updateDoc(doc(db, 'tasks', id), forFirestore({ ...updates, updatedAt: serverTimestamp() }));
      const current = this.tasksSubject.value.find(x => x.id === id);
      return { ...current, ...updates } as Task;
    })());
  }

  getPOs(): Observable<PO[]> { 
    return this.posSubject.asObservable();
  }
  
  createPO(po: Partial<PO>): Observable<PO> {
    return from((async () => {
      const id = uuidv4();
      const newPo = { 
        ...po, 
        id, 
        ownerId: auth.currentUser?.uid,
        createdAt: serverTimestamp(), 
        updatedAt: serverTimestamp() 
      };
      try {
        await setDoc(doc(db, 'pos', id), forFirestore(newPo));
        return newPo as unknown as PO;
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `pos/${id}`);
        throw error;
      }
    })());
  }

  updatePO(id: string, updates: Partial<PO>): Observable<PO> {
    return from((async () => {
      await updateDoc(doc(db, 'pos', id), forFirestore({ ...updates, updatedAt: serverTimestamp() }));
      const current = this.posSubject.value.find(x => x.id === id);
      return { ...current, ...updates } as PO;
    })());
  }

  getChangeOrders(): Observable<ChangeOrder[]> {
    return this.changeOrdersSubject.asObservable();
  }

  createChangeOrder(co: Partial<ChangeOrder>): Observable<ChangeOrder> {
    return from((async () => {
      const id = uuidv4();
      const newCo = { 
        ...co, 
        id, 
        ownerId: auth.currentUser?.uid,
        createdAt: serverTimestamp(), 
        updatedAt: serverTimestamp() 
      };
      try {
        await setDoc(doc(db, 'change-orders', id), forFirestore(newCo));
        return newCo as unknown as ChangeOrder;
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `change-orders/${id}`);
        throw error;
      }
    })());
  }

  updateChangeOrder(id: string, updates: Partial<ChangeOrder>): Observable<ChangeOrder> {
    return from((async () => {
      await updateDoc(doc(db, 'change-orders', id), forFirestore({ ...updates, updatedAt: serverTimestamp() }));
      const current = this.changeOrdersSubject.value.find(x => x.id === id);
      return { ...current, ...updates } as ChangeOrder;
    })());
  }

  getBillings(): Observable<Billing[]> { return this.billingsSubject.asObservable(); }
  createBilling(b: Partial<Billing>): Observable<Billing> {
    return from((async () => {
      const id = uuidv4();
      const newDoc = { ...b, id, ownerId: auth.currentUser?.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      await setDoc(doc(db, 'billings', id), forFirestore(newDoc));
      return newDoc as unknown as Billing;
    })());
  }
  updateBilling(id: string, updates: Partial<Billing>): Observable<Billing> {
    return from((async () => {
      await updateDoc(doc(db, 'billings', id), forFirestore({ ...updates, updatedAt: serverTimestamp() }));
      const current = this.billingsSubject.value.find(x => x.id === id);
      return { ...current, ...updates } as Billing;
    })());
  }

  getMilestones(): Observable<ScheduleMilestone[]> { return this.milestonesSubject.asObservable(); }
  createMilestone(m: Partial<ScheduleMilestone>): Observable<ScheduleMilestone> {
    return from((async () => {
      const id = uuidv4();
      const newDoc = { ...m, id, ownerId: auth.currentUser?.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      await setDoc(doc(db, 'milestones', id), forFirestore(newDoc));
      return newDoc as unknown as ScheduleMilestone;
    })());
  }
  updateMilestone(id: string, updates: Partial<ScheduleMilestone>): Observable<ScheduleMilestone> {
    return from((async () => {
      await updateDoc(doc(db, 'milestones', id), forFirestore({ ...updates, updatedAt: serverTimestamp() }));
      const current = this.milestonesSubject.value.find(x => x.id === id);
      return { ...current, ...updates } as ScheduleMilestone;
    })());
  }

  /** Legacy document status collection — prefer project-files for new file metadata. */
  getDocuments(): Observable<Document[]> { return this.documentsSubject.asObservable(); }
  createDocument(d: Partial<Document>): Observable<Document> {
    return from((async () => {
      const id = uuidv4();
      const newDoc = { ...d, id, ownerId: auth.currentUser?.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      await setDoc(doc(db, 'documents', id), forFirestore(newDoc));
      return newDoc as unknown as Document;
    })());
  }
  updateDocument(id: string, updates: Partial<Document>): Observable<Document> {
    return from((async () => {
      await updateDoc(doc(db, 'documents', id), forFirestore({ ...updates, updatedAt: serverTimestamp() }));
      const current = this.documentsSubject.value.find(x => x.id === id);
      return { ...current, ...updates } as Document;
    })());
  }

  getBudgetLines(): Observable<ProjectBudgetLine[]> { return this.budgetLinesSubject.asObservable(); }
  createBudgetLine(b: Partial<ProjectBudgetLine>): Observable<ProjectBudgetLine> {
    return from((async () => {
      const id = uuidv4();
      const newDoc = { ...b, id, ownerId: auth.currentUser?.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      await setDoc(doc(db, 'budget-lines', id), forFirestore(newDoc));
      return newDoc as unknown as ProjectBudgetLine;
    })());
  }
  updateBudgetLine(id: string, updates: Partial<ProjectBudgetLine>): Observable<ProjectBudgetLine> {
    return from((async () => {
      await updateDoc(doc(db, 'budget-lines', id), forFirestore({ ...updates, updatedAt: serverTimestamp() }));
      const current = this.budgetLinesSubject.value.find(x => x.id === id);
      return { ...current, ...updates } as ProjectBudgetLine;
    })());
  }
  deleteBudgetLine(id: string): Observable<void> {
    return from((async () => {
      await deleteDoc(doc(db, 'budget-lines', id));
    })());
  }

  getProjectFolders(): Observable<ProjectFolder[]> { return this.projectFoldersSubject.asObservable(); }
  createProjectFolder(f: Partial<ProjectFolder>): Observable<ProjectFolder> {
    return from((async () => {
      const id = uuidv4();
      const newDoc = { ...f, id, ownerId: auth.currentUser?.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      await setDoc(doc(db, 'project-folders', id), forFirestore(newDoc));
      return newDoc as unknown as ProjectFolder;
    })());
  }
  updateProjectFolder(id: string, updates: Partial<ProjectFolder>): Observable<ProjectFolder> {
    return from((async () => {
      await updateDoc(doc(db, 'project-folders', id), forFirestore({ ...updates, updatedAt: serverTimestamp() }));
      return { ...this.projectFoldersSubject.value.find(x => x.id === id), ...updates } as ProjectFolder;
    })());
  }

  // Project-file CRUD: use ProjectFilesRepository for new code; DataService here is read-only legacy relay.

  getProjectFiles(): Observable<ProjectFile[]> { return this.projectFilesSubject.asObservable(); }
  projectFilesSnapshot(): ProjectFile[] { return this.projectFilesSubject.value; }
  billingsSnapshot(): Billing[] { return this.billingsSubject.value; }
  createProjectFile(f: Partial<ProjectFile>): Observable<ProjectFile> {
    return from((async () => {
      const id = uuidv4();
      const actor = auth.currentUser?.email ?? auth.currentUser?.uid;
      const newDoc = {
        ...f,
        id,
        ownerId: auth.currentUser?.uid,
        uploadedAt: serverTimestamp(),
        lastModifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: f.createdBy ?? actor,
        updatedBy: f.updatedBy ?? actor,
      };
      await setDoc(doc(db, 'project-files', id), forFirestore(newDoc));
      return newDoc as unknown as ProjectFile;
    })());
  }
  updateProjectFile(id: string, updates: Partial<ProjectFile>): Observable<ProjectFile> {
    return from((async () => {
      const actor = auth.currentUser?.email ?? auth.currentUser?.uid;
      const patch = {
        ...updates,
        lastModifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: updates.updatedBy ?? actor,
        ...(updates.archived === true && updates.archivedAt == null
          ? { archivedAt: serverTimestamp() }
          : {}),
      };
      await updateDoc(doc(db, 'project-files', id), forFirestore(patch));
      return { ...this.projectFilesSubject.value.find(x => x.id === id), ...updates } as ProjectFile;
    })());
  }

  /** Admin-only hard delete — normal UI should use ProjectFilesRepository.archive(). */
  hardDeleteProjectFile(id: string): Observable<void> {
    return from((async () => {
      await deleteDoc(doc(db, 'project-files', id));
    })());
  }

  getRequiredDocuments(): Observable<RequiredDocument[]> { return this.requiredDocumentsSubject.asObservable(); }
  createRequiredDocument(d: Partial<RequiredDocument>): Observable<RequiredDocument> {
    return from((async () => {
      const id = uuidv4();
      const newDoc = { ...d, id, ownerId: auth.currentUser?.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      await setDoc(doc(db, 'required-documents', id), forFirestore(newDoc));
      return newDoc as unknown as RequiredDocument;
    })());
  }
  updateRequiredDocument(id: string, updates: Partial<RequiredDocument>): Observable<RequiredDocument> {
    return from((async () => {
      await updateDoc(doc(db, 'required-documents', id), forFirestore({ ...updates, updatedAt: serverTimestamp() }));
      return { ...this.requiredDocumentsSubject.value.find(x => x.id === id), ...updates } as RequiredDocument;
    })());
  }

  getProjectIssues(): Observable<ProjectIssue[]> { return this.projectIssuesSubject.asObservable(); }
  createProjectIssue(i: Partial<ProjectIssue>): Observable<ProjectIssue> {
    return from((async () => {
      const id = uuidv4();
      const newDoc = { ...i, id, ownerId: auth.currentUser?.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      await setDoc(doc(db, 'project-issues', id), forFirestore(newDoc));
      return newDoc as unknown as ProjectIssue;
    })());
  }
  updateProjectIssue(id: string, updates: Partial<ProjectIssue>): Observable<ProjectIssue> {
    return from((async () => {
      await updateDoc(doc(db, 'project-issues', id), forFirestore({ ...updates, updatedAt: serverTimestamp() }));
      return { ...this.projectIssuesSubject.value.find(x => x.id === id), ...updates } as ProjectIssue;
    })());
  }

  getProjectTasks(): Observable<ProjectTask[]> { return this.projectTasksSubject.asObservable(); }
  createProjectTask(t: Partial<ProjectTask>): Observable<ProjectTask> {
    return from((async () => {
      const id = uuidv4();
      const newDoc = { ...t, id, ownerId: auth.currentUser?.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      await setDoc(doc(db, 'project-tasks', id), forFirestore(newDoc));
      return newDoc as unknown as ProjectTask;
    })());
  }
  updateProjectTask(id: string, updates: Partial<ProjectTask>): Observable<ProjectTask> {
    return from((async () => {
      await updateDoc(doc(db, 'project-tasks', id), forFirestore({ ...updates, updatedAt: serverTimestamp() }));
      return { ...this.projectTasksSubject.value.find(x => x.id === id), ...updates } as ProjectTask;
    })());
  }

  projectsSnapshot(): Project[] { return this.projectsSubject.value; }
  changeOrdersSnapshot(): ChangeOrder[] { return this.changeOrdersSubject.value; }
  changeRequestsSnapshot(): ChangeRequest[] { return this.changeRequestsSubject.value; }
  projectTasksSnapshot(): ProjectTask[] { return this.projectTasksSubject.value; }
  projectFoldersSnapshot(): ProjectFolder[] { return this.projectFoldersSubject.value; }
  rfisSnapshot(): Rfi[] { return this.rfisSubject.value; }
  submittalsSnapshot(): Submittal[] { return this.submittalsSubject.value; }
  dailyLogsSnapshot(): DailyLog[] { return this.dailyLogsSubject.value; }
  fieldIssuesSnapshot(): FieldIssue[] { return this.fieldIssuesSubject.value; }
  budgetLinesSnapshot(): ProjectBudgetLine[] { return this.budgetLinesSubject.value; }
  payAppLinesSnapshot(): PayAppLine[] { return this.payAppLinesSubject.value; }
  arRecordsSnapshot(): ARRecord[] { return this.arRecordsSubject.value; }
  posSnapshot(): PO[] { return this.posSubject.value; }
  timeEntriesSnapshot(): TimeEntry[] { return this.timeEntriesSubject.value; }
  employeesSnapshot(): Employee[] { return this.employeesSubject.value; }
  projectLaborActualsSnapshot(): ProjectLaborActual[] { return this.projectLaborActualsSubject.value; }
  subcontractorsSnapshot(): Subcontractor[] { return this.subcontractorsSubject.value; }
  projectSubcontractorsSnapshot(): ProjectSubcontractor[] { return this.projectSubcontractorsSubject.value; }
  subcontractorDocumentsSnapshot(): SubcontractorDocument[] { return this.subcontractorDocumentsSubject.value; }
  subcontractorInvoicesSnapshot(): SubcontractorInvoice[] { return this.subcontractorInvoicesSubject.value; }
  foremanBonusPoliciesSnapshot(): ForemanBonusPolicy[] { return this.foremanBonusPoliciesSubject.value; }
  projectForemanAssignmentsSnapshot(): ProjectForemanAssignment[] { return this.projectForemanAssignmentsSubject.value; }
  foremanBonusRecordsSnapshot(): ForemanBonusRecord[] { return this.foremanBonusRecordsSubject.value; }
  foremanBonusPaymentsSnapshot(): ForemanBonusPayment[] { return this.foremanBonusPaymentsSubject.value; }
  laborCodeMappingsSnapshot(): LaborCodeMapping[] { return this.laborCodeMappingsSubject.value; }

  getChangeRequests(): Observable<ChangeRequest[]> { return this.changeRequestsSubject.asObservable(); }
  createChangeRequest(cr: Partial<ChangeRequest>): Observable<ChangeRequest> {
    return from((async () => {
      const id = uuidv4();
      const newDoc = { ...cr, id, ownerId: auth.currentUser?.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      await setDoc(doc(db, 'change-requests', id), forFirestore(newDoc));
      return newDoc as unknown as ChangeRequest;
    })());
  }
  updateChangeRequest(id: string, updates: Partial<ChangeRequest>): Observable<ChangeRequest> {
    return from((async () => {
      await updateDoc(doc(db, 'change-requests', id), forFirestore({ ...updates, updatedAt: serverTimestamp() }));
      return { ...this.changeRequestsSubject.value.find(x => x.id === id), ...updates } as ChangeRequest;
    })());
  }

  getRfis(): Observable<Rfi[]> { return this.rfisSubject.asObservable(); }
  createRfi(rfi: Partial<Rfi>): Observable<Rfi> {
    return from((async () => {
      const id = uuidv4();
      const newDoc = { ...rfi, id, ownerId: auth.currentUser?.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      await setDoc(doc(db, 'rfis', id), forFirestore(newDoc));
      return newDoc as unknown as Rfi;
    })());
  }
  updateRfi(id: string, updates: Partial<Rfi>): Observable<Rfi> {
    return from((async () => {
      await updateDoc(doc(db, 'rfis', id), forFirestore({ ...updates, updatedAt: serverTimestamp() }));
      return { ...this.rfisSubject.value.find(x => x.id === id), ...updates } as Rfi;
    })());
  }

  getSubmittals(): Observable<Submittal[]> { return this.submittalsSubject.asObservable(); }
  createSubmittal(s: Partial<Submittal>): Observable<Submittal> {
    return from((async () => {
      const id = uuidv4();
      const newDoc = { ...s, id, ownerId: auth.currentUser?.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      await setDoc(doc(db, 'submittals', id), forFirestore(newDoc));
      return newDoc as unknown as Submittal;
    })());
  }
  updateSubmittal(id: string, updates: Partial<Submittal>): Observable<Submittal> {
    return from((async () => {
      await updateDoc(doc(db, 'submittals', id), forFirestore({ ...updates, updatedAt: serverTimestamp() }));
      return { ...this.submittalsSubject.value.find(x => x.id === id), ...updates } as Submittal;
    })());
  }

  getDailyLogs(): Observable<DailyLog[]> { return this.dailyLogsSubject.asObservable(); }
  createDailyLog(log: Partial<DailyLog>): Observable<DailyLog> {
    return from((async () => {
      const id = uuidv4();
      const newDoc = { ...log, id, ownerId: auth.currentUser?.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      await setDoc(doc(db, 'daily-logs', id), forFirestore(newDoc));
      return newDoc as unknown as DailyLog;
    })());
  }
  updateDailyLog(id: string, updates: Partial<DailyLog>): Observable<DailyLog> {
    return from((async () => {
      await updateDoc(doc(db, 'daily-logs', id), forFirestore({ ...updates, updatedAt: serverTimestamp() }));
      return { ...this.dailyLogsSubject.value.find(x => x.id === id), ...updates } as DailyLog;
    })());
  }

  getFieldIssues(): Observable<FieldIssue[]> { return this.fieldIssuesSubject.asObservable(); }
  createFieldIssue(issue: Partial<FieldIssue>): Observable<FieldIssue> {
    return from((async () => {
      const id = uuidv4();
      const newDoc = { ...issue, id, ownerId: auth.currentUser?.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      await setDoc(doc(db, 'field-issues', id), forFirestore(newDoc));
      return newDoc as unknown as FieldIssue;
    })());
  }
  updateFieldIssue(id: string, updates: Partial<FieldIssue>): Observable<FieldIssue> {
    return from((async () => {
      await updateDoc(doc(db, 'field-issues', id), forFirestore({ ...updates, updatedAt: serverTimestamp() }));
      return { ...this.fieldIssuesSubject.value.find(x => x.id === id), ...updates } as FieldIssue;
    })());
  }

  getPayAppLines(): Observable<PayAppLine[]> { return this.payAppLinesSubject.asObservable(); }
  createPayAppLine(line: Partial<PayAppLine>): Observable<PayAppLine> {
    return from((async () => {
      const id = uuidv4();
      const newDoc = { ...line, id, ownerId: auth.currentUser?.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      await setDoc(doc(db, 'pay-app-lines', id), forFirestore(newDoc));
      return newDoc as unknown as PayAppLine;
    })());
  }
  deletePayAppLine(id: string): Observable<void> {
    return from((async () => {
      await deleteDoc(doc(db, 'pay-app-lines', id));
    })());
  }

  getArRecords(): Observable<ARRecord[]> { return this.arRecordsSubject.asObservable(); }
  createArRecord(rec: Partial<ARRecord>): Observable<ARRecord> {
    return from((async () => {
      const id = uuidv4();
      const newDoc = { ...rec, id, ownerId: auth.currentUser?.uid, updatedAt: serverTimestamp() };
      await setDoc(doc(db, 'ar-records', id), forFirestore(newDoc));
      return newDoc as unknown as ARRecord;
    })());
  }
  updateArRecord(id: string, updates: Partial<ARRecord>): Observable<ARRecord> {
    return from((async () => {
      await updateDoc(doc(db, 'ar-records', id), forFirestore({ ...updates, updatedAt: serverTimestamp() }));
      return { ...this.arRecordsSubject.value.find(x => x.id === id), ...updates } as ARRecord;
    })());
  }

  getEmployees(): Observable<Employee[]> {
    return this.employeesSubject.asObservable();
  }

  getTimeEntries(): Observable<TimeEntry[]> {
    return this.timeEntriesSubject.asObservable();
  }

  getProjectLaborActuals(): Observable<ProjectLaborActual[]> {
    return this.projectLaborActualsSubject.asObservable();
  }

  upsertProjectLaborActual(actual: ProjectLaborActual): Observable<ProjectLaborActual> {
    return from((async () => {
      const payload = forFirestore({
        ...actual,
        id: actual.id,
        ownerId: auth.currentUser?.uid,
        updatedAt: serverTimestamp(),
        ...(this.projectLaborActualsSubject.value.find(a => a.id === actual.id) ? {} : { createdAt: serverTimestamp() }),
      });
      await setDoc(doc(db, 'project-labor-actuals', actual.id), payload, { merge: true });
      return actual;
    })());
  }

  async upsertEmployee(employee: Partial<Employee>): Promise<void> {
    const ownerId = auth.currentUser?.uid;
    if (!ownerId || !employee.id) {
      throw new Error('Sign in before syncing employees.');
    }

    const existing = this.employeesSubject.value.find(e => e.id === employee.id);
    const payload = forFirestore({
      ...employee,
      id: employee.id,
      ownerId,
      updatedAt: serverTimestamp(),
      ...(existing ? {} : { createdAt: serverTimestamp() }),
    });

    try {
      await setDoc(doc(db, 'employees', employee.id), payload, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `employees/${employee.id}`);
      throw error;
    }
  }

  async upsertTimeEntries(entries: Partial<TimeEntry>[]): Promise<number> {
    const ownerId = auth.currentUser?.uid;
    if (!ownerId) {
      throw new Error('Sign in before syncing time entries.');
    }

    const BATCH_SIZE = 400;
    let written = 0;

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      const chunk = entries.slice(i, i + BATCH_SIZE);
      let batchCount = 0;

      for (const entry of chunk) {
        if (!entry.recordId) continue;
        const existing = this.timeEntriesSubject.value.find(e => e.recordId === entry.recordId);
        batch.set(
          doc(db, 'time-entries', entry.recordId),
          forFirestore({
            ...entry,
            id: entry.recordId,
            ownerId,
            updatedAt: serverTimestamp(),
            ...(existing ? {} : { createdAt: serverTimestamp() }),
          }),
          { merge: true },
        );
        batchCount++;
        written++;
      }

      if (batchCount > 0) {
        await batch.commit();
      }
    }

    return written;
  }

  async uploadFile(file: File): Promise<string> {
    const fileId = uuidv4();
    await this.fileStore.setItem(fileId, file);
    return fileId;
  }

  async getFile(fileId: string): Promise<File | null> {
    return this.fileStore.getItem<File>(fileId);
  }

  getSubcontractors(): Observable<Subcontractor[]> {
    return this.subcontractorsSubject.asObservable();
  }

  createSubcontractor(sub: Partial<Subcontractor>): Observable<Subcontractor> {
    return from((async () => {
      const id = uuidv4();
      const newDoc = {
        ...sub,
        id,
        w9Status: sub.w9Status ?? 'Missing',
        insuranceStatus: sub.insuranceStatus ?? 'Missing',
        status: sub.status ?? 'PendingSetup',
        ownerId: auth.currentUser?.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'subcontractors', id), forFirestore(newDoc));
      return newDoc as unknown as Subcontractor;
    })());
  }

  updateSubcontractor(id: string, updates: Partial<Subcontractor>): Observable<Subcontractor> {
    return from((async () => {
      await updateDoc(doc(db, 'subcontractors', id), forFirestore({ ...updates, updatedAt: serverTimestamp() }));
      return { ...this.subcontractorsSubject.value.find(x => x.id === id), ...updates } as Subcontractor;
    })());
  }

  getProjectSubcontractors(): Observable<ProjectSubcontractor[]> {
    return this.projectSubcontractorsSubject.asObservable();
  }

  createProjectSubcontractor(ps: Partial<ProjectSubcontractor>): Observable<ProjectSubcontractor> {
    return from((async () => {
      const id = uuidv4();
      const newDoc = {
        ...ps,
        id,
        status: ps.status ?? 'Planned',
        complianceStatus: ps.complianceStatus ?? 'MissingItems',
        performanceStatus: ps.performanceStatus ?? 'Good',
        ownerId: auth.currentUser?.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'project-subcontractors', id), forFirestore(newDoc));
      return newDoc as unknown as ProjectSubcontractor;
    })());
  }

  updateProjectSubcontractor(id: string, updates: Partial<ProjectSubcontractor>): Observable<ProjectSubcontractor> {
    return from((async () => {
      await updateDoc(doc(db, 'project-subcontractors', id), forFirestore({ ...updates, updatedAt: serverTimestamp() }));
      return { ...this.projectSubcontractorsSubject.value.find(x => x.id === id), ...updates } as ProjectSubcontractor;
    })());
  }

  getSubcontractorDocuments(): Observable<SubcontractorDocument[]> {
    return this.subcontractorDocumentsSubject.asObservable();
  }

  createSubcontractorDocument(docInput: Partial<SubcontractorDocument>): Observable<SubcontractorDocument> {
    return from((async () => {
      const id = uuidv4();
      const newDoc = {
        ...docInput,
        id,
        status: docInput.status ?? 'Valid',
        uploadedAt: docInput.uploadedAt ?? new Date().toISOString(),
        ownerId: auth.currentUser?.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'subcontractor-documents', id), forFirestore(newDoc));
      return newDoc as unknown as SubcontractorDocument;
    })());
  }

  updateSubcontractorDocument(id: string, updates: Partial<SubcontractorDocument>): Observable<SubcontractorDocument> {
    return from((async () => {
      await updateDoc(doc(db, 'subcontractor-documents', id), forFirestore({ ...updates, updatedAt: serverTimestamp() }));
      return { ...this.subcontractorDocumentsSubject.value.find(x => x.id === id), ...updates } as SubcontractorDocument;
    })());
  }

  getSubcontractorInvoices(): Observable<SubcontractorInvoice[]> {
    return this.subcontractorInvoicesSubject.asObservable();
  }

  createSubcontractorInvoice(inv: Partial<SubcontractorInvoice>): Observable<SubcontractorInvoice> {
    return from((async () => {
      const id = uuidv4();
      const newDoc = {
        ...inv,
        id,
        ownerId: auth.currentUser?.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'subcontractor-invoices', id), forFirestore(newDoc));
      return newDoc as unknown as SubcontractorInvoice;
    })());
  }

  updateSubcontractorInvoice(id: string, updates: Partial<SubcontractorInvoice>): Observable<SubcontractorInvoice> {
    return from((async () => {
      await updateDoc(doc(db, 'subcontractor-invoices', id), forFirestore({ ...updates, updatedAt: serverTimestamp() }));
      return { ...this.subcontractorInvoicesSubject.value.find(x => x.id === id), ...updates } as SubcontractorInvoice;
    })());
  }

  getForemanBonusPolicies(): Observable<ForemanBonusPolicy[]> {
    return this.foremanBonusPoliciesSubject.asObservable();
  }

  createForemanBonusPolicy(policy: Partial<ForemanBonusPolicy>): Observable<ForemanBonusPolicy> {
    return from((async () => {
      const id = policy.id ?? uuidv4();
      const newDoc = {
        ...policy,
        id,
        ownerId: auth.currentUser?.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'foreman-bonus-policies', id), forFirestore(newDoc));
      return newDoc as unknown as ForemanBonusPolicy;
    })());
  }

  getProjectForemanAssignments(): Observable<ProjectForemanAssignment[]> {
    return this.projectForemanAssignmentsSubject.asObservable();
  }

  createProjectForemanAssignment(assignment: Partial<ProjectForemanAssignment>): Observable<ProjectForemanAssignment> {
    return from((async () => {
      const id = uuidv4();
      const newDoc = {
        ...assignment,
        id,
        ownerId: auth.currentUser?.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'project-foreman-assignments', id), forFirestore(newDoc));
      return newDoc as unknown as ProjectForemanAssignment;
    })());
  }

  updateProjectForemanAssignment(id: string, updates: Partial<ProjectForemanAssignment>): Observable<ProjectForemanAssignment> {
    return from((async () => {
      await updateDoc(doc(db, 'project-foreman-assignments', id), forFirestore({ ...updates, updatedAt: serverTimestamp() }));
      return { ...this.projectForemanAssignmentsSubject.value.find(x => x.id === id), ...updates } as ProjectForemanAssignment;
    })());
  }

  getForemanBonusRecords(): Observable<ForemanBonusRecord[]> {
    return this.foremanBonusRecordsSubject.asObservable();
  }

  createForemanBonusRecord(record: Partial<ForemanBonusRecord>): Observable<ForemanBonusRecord> {
    return from((async () => {
      const id = record.id ?? uuidv4();
      const newDoc = {
        ...record,
        id,
        ownerId: auth.currentUser?.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'foreman-bonus-records', id), forFirestore(newDoc));
      return newDoc as unknown as ForemanBonusRecord;
    })());
  }

  updateForemanBonusRecord(id: string, updates: Partial<ForemanBonusRecord>): Observable<ForemanBonusRecord> {
    return from((async () => {
      await updateDoc(doc(db, 'foreman-bonus-records', id), forFirestore({ ...updates, updatedAt: serverTimestamp() }));
      return { ...this.foremanBonusRecordsSubject.value.find(x => x.id === id), ...updates } as ForemanBonusRecord;
    })());
  }

  getForemanBonusPayments(): Observable<ForemanBonusPayment[]> {
    return this.foremanBonusPaymentsSubject.asObservable();
  }

  createForemanBonusPayment(payment: Partial<ForemanBonusPayment>): Observable<ForemanBonusPayment> {
    return from((async () => {
      const id = uuidv4();
      const newDoc = {
        ...payment,
        id,
        ownerId: auth.currentUser?.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'foreman-bonus-payments', id), forFirestore(newDoc));
      return newDoc as unknown as ForemanBonusPayment;
    })());
  }

  updateForemanBonusPayment(id: string, updates: Partial<ForemanBonusPayment>): Observable<ForemanBonusPayment> {
    return from((async () => {
      await updateDoc(doc(db, 'foreman-bonus-payments', id), forFirestore({ ...updates, updatedAt: serverTimestamp() }));
      return { ...this.foremanBonusPaymentsSubject.value.find(x => x.id === id), ...updates } as ForemanBonusPayment;
    })());
  }

  getLaborCodeMappings(): Observable<LaborCodeMapping[]> {
    return this.laborCodeMappingsSubject.asObservable();
  }

  createLaborCodeMapping(mapping: Partial<LaborCodeMapping>): Observable<LaborCodeMapping> {
    return from((async () => {
      const id = mapping.id ?? uuidv4();
      const newDoc = {
        ...mapping,
        id,
        ownerId: auth.currentUser?.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'labor-code-mappings', id), forFirestore(newDoc));
      return newDoc as unknown as LaborCodeMapping;
    })());
  }

  updateLaborCodeMapping(id: string, updates: Partial<LaborCodeMapping>): Observable<LaborCodeMapping> {
    return from((async () => {
      await updateDoc(doc(db, 'labor-code-mappings', id), forFirestore({ ...updates, updatedAt: serverTimestamp() }));
      return { ...this.laborCodeMappingsSubject.value.find(x => x.id === id), ...updates } as LaborCodeMapping;
    })());
  }
}

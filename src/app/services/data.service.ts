import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, from } from 'rxjs';
import { Project, Task, DailyLog, PO, ChangeOrder, Billing, ScheduleMilestone, Document, ProjectBudgetLine, ProjectFolder, ProjectFile, RequiredDocument, ProjectIssue, ProjectTask, ActivityFeedItem } from '../models/types';
import localforage from 'localforage';
import { v4 as uuidv4 } from 'uuid';
import { db, auth } from '../firebase';
import { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, serverTimestamp } from 'firebase/firestore';

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
  throw new Error(JSON.stringify(errInfo));
}

@Injectable({ providedIn: 'root' })
export class DataService {
  private fileStore = localforage.createInstance({ name: 'brighten-files' });

  private projectsSubject = new BehaviorSubject<Project[]>([]);
  private posSubject = new BehaviorSubject<PO[]>([]);
  private changeOrdersSubject = new BehaviorSubject<ChangeOrder[]>([]);
  private dailyLogsSubject = new BehaviorSubject<DailyLog[]>([]);
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

  constructor() {
    this.setupListeners();
  }

  private setupListeners() {
    auth.onAuthStateChanged(user => {
      if (user) {
        onSnapshot(query(collection(db, 'projects'), where('ownerId', '==', user.uid)), snapshot => {
          this.projectsSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Project)));
        }, error => handleFirestoreError(error, OperationType.LIST, 'projects'));

        onSnapshot(query(collection(db, 'pos'), where('ownerId', '==', user.uid)), snapshot => {
          this.posSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PO)));
        }, error => handleFirestoreError(error, OperationType.LIST, 'pos'));

        onSnapshot(query(collection(db, 'change-orders'), where('ownerId', '==', user.uid)), snapshot => {
          this.changeOrdersSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ChangeOrder)));
        }, error => handleFirestoreError(error, OperationType.LIST, 'change-orders'));

        onSnapshot(query(collection(db, 'daily-logs'), where('ownerId', '==', user.uid)), snapshot => {
          this.dailyLogsSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as DailyLog)));
        }, error => handleFirestoreError(error, OperationType.LIST, 'daily-logs'));

        onSnapshot(query(collection(db, 'tasks'), where('ownerId', '==', user.uid)), snapshot => {
          this.tasksSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Task)));
        }, error => handleFirestoreError(error, OperationType.LIST, 'tasks'));

        onSnapshot(query(collection(db, 'billings'), where('ownerId', '==', user.uid)), snapshot => {
          this.billingsSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Billing)));
        }, error => handleFirestoreError(error, OperationType.LIST, 'billings'));
        
        onSnapshot(query(collection(db, 'milestones'), where('ownerId', '==', user.uid)), snapshot => {
          this.milestonesSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ScheduleMilestone)));
        }, error => handleFirestoreError(error, OperationType.LIST, 'milestones'));
        
        onSnapshot(query(collection(db, 'documents'), where('ownerId', '==', user.uid)), snapshot => {
          this.documentsSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Document)));
        }, error => handleFirestoreError(error, OperationType.LIST, 'documents'));

        onSnapshot(query(collection(db, 'budget-lines'), where('ownerId', '==', user.uid)), snapshot => {
          this.budgetLinesSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ProjectBudgetLine)));
        }, error => handleFirestoreError(error, OperationType.LIST, 'budget-lines'));

        onSnapshot(query(collection(db, 'project-folders'), where('ownerId', '==', user.uid)), snapshot => {
          this.projectFoldersSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ProjectFolder)));
        }, error => handleFirestoreError(error, OperationType.LIST, 'project-folders'));
        
        onSnapshot(query(collection(db, 'project-files'), where('ownerId', '==', user.uid)), snapshot => {
          this.projectFilesSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ProjectFile)));
        }, error => handleFirestoreError(error, OperationType.LIST, 'project-files'));
        
        onSnapshot(query(collection(db, 'required-documents'), where('ownerId', '==', user.uid)), snapshot => {
          this.requiredDocumentsSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as RequiredDocument)));
        }, error => handleFirestoreError(error, OperationType.LIST, 'required-documents'));

        onSnapshot(query(collection(db, 'project-issues'), where('ownerId', '==', user.uid)), snapshot => {
          this.projectIssuesSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ProjectIssue)));
        }, error => handleFirestoreError(error, OperationType.LIST, 'project-issues'));

        onSnapshot(query(collection(db, 'project-tasks'), where('ownerId', '==', user.uid)), snapshot => {
          this.projectTasksSubject.next(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ProjectTask)));
        }, error => handleFirestoreError(error, OperationType.LIST, 'project-tasks'));
      } else {
        this.projectsSubject.next([]);
        this.posSubject.next([]);
        this.changeOrdersSubject.next([]);
        this.dailyLogsSubject.next([]);
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
      }
    });
  }

  getProjects(): Observable<Project[]> { 
    return this.projectsSubject.asObservable();
  }
  
  createProject(p: Partial<Project>): Observable<Project> { 
    return from((async () => {
      const id = uuidv4();
      const newProject = { 
        ...p, 
        id,
        ownerId: auth.currentUser?.uid,
        createdAt: serverTimestamp(), 
        updatedAt: serverTimestamp() 
      };
      try {
        await setDoc(doc(db, 'projects', id), newProject);
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
        await updateDoc(doc(db, 'projects', id), {
          ...updates,
          updatedAt: serverTimestamp()
        });
        const current = this.projectsSubject.value.find(x => x.id === id);
        return { ...current, ...updates } as Project;
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `projects/${id}`);
        throw error;
      }
    })());
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
            await setDoc(doc(db, 'tasks', id), newTask);
            return newTask as unknown as Task;
        } catch (error) {
            handleFirestoreError(error, OperationType.CREATE, `tasks/${id}`);
            throw error;
        }
    })());
  }

  updateTask(id: string, updates: Partial<Task>): Observable<Task> {
    return from((async () => {
      await updateDoc(doc(db, 'tasks', id), { ...updates, updatedAt: serverTimestamp() });
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
        await setDoc(doc(db, 'pos', id), newPo);
        return newPo as unknown as PO;
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `pos/${id}`);
        throw error;
      }
    })());
  }

  updatePO(id: string, updates: Partial<PO>): Observable<PO> {
    return from((async () => {
      await updateDoc(doc(db, 'pos', id), { ...updates, updatedAt: serverTimestamp() });
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
        await setDoc(doc(db, 'change-orders', id), newCo);
        return newCo as unknown as ChangeOrder;
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `change-orders/${id}`);
        throw error;
      }
    })());
  }

  updateChangeOrder(id: string, updates: Partial<ChangeOrder>): Observable<ChangeOrder> {
    return from((async () => {
      await updateDoc(doc(db, 'change-orders', id), { ...updates, updatedAt: serverTimestamp() });
      const current = this.changeOrdersSubject.value.find(x => x.id === id);
      return { ...current, ...updates } as ChangeOrder;
    })());
  }

  getDailyLogs(): Observable<DailyLog[]> { 
    return this.dailyLogsSubject.asObservable();
  }
  
  createDailyLog(l: Partial<DailyLog>): Observable<DailyLog> {
    return from((async () => {
      const id = uuidv4();
      const newLog = { 
        ...l, 
        id, 
        ownerId: auth.currentUser?.uid,
        createdAt: serverTimestamp(), 
        updatedAt: serverTimestamp() 
      };
      try {
        await setDoc(doc(db, 'daily-logs', id), newLog);
        return newLog as unknown as DailyLog;
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `daily-logs/${id}`);
        throw error;
      }
    })());
  }

  updateDailyLog(id: string, updates: Partial<DailyLog>): Observable<DailyLog> {
    return from((async () => {
      await updateDoc(doc(db, 'daily-logs', id), { ...updates, updatedAt: serverTimestamp() });
      const current = this.dailyLogsSubject.value.find(x => x.id === id);
      return { ...current, ...updates } as DailyLog;
    })());
  }

  getBillings(): Observable<Billing[]> { return this.billingsSubject.asObservable(); }
  createBilling(b: Partial<Billing>): Observable<Billing> {
    return from((async () => {
      const id = uuidv4();
      const newDoc = { ...b, id, ownerId: auth.currentUser?.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      await setDoc(doc(db, 'billings', id), newDoc);
      return newDoc as unknown as Billing;
    })());
  }
  updateBilling(id: string, updates: Partial<Billing>): Observable<Billing> {
    return from((async () => {
      await updateDoc(doc(db, 'billings', id), { ...updates, updatedAt: serverTimestamp() });
      const current = this.billingsSubject.value.find(x => x.id === id);
      return { ...current, ...updates } as Billing;
    })());
  }

  getMilestones(): Observable<ScheduleMilestone[]> { return this.milestonesSubject.asObservable(); }
  createMilestone(m: Partial<ScheduleMilestone>): Observable<ScheduleMilestone> {
    return from((async () => {
      const id = uuidv4();
      const newDoc = { ...m, id, ownerId: auth.currentUser?.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      await setDoc(doc(db, 'milestones', id), newDoc);
      return newDoc as unknown as ScheduleMilestone;
    })());
  }
  updateMilestone(id: string, updates: Partial<ScheduleMilestone>): Observable<ScheduleMilestone> {
    return from((async () => {
      await updateDoc(doc(db, 'milestones', id), { ...updates, updatedAt: serverTimestamp() });
      const current = this.milestonesSubject.value.find(x => x.id === id);
      return { ...current, ...updates } as ScheduleMilestone;
    })());
  }

  getDocuments(): Observable<Document[]> { return this.documentsSubject.asObservable(); }
  createDocument(d: Partial<Document>): Observable<Document> {
    return from((async () => {
      const id = uuidv4();
      const newDoc = { ...d, id, ownerId: auth.currentUser?.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      await setDoc(doc(db, 'documents', id), newDoc);
      return newDoc as unknown as Document;
    })());
  }
  updateDocument(id: string, updates: Partial<Document>): Observable<Document> {
    return from((async () => {
      await updateDoc(doc(db, 'documents', id), { ...updates, updatedAt: serverTimestamp() });
      const current = this.documentsSubject.value.find(x => x.id === id);
      return { ...current, ...updates } as Document;
    })());
  }

  getBudgetLines(): Observable<ProjectBudgetLine[]> { return this.budgetLinesSubject.asObservable(); }
  createBudgetLine(b: Partial<ProjectBudgetLine>): Observable<ProjectBudgetLine> {
    return from((async () => {
      const id = uuidv4();
      const newDoc = { ...b, id, ownerId: auth.currentUser?.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      await setDoc(doc(db, 'budget-lines', id), newDoc);
      return newDoc as unknown as ProjectBudgetLine;
    })());
  }
  updateBudgetLine(id: string, updates: Partial<ProjectBudgetLine>): Observable<ProjectBudgetLine> {
    return from((async () => {
      await updateDoc(doc(db, 'budget-lines', id), { ...updates, updatedAt: serverTimestamp() });
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
      await setDoc(doc(db, 'project-folders', id), newDoc);
      return newDoc as unknown as ProjectFolder;
    })());
  }
  updateProjectFolder(id: string, updates: Partial<ProjectFolder>): Observable<ProjectFolder> {
    return from((async () => {
      await updateDoc(doc(db, 'project-folders', id), { ...updates, updatedAt: serverTimestamp() });
      return { ...this.projectFoldersSubject.value.find(x => x.id === id), ...updates } as ProjectFolder;
    })());
  }

  getProjectFiles(): Observable<ProjectFile[]> { return this.projectFilesSubject.asObservable(); }
  createProjectFile(f: Partial<ProjectFile>): Observable<ProjectFile> {
    return from((async () => {
      const id = uuidv4();
      const newDoc = { ...f, id, ownerId: auth.currentUser?.uid, uploadedAt: serverTimestamp(), lastModifiedAt: serverTimestamp() };
      await setDoc(doc(db, 'project-files', id), newDoc);
      return newDoc as unknown as ProjectFile;
    })());
  }
  updateProjectFile(id: string, updates: Partial<ProjectFile>): Observable<ProjectFile> {
    return from((async () => {
      await updateDoc(doc(db, 'project-files', id), { ...updates, lastModifiedAt: serverTimestamp() });
      return { ...this.projectFilesSubject.value.find(x => x.id === id), ...updates } as ProjectFile;
    })());
  }

  getRequiredDocuments(): Observable<RequiredDocument[]> { return this.requiredDocumentsSubject.asObservable(); }
  createRequiredDocument(d: Partial<RequiredDocument>): Observable<RequiredDocument> {
    return from((async () => {
      const id = uuidv4();
      const newDoc = { ...d, id, ownerId: auth.currentUser?.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      await setDoc(doc(db, 'required-documents', id), newDoc);
      return newDoc as unknown as RequiredDocument;
    })());
  }
  updateRequiredDocument(id: string, updates: Partial<RequiredDocument>): Observable<RequiredDocument> {
    return from((async () => {
      await updateDoc(doc(db, 'required-documents', id), { ...updates, updatedAt: serverTimestamp() });
      return { ...this.requiredDocumentsSubject.value.find(x => x.id === id), ...updates } as RequiredDocument;
    })());
  }

  getProjectIssues(): Observable<ProjectIssue[]> { return this.projectIssuesSubject.asObservable(); }
  createProjectIssue(i: Partial<ProjectIssue>): Observable<ProjectIssue> {
    return from((async () => {
      const id = uuidv4();
      const newDoc = { ...i, id, ownerId: auth.currentUser?.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      await setDoc(doc(db, 'project-issues', id), newDoc);
      return newDoc as unknown as ProjectIssue;
    })());
  }
  updateProjectIssue(id: string, updates: Partial<ProjectIssue>): Observable<ProjectIssue> {
    return from((async () => {
      await updateDoc(doc(db, 'project-issues', id), { ...updates, updatedAt: serverTimestamp() });
      return { ...this.projectIssuesSubject.value.find(x => x.id === id), ...updates } as ProjectIssue;
    })());
  }

  getProjectTasks(): Observable<ProjectTask[]> { return this.projectTasksSubject.asObservable(); }
  createProjectTask(t: Partial<ProjectTask>): Observable<ProjectTask> {
    return from((async () => {
      const id = uuidv4();
      const newDoc = { ...t, id, ownerId: auth.currentUser?.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      await setDoc(doc(db, 'project-tasks', id), newDoc);
      return newDoc as unknown as ProjectTask;
    })());
  }
  updateProjectTask(id: string, updates: Partial<ProjectTask>): Observable<ProjectTask> {
    return from((async () => {
      await updateDoc(doc(db, 'project-tasks', id), { ...updates, updatedAt: serverTimestamp() });
      return { ...this.projectTasksSubject.value.find(x => x.id === id), ...updates } as ProjectTask;
    })());
  }

  async uploadFile(file: File): Promise<string> {
    const fileId = uuidv4();
    await this.fileStore.setItem(fileId, file);
    return fileId;
  }

  async getFile(fileId: string): Promise<File | null> {
    return this.fileStore.getItem<File>(fileId);
  }
}

import { Component, Input, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { Project, ProjectFile, RequiredDocument, ProjectFolder } from '../models/types';
import { DataService } from '../services/data.service';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-documents-tab',
  standalone: true,
  imports: [CommonModule, MatIconModule, FormsModule],
  template: `
    <div class="space-y-6">
      
      <!-- Documents Stats -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Required Docs</p>
          <div class="flex items-end gap-2">
            <p class="text-xl font-bold text-slate-900">{{ requiredDocs().length }}</p>
            <p class="text-sm font-bold text-slate-500 mb-0.5">total</p>
          </div>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200" [class.bg-red-50]="missingDocs().length > 0">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1" [class.text-red-500]="missingDocs().length > 0">Missing Needed</p>
          <p class="text-xl font-bold" [class.text-slate-900]="missingDocs().length === 0" [class.text-red-600]="missingDocs().length > 0">{{ missingDocs().length }}</p>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200" [class.bg-orange-50]="expiredDocs().length > 0">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1" [class.text-orange-500]="expiredDocs().length > 0">Expired</p>
          <p class="text-xl font-bold" [class.text-slate-900]="expiredDocs().length === 0" [class.text-orange-600]="expiredDocs().length > 0">{{ expiredDocs().length }}</p>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">All Files</p>
          <p class="text-xl font-bold text-slate-900">{{ projectFiles().length }}</p>
        </div>
      </div>

      <!-- Required Documents -->
      <div class="bg-white rounded-md shadow-sm border border-slate-200 overflow-hidden">
        <div class="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h3 class="text-lg font-bold text-slate-900">Required Documents</h3>
          <button (click)="showNewReq = true" class="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-md font-bold shadow-sm hover:bg-slate-50 transition-all text-sm flex items-center gap-2">
            <mat-icon class="!text-[18px] w-4 h-4">add</mat-icon> Add Requirement
          </button>
        </div>

        @if (showNewReq) {
          <div class="p-5 border-b border-slate-200 bg-slate-50 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="col-span-full">
               <h4 class="font-bold text-slate-900 mb-2">Create / Edit Requirement</h4>
            </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Document Type</label>
               <input [(ngModel)]="newReq.documentType" placeholder="e.g. Signed Contract, Insurance" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Status</label>
               <select [(ngModel)]="newReq.status" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                  <option value="Needed">Needed</option>
                  <option value="Requested">Requested</option>
                  <option value="Received">Received</option>
                  <option value="Submitted">Submitted</option>
                  <option value="Approved">Approved</option>
                  <option value="Expired">Expired</option>
               </select>
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Due Date</label>
               <input type="date" [(ngModel)]="newReq.dueDate" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Expiration Date</label>
               <input type="date" [(ngModel)]="newReq.expirationDate" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div class="col-span-full flex justify-end gap-2 mt-2">
                <button (click)="cancelReq()" class="px-4 py-2 rounded font-bold text-slate-600 hover:bg-slate-200 text-sm">Cancel</button>
                <button (click)="saveReq()" class="bg-slate-900 text-white px-4 py-2 rounded font-bold hover:bg-slate-800 text-sm">Save</button>
             </div>
          </div>
        }

        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm whitespace-nowrap min-w-[800px]">
             <thead>
              <tr class="bg-white border-b border-slate-200">
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider">Document / Type</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider">Status</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider">Dates</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider">File Link</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (req of requiredDocs(); track req.id) {
                 <tr class="hover:bg-slate-50 transition-colors group">
                    <td class="px-6 py-4">
                      <span class="font-bold text-slate-900">{{ req.documentType }}</span>
                    </td>
                    <td class="px-6 py-4">
                       <span class="px-2.5 py-1 rounded text-[10px] uppercase font-bold tracking-wide"
                        [ngClass]="{
                          'bg-amber-100 text-amber-700': req.status === 'Needed' || req.status === 'Requested',
                          'bg-emerald-100 text-emerald-700': req.status === 'Received' || req.status === 'Approved',
                          'bg-slate-100 text-slate-700': req.status === 'Submitted',
                          'bg-red-100 text-red-700': req.status === 'Expired'
                        }">
                        {{ req.status }}
                      </span>
                    </td>
                    <td class="px-6 py-4">
                      <div class="flex flex-col text-xs text-slate-600 gap-1">
                        @if (req.dueDate) { <span>Due: {{ req.dueDate | date:'shortDate' }}</span> }
                        @if (req.expirationDate) { <span>Exp: <span [class.text-red-500]="isExpired(req.expirationDate)">{{ req.expirationDate | date:'shortDate' }}</span></span> }
                      </div>
                    </td>
                    <td class="px-6 py-4">
                      @if (req.relatedFileId) {
                         <a href="#" class="text-blue-500 hover:underline flex items-center gap-1"><mat-icon class="!text-[14px] w-4 h-4">attachment</mat-icon> View File</a>
                      } @else {
                         <span class="text-slate-400 text-xs italic">No file attached</span>
                      }
                    </td>
                    <td class="px-6 py-4 text-right space-x-2">
                       <button (click)="editReq(req)" class="text-slate-400 hover:text-slate-800 transition-colors opacity-0 group-hover:opacity-100">
                          <mat-icon class="!text-[18px]">edit</mat-icon>
                       </button>
                    </td>
                 </tr>
              } @empty {
                 <tr><td colspan="5" class="px-6 py-12 text-center text-slate-400 italic">No required documents specified.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- Project Files List -->
      <div class="bg-white rounded-md shadow-sm border border-slate-200 overflow-hidden">
        <div class="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h3 class="text-lg font-bold text-slate-900">Project Files & Photos</h3>
          <button (click)="showNewFile = true" class="bg-slate-900 text-white px-4 py-2 rounded-md font-bold shadow-sm hover:bg-slate-800 transition-all text-sm flex items-center gap-2">
            <mat-icon class="!text-[18px] w-4 h-4">add_photo_alternate</mat-icon> Add File Link
          </button>
        </div>

        @if (showNewFile) {
          <div class="p-5 border-b border-slate-200 bg-slate-50 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div class="col-span-full">
               <h4 class="font-bold text-slate-900 mb-2">Add Document or Photo Link</h4>
            </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">File Name</label>
               <input [(ngModel)]="newFile.fileName" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Document Type</label>
               <input [(ngModel)]="newFile.documentType" placeholder="e.g. Photo, Invoice, Plans" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Folder Key</label>
               <select [(ngModel)]="newFile.folderKey" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                  <option value="PROJECT_ADMIN">00 Project Admin</option>
                  <option value="CONTRACT">01 Contract</option>
                  <option value="PLANS_SPECS">02 Plans Specs</option>
                  <option value="SUBMITTALS">03 Submittals</option>
                  <option value="RFIS">04 RFIs</option>
                  <option value="CHANGE_ORDERS">05 Change Orders</option>
                  <option value="BILLING">07 Billing</option>
                  <option value="PHOTOS">08 Photos</option>
                  <option value="SAFETY">11 Safety</option>
                  <option value="CLOSEOUT">13 Closeout</option>
                  <option value="ARCHIVE">99 Archive</option>
               </select>
             </div>
             <div class="col-span-full">
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">File URL / Drive Link</label>
               <input [(ngModel)]="newFile.fileUrl" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div class="col-span-full flex justify-end gap-2 mt-2">
                <button (click)="cancelFile()" class="px-4 py-2 rounded font-bold text-slate-600 hover:bg-slate-200 text-sm">Cancel</button>
                <button (click)="saveFile()" class="bg-emerald-600 text-white px-4 py-2 rounded font-bold hover:bg-emerald-700 text-sm">Save Link</button>
             </div>
          </div>
        }

        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm whitespace-nowrap min-w-[800px]">
             <thead>
              <tr class="bg-white border-b border-slate-200">
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider">File Name / Link</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider">Document Type</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider">Folder Key</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider">Uploaded Date</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (file of projectFiles(); track file.id) {
                 <tr class="hover:bg-slate-50 transition-colors group">
                    <td class="px-6 py-4">
                      @if (file.fileUrl) {
                        <a [href]="file.fileUrl" target="_blank" class="font-bold text-blue-600 hover:underline flex items-center gap-2">
                           <mat-icon class="!text-[18px] w-5 h-5 text-blue-400">description</mat-icon>
                           {{ file.fileName || 'Unnamed File' }}
                        </a>
                      } @else {
                        <span class="font-bold text-slate-900 flex items-center gap-2">
                           <mat-icon class="!text-[18px] w-5 h-5 text-slate-300">description</mat-icon>
                           {{ file.fileName || 'Unnamed File' }}
                        </span>
                      }
                    </td>
                    <td class="px-6 py-4 text-slate-700">{{ file.documentType || 'N/A' }}</td>
                    <td class="px-6 py-4">
                      @if (file.folderKey) {
                         <span class="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] rounded uppercase font-bold tracking-wider">{{ file.folderKey }}</span>
                      }
                    </td>
                    <td class="px-6 py-4 text-slate-500">
                       {{ file.uploadedAt?.toDate() | date:'short' }}
                    </td>
                    <td class="px-6 py-4 text-right space-x-2">
                       @if (file.documentType?.toLowerCase() === 'photo' || file.documentType?.toLowerCase() === 'damage' || file.documentType?.toLowerCase() === 'issue') {
                          <button (click)="createAction('Issue', file)" class="text-xs font-bold text-red-600 hover:text-red-800 transition-colors mr-2">CREATE ISSUE</button>
                       }
                       <button (click)="editFile(file)" class="text-slate-400 hover:text-slate-800 transition-colors opacity-0 group-hover:opacity-100">
                          <mat-icon class="!text-[18px]">edit</mat-icon>
                       </button>
                    </td>
                 </tr>
              } @empty {
                 <tr><td colspan="5" class="px-6 py-12 text-center text-slate-400 italic">No files attached to this project.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `
})
export class DocumentsTabComponent {
  @Input({ required: true }) project!: Project;

  private dataService = inject(DataService);
  
  allFiles = toSignal(this.dataService.getProjectFiles(), { initialValue: [] });
  projectFiles = computed(() => (this.allFiles() || []).filter(f => f.projectId === this.project.id));
  
  allReqs = toSignal(this.dataService.getRequiredDocuments(), { initialValue: [] });
  requiredDocs = computed(() => (this.allReqs() || []).filter(r => r.projectId === this.project.id));

  missingDocs = computed(() => this.requiredDocs().filter(r => r.status === 'Needed' || r.status === 'Requested'));
  expiredDocs = computed(() => this.requiredDocs().filter(r => r.status === 'Expired' || this.isExpired(r.expirationDate)));

  showNewReq = false;
  editingReqId: string | null = null;
  newReq: Partial<RequiredDocument> = this.resetReq();

  showNewFile = false;
  editingFileId: string | null = null;
  newFile: Partial<ProjectFile> = this.resetFile();

  resetReq(): Partial<RequiredDocument> {
    return { documentType: '', status: 'Needed', required: true, dueDate: '', expirationDate: '' };
  }

  isExpired(dateStr?: string): boolean {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  }

  editReq(req: RequiredDocument) {
    this.editingReqId = req.id;
    this.newReq = { ...req };
    this.showNewReq = true;
  }

  cancelReq() {
    this.editingReqId = null;
    this.newReq = this.resetReq();
    this.showNewReq = false;
  }

  saveReq() {
    if (!this.newReq.documentType) return;
    this.newReq.projectId = this.project.id;
    if (this.editingReqId) {
      this.dataService.updateRequiredDocument(this.editingReqId, this.newReq).subscribe(() => this.cancelReq());
    } else {
      this.dataService.createRequiredDocument(this.newReq).subscribe(() => this.cancelReq());
    }
  }

  resetFile(): Partial<ProjectFile> {
    return { fileName: '', documentType: '', folderKey: 'PROJECT_ADMIN', fileUrl: '', documentStatus: 'Received' };
  }

  editFile(f: ProjectFile) {
    this.editingFileId = f.id;
    this.newFile = { ...f };
    this.showNewFile = true;
  }

  cancelFile() {
    this.editingFileId = null;
    this.newFile = this.resetFile();
    this.showNewFile = false;
  }

  createAction(type: string, file: ProjectFile) {
    if (confirm(`Create a linked Issue from this photo/file?`)) {
      this.dataService.createProjectIssue({
         projectId: file.projectId,
         title: `Issue from Photo: ${file.fileName}`,
         description: `Review linked file: ${file.fileUrl}\n\nNotes: ${file.notes || ''}`,
         category: 'Quality/Damage',
         priority: 'High',
         status: 'Open',
         relatedRecordType: 'ProjectFile',
         relatedRecordId: file.id
      }).subscribe(() => alert('Issue created successfully! View in Issues tab.'));
    }
  }

  saveFile() {
    if (!this.newFile.fileName) return;
    this.newFile.projectId = this.project.id;
    if (this.editingFileId) {
      this.dataService.updateProjectFile(this.editingFileId, this.newFile).subscribe(() => this.cancelFile());
    } else {
      this.dataService.createProjectFile(this.newFile).subscribe(() => this.cancelFile());
    }
  }
}

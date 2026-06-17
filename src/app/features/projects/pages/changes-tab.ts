import { Component, Input, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { Project, Billing, ChangeOrder } from '@app/models/types';
import {
  CHANGE_ORDER_STATUSES,
  CHANGE_REQUEST_STATUSES,
  ChangeRequest,
  ChangeRequestSource,
  ChangeRequestType,
  ChangeRequestUrgency,
} from '@app/models/project-controls.types';
import { DataService } from '@core/services/data.service';
import { ProjectControlsService } from '@features/projects/services/project-controls.service';
import { PayAppService } from '@features/financials/services/pay-app.service';
import { ChangeOrderDocumentService } from '@features/projects/services/change-order-document.service';
import { WorkflowDocumentsSectionComponent } from '@app/components/workflow-documents-section';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  computeChangeMetrics,
  crNumber,
  coNumber,
  coTotalAmount,
  coApprovedAmount,
  normalizeCoStatus,
  isApprovedUnbilledCo,
  isOpenChangeRequest,
  coStatusMatches,
} from '@features/projects/utils/change-management';
import {
  buildChangeList,
  ChangeListSegment,
  filterChangeListBySegment,
} from '@features/projects/utils/project-work.compute';
import { ListRowComponent } from '@app/components/ui/list-row';
import { StatusChipComponent, StatusTone } from '@app/components/ui/status-chip';
import { EmptyStateComponent } from '@app/components/ui/empty-state';

type ChangesViewTab = 'log-cr' | 'log-co' | 'needs-pricing' | 'awaiting-approval' | 'approved-bill';

@Component({
  selector: 'app-changes-tab',
  standalone: true,
  imports: [CommonModule, MatIconModule, FormsModule, WorkflowDocumentsSectionComponent, ListRowComponent, StatusChipComponent, EmptyStateComponent],
  template: `
    <div class="space-y-4">
      @if (simplified && !showAllTools) {
        <div class="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div class="p-5 border-b border-slate-200 bg-slate-50 flex flex-wrap justify-between items-center gap-3">
            <h3 class="text-sm font-semibold text-slate-900">Changes</h3>
            <button type="button" (click)="openNewCr()" class="bg-slate-900 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2">
              <mat-icon class="!text-[18px]">add</mat-icon> New change request
            </button>
          </div>
          @for (item of simplifiedChangeItems(); track item.id) {
            <app-list-row
              [title]="item.number + ' — ' + item.title"
              [subtitle]="(item.kind === 'cr' ? 'Change Request' : 'Change Order') + ' · ' + item.status"
              [metrics]="changeItemMetrics(item)"
              [nextAction]="item.nextAction"
              [health]="item.urgency >= 85 ? 'Red' : item.urgency >= 70 ? 'Yellow' : 'Neutral'" />
          } @empty {
            <app-empty-state icon="difference" title="No changes match this filter" />
          }
        </div>
      } @else {
      <div class="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div class="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Open CRs</p>
          <p class="text-2xl font-bold text-slate-900">{{ metrics().openChangeRequests }}</p>
        </div>
        <div class="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1">Needs pricing</p>
          <p class="text-2xl font-bold text-amber-700">{{ metrics().needsPricing }}</p>
        </div>
        <div class="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-1">Awaiting approval</p>
          <p class="text-2xl font-bold text-orange-600">{{ metrics().awaitingApproval }}</p>
        </div>
        <div class="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Appr. unbilled</p>
          <p class="text-2xl font-bold text-emerald-700">{{ metrics().approvedUnbilled }}</p>
        </div>
        <div class="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Appr. unbilled $</p>
          <p class="text-2xl font-bold text-emerald-800">{{ metrics().approvedUnbilledAmount | currency }}</p>
        </div>
        <div class="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Pending CO $</p>
          <p class="text-2xl font-bold text-slate-900">{{ metrics().pendingCoAmount | currency }}</p>
        </div>
      </div>

      <div class="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        @for (t of tabs; track t.key) {
          <button type="button" (click)="viewTab.set(t.key)"
                  class="px-4 py-2 text-sm font-semibold rounded-lg transition-colors"
                  [class.bg-slate-900]="viewTab() === t.key"
                  [class.text-white]="viewTab() === t.key"
                  [class.text-slate-600]="viewTab() !== t.key"
                  [class.hover:bg-slate-100]="viewTab() !== t.key">
            {{ t.label }}
          </button>
        }
      </div>

      @if (convertingCr()) {
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-5 space-y-4">
          <div class="flex flex-wrap justify-between gap-2 items-start">
            <h4 class="font-bold text-blue-950">Convert {{ crNumberFn(convertingCr()!) }} to Change Order</h4>
            <button type="button" (click)="convertingCr.set(null)"
                    class="text-sm font-semibold text-slate-700 hover:text-slate-900">Dismiss</button>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">CO #</label>
              <input [(ngModel)]="coPricing.coNumber" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
            </div>
            <div class="sm:col-span-2">
              <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Title</label>
              <input [(ngModel)]="coPricing.title" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
            </div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Labor</label>
              <input type="number" [(ngModel)]="coPricing.laborCost" (input)="recalcConvertTotal()" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Material</label>
              <input type="number" [(ngModel)]="coPricing.materialCost" (input)="recalcConvertTotal()" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Subcontractor</label>
              <input type="number" [(ngModel)]="coPricing.subCost" (input)="recalcConvertTotal()" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Equipment</label>
              <input type="number" [(ngModel)]="coPricing.equipmentCost" (input)="recalcConvertTotal()" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Other</label>
              <input type="number" [(ngModel)]="coPricing.otherCost" (input)="recalcConvertTotal()" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">OH %</label>
              <input type="number" [(ngModel)]="coPricing.overheadPercent" (input)="recalcConvertTotal()" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Profit %</label>
              <input type="number" [(ngModel)]="coPricing.profitPercent" (input)="recalcConvertTotal()" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Bond / Ins %</label>
              <input type="number" [(ngModel)]="coPricing.bondInsurancePercent" (input)="recalcConvertTotal()" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Tax</label>
              <input type="number" [(ngModel)]="coPricing.taxAmount" (input)="recalcConvertTotal()" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Days added</label>
              <input type="number" [(ngModel)]="coPricing.scheduleImpactDays" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
          </div>
          <div class="text-right font-bold text-slate-900">Preview total: {{ convertPreviewTotal() | currency }}</div>
          <div class="flex justify-end gap-2">
            <button type="button" (click)="convertingCr.set(null)" class="px-4 py-2 rounded-lg font-bold text-slate-600 hover:bg-slate-200 text-sm">Cancel</button>
            <button type="button" (click)="convertCrToCo()" class="bg-slate-900 hover:bg-slate-800 transition-colors text-white px-4 py-2 rounded-lg text-sm font-semibold">
              Convert to CO
            </button>
          </div>
        </div>
      }

      @if (viewTab() === 'log-cr') {
        <div class="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div class="p-5 border-b border-slate-200 bg-slate-50 flex flex-wrap justify-between items-center gap-3">
            <h3 class="text-sm font-semibold text-slate-900">Change request log</h3>
            <button type="button" (click)="openNewCr()" class="bg-slate-900 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2">
              <mat-icon class="!text-[18px]">add</mat-icon> New change request
            </button>
          </div>

          @if (showCrForm()) {
            <div class="p-6 border-b border-slate-200 bg-slate-50 space-y-4">
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div class="lg:col-span-2">
                  <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Title</label>
                  <input [(ngModel)]="draftCr.title" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Requested date</label>
                  <input type="date" [(ngModel)]="draftCr.requestedDate" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Source</label>
                  <select [(ngModel)]="draftCr.source" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                    @for (s of sources; track s) { <option [value]="s">{{ s }}</option> }
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Change type</label>
                  <select [(ngModel)]="draftCr.changeType" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                    @for (t of changeTypes; track t) { <option [value]="t">{{ t }}</option> }
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Urgency</label>
                  <select [(ngModel)]="draftCr.urgency" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                    @for (u of urgencies; track u) { <option [value]="u">{{ u }}</option> }
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Requested by</label>
                  <input [(ngModel)]="draftCr.requestedBy" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Location</label>
                  <input [(ngModel)]="draftCr.location" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Drawing ref.</label>
                  <input [(ngModel)]="draftCr.drawingReference" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Spec ref.</label>
                  <input [(ngModel)]="draftCr.specReference" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Status</label>
                  <select [(ngModel)]="draftCr.status" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                    @for (s of crFormStatuses; track s) { <option [value]="s">{{ s }}</option> }
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Days added</label>
                  <input type="number" [(ngModel)]="draftCr.daysAdded" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                </div>
                <div class="flex items-center gap-3 pt-6">
                  <label class="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" [(ngModel)]="draftCr.costImpactKnown"> Cost impact known
                  </label>
                </div>
                <div class="flex items-center gap-3 pt-6">
                  <label class="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" [(ngModel)]="draftCr.scheduleImpactKnown"> Schedule impact known
                  </label>
                </div>
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Description</label>
                <textarea [(ngModel)]="draftCr.description" rows="3" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></textarea>
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Internal notes</label>
                <textarea [(ngModel)]="draftCr.internalNotes" rows="2" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></textarea>
              </div>
              <div class="flex justify-end gap-2">
                <button type="button" (click)="cancelCrForm()" class="px-4 py-2 rounded-lg font-bold text-slate-600 hover:bg-slate-200 text-sm">Cancel</button>
                <button type="button" (click)="saveCr()" class="bg-slate-900 hover:bg-slate-800 transition-colors text-white px-4 py-2 rounded-lg text-sm font-semibold">Save</button>
              </div>
            </div>
          }

          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
              <tr class="text-[10px] font-bold uppercase tracking-widest text-slate-500 border-b">
                <th class="px-3 py-2 text-left">CR #</th>
                <th class="px-3 py-2 text-left">Title</th>
                <th class="px-3 py-2 text-left">Source</th>
                <th class="px-3 py-2 text-left">Status</th>
                <th class="px-3 py-2 text-right">Actions</th>
              </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (cr of projectCrsSorted(); track cr.id) {
                  <tr class="hover:bg-slate-50 transition-colors text-xs text-slate-700">
                    <td class="px-3 py-2.5 font-numeric font-bold">{{ crNumberFn(cr) || '—' }}</td>
                    <td class="px-3 py-2.5 max-w-xs truncate">
                      {{ cr.title || cr.description || '—' }}
                      @if (!isOpenChangeRequest(cr)) {
                        <span class="block text-[10px] uppercase text-slate-400 mt-0.5">Archived</span>
                      }
                    </td>
                    <td class="px-3 py-2.5">{{ cr.source || '—' }}</td>
                    <td class="px-3 py-2.5">
                      <app-status-chip [tone]="crStatusTone(cr.status)" [label]="cr.status" />
                    </td>
                    <td class="px-5 py-3 text-right flex flex-wrap justify-end gap-1">
                      <button type="button" (click)="editCr(cr)" class="text-slate-400 hover:text-slate-800" title="Edit"><mat-icon class="!text-[16px]">edit</mat-icon></button>
                      <button type="button" (click)="toggleCrDocs(cr.id)" class="text-xs font-bold text-slate-600 hover:underline">Docs</button>
                      <button type="button" (click)="controls.submitChangeRequestForPricing(cr)"
                              class="text-xs font-bold text-emerald-700 hover:underline whitespace-nowrap">Submit for Pricing</button>
                      <button type="button" (click)="controls.markChangeRequestNeedsBackup(cr)"
                              class="text-xs font-bold text-amber-700 hover:underline whitespace-nowrap">Needs Backup</button>
                      <button type="button" (click)="controls.voidChangeRequest(cr)" class="text-xs font-bold text-rose-600 hover:underline">Void</button>
                      @if (cr.status !== 'Converted' && !cr.linkedChangeOrderId) {
                        <button type="button" (click)="beginConvert(cr)"
                                class="text-xs font-bold text-blue-600 hover:underline whitespace-nowrap">Convert to CO</button>
                      }
                    </td>
                  </tr>
                  @if (expandedCrId() === cr.id) {
                    <tr>
                      <td colspan="5" class="px-5 py-4 bg-slate-50">
                        <app-workflow-documents-section
                          [project]="project"
                          workflowType="change_request"
                          [sourceRecordId]="cr.id"
                          [canGenerateDoc]="true" />
                      </td>
                    </tr>
                  }
                } @empty {
                  <tr><td colspan="5" class="p-0"><app-empty-state icon="difference" title="No change requests" /></td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      @if (viewTab() === 'log-co') {
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div class="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
            <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Draft / pricing</p>
            <p class="text-xl font-bold text-slate-900">{{ summaryDraftPricing() | currency }}</p>
          </div>
          <div class="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
            <p class="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-1">Sent</p>
            <p class="text-xl font-bold text-orange-600">{{ summarySent() | currency }}</p>
          </div>
          <div class="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
            <p class="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Approved</p>
            <p class="text-xl font-bold text-emerald-700">{{ summaryApproved() | currency }}</p>
          </div>
          <div class="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
            <p class="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-1">Pending</p>
            <p class="text-xl font-bold text-slate-800">{{ summaryPending() | currency }}</p>
          </div>
        </div>

        <div class="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div class="p-5 border-b border-slate-200 bg-slate-50 flex flex-wrap justify-between items-center gap-3">
            <h3 class="text-sm font-semibold text-slate-900">Change order log</h3>
            <button type="button" (click)="openNewCo()" class="bg-slate-900 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2">
              <mat-icon class="!text-[18px]">add</mat-icon> New change order
            </button>
          </div>

          @if (showCoForm()) {
            <div class="p-6 border-b border-slate-200 bg-slate-50 space-y-4">
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">CO #</label>
                  <input [(ngModel)]="draftCo.changeOrderNumber" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                </div>
                <div class="sm:col-span-2 lg:col-span-2">
                  <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Title</label>
                  <input [(ngModel)]="draftCo.title" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Status</label>
                  <select [(ngModel)]="draftCo.status" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                    @for (s of coStatuses; track s) { <option [value]="s">{{ s }}</option> }
                  </select>
                </div>
                <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Labor</label>
                  <input type="number" [(ngModel)]="draftCo.laborCost" (input)="recalcDraftCo()" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
                <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Material</label>
                  <input type="number" [(ngModel)]="draftCo.materialCost" (input)="recalcDraftCo()" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
                <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Subcontractor</label>
                  <input type="number" [(ngModel)]="draftCo.subCost" (input)="recalcDraftCo()" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
                <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Equipment</label>
                  <input type="number" [(ngModel)]="draftCo.equipmentCost" (input)="recalcDraftCo()" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
                <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Other</label>
                  <input type="number" [(ngModel)]="draftCo.otherCost" (input)="recalcDraftCo()" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
                <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">OH %</label>
                  <input type="number" [(ngModel)]="draftCo.overheadPercent" (input)="recalcDraftCo()" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
                <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Profit %</label>
                  <input type="number" [(ngModel)]="draftCo.profitPercent" (input)="recalcDraftCo()" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
                <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Bond / Ins %</label>
                  <input type="number" [(ngModel)]="draftCo.bondInsurancePercent" (input)="recalcDraftCo()" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
                <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Tax</label>
                  <input type="number" [(ngModel)]="draftCo.taxAmount" (input)="recalcDraftCo()" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
                <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Days added</label>
                  <input type="number" [(ngModel)]="draftCo.daysAdded" (input)="recalcDraftCo()" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Customer contact</label>
                  <input [(ngModel)]="draftCo.customerContact" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">GC contact</label>
                  <input [(ngModel)]="draftCo.gcContact" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Owner contact</label>
                  <input [(ngModel)]="draftCo.ownerContact" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                </div>
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Clarifications</label>
                <textarea [(ngModel)]="draftCo.clarifications" rows="2" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></textarea>
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Exclusions</label>
                <textarea [(ngModel)]="draftCo.exclusions" rows="2" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></textarea>
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Description</label>
                <textarea [(ngModel)]="draftCo.description" rows="2" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></textarea>
              </div>
              <div class="text-right font-numeric font-bold text-slate-900">Sell price: {{ draftCo.sellPrice | currency }}</div>
              <div class="flex justify-end gap-2">
                <button type="button" (click)="cancelCoForm()" class="px-4 py-2 rounded-lg font-bold text-slate-600 hover:bg-slate-200 text-sm">Cancel</button>
                <button type="button" (click)="saveCo()" class="bg-slate-900 hover:bg-slate-800 transition-colors text-white px-4 py-2 rounded-lg text-sm font-semibold">Save</button>
              </div>
            </div>
          }

          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
              <tr class="text-[10px] font-bold uppercase tracking-widest text-slate-500 border-b">
                <th class="px-3 py-2 text-left">CO #</th>
                <th class="px-3 py-2 text-left">Title</th>
                <th class="px-3 py-2 text-left">Status</th>
                <th class="px-3 py-2 text-right">Amount</th>
                <th class="px-3 py-2 text-right">Actions</th>
              </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (co of projectCosSorted(); track co.id) {
                  <tr class="hover:bg-slate-50 transition-colors text-xs text-slate-700">
                    <td class="px-3 py-2.5 font-numeric font-bold">{{ coNumberFn(co) || '—' }}</td>
                    <td class="px-3 py-2.5">{{ co.title }}</td>
                    <td class="px-3 py-2.5">
                      <app-status-chip [tone]="coStatusTone(co.status)" [label]="normalizeCoStatus(co.status)" />
                    </td>
                    <td class="px-3 py-2.5 text-right text-xs font-numeric text-slate-700">{{ displayCoAmount(co) | currency }}</td>
                    <td class="px-5 py-3 text-right flex flex-wrap justify-end gap-1 items-center">
                      <button type="button" (click)="editCo(co)" class="text-slate-400 hover:text-slate-800"><mat-icon class="!text-[16px]">edit</mat-icon></button>
                      <button type="button" (click)="toggleCoDocs(co.id)" class="text-xs font-bold text-slate-600 hover:underline">Docs</button>
                      <button type="button" (click)="generateDoc(co)"
                              class="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-lg hover:bg-indigo-100 transition-colors whitespace-nowrap">Generate Doc</button>
                      <button type="button" (click)="controls.markChangeOrderSent(co)"
                              class="text-xs font-semibold text-orange-700 hover:underline whitespace-nowrap">Mark Sent</button>
                      <button type="button" (click)="controls.markChangeOrderApproved(co)"
                              class="text-xs font-semibold text-emerald-700 hover:underline whitespace-nowrap">Mark Approved</button>
                      <button type="button" (click)="controls.markChangeOrderRejected(co)"
                              class="text-xs font-semibold text-amber-700 hover:underline whitespace-nowrap">Mark Rejected</button>
                      <button type="button" (click)="controls.markChangeOrderVoid(co)"
                              class="text-xs font-semibold text-rose-600 hover:underline whitespace-nowrap">Mark Void</button>
                      <button type="button" (click)="addCoToDraftPayApp(co)"
                              class="text-xs font-semibold text-slate-800 hover:underline whitespace-nowrap">Mark Billed</button>
                    </td>
                  </tr>
                  @if (expandedCoId() === co.id) {
                    <tr>
                      <td colspan="5" class="px-5 py-4 bg-slate-50">
                        <app-workflow-documents-section
                          [project]="project"
                          workflowType="change_order"
                          [sourceRecordId]="co.id"
                          [canGenerateDoc]="true"
                          [backupUpload]="true"
                          [signedUpload]="true" />
                      </td>
                    </tr>
                  }
                } @empty {
                  <tr><td colspan="5" class="p-0"><app-empty-state icon="difference" title="No change orders" /></td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      @if (viewTab() === 'needs-pricing') {
        <div class="space-y-4">
          <div class="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <div class="p-4 border-b border-slate-200 bg-slate-50 font-bold text-slate-900">Change requests · submitted / pricing</div>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead><tr class="text-[10px] uppercase text-slate-400 border-b">
                  <th class="px-5 py-3 text-left">CR #</th><th class="px-5 py-3 text-left">Title</th><th class="px-5 py-3 text-left">Status</th><th class="px-5 py-3 text-right">Actions</th>
                </tr></thead>
                <tbody class="divide-y divide-slate-100">
                  @for (cr of crsNeedsPricing(); track cr.id) {
                    <tr class="hover:bg-slate-50">
                      <td class="px-5 py-3 font-numeric">{{ crNumberFn(cr) }}</td>
                      <td class="px-5 py-3 truncate max-w-xs">{{ cr.title || cr.description }}</td>
                      <td class="px-5 py-3">{{ cr.status }}</td>
                      <td class="px-5 py-3 text-right space-x-1">
                        <button type="button" (click)="editCr(cr)" class="text-xs font-bold text-slate-700 hover:underline">Edit</button>
                        <button type="button" (click)="toggleCrDocsPricing(cr)" class="text-xs font-bold text-slate-600 hover:underline">Docs</button>
                        <button type="button" (click)="controls.markChangeRequestNeedsBackup(cr)" class="text-xs font-bold text-amber-700 hover:underline">Backup</button>
                      </td>
                    </tr>
                    @if (expandedCrPricingId() === cr.id) {
                      <tr><td colspan="4" class="px-5 py-4 bg-slate-50">
                        <app-workflow-documents-section [project]="project" workflowType="change_request" [sourceRecordId]="cr.id" [canGenerateDoc]="true" />
                      </td></tr>
                    }
                  } @empty {
                    <tr><td colspan="4" class="px-5 py-8 text-center text-slate-400 italic">No CRs need pricing</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
          <div class="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <div class="p-4 border-b border-slate-200 bg-slate-50 font-bold text-slate-900">Change orders · draft / pricing / backup</div>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead><tr class="text-[10px] uppercase text-slate-400 border-b">
                  <th class="px-5 py-3 text-left">CO #</th><th class="px-5 py-3 text-left">Title</th><th class="px-5 py-3 text-left">Status</th><th class="px-5 py-3 text-right">$</th><th class="px-5 py-3 text-right">Actions</th>
                </tr></thead>
                <tbody class="divide-y divide-slate-100">
                  @for (co of cosNeedsPricing(); track co.id) {
                    <tr class="hover:bg-slate-50">
                      <td class="px-5 py-3 font-numeric">{{ coNumberFn(co) }}</td>
                      <td class="px-5 py-3">{{ co.title }}</td>
                      <td class="px-5 py-3">{{ normalizeCoStatus(co.status) }}</td>
                      <td class="px-5 py-3 text-right font-numeric">{{ coTotalAmountFn(co) | currency }}</td>
                      <td class="px-5 py-3 text-right space-x-1">
                        <button type="button" (click)="editCo(co)" class="text-xs font-bold text-slate-700 hover:underline">Edit</button>
                        <button type="button" (click)="toggleCoDocsPricing(co)" class="text-xs font-bold text-slate-600 hover:underline">Docs</button>
                        <button type="button" (click)="controls.markChangeOrderSent(co)" class="text-xs font-bold text-orange-700 hover:underline">Sent</button>
                      </td>
                    </tr>
                    @if (expandedCoPricingId() === co.id) {
                      <tr><td colspan="5" class="px-5 py-4 bg-slate-50">
                        <app-workflow-documents-section [project]="project" workflowType="change_order" [sourceRecordId]="co.id" [canGenerateDoc]="true" [backupUpload]="true" [signedUpload]="true" />
                      </td></tr>
                    }
                  } @empty {
                    <tr><td colspan="5" class="px-5 py-8 text-center text-slate-400 italic">No COs in pricing</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      }

      @if (viewTab() === 'awaiting-approval') {
        <div class="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div class="p-4 border-b border-slate-200 bg-slate-50 font-bold text-slate-900">Change orders awaiting approval</div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead><tr class="text-[10px] uppercase text-slate-400 border-b">
                <th class="px-5 py-3 text-left">CO #</th><th class="px-5 py-3 text-left">Title</th><th class="px-5 py-3 text-right">$</th><th class="px-5 py-3 text-right">Actions</th>
              </tr></thead>
              <tbody class="divide-y divide-slate-100">
                @for (co of cosAwaitingApproval(); track co.id) {
                  <tr class="hover:bg-slate-50">
                    <td class="px-5 py-3 font-numeric">{{ coNumberFn(co) }}</td>
                    <td class="px-5 py-3">{{ co.title }}</td>
                    <td class="px-5 py-3 text-right font-numeric">{{ coTotalAmountFn(co) | currency }}</td>
                    <td class="px-5 py-3 text-right space-x-1">
                      <button type="button" (click)="editCo(co)" class="text-xs font-bold text-slate-700 hover:underline">Edit</button>
                      <button type="button" (click)="toggleCoDocsApprove(co)" class="text-xs font-bold text-slate-600 hover:underline">Docs</button>
                      <button type="button" (click)="controls.markChangeOrderApproved(co)" class="text-xs font-bold text-emerald-700 hover:underline">Approved</button>
                      <button type="button" (click)="controls.markChangeOrderRejected(co)" class="text-xs font-bold text-rose-600 hover:underline">Rejected</button>
                    </td>
                  </tr>
                  @if (expandedCoApproveId() === co.id) {
                    <tr><td colspan="4" class="px-5 py-4 bg-slate-50">
                      <app-workflow-documents-section [project]="project" workflowType="change_order" [sourceRecordId]="co.id" [canGenerateDoc]="true" [backupUpload]="true" [signedUpload]="true" />
                    </td></tr>
                  }
                } @empty {
                  <tr><td colspan="4" class="px-5 py-10 text-center text-slate-400 italic">None awaiting approval</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      @if (viewTab() === 'approved-bill') {
        <div class="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div class="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap justify-between gap-2">
            <span class="font-bold text-slate-900">Approved · not yet billed</span>
            <span class="text-xs text-slate-600">Uses draft pay application when present</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead><tr class="text-[10px] uppercase text-slate-400 border-b">
                <th class="px-5 py-3 text-left">CO #</th><th class="px-5 py-3 text-left">Title</th><th class="px-5 py-3 text-right">Approved</th><th class="px-5 py-3 text-right">Pay app</th>
              </tr></thead>
              <tbody class="divide-y divide-slate-100">
                @for (co of cosApprovedUnbilled(); track co.id) {
                  <tr class="hover:bg-slate-50">
                    <td class="px-5 py-3 font-numeric">{{ coNumberFn(co) }}</td>
                    <td class="px-5 py-3">{{ co.title }}</td>
                    <td class="px-5 py-3 text-right font-numeric">{{ coApprovedAmount(co) | currency }}</td>
                    <td class="px-5 py-3 text-right">
                      <button type="button"
                              [disabled]="!pickDraftPayApp()"
                              (click)="addApprovedCoToPayApp(co)"
                              class="bg-slate-900 hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:pointer-events-none text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
                        Add to next pay app
                      </button>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="4" class="px-5 py-10 text-center text-slate-400 italic">No approved unbilled change orders</td></tr>
                }
              </tbody>
            </table>
          </div>
          @if (!pickDraftPayApp()) {
            <p class="px-5 pb-4 text-xs text-amber-800">Create a draft pay application for this project to add change orders.</p>
          }
        </div>
      }
      }
    </div>
  `,
})
export class ChangesTabComponent {
  @Input({ required: true }) project!: Project;
  @Input() simplified = false;
  @Input() showAllTools = false;
  @Input() changeSegment: ChangeListSegment = 'all';

  data = inject(DataService);
  controls = inject(ProjectControlsService);
  payApps = inject(PayAppService);
  private coDoc = inject(ChangeOrderDocumentService);

  viewTab = signal<ChangesViewTab>('log-cr');

  readonly tabs: { key: ChangesViewTab; label: string }[] = [
    { key: 'log-cr', label: 'CR log' },
    { key: 'log-co', label: 'CO log' },
    { key: 'needs-pricing', label: 'Needs pricing' },
    { key: 'awaiting-approval', label: 'Awaiting approval' },
    { key: 'approved-bill', label: 'Approved · bill' },
  ];

  changeRequests = toSignal(this.data.getChangeRequests(), { initialValue: [] });
  changeOrders = toSignal(this.data.getChangeOrders(), { initialValue: [] });

  projectCrs = computed(() => this.changeRequests().filter(c => c.projectId === this.project.id));
  projectCos = computed(() => this.changeOrders().filter(c => c.projectId === this.project.id));

  metrics = computed(() => computeChangeMetrics(this.projectCrs(), this.projectCos()));

  simplifiedChangeItems = computed(() =>
    filterChangeListBySegment(
      buildChangeList(this.projectCrs(), this.projectCos(), this.project.id),
      this.changeSegment,
    ),
  );

  changeItemMetrics(item: ReturnType<typeof buildChangeList>[number]) {
    const metrics: { label: string; value: string; alert?: boolean }[] = [];
    if (item.amount > 0) metrics.push({ label: 'Amount', value: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(item.amount) });
    metrics.push({ label: 'Billing', value: item.billingStatus });
    return metrics;
  }

  crsNeedsPricing = computed(() =>
    this.projectCrs().filter(cr => cr.status === 'Submitted' || cr.status === 'Pricing'));

  cosNeedsPricing = computed(() =>
    this.projectCos().filter(co =>
      coStatusMatches(co, 'Draft', 'Pricing', 'Needs Backup'),
    ));

  cosAwaitingApproval = computed(() => this.projectCos().filter(co => coStatusMatches(co, 'Sent')));

  cosApprovedUnbilled = computed(() => this.projectCos().filter(isApprovedUnbilledCo));

  expandedCrId = signal<string | null>(null);
  expandedCoId = signal<string | null>(null);
  expandedCrPricingId = signal<string | null>(null);
  expandedCoPricingId = signal<string | null>(null);
  expandedCoApproveId = signal<string | null>(null);

  showCrForm = signal(false);
  showCoForm = signal(false);
  convertingCr = signal<ChangeRequest | null>(null);
  editingCrId: string | null = null;
  editingCoId: string | null = null;

  readonly sources: ChangeRequestSource[] = [
    'Owner', 'GC', 'Architect', 'Field', 'Subcontractor', 'Internal', 'Unknown',
  ];
  readonly changeTypes: ChangeRequestType[] = [
    'Scope Add', 'Scope Delete', 'Field Condition', 'Design Change', 'T&M', 'Allowance', 'Schedule Impact', 'Other',
  ];
  readonly urgencies: ChangeRequestUrgency[] = ['Normal', 'High', 'Critical'];
  readonly crFormStatuses = CHANGE_REQUEST_STATUSES.filter(s => s !== 'Converted');
  readonly coStatuses = CHANGE_ORDER_STATUSES;

  draftCr: Partial<ChangeRequest> = this.resetCr();
  draftCo: Partial<ChangeOrder> = this.resetCo();

  coPricing: {
    coNumber: string;
    title: string;
    laborCost: number;
    materialCost: number;
    subCost: number;
    equipmentCost: number;
    otherCost: number;
    overheadPercent: number;
    profitPercent: number;
    bondInsurancePercent: number;
    taxAmount: number;
    scheduleImpactDays: number;
  } = this.resetCoPricing();

  convertPreviewTotal = signal(0);

  normalizeCoStatus = normalizeCoStatus;
  coApprovedAmount = coApprovedAmount;
  coTotalAmountFn = coTotalAmount;
  crNumberFn = crNumber;
  coNumberFn = coNumber;
  isOpenChangeRequest = isOpenChangeRequest;

  projectCrsSorted = computed(() =>
    [...this.projectCrs()].sort((a, b) => crNumber(a).localeCompare(crNumber(b), undefined, { numeric: true })),
  );

  projectCosSorted = computed(() =>
    [...this.projectCos()].sort((a, b) => coNumber(a).localeCompare(coNumber(b), undefined, { numeric: true })),
  );

  summaryDraftPricing = computed(() =>
    this.projectCos()
      .filter(co => coStatusMatches(co, 'Draft', 'Pricing', 'Needs Backup'))
      .reduce((s, co) => s + coTotalAmount(co), 0),
  );

  summarySent = computed(() =>
    this.projectCos().filter(co => coStatusMatches(co, 'Sent')).reduce((s, co) => s + coTotalAmount(co), 0),
  );

  summaryApproved = computed(() =>
    this.projectCos()
      .filter(co => coStatusMatches(co, 'Approved'))
      .reduce((s, co) => s + coApprovedAmount(co), 0),
  );

  summaryPending = computed(() =>
    this.projectCos()
      .filter(co =>
        coStatusMatches(co, 'Draft', 'Pricing', 'Needs Backup', 'Sent'),
      )
      .reduce((s, co) => s + coTotalAmount(co), 0),
  );

  private resetCoPricing() {
    return {
      coNumber: '',
      title: '',
      laborCost: 0,
      materialCost: 0,
      subCost: 0,
      equipmentCost: 0,
      otherCost: 0,
      overheadPercent: 10,
      profitPercent: 10,
      bondInsurancePercent: 0,
      taxAmount: 0,
      scheduleImpactDays: 0,
    };
  }

  resetCr(): Partial<ChangeRequest> {
    const today = new Date().toISOString().slice(0, 10);
    return {
      status: 'Draft',
      source: 'Internal',
      changeType: 'Other',
      urgency: 'Normal',
      requestedDate: today,
      requestedBy: '',
      title: '',
      description: '',
      location: '',
      drawingReference: '',
      specReference: '',
      internalNotes: '',
      costImpactKnown: false,
      scheduleImpactKnown: false,
      daysAdded: undefined,
    };
  }

  resetCo(): Partial<ChangeOrder> {
    return {
      status: 'Draft',
      laborCost: 0,
      materialCost: 0,
      subCost: 0,
      equipmentCost: 0,
      otherCost: 0,
      overheadPercent: 10,
      profitPercent: 10,
      bondInsurancePercent: 0,
      taxAmount: 0,
      approvedAmount: 0,
      title: '',
    };
  }

  displayCoAmount(co: ChangeOrder): number {
    if (normalizeCoStatus(co.status) === 'Approved' || normalizeCoStatus(co.status) === 'Billed') {
      return coApprovedAmount(co);
    }
    return coTotalAmount(co);
  }

  pickDraftPayApp(): Billing | undefined {
    return this.projectBillings().find(b => b.status === 'Draft');
  }

  /** Project billings newest-first (draft finder picks primary draft). */
  private projectBillings = computed(() => {
    const list = this.data
      .billingsSnapshot()
      .filter(b => b.projectId === this.project.id);
    const score = (b: Billing) => `${b.billingPeriod ?? ''}\t${b.payAppNumber ?? ''}`;
    return [...list].sort((a, b) => score(b).localeCompare(score(a)));
  });

  async openNewCr() {
    this.draftCr = {
      ...this.resetCr(),
      projectId: this.project.id,
    };
    this.editingCrId = null;
    this.showCrForm.set(true);
  }

  editCr(cr: ChangeRequest) {
    this.draftCr = {
      ...cr,
      urgency: cr.urgency ?? (cr.urgent ? 'High' : 'Normal'),
      drawingReference: cr.drawingReference ?? cr.drawingSpecReference,
      specReference: cr.specReference,
      requestedDate: cr.requestedDate ?? cr.requestDate,
    };
    this.editingCrId = cr.id;
    this.showCrForm.set(true);
  }

  cancelCrForm() {
    this.showCrForm.set(false);
    this.draftCr = this.resetCr();
    this.editingCrId = null;
  }

  async saveCr() {
    await this.controls.saveChangeRequest(this.project, this.draftCr, this.editingCrId);
    this.cancelCrForm();
  }

  beginConvert(cr: ChangeRequest) {
    this.convertingCr.set(cr);
    const next = this.controls.nextChangeOrderNumber(this.project.id);
    this.coPricing = {
      ...this.resetCoPricing(),
      coNumber: next,
      title: cr.title ?? cr.description?.slice(0, 80) ?? 'Change Order',
      scheduleImpactDays: cr.daysAdded ?? 0,
    };
    this.recalcConvertTotal();
    this.viewTab.set('log-co');
  }

  recalcConvertTotal() {
    this.convertPreviewTotal.set(this.controls.calcChangeOrderTotal(this.coPricing).sellPrice);
  }

  async convertCrToCo() {
    const cr = this.convertingCr();
    if (!cr) return;
    await this.controls.convertChangeRequestToChangeOrder(cr, this.coPricing);
    this.convertingCr.set(null);
  }

  openNewCo() {
    const num = this.controls.nextChangeOrderNumber(this.project.id);
    this.draftCo = {
      ...this.resetCo(),
      projectId: this.project.id,
      coNumber: num,
      changeOrderNumber: num,
    };
    this.editingCoId = null;
    this.showCoForm.set(true);
    this.recalcDraftCo();
  }

  editCo(co: ChangeOrder) {
    const num = co.changeOrderNumber ?? co.coNumber;
    this.draftCo = { ...co, coNumber: num, changeOrderNumber: num };
    this.editingCoId = co.id;
    this.showCoForm.set(true);
    this.recalcDraftCo();
  }

  cancelCoForm() {
    this.showCoForm.set(false);
    this.draftCo = this.resetCo();
    this.editingCoId = null;
  }

  recalcDraftCo() {
    const totals = this.controls.calcChangeOrderTotal(this.draftCo);
    this.draftCo.costImpact = totals.directCost;
    this.draftCo.sellPrice = totals.sellPrice;
    this.draftCo.totalAmount = totals.sellPrice;
  }

  async saveCo() {
    const n = this.draftCo.changeOrderNumber ?? this.draftCo.coNumber ?? '';
    this.draftCo.coNumber = n;
    this.draftCo.changeOrderNumber = n;
    this.recalcDraftCo();
    await this.controls.saveChangeOrder(this.project, this.draftCo, this.editingCoId);
    this.cancelCoForm();
  }

  async generateDoc(co: ChangeOrder) {
    await this.coDoc.generateAndSave(this.project, co);
    this.coDoc.openPrintPreview(this.project, co);
    await this.controls.onChangeOrderDocumentGenerated(co);
  }

  toggleCrDocs(id: string) {
    this.expandedCrId.set(this.expandedCrId() === id ? null : id);
  }

  toggleCoDocs(id: string) {
    this.expandedCoId.set(this.expandedCoId() === id ? null : id);
  }

  toggleCrDocsPricing(cr: ChangeRequest) {
    this.expandedCrPricingId.set(this.expandedCrPricingId() === cr.id ? null : cr.id);
  }

  toggleCoDocsPricing(co: ChangeOrder) {
    this.expandedCoPricingId.set(this.expandedCoPricingId() === co.id ? null : co.id);
  }

  toggleCoDocsApprove(co: ChangeOrder) {
    this.expandedCoApproveId.set(this.expandedCoApproveId() === co.id ? null : co.id);
  }

  /** Add approved CO to draft pay app without marking billed. */
  async addCoToDraftPayApp(co: ChangeOrder) {
    let pay = this.pickDraftPayApp();
    if (!pay) pay = await this.payApps.createDraftPayApp(this.project);
    await this.payApps.includeCoInDraftPayApp(co, pay);
  }

  async addApprovedCoToPayApp(co: ChangeOrder) {
    await this.addCoToDraftPayApp(co);
  }

  crStatusTone(status: string): StatusTone {
    if (status === 'Converted' || status === 'Approved') return 'green';
    if (status === 'Submitted' || status === 'Pricing' || status === 'Needs Backup') return 'amber';
    if (status === 'Void' || status === 'Rejected') return 'red';
    return 'slate';
  }

  coStatusTone(status: string): StatusTone {
    const normalized = normalizeCoStatus(status);
    if (normalized === 'Approved' || normalized === 'Billed') return 'green';
    if (normalized === 'Sent' || normalized === 'Pricing' || normalized === 'Needs Backup') return 'amber';
    if (normalized === 'Rejected' || normalized === 'Void') return 'red';
    return 'slate';
  }
}

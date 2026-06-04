import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="bg-white rounded-lg border border-slate-200 shadow-sm p-3 h-full">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">{{ label }}</div>
          <div class="text-xl font-black text-slate-900 truncate">{{ value }}</div>
          @if (subtext) {
            <div class="text-xs text-slate-500 mt-1 truncate">{{ subtext }}</div>
          }
          @if (trend) {
            <div class="text-xs font-medium mt-1" [class.text-emerald-600]="trendPositive" [class.text-amber-600]="!trendPositive">
              {{ trend }}
            </div>
          }
        </div>
        @if (icon) {
          <div class="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
            <mat-icon class="!text-[18px]">{{ icon }}</mat-icon>
          </div>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatCardComponent {
  @Input({ required: true }) label!: string;
  @Input({ required: true }) value!: string;
  @Input() subtext?: string;
  @Input() trend?: string;
  @Input() trendPositive = true;
  @Input() icon?: string;
}

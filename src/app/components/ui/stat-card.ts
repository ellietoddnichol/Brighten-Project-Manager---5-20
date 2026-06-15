import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

import { CommonModule } from '@angular/common';

import { MatIconModule } from '@angular/material/icon';



@Component({

  selector: 'app-stat-card',

  standalone: true,

  imports: [CommonModule, MatIconModule],

  template: `

    <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 h-full">

      <div class="flex items-start justify-between gap-2">

        <div class="min-w-0">

          <div class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{{ label }}</div>

          @if (value === null || value === undefined || value === '') {

            <span class="animate-pulse bg-slate-100 rounded h-6 w-16 inline-block"></span>

          } @else {

            <div class="text-xl font-black text-slate-900 truncate">{{ value }}</div>

          }

          @if (subtext) {

            <div class="text-xs text-slate-500 mt-1 truncate">{{ subtext }}</div>

          }

          @if (trendDirection && trendDisplayText) {

            <div class="text-xs font-medium mt-1 flex items-center gap-0.5"

                 [class.text-emerald-700]="trendDirection === 'up'"

                 [class.text-rose-700]="trendDirection === 'down'"

                 [class.text-slate-500]="trendDirection === 'neutral'">

              @if (trendDirection === 'up') {

                <mat-icon class="!text-[14px]">arrow_upward</mat-icon>

              } @else if (trendDirection === 'down') {

                <mat-icon class="!text-[14px]">arrow_downward</mat-icon>

              }

              {{ trendDisplayText }}

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

  @Input() value: string | number | null | undefined = '';

  @Input() subtext?: string;

  @Input() trend?: 'up' | 'down' | 'neutral' | string;

  @Input() trendValue?: string;

  @Input() icon?: string;

  @Input() trendPositive = true;



  get trendDirection(): 'up' | 'down' | 'neutral' | null {

    if (this.trend === 'up' || this.trend === 'down' || this.trend === 'neutral') return this.trend;

    if (this.trendValue) return this.trendPositive ? 'up' : 'down';

    if (typeof this.trend === 'string' && this.trend) return this.trendPositive ? 'up' : 'down';

    return null;

  }



  get trendDisplayText(): string {

    if (this.trendValue) return this.trendValue;

    if (this.trend === 'up' || this.trend === 'down' || this.trend === 'neutral') return '';

    return typeof this.trend === 'string' ? this.trend : '';

  }

}


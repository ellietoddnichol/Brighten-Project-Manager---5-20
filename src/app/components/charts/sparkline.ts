import { Component, Input, ChangeDetectionStrategy, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-sparkline',
  standalone: true,
  imports: [CommonModule],
  template: `
    <svg [attr.width]="width()" [attr.height]="height()" [attr.viewBox]="viewBox()" style="display:block;overflow:visible">
      <polyline
        [attr.points]="points()"
        [attr.stroke]="lineColor()"
        stroke-width="1.5"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SparklineComponent {
  readonly values = input<number[]>([]);
  readonly color = input<string | undefined>(undefined);
  readonly width = input<number>(80);
  readonly height = input<number>(24);

  viewBox = computed(() => `0 0 ${this.width()} ${this.height()}`);

  lineColor = computed(() => {
    const c = this.color();
    if (c) return c;
    const vals = this.values();
    if (vals.length < 2) return '#059669';
    return vals[vals.length - 1] >= vals[0] ? '#059669' : '#e11d48';
  });

  points = computed(() => {
    const vals = this.values();
    const w = this.width();
    const h = this.height();
    if (!vals || vals.length < 2) return '';

    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const padding = 2;

    return vals
      .map((v, i) => {
        const x = (i / (vals.length - 1)) * w;
        const y = h - padding - ((v - min) / range) * (h - padding * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  });
}

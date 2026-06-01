import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Legend,
  Tooltip,
  Filler,
} from 'chart.js';

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Legend, Tooltip, Filler);

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
  fill?: boolean;
}

@Component({
  selector: 'app-line-chart',
  standalone: true,
  template: `<div class="relative h-full min-h-[200px]"><canvas #canvas></canvas></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LineChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  @Input({ required: true }) labels: string[] = [];
  @Input({ required: true }) data: Record<string, number>[] = [];
  @Input({ required: true }) series: LineSeries[] = [];

  private chart?: Chart;

  ngAfterViewInit(): void {
    this.render();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.chart && (changes['labels'] || changes['data'] || changes['series'])) {
      this.render();
    }
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  private render(): void {
    if (!this.canvasRef?.nativeElement) return;
    this.chart?.destroy();

    this.chart = new Chart(this.canvasRef.nativeElement, {
      type: 'line',
      data: {
        labels: this.labels,
        datasets: this.series.map(s => ({
          label: s.label,
          data: this.data.map(row => row[s.key] ?? 0),
          borderColor: s.color,
          backgroundColor: s.fill ? `${s.color}22` : 'transparent',
          fill: s.fill ?? false,
          borderDash: s.dashed ? [6, 4] : undefined,
          tension: 0.35,
          pointRadius: 3,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
        scales: {
          x: { grid: { display: false } },
          y: { ticks: { callback: v => `$${Number(v) / 1000}k` } },
        },
      },
    });
  }
}

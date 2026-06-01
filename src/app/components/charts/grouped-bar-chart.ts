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
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Legend,
  Tooltip,
} from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Legend, Tooltip);

export interface GroupedBarSeries {
  key: string;
  label: string;
  color: string;
}

@Component({
  selector: 'app-grouped-bar-chart',
  standalone: true,
  template: `<div class="relative h-full min-h-[200px]"><canvas #canvas></canvas></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupedBarChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  @Input({ required: true }) labels: string[] = [];
  @Input({ required: true }) data: Record<string, number>[] = [];
  @Input({ required: true }) series: GroupedBarSeries[] = [];
  @Input() horizontal = false;

  private chart?: Chart;

  ngAfterViewInit(): void {
    this.render();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.chart && (changes['labels'] || changes['data'] || changes['series'] || changes['horizontal'])) {
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
      type: 'bar',
      data: {
        labels: this.labels,
        datasets: this.series.map(s => ({
          label: s.label,
          data: this.data.map(row => row[s.key] ?? 0),
          backgroundColor: s.color,
          borderRadius: 4,
        })),
      },
      options: {
        indexAxis: this.horizontal ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
        },
        scales: {
          x: {
            grid: { display: this.horizontal },
            ticks: this.horizontal
              ? { callback: v => `$${Number(v) / 1000}k` }
              : undefined,
          },
          y: {
            grid: { display: !this.horizontal },
            ticks: !this.horizontal
              ? { callback: v => `$${Number(v) / 1000}k` }
              : undefined,
          },
        },
      },
    });
  }
}

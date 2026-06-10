import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  HostListener,
  ElementRef,
  ViewChild,
  AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Project } from '@app/models/types';

const RECENTS_KEY = 'brighten-recent-nav';
const MAX_RECENTS = 5;

interface PaletteResult {
  id: string;
  group: 'recent' | 'pages' | 'projects' | 'actions';
  label: string;
  sublabel?: string;
  icon: string;
  route: string;
  queryParams?: Record<string, string>;
  isComingSoon?: boolean;
  /** Breadcrumb path hint shown on the right */
  pathHint?: string;
  /** Status dot color for projects */
  statusDot?: 'green' | 'amber' | 'rose';
  /** Contract value for project results */
  contractValue?: number;
}

const PAGE_RESULTS: PaletteResult[] = [
  { id: 'page-dashboard',      group: 'pages', label: 'Dashboard',      icon: 'dashboard',     route: '/',                            pathHint: 'Home' },
  { id: 'page-projects',       group: 'pages', label: 'Projects',       icon: 'folder',        route: '/projects',                    pathHint: 'Projects' },
  { id: 'page-billing',        group: 'pages', label: 'Billing',        icon: 'receipt_long',  route: '/billing',                     pathHint: 'Billing' },
  { id: 'page-financials',     group: 'pages', label: 'Financials',     icon: 'bar_chart',     route: '/financials',                  pathHint: 'Financials' },
  { id: 'page-wip',            group: 'pages', label: 'WIP',            icon: 'construction',  route: '/financials/wip',              pathHint: 'Financials › WIP' },
  { id: 'page-ar',             group: 'pages', label: 'AR',             icon: 'account_balance',route: '/ar',                         pathHint: 'AR' },
  { id: 'page-labor',          group: 'pages', label: 'Labor',          icon: 'people',        route: '/labor',                       pathHint: 'Labor' },
  { id: 'page-documents',      group: 'pages', label: 'Documents',      icon: 'description',   route: '/documents',                   pathHint: 'Documents' },
  { id: 'page-settings',       group: 'pages', label: 'Settings',       icon: 'settings',      route: '/settings/source-health',      pathHint: 'Settings' },
];

const ACTION_RESULTS: PaletteResult[] = [
  { id: 'action-new-project',    group: 'actions', label: 'New Project',         icon: 'add_circle',        route: '/projects', queryParams: { new: '1' },  pathHint: 'Projects › New' },
  { id: 'action-export-csv',     group: 'actions', label: 'Export CSV',          icon: 'download',          route: '',          isComingSoon: true,          pathHint: 'Actions' },
  { id: 'action-source-health',  group: 'actions', label: 'Go to Source Health', icon: 'health_and_safety', route: '/settings/source-health',               pathHint: 'Settings › Source Health' },
];

function loadRecents(): PaletteResult[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PaletteResult[];
  } catch {
    return [];
  }
}

function saveRecent(item: PaletteResult): void {
  try {
    const existing = loadRecents().filter(r => r.id !== item.id);
    const updated = [{ ...item, group: 'recent' as const }, ...existing].slice(0, MAX_RECENTS);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

function statusDotForProject(project: Project): 'green' | 'amber' | 'rose' {
  const s = project.status;
  if (s === 'Active') return 'green';
  if (s === 'Closeout' || s === 'Setup Needed' || s === 'Awarded') return 'amber';
  return 'rose';
}

@Component({
  selector: 'app-command-palette',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open) {
      <div
        class="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-start justify-center pt-[15vh]"
        (click)="onOverlayClick($event)"
      >
        <div
          class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden"
          (click)="$event.stopPropagation()"
        >
          <!-- Search input -->
          <div class="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
            <mat-icon class="text-slate-400 shrink-0">search</mat-icon>
            <input
              #searchInput
              type="text"
              placeholder="Search pages, projects, actions…"
              class="flex-1 text-sm text-slate-900 placeholder-slate-400 outline-none bg-transparent"
              [value]="query()"
              (input)="onInput($event)"
              (keydown)="onKeyDown($event)"
              autocomplete="off"
            />
            @if (query()) {
              <button class="text-slate-400 hover:text-slate-600" (click)="clearQuery()">
                <mat-icon class="!text-[16px]">close</mat-icon>
              </button>
            }
          </div>

          <!-- Results -->
          <div class="max-h-[60vh] overflow-y-auto" #resultsList>
            @if (flatResults().length === 0) {
              <div class="px-4 py-8 text-center text-sm text-slate-400">No results for "{{ query() }}"</div>
            } @else {
              @for (group of groupedResults(); track group.name) {
                <!-- Group header -->
                <div class="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-4 py-2 bg-slate-50">
                  {{ group.name }}
                </div>
                @for (item of group.items; track item.id) {
                  <div
                    class="px-4 py-2.5 flex items-center gap-3 cursor-pointer transition-colors"
                    [class.bg-indigo-50]="isSelected(item)"
                    [class.hover:bg-slate-50]="!isSelected(item)"
                    (click)="execute(item)"
                    (mouseenter)="setSelectedId(item.id)"
                  >
                    <!-- Icon or status dot -->
                    <div class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 shrink-0 relative">
                      <mat-icon class="!text-[16px]">{{ item.icon }}</mat-icon>
                      @if (item.statusDot) {
                        <span
                          class="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white"
                          [class.bg-green-500]="item.statusDot === 'green'"
                          [class.bg-amber-400]="item.statusDot === 'amber'"
                          [class.bg-rose-500]="item.statusDot === 'rose'"
                        ></span>
                      }
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-sm font-medium text-slate-900 truncate">{{ item.label }}</div>
                      @if (item.sublabel) {
                        <div class="text-xs text-slate-500 truncate">{{ item.sublabel }}</div>
                      }
                    </div>
                    <!-- Contract value for projects -->
                    @if (item.contractValue != null) {
                      <span class="text-xs text-slate-400 font-numeric shrink-0">{{ fmtCurrency(item.contractValue) }}</span>
                    }
                    <!-- Path hint -->
                    @if (item.pathHint && !item.contractValue) {
                      <span class="text-[10px] text-slate-400 shrink-0 hidden sm:block">{{ item.pathHint }}</span>
                    }
                    @if (item.isComingSoon) {
                      <span class="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">soon</span>
                    } @else if (isSelected(item)) {
                      <span class="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">↵ to go</span>
                    }
                  </div>
                }
              }
            }
          </div>

          <!-- Footer -->
          <div class="px-4 py-2 border-t border-slate-100 flex items-center justify-end">
            <span class="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">esc to close</span>
          </div>
        </div>
      </div>
    }
  `,
})
export class CommandPaletteComponent implements OnChanges, AfterViewInit {
  @Input() open = false;
  @Input() projects: Project[] = [];
  @Output() close = new EventEmitter<void>();

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  private router = inject(Router);

  readonly query = signal('');
  private selectedId = signal<string | null>(null);
  private recents = signal<PaletteResult[]>([]);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']) {
      if (this.open) {
        this.query.set('');
        this.selectedId.set(null);
        this.recents.set(loadRecents());
        // Focus after render
        setTimeout(() => this.searchInput?.nativeElement?.focus(), 0);
      }
    }
  }

  ngAfterViewInit(): void {
    if (this.open) {
      this.recents.set(loadRecents());
      setTimeout(() => this.searchInput?.nativeElement?.focus(), 0);
    }
  }

  readonly flatResults = computed((): PaletteResult[] => {
    const q = this.query().toLowerCase().trim();

    if (!q) {
      // Show recents first when query is empty
      const recentItems = this.recents().map(r => ({ ...r, group: 'recent' as const }));
      const pages = PAGE_RESULTS;
      const actions = ACTION_RESULTS;
      return [...recentItems, ...pages, ...actions];
    }

    const pages = PAGE_RESULTS.filter(p => p.label.toLowerCase().includes(q));

    const projectResults: PaletteResult[] = this.projects
      .filter(p =>
        p.projectName?.toLowerCase().includes(q) ||
        p.projectNumber?.toLowerCase().includes(q) ||
        p.customer?.toLowerCase().includes(q),
      )
      .slice(0, 8)
      .map(p => ({
        id: `project-${p.id}`,
        group: 'projects' as const,
        label: `${p.projectNumber} – ${p.projectName}`,
        sublabel: p.customer,
        icon: 'work',
        route: `/projects/${p.id}`,
        pathHint: `Projects › #${p.projectNumber}`,
        statusDot: statusDotForProject(p),
        contractValue: p.originalContractAmount,
      }));

    const actions = ACTION_RESULTS.filter(a => a.label.toLowerCase().includes(q));

    return [...pages, ...projectResults, ...actions];
  });

  readonly groupedResults = computed(() => {
    const results = this.flatResults();
    const groups: Array<{ name: string; items: PaletteResult[] }> = [];
    const recentItems = results.filter(r => r.group === 'recent');
    const pageItems = results.filter(r => r.group === 'pages');
    const projectItems = results.filter(r => r.group === 'projects');
    const actionItems = results.filter(r => r.group === 'actions');
    if (recentItems.length) groups.push({ name: 'Recent', items: recentItems });
    if (pageItems.length) groups.push({ name: 'Pages', items: pageItems });
    if (projectItems.length) groups.push({ name: 'Projects', items: projectItems });
    if (actionItems.length) groups.push({ name: 'Actions', items: actionItems });
    return groups;
  });

  isSelected(item: PaletteResult): boolean {
    const sid = this.selectedId();
    if (sid !== null) return item.id === sid;
    return item.id === this.flatResults()[0]?.id;
  }

  setSelectedId(id: string): void {
    this.selectedId.set(id);
  }

  onInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.query.set(val);
    this.selectedId.set(null);
  }

  clearQuery(): void {
    this.query.set('');
    this.selectedId.set(null);
    this.searchInput?.nativeElement?.focus();
  }

  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close.emit();
    }
  }

  fmtCurrency(n: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (!this.open) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      this.close.emit();
      return;
    }

    const results = this.flatResults();
    if (!results.length) return;

    const currentId = this.selectedId();
    const currentIdx = currentId !== null
      ? results.findIndex(r => r.id === currentId)
      : 0;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIdx = (currentIdx + 1) % results.length;
      this.selectedId.set(results[nextIdx].id);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prevIdx = (currentIdx - 1 + results.length) % results.length;
      this.selectedId.set(results[prevIdx].id);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selected = currentId !== null
        ? results.find(r => r.id === currentId)
        : results[0];
      if (selected) this.execute(selected);
    }
  }

  execute(item: PaletteResult): void {
    if (item.isComingSoon) {
      this.close.emit();
      return;
    }
    if (item.route) {
      saveRecent(item);
      void this.router.navigate([item.route], item.queryParams ? { queryParams: item.queryParams } : {});
    }
    this.close.emit();
  }
}

import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  HostListener,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { User } from 'firebase/auth';
import { DataService } from '@core/services/data.service';
import type { GlobalSearchResult, GlobalSearchResultType } from '@shared/utils/global-search.util';

@Component({
  selector: 'app-top-header',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <header class="h-14 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-6 z-10 shrink-0">
      <div class="flex items-center gap-4 min-w-0">
        <div class="relative hidden sm:block" #searchRoot>
          <mat-icon class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 !text-[16px] w-4 h-4 pointer-events-none">search</mat-icon>
          <input #searchInput
                 type="text"
                 [value]="query()"
                 (input)="onQueryInput($event)"
                 (focus)="onSearchFocus()"
                 (keydown.enter)="submitSearch()"
                 (keydown.escape)="closeDropdown()"
                 placeholder="Search projects, invoices, changes..."
                 class="w-72 lg:w-96 pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm text-slate-200 placeholder:text-slate-500" />

          @if (dropdownOpen() && query().trim().length >= 2) {
            <div class="absolute top-full left-0 mt-2 w-72 lg:w-96 bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-50">
              @if (results().length) {
                <ul class="max-h-80 overflow-y-auto py-1">
                  @for (result of results(); track result.id) {
                    <li>
                      <button type="button"
                              (mousedown)="selectResult(result)"
                              class="w-full text-left px-3 py-2.5 hover:bg-slate-800 transition-colors">
                        <div class="flex items-start justify-between gap-2">
                          <span class="text-sm text-slate-100 truncate">{{ result.label }}</span>
                          <span class="text-[10px] uppercase font-bold text-slate-500 shrink-0">{{ typeLabel(result.type) }}</span>
                        </div>
                        @if (result.sublabel) {
                          <div class="text-xs text-slate-500 truncate mt-0.5">{{ result.sublabel }}</div>
                        }
                      </button>
                    </li>
                  }
                </ul>
              } @else {
                <div class="px-3 py-4 text-sm text-slate-500">No matches for "{{ query().trim() }}"</div>
              }
              <div class="border-t border-slate-800 px-3 py-2 text-[11px] text-slate-500">
                Press Enter to view all project matches
              </div>
            </div>
          }
        </div>
      </div>

      <div class="flex items-center gap-3">
        <div class="hidden md:flex items-center gap-2 text-slate-400 text-sm">
          <mat-icon class="!text-[16px] w-4 h-4">calendar_today</mat-icon>
          <span>{{ today | date:'MMMM d, y' }}</span>
        </div>

        <div class="h-5 w-px bg-slate-700 hidden md:block"></div>

        <button type="button"
                class="relative p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                title="Notifications">
          <mat-icon class="!text-[20px]">notifications</mat-icon>
          <span class="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-500 rounded-full"></span>
        </button>

        <div class="h-5 w-px bg-slate-700"></div>

        <button type="button"
                (click)="logout.emit()"
                class="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-slate-800 transition-colors"
                title="Sign out">
          <img [src]="user?.photoURL || 'https://www.gravatar.com/avatar/0?d=mp'"
               class="w-8 h-8 rounded-full border border-slate-700"
               alt="" />
          <div class="hidden lg:block text-left min-w-0">
            <div class="text-sm font-medium text-slate-200 truncate max-w-[140px]">{{ user?.displayName || 'User' }}</div>
            <div class="text-[10px] text-slate-500 truncate max-w-[140px]">{{ user?.email }}</div>
          </div>
          <mat-icon class="text-slate-500 !text-[18px] hidden lg:block">logout</mat-icon>
        </button>
      </div>
    </header>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopHeaderComponent {
  @Input() user: User | null = null;
  @Input() today = new Date();
  @Output() logout = new EventEmitter<void>();

  private router = inject(Router);
  private data = inject(DataService);
  private host = inject(ElementRef);

  query = signal('');
  dropdownOpen = signal(false);
  private searchApi = signal<{
    search: (query: string) => GlobalSearchResult[];
    typeLabel: (type: GlobalSearchResultType) => string;
  } | null>(null);

  private searchLoadPromise: Promise<void> | null = null;

  results = computed(() => {
    const api = this.searchApi();
    const q = this.query().trim();
    if (!api || q.length < 2) return [];
    return api.search(q);
  });

  typeLabel(type: GlobalSearchResultType): string {
    return this.searchApi()?.typeLabel(type) ?? type;
  }

  private ensureSearchLoaded(): void {
    void this.loadSearchApi();
  }

  private loadSearchApi(): Promise<void> {
    if (this.searchApi()) return Promise.resolve();
    if (!this.searchLoadPromise) {
      this.searchLoadPromise = import('@shared/utils/global-search.util').then(mod => {
        this.searchApi.set({
          search: q => mod.runGlobalSearch(this.data, q),
          typeLabel: t => mod.searchTypeLabel(t),
        });
      });
    }
    return this.searchLoadPromise;
  }

  onSearchFocus(): void {
    this.dropdownOpen.set(true);
    if (this.query().trim().length >= 2) {
      this.ensureSearchLoaded();
    }
  }

  onQueryInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    this.dropdownOpen.set(true);
    if (value.trim().length >= 2) {
      this.ensureSearchLoaded();
    }
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }

  selectResult(result: GlobalSearchResult): void {
    this.closeDropdown();
    this.query.set('');
    this.router.navigate(result.route, result.queryParams ? { queryParams: result.queryParams } : undefined);
  }

  async submitSearch(): Promise<void> {
    const trimmed = this.query().trim();
    if (!trimmed) return;

    if (trimmed.length >= 2) {
      await this.loadSearchApi();
    }

    const first = this.results()[0];
    if (first) {
      this.selectResult(first);
      return;
    }

    this.closeDropdown();
    this.query.set('');
    this.router.navigate(['/projects'], { queryParams: { q: trimmed } });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target)) {
      this.closeDropdown();
    }
  }
}

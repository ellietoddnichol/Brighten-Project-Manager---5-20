import { Component, ChangeDetectionStrategy, inject, computed, signal, Output, EventEmitter } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs/operators';
import { GlobalNeedsService } from '@core/services/global-needs.service';
import {
  GLOBAL_MAIN_NAV,
  GLOBAL_NAV_GROUPS,
  GLOBAL_SETTINGS_NAV,
  GlobalNavGroupConfig,
  GlobalNavItemConfig,
  sidebarBadgeForNavItem,
} from '@app/config/global-nav.config';
import { GlobalModuleBadge } from '@app/models/global-enabled-modules.types';

type NavRow = GlobalNavItemConfig & { badge?: GlobalModuleBadge };
type NavGroup = GlobalNavGroupConfig & { items: NavRow[] };

const SIDEBAR_COLLAPSED_KEY = 'brighten-sidebar-collapsed';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  template: `
    <aside class="bg-slate-900 flex flex-col z-20 shrink-0 h-full transition-all duration-200"
           [class.w-14]="collapsed()"
           [class.w-56]="!collapsed()">

      <!-- Header with collapse toggle -->
      <div class="px-2 py-4 flex items-center border-b border-slate-800 relative"
           [class.justify-center]="collapsed()"
           [class.gap-2.5]="!collapsed()"
           [class.px-4]="!collapsed()">
        <div class="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center font-bold text-sm text-white shrink-0">B</div>
        @if (!collapsed()) {
          <div class="min-w-0 flex-1">
            <div class="text-sm font-semibold text-white truncate">Brighten</div>
            <div class="text-[10px] text-slate-400 truncate">Project Manager</div>
          </div>
          <button type="button" (click)="toggleCollapse()"
                  class="shrink-0 text-slate-400 hover:text-white transition-colors"
                  title="Collapse sidebar">
            <mat-icon class="!text-[18px]">chevron_left</mat-icon>
          </button>
        } @else {
          <button type="button" (click)="toggleCollapse()"
                  class="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-slate-700 rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-600 transition-colors shadow z-10"
                  title="Expand sidebar">
            <mat-icon class="!text-[14px]">chevron_right</mat-icon>
          </button>
        }
      </div>

      <nav class="flex-1 px-2 py-3 overflow-y-auto">
        <div class="space-y-4">
          @for (group of navGroups(); track group.id) {
            <section>
              @if (!collapsed()) {
                <div class="px-3 mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  {{ group.label }}
                </div>
              }
              <div class="space-y-0.5">
                @for (item of group.items; track item.id) {
                  <a [routerLink]="item.route"
                     [class.bg-slate-700]="isActive(item)"
                     [class.text-white]="isActive(item)"
                     [class.font-semibold]="isActive(item)"
                     [class.border-l-indigo-400]="isActive(item)"
                     [class.text-slate-400]="!isActive(item)"
                     [class.border-l-transparent]="!isActive(item)"
                     [class.justify-center]="collapsed()"
                     [class.px-0]="collapsed()"
                     [title]="collapsed() ? item.label : ''"
                     class="flex items-center gap-2.5 px-3 py-2 rounded-md hover:text-white hover:bg-slate-800 transition-all duration-150 text-sm min-w-0 border-l-2">
                    <mat-icon class="!text-[18px] w-[18px] h-[18px] shrink-0">{{ item.icon }}</mat-icon>
                    @if (!collapsed()) {
                      <span class="truncate flex-1">{{ item.label }}</span>
                      @if (item.badge; as badge) {
                        <span class="text-[10px] font-bold min-w-[1.25rem] text-center px-1 py-0.5 rounded-full shrink-0"
                              [class.bg-rose-500]="badge.tone === 'urgent'"
                              [class.text-white]="badge.tone === 'urgent'"
                              [class.bg-amber-500]="badge.tone === 'review'"
                              [class.text-white]="badge.tone === 'review'">{{ badge.count }}</span>
                      }
                    } @else if (item.badge; as badge) {
                      <span class="absolute top-0 right-0 text-[8px] font-bold w-3.5 h-3.5 flex items-center justify-center rounded-full"
                            [class.bg-rose-500]="badge.tone === 'urgent'"
                            [class.text-white]="badge.tone === 'urgent'"
                            [class.bg-amber-500]="badge.tone === 'review'"
                            [class.text-white]="badge.tone === 'review'">{{ badge.count }}</span>
                    }
                  </a>
                }
              </div>
            </section>
          }
        </div>
      </nav>

      <!-- Search / ⌘K -->
      <div class="px-2 py-2">
        <button class="w-full flex items-center rounded-lg text-xs text-slate-500 hover:bg-slate-800 transition-colors"
                [class.justify-center]="collapsed()"
                [class.gap-2]="!collapsed()"
                [class.px-3]="!collapsed()"
                [class.py-2]="!collapsed()"
                [class.p-2]="collapsed()">
          <mat-icon class="!text-[14px] shrink-0">search</mat-icon>
          @if (!collapsed()) {
            <span>Search</span>
            <span class="ml-auto font-mono bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded text-[10px]">⌘K</span>
          }
        </button>
      </div>

      <!-- Notifications bell -->
      <div class="px-2 py-2 border-t border-slate-800">
        <button type="button" (click)="openNotifications.emit()"
                class="relative w-full flex items-center rounded-lg text-xs text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                [class.justify-center]="collapsed()"
                [class.gap-2]="!collapsed()"
                [class.px-3]="!collapsed()"
                [class.py-2]="!collapsed()"
                [class.p-2]="collapsed()"
                title="Alerts &amp; Actions">
          <mat-icon class="!text-[18px] shrink-0">notifications</mat-icon>
          @if (!collapsed()) {
            <span class="flex-1 text-left">Alerts</span>
            @if (notificationCount() > 0) {
              <span class="text-[10px] font-bold min-w-[1.25rem] text-center px-1 py-0.5 rounded-full bg-rose-500 text-white shrink-0">{{ notificationCount() }}</span>
            }
          } @else if (notificationCount() > 0) {
            <span class="absolute top-0 right-0 text-[8px] font-bold w-3.5 h-3.5 flex items-center justify-center rounded-full bg-rose-500 text-white">{{ notificationCount() }}</span>
          }
        </button>
      </div>

      <!-- Settings + sync -->
      <div class="px-2 pb-2 border-t border-slate-800 pt-2 space-y-2">
        <a [routerLink]="settingsNav.route"
           [class.bg-slate-700]="isActive(settingsNav)"
           [class.text-white]="isActive(settingsNav)"
           [class.font-semibold]="isActive(settingsNav)"
           [class.border-l-indigo-400]="isActive(settingsNav)"
           [class.text-slate-400]="!isActive(settingsNav)"
           [class.border-l-transparent]="!isActive(settingsNav)"
           [class.justify-center]="collapsed()"
           [class.px-0]="collapsed()"
           [title]="collapsed() ? settingsNav.label : ''"
           class="flex items-center gap-2.5 px-3 py-2 rounded-md hover:text-white hover:bg-slate-800 transition-all duration-150 text-sm border-l-2">
          <mat-icon class="!text-[18px] w-[18px] h-[18px] shrink-0">{{ settingsNav.icon }}</mat-icon>
          @if (!collapsed()) {
            <span class="truncate flex-1">{{ settingsNav.label }}</span>
          }
        </a>
        @if (!collapsed()) {
          <div class="px-3 py-1.5 flex items-center gap-2 text-[10px] text-slate-500">
            <span class="w-1.5 h-1.5 bg-emerald-500 rounded-full shrink-0"></span>
            <span>Cloud sync active</span>
          </div>
        } @else {
          <div class="flex justify-center py-1">
            <span class="w-1.5 h-1.5 bg-emerald-500 rounded-full" title="Cloud sync active"></span>
          </div>
        }
      </div>
    </aside>

    <!-- Mobile bottom tab bar -->
    <nav class="fixed bottom-0 left-0 right-0 z-30 flex md:hidden bg-slate-900 border-t border-slate-700">
      @for (tab of mobileTabs; track tab.route) {
        <a [routerLink]="tab.route"
           class="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-slate-400 hover:text-white transition-colors relative"
           [class.text-white]="isMobileTabActive(tab.route)">
          @if (isMobileTabActive(tab.route)) {
            <span class="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-indigo-400 rounded-full"></span>
          }
          <mat-icon class="!text-[20px]">{{ tab.icon }}</mat-icon>
          <span class="text-[10px] font-medium">{{ tab.label }}</span>
        </a>
      }
    </nav>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent {
  @Output() openNotifications = new EventEmitter<void>();

  private globalNeeds = inject(GlobalNeedsService);
  private router = inject(Router);

  readonly settingsNav = GLOBAL_SETTINGS_NAV;

  readonly mobileTabs = [
    { label: 'Dashboard', route: '/', icon: 'home' },
    { label: 'Projects', route: '/projects', icon: 'folder' },
    { label: 'Financials', route: '/financials', icon: 'payments' },
    { label: 'Tasks', route: '/tasks', icon: 'assignment' },
    { label: 'Settings', route: '/settings', icon: 'settings' },
  ];

  isMobileTabActive(route: string): boolean {
    const path = this.currentPath() ?? '/';
    if (route === '/') return path === '/';
    return path.startsWith(route);
  }

  notificationCount = computed(() => {
    const rows = this.globalNeeds.active2026Rows();
    return rows.filter(r => r.arBalance > 0 || r.needsReview || r.missingItemCount > 0 || (r.reviewFlags?.length ?? 0) > 0).length;
  });

  collapsed = signal<boolean>(this.loadCollapsed());

  private currentPath = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.router.url.split('?')[0]),
      startWith(this.router.url.split('?')[0]),
    ),
    { initialValue: '/' },
  );

  mainNav = computed((): NavRow[] => {
    const badges = this.globalNeeds.modules().badges;
    return GLOBAL_MAIN_NAV.map(item => {
      const badge = sidebarBadgeForNavItem(item, badges);
      return badge ? { ...item, badge } : item;
    });
  });

  navGroups = computed((): NavGroup[] => {
    const items = this.mainNav();
    return GLOBAL_NAV_GROUPS.map(group => ({
      ...group,
      items: items.filter(item => item.group === group.id),
    })).filter(group => group.items.length > 0);
  });

  isActive(item: GlobalNavItemConfig): boolean {
    return item.isActive(this.currentPath() ?? '/');
  }

  toggleCollapse(): void {
    const next = !this.collapsed();
    this.collapsed.set(next);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
    } catch { /* ignore */ }
  }

  private loadCollapsed(): boolean {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  }
}

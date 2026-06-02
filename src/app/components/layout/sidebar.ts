import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs/operators';
import { GlobalNeedsService } from '../../services/global-needs.service';
import {
  GLOBAL_MAIN_NAV,
  GLOBAL_NAV_GROUPS,
  GLOBAL_SETTINGS_NAV,
  GlobalNavGroupConfig,
  GlobalNavItemConfig,
  sidebarBadgeForNavItem,
} from '../../config/global-nav.config';
import { GlobalModuleBadge } from '../../models/global-enabled-modules.types';

type NavRow = GlobalNavItemConfig & { badge?: GlobalModuleBadge };
type NavGroup = GlobalNavGroupConfig & { items: NavRow[] };

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  template: `
    <aside class="w-56 bg-slate-900 flex flex-col z-20 border-r border-slate-800 shrink-0 h-full">
      <div class="px-4 py-4 flex items-center gap-2.5 border-b border-slate-800">
        <div class="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-sm text-white">B</div>
        <div class="min-w-0">
          <div class="text-sm font-semibold text-white truncate">Brighten</div>
          <div class="text-[10px] text-slate-500 truncate">Project Manager</div>
        </div>
      </div>

      <nav class="flex-1 px-2 py-3 overflow-y-auto">
        <div class="space-y-4">
          @for (group of navGroups(); track group.id) {
            <section>
              <div class="px-3 mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                {{ group.label }}
              </div>
              <div class="space-y-0.5">
                @for (item of group.items; track item.id) {
                  <a [routerLink]="item.route"
                     [class.bg-slate-800]="isActive(item)"
                     [class.text-white]="isActive(item)"
                     [class.text-slate-400]="!isActive(item)"
                     class="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-slate-800 hover:text-white transition-colors text-sm font-medium min-w-0">
                    <mat-icon class="!text-[18px] w-[18px] h-[18px] shrink-0 opacity-90">{{ item.icon }}</mat-icon>
                    <span class="truncate flex-1">{{ item.label }}</span>
                    @if (item.badge; as badge) {
                      <span class="text-[10px] font-bold min-w-[1.25rem] text-center px-1 py-0.5 rounded-full shrink-0"
                            [class.bg-rose-600]="badge.tone === 'urgent'"
                            [class.bg-amber-500]="badge.tone === 'review'">{{ badge.count }}</span>
                    }
                  </a>
                }
              </div>
            </section>
          }
        </div>
      </nav>

      <div class="px-2 pb-2 border-t border-slate-800 pt-2 space-y-2">
        <a [routerLink]="settingsNav.route"
           [class.bg-slate-800]="isActive(settingsNav)"
           [class.text-white]="isActive(settingsNav)"
           [class.text-slate-400]="!isActive(settingsNav)"
           class="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-slate-800 hover:text-white transition-colors text-sm font-medium">
          <mat-icon class="!text-[18px] w-[18px] h-[18px] shrink-0 opacity-90">{{ settingsNav.icon }}</mat-icon>
          <span class="truncate flex-1">{{ settingsNav.label }}</span>
        </a>
        <div class="px-3 py-1.5 flex items-center gap-2 text-[10px] text-slate-500">
          <span class="w-1.5 h-1.5 bg-emerald-500 rounded-full shrink-0"></span>
          <span>Cloud sync active</span>
        </div>
      </div>
    </aside>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent {
  private globalNeeds = inject(GlobalNeedsService);
  private router = inject(Router);

  readonly settingsNav = GLOBAL_SETTINGS_NAV;

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
}

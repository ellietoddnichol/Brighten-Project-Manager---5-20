import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { User } from 'firebase/auth';
import { toSignal } from '@angular/core/rxjs-interop';
import { SidebarComponent } from './sidebar';
import { TopHeaderComponent } from './top-header';
import { CommandPaletteComponent } from '@app/components/ui/command-palette';
import { KeyboardShortcutsModalComponent } from '@app/components/ui/keyboard-shortcuts-modal';
import { NotificationsDrawerComponent } from '@app/components/ui/notifications-drawer';
import { DataService } from '@core/services/data.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, TopHeaderComponent, CommandPaletteComponent, KeyboardShortcutsModalComponent, NotificationsDrawerComponent],
  template: `
    <div class="flex h-screen bg-slate-100 text-slate-900 font-sans overflow-hidden">
      <div class="hidden md:flex h-full shrink-0">
        <app-sidebar (openNotifications)="notificationsOpen.set(true)" />
      </div>
      <div class="flex-1 flex flex-col overflow-hidden min-w-0">
        <app-top-header [user]="user" [today]="today" (logout)="logout.emit()" />
        <main class="flex-1 overflow-y-auto pb-16 md:pb-0">
          <router-outlet />
        </main>
      </div>
    </div>

    <app-command-palette
      [open]="paletteOpen()"
      [projects]="projects() ?? []"
      (close)="paletteOpen.set(false)"
    />

    <app-keyboard-shortcuts-modal
      [open]="shortcutsOpen()"
      (close)="shortcutsOpen.set(false)"
    />

    <app-notifications-drawer
      [open]="notificationsOpen()"
      (close)="notificationsOpen.set(false)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellComponent {
  @Input() user: User | null = null;
  @Input() today = new Date();
  @Output() logout = new EventEmitter<void>();

  private dataService = inject(DataService);

  readonly paletteOpen = signal(false);
  readonly shortcutsOpen = signal(false);
  readonly notificationsOpen = signal(false);
  readonly projects = toSignal(this.dataService.getProjects(), { initialValue: [] });

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault();
      this.paletteOpen.update(v => !v);
      return;
    }
    if (
      event.key === '?' &&
      !(event.target instanceof HTMLInputElement) &&
      !(event.target instanceof HTMLTextAreaElement)
    ) {
      event.preventDefault();
      this.shortcutsOpen.update(v => !v);
    }
    if (event.key === 'Escape') {
      this.shortcutsOpen.set(false);
    }
  }
}

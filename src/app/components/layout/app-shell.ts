import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { User } from 'firebase/auth';
import { SidebarComponent } from './sidebar';
import { TopHeaderComponent } from './top-header';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, TopHeaderComponent],
  template: `
    <div class="flex h-screen bg-slate-100 text-slate-900 font-sans overflow-hidden">
      <app-sidebar />
      <div class="flex-1 flex flex-col overflow-hidden min-w-0">
        <app-top-header [user]="user" [today]="today" (logout)="logout.emit()" />
        <main class="flex-1 overflow-y-auto">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellComponent {
  @Input() user: User | null = null;
  @Input() today = new Date();
  @Output() logout = new EventEmitter<void>();
}

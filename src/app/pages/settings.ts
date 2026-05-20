import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="p-8 max-w-4xl">
      <h1 class="text-3xl font-bold text-slate-900 mb-8">Settings</h1>
      <section class="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <h2 class="text-xl font-bold mb-6">Workspace</h2>
        <p class="text-sm text-slate-500 font-medium">Brighten Field is successfully connected to your Google Workspace environment.</p>
      </section>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings {}

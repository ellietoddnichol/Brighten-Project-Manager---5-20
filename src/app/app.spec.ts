import { describe, expect, it } from 'vitest';
import '@angular/compiler';
import {App} from './app';

describe('App', () => {
  it('exports the root app component', () => {
    expect(App).toBeDefined();
  });
});

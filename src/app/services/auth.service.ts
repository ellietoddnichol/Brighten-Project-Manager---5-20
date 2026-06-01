import { Injectable, signal, NgZone, inject } from '@angular/core';
import { auth } from '../firebase';
import { GoogleAuthProvider, reauthenticateWithPopup, signInWithPopup, User } from 'firebase/auth';

const TOKEN_KEY = 'google_oauth_access_token';
const TOKEN_EXP_KEY = 'google_oauth_access_token_exp';
const TOKEN_TTL_MS = 50 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private ngZone = inject(NgZone);

  user = signal<User | null>(null);
  authLoaded = signal(false);
  accessToken = signal<string | null>(null);

  /** Ensures only one Google consent popup runs at a time. */
  private googleTokenPromise: Promise<string | null> | null = null;

  constructor() {
    auth.onAuthStateChanged((user) => {
      this.ngZone.run(() => {
        this.user.set(user);
        this.authLoaded.set(true);
        if (!user) {
          this.clearAccessToken();
        } else {
          this.loadPersistedToken();
        }
      });
    });
  }

  private googleProvider(forceConsent = false): GoogleAuthProvider {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive');
    provider.addScope('https://www.googleapis.com/auth/spreadsheets.readonly');
    if (forceConsent) {
      provider.setCustomParameters({ prompt: 'consent' });
    }
    return provider;
  }

  private persistToken(token: string): void {
    this.accessToken.set(token);
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(TOKEN_EXP_KEY, String(Date.now() + TOKEN_TTL_MS));
  }

  private loadPersistedToken(): string | null {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const exp = sessionStorage.getItem(TOKEN_EXP_KEY);
    if (token && exp && Date.now() < Number(exp)) {
      this.accessToken.set(token);
      return token;
    }
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_EXP_KEY);
    return null;
  }

  clearAccessToken(): void {
    this.accessToken.set(null);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_EXP_KEY);
  }

  /** Primary sign-in — user clicked "Sign in with Google" on the login screen. */
  async login(): Promise<void> {
    const provider = this.googleProvider(true);
    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        this.persistToken(credential.accessToken);
      }
    } catch (error) {
      console.error('Sign in error', error);
      throw error;
    }
  }

  async logout(): Promise<void> {
    await auth.signOut();
    this.clearAccessToken();
  }

  /** User explicitly re-authorizes Drive/Sheets (e.g. "Re-authorize Drive" button). */
  async refreshDriveAccess(): Promise<string | null> {
    this.clearAccessToken();
    return this.requestGoogleAccessToken(true);
  }

  /**
   * Returns a cached Google API token. Never opens a popup.
   * Background sheet/drive syncs call this — popups only via login() or refreshDriveAccess().
   */
  async getAccessToken(_forceRefresh = false): Promise<string | null> {
    return this.accessToken() || this.loadPersistedToken();
  }

  private requestGoogleAccessToken(forceConsent: boolean): Promise<string | null> {
    if (this.googleTokenPromise) {
      return this.googleTokenPromise;
    }

    this.googleTokenPromise = this.fetchGoogleAccessToken(forceConsent).finally(() => {
      this.googleTokenPromise = null;
    });

    return this.googleTokenPromise;
  }

  private async fetchGoogleAccessToken(forceConsent: boolean): Promise<string | null> {
    const user = this.user();
    if (!user) return null;

    try {
      const result = await reauthenticateWithPopup(user, this.googleProvider(forceConsent));
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        this.persistToken(credential.accessToken);
        return credential.accessToken;
      }
      console.warn('Google sign-in succeeded but no access token was returned.');
      return null;
    } catch (error) {
      console.error('Google API authorization error', error);
      return null;
    }
  }
}

import { Injectable, signal, NgZone, inject } from '@angular/core';
import { auth } from '../firebase';
import {
  GoogleAuthProvider,
  getRedirectResult,
  reauthenticateWithPopup,
  signInWithPopup,
  signInWithRedirect,
  User,
  UserCredential,
} from 'firebase/auth';

const TOKEN_KEY = 'google_oauth_access_token';
const TOKEN_EXP_KEY = 'google_oauth_access_token_exp';
const TOKEN_TTL_MS = 50 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private ngZone = inject(NgZone);

  user = signal<User | null>(null);
  authLoaded = signal(false);
  accessToken = signal<string | null>(null);
  loginError = signal<string | null>(null);
  signingIn = signal(false);

  /** Ensures only one Google consent popup runs at a time. */
  private googleTokenPromise: Promise<string | null> | null = null;

  constructor() {
    void this.completeRedirectSignIn();
    auth.onAuthStateChanged((user) => {
      this.ngZone.run(() => {
        this.user.set(user);
        this.authLoaded.set(true);
        this.signingIn.set(false);
        if (!user) {
          this.clearAccessToken();
        } else {
          this.loadPersistedToken();
        }
      });
    });
  }

  /** Basic Google sign-in — identity only. Drive/Sheets scopes are requested later. */
  private signInProvider(): GoogleAuthProvider {
    return new GoogleAuthProvider();
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

  private shouldUseRedirect(): boolean {
    if (typeof window === 'undefined') return false;
    const host = window.location.hostname;
    return host !== 'localhost' && host !== '127.0.0.1';
  }

  private isPopupBlocked(error: unknown): boolean {
    const code = (error as { code?: string })?.code;
    return code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user';
  }

  private formatAuthError(error: unknown): string {
    const code = (error as { code?: string })?.code;
    const message = (error as { message?: string })?.message;
    const host = typeof window !== 'undefined' ? window.location.hostname : 'this site';

    switch (code) {
      case 'auth/unauthorized-domain':
        return `Sign-in blocked: "${host}" is not in Firebase Auth authorized domains. Add it under Firebase Console → Authentication → Settings → Authorized domains.`;
      case 'auth/popup-blocked':
        return 'Sign-in popup was blocked by the browser. Try again — the app will redirect to Google instead.';
      case 'auth/popup-closed-by-user':
        return 'Sign-in was cancelled. Click Sign in with Google to try again.';
      case 'auth/operation-not-allowed':
        return 'Google sign-in is not enabled for this Firebase project. Enable it in Firebase Console → Authentication → Sign-in method.';
      default:
        return message ?? 'Sign-in failed. Check the browser console for details.';
    }
  }

  private storeCredentialFromResult(result: UserCredential | null): void {
    if (!result) return;
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      this.persistToken(credential.accessToken);
    }
  }

  private async completeRedirectSignIn(): Promise<void> {
    try {
      const result = await getRedirectResult(auth);
      if (result) {
        this.loginError.set(null);
        this.storeCredentialFromResult(result);
      }
    } catch (error) {
      console.error('Redirect sign-in error', error);
      this.loginError.set(this.formatAuthError(error));
    }
  }

  /** Primary sign-in — user clicked "Sign in with Google" on the login screen. */
  async login(): Promise<void> {
    this.loginError.set(null);
    this.signingIn.set(true);
    const provider = this.signInProvider();

    try {
      if (this.shouldUseRedirect()) {
        await signInWithRedirect(auth, provider);
        return;
      }

      const result = await signInWithPopup(auth, provider);
      this.storeCredentialFromResult(result);
    } catch (error) {
      console.error('Sign in error', error);
      if (this.isPopupBlocked(error) || !this.shouldUseRedirect()) {
        try {
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectError) {
          console.error('Redirect sign-in error', redirectError);
          this.loginError.set(this.formatAuthError(redirectError));
          throw redirectError;
        }
      }
      this.loginError.set(this.formatAuthError(error));
      throw error;
    } finally {
      if (!this.shouldUseRedirect()) {
        this.signingIn.set(false);
      }
    }
  }

  async logout(): Promise<void> {
    await auth.signOut();
    this.clearAccessToken();
    this.loginError.set(null);
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

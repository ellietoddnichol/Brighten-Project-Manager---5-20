import { Injectable, signal } from '@angular/core';
import { auth } from '../firebase';
import { GoogleAuthProvider, signInWithPopup, User } from 'firebase/auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  user = signal<User | null>(null);
  authLoaded = signal(false);
  accessToken = signal<string | null>(null);

  constructor() {
    auth.onAuthStateChanged((user) => {
      this.user.set(user);
      this.authLoaded.set(true);
      if (!user) {
        this.accessToken.set(null);
      }
    });
  }

  async login() {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive.readonly');
    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        this.accessToken.set(credential.accessToken);
      }
    } catch (error) {
      console.error('Sign in error', error);
    }
  }

  async logout() {
    await auth.signOut();
    this.accessToken.set(null);
  }

  async getAccessToken(): Promise<string | null> {
    if (this.accessToken()) {
      return this.accessToken();
    }
    // Try to login silently or prompt user 
    await this.login();
    return this.accessToken();
  }
}

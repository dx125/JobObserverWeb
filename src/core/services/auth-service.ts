import type { AuthPort, SignUpResult, Unsubscribe } from '../ports';

export class AuthService {
  constructor(private readonly port: AuthPort) {}

  subscribe(listener: (userId: string | null) => void): Unsubscribe {
    return this.port.subscribe(listener);
  }

  async signIn(email: string, password: string): Promise<void> {
    if (email === '' || password === '') {
      throw new Error('Email and password are required');
    }
    await this.port.signInWithPassword(email, password);
  }

  async signUp(email: string, password: string): Promise<SignUpResult> {
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }
    return this.port.signUp(email, password);
  }

  signOut(): Promise<void> {
    return this.port.signOut();
  }
}

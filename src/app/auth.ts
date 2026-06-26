import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { initializeApp } from 'firebase/app';
// Добавляем новые методы: sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  getAuth, 
  Auth, 
  sendPasswordResetEmail, 
  GoogleAuthProvider, 
  signInWithPopup 
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyBr-wqy0onSA0PKRVy99fIgWK_ztaFoX8Y",
  authDomain: "lesson-study-2998e.firebaseapp.com",
  projectId: "lesson-study-2998e",
  storageBucket: "lesson-study-2998e.firebasestorage.app",
  messagingSenderId: "796469251360",
  appId: "1:796469251360:web:777cd0aac27ddbcda75b45",
  measurementId: "G-JQN4JZWDDZ"
};

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private firebaseApp = initializeApp(firebaseConfig);
  private firebaseAuth: Auth = getAuth(this.firebaseApp);
  private router = inject(Router);
  
  isLoggedIn = signal<boolean>(false);

  constructor() {
    onAuthStateChanged(this.firebaseAuth, (user) => {
      if (user) {
        this.isLoggedIn.set(true);
      } else {
        this.isLoggedIn.set(false);
      }
    });
  }

  // 1. Функция "Забыли пароль"


  // 2. Вход через Google
  async loginWithGoogle(): Promise<boolean> {
    try {
      const provider = new GoogleAuthProvider();
      // Открывает стандартное безопасное окно Google для выбора аккаунта
      await signInWithPopup(this.firebaseAuth, provider);
      this.router.navigate(['/dashboard']);
      return true;
    } catch (error) {
      console.error('Ошибка входа через Google:', error);
      return false;
    }
  }

  // ... твои старые методы login, register и logout остаются без изменений
async login(email: string, password: string): Promise<boolean> {
    try {
      // Передаем email напрямую, как он есть
      await signInWithEmailAndPassword(this.firebaseAuth, email.trim().toLowerCase(), password);
      this.router.navigate(['/dashboard']);
      return true;
    } catch (error) {
      console.error('Ошибка входа в облако:', error);
      return false;
    }
  }

  async register(email: string, password: string): Promise<{ success: boolean; message: string }> {
    try {
      if (password.length < 6) {
        return { success: false, message: 'Пароль должен быть от 6 символов!' };
      }

      // Передаем чистый email пользователя в базу
      await createUserWithEmailAndPassword(this.firebaseAuth, email.trim().toLowerCase(), password);
      return { success: true, message: 'Аккаунт успешно создан в облаке!' };
    } catch (error: any) {
      console.error('Ошибка регистрации в облаке:', error);
      if (error.code === 'auth/email-already-in-use') {
        return { success: false, message: 'Этот Email уже зарегистрирован!' };
      }
      if (error.code === 'auth/invalid-email') {
        return { success: false, message: 'Неверный формат Email адреса!' };
      }
      return { success: false, message: 'Ошибка при создании аккаунта.' };
    }
  }

  async resetPassword(email: string): Promise<{ success: boolean; message: string }> {
    try {
      await sendPasswordResetEmail(this.firebaseAuth, email.trim().toLowerCase());
      return { success: true, message: 'Ссылка для сброса пароля отправлена на ваш Email!' };
    } catch (error: any) {
      console.error('Ошибка сброса пароля:', error);
      if (error.code === 'auth/user-not-found') {
        return { success: false, message: 'Пользователь с таким Email не найден.' };
      }
      return { success: false, message: 'Не удалось отправить ссылку. Проверьте Email.' };
    }
  }

  async logout(): Promise<void> {
    await signOut(this.firebaseAuth);
    this.router.navigate(['/login']);
  }
}
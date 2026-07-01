import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { initializeApp } from 'firebase/app';
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

// КРИТИЧЕСКОЕ ОБНОВЛЕНИЕ: Добавили deleteDoc в импорты
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where,
  doc,
  updateDoc,
  deleteDoc 
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBr-wqy0onSA0PKRVy99fIgWK_ztaFoX8Y",
  authDomain: "lesson-study-2998e.firebaseapp.com",
  projectId: "lesson-study-2998e",
  storageBucket: "lesson-study-2998e.firebasestorage.app",
  messagingSenderId: "796469251360",
  appId: "1:796469251360:web:777cd0aac27ddbcda75b45",
  measurementId: "G-JQN4JZWDDZ"
};

interface Research {
  id?: string;
  title: string;
  fileType: 'doc' | 'pdf';
  updatedAt: string;
  project?: string;
  rawContent?: string;
  userId?: string;
  createdAtTimestamp?: number;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private firebaseApp = initializeApp(firebaseConfig);
  private firebaseAuth: Auth = getAuth(this.firebaseApp);
  private db = getFirestore(this.firebaseApp); // Используем инстанс 'this.db'
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

  /**
   * СОХРАНЕНИЕ В ОБЛАКО FIRESTORE
   */
  async saveResearchToDb(research: Omit<Research, 'userId'>): Promise<Research> {
    const currentUser = this.firebaseAuth.currentUser;
    if (!currentUser) {
      throw new Error('Пользователь не авторизован');
    }

    try {
      const researchData = {
        ...research,
        userId: currentUser.uid, 
        createdAtTimestamp: Date.now()
      };

      const docRef = await addDoc(collection(this.db, 'researches'), researchData);
      
      return {
        ...research,
        id: docRef.id
      };
    } catch (error) {
      console.error('Ошибка добавления документа в Firestore:', error);
      throw error;
    }
  }

  /**
   * ПОЛУЧЕНИЕ ДАННЫХ ИЗ ОБЛАКА С АВТО-СОРТИРОВКОЙ
   */
  async getResearches(): Promise<Research[]> {
    const currentUser = this.firebaseAuth.currentUser;
    if (!currentUser) return [];

    try {
      const q = query(
        collection(this.db, 'researches'),
        where('userId', '==', currentUser.uid)
      );

      const querySnapshot = await getDocs(q);
      const list: Research[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data() as any;
        list.push({
          id: doc.id,
          title: data.title,
          fileType: data.fileType,
          updatedAt: data.updatedAt,
          project: data.project,
          rawContent: data.rawContent,
          createdAtTimestamp: data.createdAtTimestamp
        });
      });

      return list.sort((a, b) => (b.createdAtTimestamp || 0) - (a.createdAtTimestamp || 0));
    } catch (error) {
      console.error('Ошибка получения документов из Firestore:', error);
      return [];
    }
  }

  /**
   * ОБНОВЛЕНИЕ ТЕКСТА И СТРУКТУРЫ ИССЛЕДОВАНИЯ В РЕАЛЬНОМ ВРЕМЕНИ
   */
  async updateResearchContent(id: string, newContent: string): Promise<void> {
    try {
      const docRef = doc(this.db, 'researches', id);
      await updateDoc(docRef, {
        rawContent: newContent,
        updatedAt: new Date().toLocaleDateString('ru-RU') + ' ' + new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
      });
    } catch (error) {
      console.error('Ошибка обновления документа в Firestore:', error);
      throw error;
    }
  }

  /**
   * ДОБАВЛЕННЫЙ МЕТОД: Безвозвратное удаление исследования из Firestore
   */
  async deleteResearch(id: string): Promise<void> {
    try {
      const docRef = doc(this.db, 'researches', id);
      await deleteDoc(docRef);
    } catch (error) {
      console.error('Ошибка удаления документа из Firestore:', error);
      throw error;
    }
  }

  // Авторизационные методы
  async loginWithGoogle(): Promise<boolean> {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(this.firebaseAuth, provider);
      this.router.navigate(['/dashboard']);
      return true;
    } catch (error) {
      console.error('Ошибка входа через Google:', error);
      return false;
    }
  }

  async login(email: string, password: string): Promise<boolean> {
    try {
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
      await createUserWithEmailAndPassword(this.firebaseAuth, email.trim().toLowerCase(), password);
      return { success: true, message: 'Аккаунт успешно создан в облаке!' };
    } catch (error: any) {
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
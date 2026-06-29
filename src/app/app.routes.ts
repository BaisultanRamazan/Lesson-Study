import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard'; // Проверь путь
import { DocumentRedactorComponent } from './document-redactor/document-redactor'; // Импортируем наш файл
import { Login } from './login/login';

export const routes: Routes = [
  // 1. При входе на сайт сразу отправляем на страницу логина/твоего меню
  { path: '', redirectTo: '/login', pathMatch: 'full' },

  // 2. Твои существующие маршруты
  { path: 'login', component: Login },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'redactor', component: DocumentRedactorComponent },

  // 3. Если что-то пошло не так — тоже на логин
  { path: '**', redirectTo: '/login' }
];
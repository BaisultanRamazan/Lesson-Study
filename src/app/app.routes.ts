import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard'; 
import { DocumentRedactorComponent } from './document-redactor/document-redactor'; 
import { Login } from './login/login';
import { authGuard } from './auth.guard'; // Импортируем твой гвард

export const routes: Routes = [
  // 1. При входе на сайт сразу отправляем на страницу логина
  { path: '', redirectTo: '/login', pathMatch: 'full' },

  // 2. Страница авторизации (доступна всем)
  { path: 'login', component: Login },

  // 3. Защищенные рабочие зоны (добавляем canActivate)
  { 
    path: 'dashboard', 
    component: DashboardComponent, 
    canActivate: [authGuard] 
  },
  { 
    path: 'redactor/:id', // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: добавили /:id для динамического ID документа
    component: DocumentRedactorComponent, 
    canActivate: [authGuard] 
  },

  // 4. Если роут не найден — отправляем на логин
  { path: '**', redirectTo: '/login' }
];
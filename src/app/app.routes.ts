import { Routes } from '@angular/router';
import { Login } from './login/login'; // Твой компонент логина
import { DashboardComponent } from './dashboard/dashboard'; // Указываем путь к твоему файлу dashboard.ts

export const routes: Routes = [
  { path: 'login', component: Login },
  { path: 'dashboard', component: DashboardComponent },
  { path: '', redirectTo: 'login', pathMatch: 'full' }
];
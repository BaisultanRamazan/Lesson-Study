import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard'; // Проверь путь
import { DocumentRedactorComponent } from './document-redactor/document-redactor'; // Импортируем наш файл

export const routes: Routes = [
  { path: 'dashboard', component: DashboardComponent },
  { path: 'redactor/:id', component: DocumentRedactorComponent }, // Маршрут для открытия конкретного документа
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' }
];
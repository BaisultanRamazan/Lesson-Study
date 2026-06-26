import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../auth'; // Проверь путь к своему файлу auth.ts
import { Router } from '@angular/router';

interface Research {
  title: string;
  fileType: 'doc' | 'pdf';
  updatedAt: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.html', // Указали просто dashboard.html
  styleUrls: [] // Если CSS файла нет, оставляем пустым
})
export class DashboardComponent implements OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);

  // Управление открытием боковой панели (сайдбара)
  isSidebarOpen = signal<boolean>(false);
  
  // Храним имя выбранного ИИ-агента
  activeAgent = signal<string | null>(null);

  // Статичные данные для отображения списка
  myResearches = signal<Research[]>([
    { title: 'Влияние соцсетей на ребенка', fileType: 'doc', updatedAt: '23.03.2026 15:43' },
    { title: 'Рост растений в природе', fileType: 'pdf', updatedAt: '23.03.2026 15:02' },
    { title: 'Влияние AI на студентов', fileType: 'doc', updatedAt: '23.03.2026 15:00' },
    { title: 'Левое полушарие мозга', fileType: 'doc', updatedAt: '23.03.2026 15:00' }
  ]);

  ngOnInit() {
    // Если пользователь не вошел, временно закомментируй эту проверку, 
    // чтобы ты мог зайти на /dashboard напрямую без логина и проверить дизайн
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
    }
  }

  toggleSidebar() {
    this.isSidebarOpen.set(!this.isSidebarOpen());
  }

  selectAgent(agentName: string) {
    this.activeAgent.set(agentName);
  }
}
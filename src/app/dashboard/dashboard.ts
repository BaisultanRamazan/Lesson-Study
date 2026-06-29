import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../auth'; 
import { Router } from '@angular/router';
import { getAuth, onAuthStateChanged } from 'firebase/auth'; // Импортируем слушатель для отслеживания сессии

interface Research {
  id?: string; 
  title: string;
  fileType: 'doc' | 'pdf';
  updatedAt: string;
  project?: string;
  rawContent?: string; 
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.html',
  styleUrls: [] 
})
export class DashboardComponent implements OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);

  isSidebarOpen = signal<boolean>(false);
  activeAgent = signal<string | null>(null);
  isModalOpen = signal<boolean>(false);

  projectRoute = signal<string>(''); 
  researchTitle = signal<string>(''); 

  myResearches = signal<Research[]>([]);

  ngOnInit() {
    // Получаем инстанс auth для отслеживания загрузки профиля
    const auth = getAuth();
    
    // Ждем, пока Firebase железно подтвердит восстановление сессии из облака
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Пользователь успешно распознан облаком, загружаем его личные файлы
        await this.loadUserResearches();
      } else {
        // Если сессии нет — отправляем на логин
        this.router.navigate(['/login']);
      }
    });
  }

  async loadUserResearches() {
    try {
      const researchesFromDb = await this.authService.getResearches();
      this.myResearches.set(researchesFromDb);
    } catch (error) {
      console.error('Ошибка при загрузке исследований из облака:', error);
    }
  }

  toggleSidebar() { this.isSidebarOpen.set(!this.isSidebarOpen()); }
  selectAgent(agentName: string) { this.activeAgent.set(agentName); }
  openCreateModal() { this.projectRoute.set(''); this.researchTitle.set(''); this.isModalOpen.set(true); }
  closeCreateModal() { this.isModalOpen.set(false); }

  onInputUpdate(event: Event, field: 'project' | 'research') {
    const value = (event.target as HTMLInputElement).value;
    if (field === 'project') this.projectRoute.set(value);
    if (field === 'research') this.researchTitle.set(value);
  }

  async createDocument(format: 'doc' | 'pdf') {
    if (!this.researchTitle().trim()) {
      alert('Пожалуйста, заполните наименование исследовательской работы!');
      return;
    }

    const titleText = this.researchTitle();
    const projectText = this.projectRoute() || 'Без названия проекта';
    const now = new Date();
    const formattedDate = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const htmlTemplate = format === 'doc' 
      ? this.getWordHtmlTemplate(projectText, titleText)
      : this.getPdfHtmlTemplate(projectText, titleText);

    const newResearch: Research = {
      title: titleText,
      fileType: format,
      updatedAt: formattedDate,
      project: projectText,
      rawContent: htmlTemplate
    };

try {
  // ОТПРАВЛЯЕМ В БАЗУ ДАННЫХ FIRESTORE
  const savedResearch = await this.authService.saveResearchToDb(newResearch);

  // Добавляем в локальный массив для мгновенного отображения на экране
  this.myResearches.set([savedResearch, ...this.myResearches()]);

  this.closeCreateModal();

  // Шаг 3: Сразу открываем файл в нашем умном редакторе по его ID
  this.openInRedactor(savedResearch.id);

} catch (error) {
  alert('Не удалось сохранить файл в облако. Проверьте соединение.');
  console.error(error);
}
  }

  openInRedactor(id: string | undefined) {
  if (!id) {
    alert('Не удалось открыть документ: отсутствует ID');
    return;
  }
  this.router.navigate(['/redactor', id]);
}

  openDocument(item: Research) {
    if (!item.rawContent) return;
    
    const encoder = new TextEncoder();
    
    if (item.fileType === 'doc') {
      const uint8Array = encoder.encode(item.rawContent);
      const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
      const blobContent = new Uint8Array(bom.length + uint8Array.length);
      blobContent.set(bom, 0);
      blobContent.set(uint8Array, bom.length);

      const blob = new Blob([blobContent], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `${item.title}.doc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      const blobContent = encoder.encode(item.rawContent);
      const blob = new Blob([blobContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    }
  }

  private getWordHtmlTemplate(project: string, title: string): string {
    return `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
        <style>
          body { font-family: 'Arial', sans-serif; padding: 40px; line-height: 1.5; } 
          h1 { color: #ff4a3b; font-size: 24px; text-align: center; } 
          .project-box { margin-top: 20px; padding: 10px; background: #fff4f2; border-left: 4px solid #ff4a3b; }
        </style>
      </head>
      <body>
        <h1>Исследовательская работа</h1>
        <div class="project-box"><p><strong>Название проекта:</strong> ${project}</p></div>
        <h3>Наименование работы:</h3><p>${title}</p>
      </body>
      </html>
    `;
  }

  private getPdfHtmlTemplate(project: string, title: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>
          body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 50px; color: #333; line-height: 1.6; } 
          h1 { color: #ff4a3b; border-bottom: 2px solid #ff4a3b; padding-bottom: 15px; }
          .info-block { margin-top: 30px; background: #f9f9f9; padding: 20px; border-radius: 8px; border: 1px solid #eee; }
        </style>
      </head>
      <body>
        <h1>Отчет об исследовании</h1>
        <div class="info-block">
          <p style="font-size: 14px; color: #666; text-transform: uppercase; margin: 0;">Проект</p>
          <p style="font-size: 18px; font-weight: bold; margin: 5px 0 20px 0;">${project}</p>
          <p style="font-size: 14px; color: #666; text-transform: uppercase; margin: 0;">Наименование исследовательской работы</p>
          <p style="font-size: 18px; font-weight: bold; margin: 5px 0 0 0;">${title}</p>
        </div>
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `;
  }
}
import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpClientModule } from '@angular/common/http'; // Импортируем HTTP клиент
import { AuthService } from '../auth'; 
import { firstValueFrom } from 'rxjs';

interface Message {
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
}

@Component({
  selector: 'app-document-redactor',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule], // Добавили HttpClientModule
  templateUrl: './document-redactor.html',
  styleUrls: ['./document-redactor.css']
})
export class DocumentRedactorComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  private http = inject(HttpClient); // Внедряем HTTP-клиент

  // Твой URL из n8n или серверного эндпоинта (замени на свой, когда создашь workflow)
  private aiWebhookUrl = 'https://lessonstudy11.app.n8n.cloud/webhook/redactor-ai';

  researchId = signal<string | null>(null);
  researchTitle = signal<string>('Загрузка документа...');
  documentContent = signal<string>(''); 
  isSaving = signal<boolean>(false);
  isAiThinking = signal<boolean>(false); // Индикатор того, что ИИ генерирует ответ

  chatInput = signal<string>('');
  messages = signal<Message[]>([
    { sender: 'ai', text: 'Привет! Я твой ИИ-ассистент. Напиши мне, что добавить в текст, или попроси проанализировать твое исследование.', timestamp: new Date() }
  ]);

  stats = computed(() => {
    const text = this.stripHtml(this.documentContent());
    const charCount = text.length;
    const wordCount = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
    const pageCount = Math.max(1, Math.ceil(charCount / 1800)); 

    return { pages: pageCount, words: wordCount, chars: charCount };
  });

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      alert('Документ не найден!');
      this.router.navigate(['/dashboard']);
      return;
    }
    this.researchId.set(id);
    await this.loadDocument();
  }

  async loadDocument() {
    try {
      const allResearches = await this.authService.getResearches();
      const currentDoc = allResearches.find(r => r.id === this.researchId());
      
      if (currentDoc) {
        this.researchTitle.set(currentDoc.title);
        this.documentContent.set(currentDoc.rawContent || '');
      } else {
        alert('Документ не найден.');
        this.router.navigate(['/dashboard']);
      }
    } catch (error) {
      console.error('Ошибка загрузки документа:', error);
    }
  }

  onContentChange(event: Event) {
    const html = (event.target as HTMLElement).innerHTML;
    this.documentContent.set(html);
    this.saveDocument();
  }

  async saveDocument() {
    if (!this.researchId()) return;
    this.isSaving.set(true);
    try {
      await this.authService.updateResearchContent(this.researchId()!, this.documentContent());
      this.isSaving.set(false);
    } catch (error) {
      console.error('Ошибка сохранения:', error);
      this.isSaving.set(false);
    }
  }

  async sendAiMessage() {
    const prompt = this.chatInput().trim();
    if (!prompt || this.isAiThinking()) return;

    // 1. Добавляем сообщение пользователя в чат
    this.messages.set([...this.messages(), { sender: 'user', text: prompt, timestamp: new Date() }]);
    this.chatInput.set('');
    this.isAiThinking.set(true);

    try {
      // 2. Передаем ИИ текущий текст документа и запрос пользователя, чтобы ИИ понимал контекст
      const payload = {
        action: 'chat_and_edit',
        researchId: this.researchId(),
        documentTitle: this.researchTitle(),
        currentContent: this.documentContent(),
        userPrompt: prompt,
        stats: this.stats()
      };

      // Отправляем POST запрос и дожидаемся ответа от ИИ
      const response = await firstValueFrom(
        this.http.post<{ aiResponse: string, updatedHtmlContent?: string }>(this.aiWebhookUrl, payload)
      );

      // 3. Если ИИ решил изменить или дополнить текст внутри А4
      if (response.updatedHtmlContent) {
        this.documentContent.set(response.updatedHtmlContent);
        this.saveDocument();
      }

      // 4. Добавляем текстовый ответ ИИ в чат-баббл
      this.messages.set([
        ...this.messages(), 
        { sender: 'ai', text: response.aiResponse, timestamp: new Date() }
      ]);

    } catch (error) {
      console.error('Ошибка ИИ-модели:', error);
      this.messages.set([
        ...this.messages(), 
        { sender: 'ai', text: 'Произошла ошибка связи с ИИ-агентом. Проверь настройки webhook в n8n.', timestamp: new Date() }
      ]);
    } finally {
      this.isAiThinking.set(false);
    }
  }

  private stripHtml(html: string): string {
    const tmp = document.createElement('DIV');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  goBack() { this.router.navigate(['/dashboard']); }
}
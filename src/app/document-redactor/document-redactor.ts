import { Component, OnInit, signal, inject, computed, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpClientModule } from '@angular/common/http'; 
import { AuthService } from '../auth'; 
import { firstValueFrom } from 'rxjs';
import { DomSanitizer } from '@angular/platform-browser';

interface Message {
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
}

@Component({
  selector: 'app-document-redactor',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './document-redactor.html',
  styleUrls: ['./document-redactor.css']
})
export class DocumentRedactorComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  private http = inject(HttpClient); 
  private sanitizer = inject(DomSanitizer);

  @ViewChild('subSheet') subSheet!: ElementRef<HTMLDivElement>;
  
  private aiWebhookUrl = 'https://lessonstudy11.app.n8n.cloud/webhook/redactor-ai';

  researchId = signal<string | null>(null);
  researchTitle = signal<string>('Загрузка документа...');
  
  // КРИТИЧЕСКОЕ ОБНОВЛЕНИЕ: Храним контент постранично в виде массива строк HTML
  documentPages = signal<string[]>(['']); 
  currentPageIndex = signal<number>(0); // Индекс текущей активной страницы (с 0)

  isSaving = signal<boolean>(false);
  isAiThinking = signal<boolean>(false); 

  chatInput = signal<string>('');
  messages = signal<Message[]>([
    { sender: 'ai', text: 'Привет! Я твой ИИ-ассистент. Напиши мне, что добавить в текст, или попроси проанализировать твое исследование.', timestamp: new Date() }
  ]);

  // Генерируем общий контент для аналитики и экспорта (склеиваем все страницы)
  documentContent = computed(() => this.documentPages().join(' '));

  stats = computed(() => {
    const text = this.stripHtml(this.documentContent());
    const charCount = text.length;
    const wordCount = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
    const pageCount = this.documentPages().length; // Количество страниц теперь рассчитывается точно

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

  isDocumentLoading = false;

  async loadDocument() {
    try {
      this.isDocumentLoading = true; // Блокируем авто-сохранение на время разбора данных

      const allResearches = await this.authService.getResearches();
      const currentDoc = allResearches.find(r => r.id === this.researchId());

      if (currentDoc) {
        this.researchTitle.set(currentDoc.title);
        let rawContent = (currentDoc.rawContent || '').trim();

        // Декодируем строку из базы, если браузер заэкранировал теги
        if (rawContent.includes('&lt;') || rawContent.includes('&gt;')) {
          const decoderNode = document.createElement('textarea');
          decoderNode.innerHTML = rawContent;
          rawContent = decoderNode.value.trim();
        }

        let pages: string[] = [];

        // ИСПРАВЛЕНИЕ: Если это чистый HTML-шаблон Word (только что созданный документ),
        // извлекаем из него текст внутри <body> или создаем первую чистую страницу
        if (rawContent.includes('<html') || rawContent.includes('xmlns:w=')) {
          // Пытаемся вытащить содержимое body шаблона, если оно там есть
          const bodyMatch = rawContent.match(/<body>([\s\S]*?)<\/body>/i);
          if (bodyMatch && bodyMatch[1].trim()) {
            // Очищаем от лишних оберток таблиц или блоков проекта, если нужно, или берем как есть
            pages = [bodyMatch[1].trim()];
          } else {
            pages = ['<p>Начните вводить текст здесь...</p>'];
          }
        } else if (!rawContent || rawContent === '<p><br></p>' || rawContent === '<div><br></div>') {
          pages = ['<p><br></p>'];
        } else if (rawContent.includes('')) {
          pages = rawContent.split('').map(p => p.trim()).filter(p => p.length > 0);
          if (pages.length === 0) pages = ['<p><br></p>'];
        } else {
          pages = [rawContent];
        }
        
        this.documentPages.set(pages);
        this.currentPageIndex.set(0);

        // Рендерим текущую страницу
        setTimeout(() => {
          if (this.subSheet) {
            this.subSheet.nativeElement.innerHTML = pages[0] || '<p><br></p>';
          }
          // Снимаем блокировку сохранения ПОСЛЕ того, как данные полностью отобразились в редакторе
          this.isDocumentLoading = false; 
        }, 50);

      } else {
        alert('Документ не найден.');
        this.isDocumentLoading = false;
        this.router.navigate(['/dashboard']);
      }
    } catch (error) {
      this.isDocumentLoading = false;
      console.error('Ошибка загрузки документа:', error);
    }
  }

  private saveTimeout: any = null;

  onContentChange(event: Event) {
    const html = (event.target as HTMLElement).innerHTML;
    
    // Обновляем только текущую редактируемую страницу в массиве сигналов
    const pages = [...this.documentPages()];
    pages[this.currentPageIndex()] = html;
    this.documentPages.set(pages);
    
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    // Дебаунс на сохранение в Firestore
    this.saveTimeout = setTimeout(() => {
      this.saveDocument();
    }, 1500);
  }

  async saveDocument() {
    if (this.isDocumentLoading) {
      return; 
    }
    if (!this.researchId()) return;
    this.isSaving.set(true);
    try {
      // Склеиваем страницы специальным маркером перед отправкой в Firebase
      const fullContent = this.documentPages().join('');
      await this.authService.updateResearchContent(this.researchId()!, fullContent);
      this.isSaving.set(false);
    } catch (error) {
      console.error('Ошибка сохранения:', error);
      this.isSaving.set(false);
    }
  }

  format(command: string, value: string = '') {
    document.execCommand(command, false, value);

    if (this.subSheet) {
      const updatedHtml = this.subSheet.nativeElement.innerHTML;
      const pages = [...this.documentPages()];
      pages[this.currentPageIndex()] = updatedHtml;
      this.documentPages.set(pages);
      this.saveDocument();
    }
  }

  // --- МЕТОДЫ УПРАВЛЕНИЯ ПОСТРАНИЧНОЙ НАВИГАЦИЕЙ ---
  
  goToPage(index: number) {
    if (index < 0 || index >= this.documentPages().length) return;

    // 1. Фиксируем контент уходящей страницы
    if (this.subSheet) {
      const pages = [...this.documentPages()];
      pages[this.currentPageIndex()] = this.subSheet.nativeElement.innerHTML;
      this.documentPages.set(pages);
    }

    // 2. Меняем индекс текущей страницы
    this.currentPageIndex.set(index);

    // 3. Подставляем в редактор HTML новой выбранной страницы
    if (this.subSheet) {
      this.subSheet.nativeElement.innerHTML = this.documentPages()[index] || '<p><br></p>';
    }
  }

  addPage() {
    const pages = [...this.documentPages()];
    const nextIndex = this.currentPageIndex() + 1;
    
    // Добавляем чистый шаблон страницы (параграф с переносом)
    pages.splice(nextIndex, 0, '<p><br></p>');
    this.documentPages.set(pages);
    
    // Сразу переносим пользователя на новую страницу
    this.goToPage(nextIndex);
    this.saveDocument();
  }

  removePage() {
    const pages = [...this.documentPages()];
    if (pages.length <= 1) {
      alert('Документ должен содержать хотя бы одну страницу!');
      return;
    }

    if (confirm(`Вы уверены, что хотите полностью удалить страницу ${this.currentPageIndex() + 1}?`)) {
      pages.splice(this.currentPageIndex(), 1);
      this.documentPages.set(pages);

      // Рассчитываем безопасный индекс возврата
      const newIndex = Math.max(0, this.currentPageIndex() - 1);
      this.currentPageIndex.set(newIndex);

      if (this.subSheet) {
        this.subSheet.nativeElement.innerHTML = pages[newIndex] || '<p><br></p>';
      }
      this.saveDocument();
    }
  }
  // --------------------------------------------------

  async sendAiMessage() {
    const prompt = this.chatInput().trim();
    if (!prompt || this.isAiThinking()) return;

    this.messages.set([...this.messages(), { sender: 'user', text: prompt, timestamp: new Date() }]);
    this.chatInput.set('');
    this.isAiThinking.set(true);

    try {
      const payload = {
        action: 'chat_and_edit',
        researchId: this.researchId(),
        documentTitle: this.researchTitle(),
        currentContent: this.documentPages()[this.currentPageIndex()], // Отправляем ИИ контент ТЕКУЩЕЙ страницы
        userPrompt: prompt,
        stats: this.stats()
      };

      const rawResponse = await firstValueFrom(
        this.http.post<any>(this.aiWebhookUrl, payload)
      );

      let parsedData: { aiResponse: string, updatedHtmlContent?: string } | null = null;
      const dataToProcess = rawResponse && rawResponse.output ? rawResponse.output : rawResponse;

      if (typeof dataToProcess === 'string') {
        try {
          parsedData = JSON.parse(dataToProcess);
        } catch (e) {
          console.error('Ошибка парсинга ответа n8n:', e);
        }
      } else if (typeof dataToProcess === 'object' && dataToProcess !== null) {
        parsedData = dataToProcess;
      }

      // Обновляем текущую страницу ответом ИИ (с поддержкой графиков)
     if (parsedData && parsedData.updatedHtmlContent) {
        const pages = [...this.documentPages()];
        pages[this.currentPageIndex()] = parsedData.updatedHtmlContent;
        this.documentPages.set(pages);
        
        if (this.subSheet) {
          this.subSheet.nativeElement.innerHTML = parsedData.updatedHtmlContent;
        }
        this.saveDocument();
      }

      const textForChat = parsedData?.aiResponse || 'Изменения внесены в документ.';
      this.messages.set([
        ...this.messages(), 
        { sender: 'ai', text: textForChat, timestamp: new Date() }
      ]);

    } catch (error) {
      console.error('Ошибка ИИ-модели или парсинга:', error);
      this.messages.set([
        ...this.messages(), 
        { sender: 'ai', text: 'Произошла ошибка связи с ИИ-агентом. Проверь настройки webhook в n8n.', timestamp: new Date() }
      ]);
    } finally {
      this.isAiThinking.set(false);
    }
  }

  downloadFile(format: 'doc' | 'pdf') {
    const currentHtml = this.documentContent();
    const titleText = this.researchTitle();
    const encoder = new TextEncoder();

    if (format === 'doc') {
      const finalHtml = currentHtml.includes('<html') 
        ? currentHtml 
        : this.wrapInWordTemplate(titleText, currentHtml);

      const uint8Array = encoder.encode(finalHtml);
      const bom = new Uint8Array([0xEF, 0xBB, 0xBF]); 
      const blobContent = new Uint8Array(bom.length + uint8Array.length);
      blobContent.set(bom, 0);
      blobContent.set(uint8Array, bom.length);

      const blob = new Blob([blobContent], { type: 'application/msword' });
      this.triggerDownload(blob, `${titleText}.doc`);
    } else {
let currentHtml = this.documentContent();

      // Жестко раскодируем амперсанды, если они случайно проскочили перед генерацией PDF
      if (currentHtml.includes('&lt;') || currentHtml.includes('&gt;')) {
        const tempTextArea = document.createElement('textarea');
        tempTextArea.innerHTML = currentHtml;
        currentHtml = tempTextArea.value;
      }

      // Оборачиваем в печатный PDF-шаблон
      const finalHtml = this.wrapInPdfTemplate(titleText, currentHtml);
      
      const blob = new Blob([finalHtml], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    }
  }

  private triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private wrapInWordTemplate(title: string, content: string): string {
    return `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
        <style>
          body { font-family: 'Arial', sans-serif; padding: 40px; line-height: 1.5; }
          h1 { color: #ff4a3b; font-size: 24px; text-align: center; }
        </style>
      </head>
      <body>
        ${content}
      </body>
      </html>
    `;
  }

  private wrapInPdfTemplate(title: string, content: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>
          body { 
            font-family: 'Arial', sans-serif; 
            padding: 50px; 
            color: #333; 
            line-height: 1.6; 
            background: white;
          }
          /* Стили для таблиц, если ИИ их добавит, чтобы они не ломались в PDF */
          table { border-collapse: collapse; width: 100%; margin: 15px 0; }
          th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; }
          th { background-color: #f8fafc; }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        ${content}
        <script>
          window.onload = function() { 
            // Небольшая задержка, чтобы стили успели примениться перед открытием окна печати
            setTimeout(() => { window.print(); }, 300); 
          }
        </script>
      </body>
      </html>
    `;
  }

  private stripHtml(html: string): string {
    const tmp = document.createElement('DIV');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  goBack() { this.router.navigate(['/dashboard']); }
}
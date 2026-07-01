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
  
  // Храним контент постранично в виде массива строк HTML
  documentPages = signal<string[]>(['']); 
  currentPageIndex = signal<number>(0); // Индекс текущей активной страницы (с 0)

  isSaving = signal<boolean>(false);
  isAiThinking = signal<boolean>(false); 
  isDocumentLoading = false;

  // ДОБАВЛЕНО: Сигнал и метод управления шторкой для мобильных устройств
  isMobileAiOpen = signal<boolean>(false);

  toggleMobileAi() {
    this.isMobileAiOpen.set(!this.isMobileAiOpen());
  }

  chatInput = signal<string>('');
  messages = signal<Message[]>([
    { sender: 'ai', text: 'Привет! Я твой ИИ-ассистент. Напиши мне, что добавить в текст, или попроси проанализировать твое исследование.', timestamp: new Date() }
  ]);

  // Генерируем общий контент для аналитики и экспорта (склеиваем все страницы)
  documentContent = computed(() => this.documentPages().join(''));

  stats = computed(() => {
    const text = this.stripHtml(this.documentContent());
    const charCount = text.length;
    const wordCount = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
    const pageCount = this.documentPages().length; 

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
      this.isDocumentLoading = true; // СРАЗУ блокируем авто-сохранение

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

        if (rawContent.includes('<html') || rawContent.includes('xmlns:w=')) {
          const bodyMatch = rawContent.match(/<body>([\s\S]*?)<\/body>/i);
          if (bodyMatch && bodyMatch[1].trim()) {
            pages = [bodyMatch[1].trim()];
          } else {
            pages = ['<p>Начните вводить текст здесь...</p>'];
          }
        } else if (!rawContent || rawContent === '<p><br></p>' || rawContent === '<div><br></div>') {
          pages = ['<p><br></p>'];
        } else if (rawContent.includes('')) {
          // ИСПРАВЛЕНИЕ: Жестко вычищаем пустые страницы, которые могли нагенерироваться раньше
          pages = rawContent
            .split('')
            .map(p => p.trim())
            .filter(p => p.length > 0 && p !== '<p><br></p>' && p !== '<div><br></div>');
          
          // Если все страницы отфильтровались как пустые, оставляем строго ОДНУ
          if (pages.length === 0) pages = ['<p><br></p>'];
        } else {
          pages = [rawContent];
        }
        
        this.documentPages.set(pages);
        this.currentPageIndex.set(0);

        // Рендерим текущую страницу И только после этого снимаем блокировку
        if (this.subSheet) {
          this.subSheet.nativeElement.innerHTML = pages[0] || '<p><br></p>';
        }

        // Даем браузеру 100мс, чтобы "переварить" вставленный HTML, и только потом разрешаем сохранять
        setTimeout(() => {
          this.isDocumentLoading = false; 
          console.log('Документ полностью загружен. Автосохранение разблокировано.');
        }, 100);

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
    // 1. ЕСЛИ ДОКУМЕНТ ЕЩЕ ЗАГРУЖАЕТСЯ — СРАЗУ ВЫХОДИМ И НИЧЕГО НЕ ПЕРЕЗАПИСЫВАЕМ
    if (this.isDocumentLoading) return;

    // 2. Берем измененный HTML из листа А4
    const html = (event.target as HTMLElement).innerHTML;
    
    // 3. Обновляем контент только ТЕКУЩЕЙ страницы в массиве сигналов
    const pages = [...this.documentPages()];
    pages[this.currentPageIndex()] = html;
    this.documentPages.set(pages);
    
    // 4. Сбрасываем предыдущий таймер автосохранения (Дебаунс)
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    // 5. Запускаем новый таймер: сохраняем в базу через 1.5 секунды после затишья в печати
    this.saveTimeout = setTimeout(() => {
      this.saveDocument();
    }, 1500);
  }

  async saveDocument() {
    if (this.isDocumentLoading) return; 
    if (!this.researchId()) return;
    
    this.isSaving.set(true);
    try {
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Перед склейкой убираем из массива страниц фантомные пустые строки
      // Оставляем только те страницы, где есть хоть какой-то текст или теги
      const cleanPages = this.documentPages()
        .map(p => p.trim())
        .filter(p => p !== '' && p !== '<p><br></p>' && p !== '<div><br></div>');

      // Если после чистки вообще ничего не осталось, принудительно делаем одну чистую страницу
      const finalPages = cleanPages.length > 0 ? cleanPages : ['<p><br></p>'];

      // Обновляем локальный сигнал отфильтрованными данными, чтобы интерфейс не прыгал
      this.documentPages.set(finalPages);

      // Склеиваем чистые страницы
      const fullContent = finalPages.join('');
      
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

    if (this.subSheet) {
      const pages = [...this.documentPages()];
      pages[this.currentPageIndex()] = this.subSheet.nativeElement.innerHTML;
      this.documentPages.set(pages);
    }

    this.currentPageIndex.set(index);

    if (this.subSheet) {
      this.subSheet.nativeElement.innerHTML = this.documentPages()[index] || '<p><br></p>';
    }
  }

  addPage() {
    const pages = [...this.documentPages()];
    const nextIndex = this.currentPageIndex() + 1;
    
    pages.splice(nextIndex, 0, '<p><br></p>');
    this.documentPages.set(pages);
    
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

      const newIndex = Math.max(0, this.currentPageIndex() - 1);
      this.currentPageIndex.set(newIndex);

      if (this.subSheet) {
        this.subSheet.nativeElement.innerHTML = pages[newIndex] || '<p><br></p>';
      }
      this.saveDocument();
    }
  }

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
        currentContent: this.documentPages()[this.currentPageIndex()], 
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

      if (currentHtml.includes('&lt;') || currentHtml.includes('&gt;')) {
        const tempTextArea = document.createElement('textarea');
        tempTextArea.innerHTML = currentHtml;
        currentHtml = tempTextArea.value;
      }

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
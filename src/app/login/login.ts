import { Component, inject, signal } from '@angular/core';
import { AuthService } from '../auth';
import { Router } from '@angular/router'; // 1. Импортируем роутер Angular

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class Login {
  private authService = inject(AuthService);
  private router = inject(Router); // 2. Инжектируем роутер для навигации

  // Состояния экрана: 'menu' | 'login' | 'register'
  currentScreen = signal<'menu' | 'login' | 'register'>('menu');

  // Поля ввода
  username = signal('');
  password = signal('');
  
  // Уведомления
  errorMessage = signal('');
  successMessage = signal('');

  // Навигация внутри компонента
  changeScreen(screen: 'menu' | 'login' | 'register') {
    this.currentScreen.set(screen);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.username.set('');
    this.password.set('');
  }

  // Логин
  async onLoginSubmit(event: Event) {
    event.preventDefault();
    this.errorMessage.set('');
    
    const success = await this.authService.login(this.username(), this.password());
    if (success) {
      // 3. Если вход успешен, перекидываем в личный кабинет
      this.router.navigate(['/dashboard']);
    } else {
      this.errorMessage.set('Неверное имя пользователя или пароль (минимум 6 символов)');
    }
  }

  // Регистрация
  async onRegisterSubmit(event: Event) {
    event.preventDefault();
    this.errorMessage.set('');
    this.successMessage.set('');
    const result = await this.authService.register(this.username(), this.password());
    
    if (result.success) {
      this.successMessage.set(result.message + ' Теперь вы можете войти.');
      setTimeout(() => this.changeScreen('login'), 1500);
    } else {
      this.errorMessage.set(result.message);
    }
  }

  async onForgotPassword() {
    if (!this.username()) {
      this.errorMessage.set('Введите ваш логин в поле ввода, чтобы сбросить пароль!');
      return;
    }
    
    this.errorMessage.set('');
    this.successMessage.set('Отправка запроса...');
    
    const result = await this.authService.resetPassword(this.username());
    if (result.success) {
      this.successMessage.set(result.message);
    } else {
      this.errorMessage.set(result.message);
      this.successMessage.set('');
    }
  }

  // Метод для кнопки входа через Google
  async onGoogleLogin() {
    this.errorMessage.set('');
    const success = await this.authService.loginWithGoogle();
    if (success) {
      // 4. Если вход через Google успешен, тоже перекидываем на dashboard
      this.router.navigate(['/dashboard']);
    } else {
      this.errorMessage.set('Не удалось войти через Google.');
    }
  }
}
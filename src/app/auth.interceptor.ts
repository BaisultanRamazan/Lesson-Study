import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Firebase сам под капотом управляет сессиями, поэтому просто пропускаем запрос дальше
  return next(req);
};
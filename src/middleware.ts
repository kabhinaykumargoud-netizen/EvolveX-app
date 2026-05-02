import { Request, Response, NextFunction } from 'express';

export function loginRequired(role?: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!(req.session as any).user_id) {
      (req as any).flash('warning', 'Please log in.');
      res.redirect('/login');
      return;
    }
    if (role && (req.session as any).role !== role) {
      (req as any).flash('danger', 'Invalid access.');
      res.redirect('/dashboard');
      return;
    }
    next();
  };
}

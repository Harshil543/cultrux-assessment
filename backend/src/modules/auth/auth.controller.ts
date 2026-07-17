import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { sendSuccess } from '../../common/utils/response';

export class AuthController {
  constructor(private readonly authService = new AuthService()) {}

  signup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.authService.signup(req.body);
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.authService.login(req.body);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.authService.me(req.user!.userId);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };
}

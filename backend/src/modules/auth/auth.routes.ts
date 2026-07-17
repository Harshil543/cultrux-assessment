import { Router } from 'express';
import { AuthController } from './auth.controller';
import { validate } from '../../common/middleware/validate';
import { loginSchema, signupSchema } from './auth.service';
import { authMiddleware } from '../../common/middleware/authMiddleware';

const router = Router();
const controller = new AuthController();

router.post('/signup', validate(signupSchema), controller.signup);
router.post('/login', validate(loginSchema), controller.login);
router.post('/logout', controller.logout);
router.get('/me', authMiddleware, controller.me);

export default router;

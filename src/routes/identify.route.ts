import { Router } from 'express';
import { validateIdentifyRequest } from '../middlewares/validateRequest';
import { identifyController } from '../controllers/identify.controller';

const router = Router();

router.post('/identify', validateIdentifyRequest, identifyController);

export default router;

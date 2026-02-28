import { Request, Response, NextFunction } from 'express';
import { identifyContact } from '../services/contact.service';
import { logger } from '../utils/logger';

export async function identifyController(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const { email, phoneNumber } = req.body;

        logger.debug('Identify request received', { email, phoneNumber });

        const result = await identifyContact(email, phoneNumber);

        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

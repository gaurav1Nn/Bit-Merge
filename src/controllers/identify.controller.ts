import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export async function identifyController(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const { email, phoneNumber } = req.body;

        logger.debug('Identify request received', { email, phoneNumber });

        // Service will be wired in Part 3
        res.status(200).json({
            contact: {
                primaryContatctId: 0,
                emails: [],
                phoneNumbers: [],
                secondaryContactIds: [],
            },
        });
    } catch (error) {
        next(error);
    }
}

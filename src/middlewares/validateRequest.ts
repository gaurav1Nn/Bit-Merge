import { Request, Response, NextFunction } from 'express';

export function validateIdentifyRequest(req: Request, res: Response, next: NextFunction): void {
    let { email, phoneNumber } = req.body;

    if (email !== undefined && email !== null) {
        if (typeof email !== 'string') {
            res.status(400).json({ error: 'email must be a string' });
            return;
        }
        email = email.trim().toLowerCase();
        if (email === '') email = null;
    } else {
        email = null;
    }

    if (phoneNumber !== undefined && phoneNumber !== null) {
        phoneNumber = phoneNumber.toString().trim();
        if (phoneNumber === '') phoneNumber = null;
    } else {
        phoneNumber = null;
    }

    if (!email && !phoneNumber) {
        res.status(400).json({ error: 'At least one of email or phoneNumber is required' });
        return;
    }

    req.body.email = email;
    req.body.phoneNumber = phoneNumber;

    next();
}

import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../src/app';

const prisma = new PrismaClient();

beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE TABLE "Contact" CASCADE`;
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe('POST /identify', () => {
    it('should create a new primary contact when no matches exist', async () => {
        const res = await request(app)
            .post('/identify')
            .send({ email: 'lorraine@hillvalley.edu', phoneNumber: '123456' });

        expect(res.status).toBe(200);
        expect(res.body.contact.primaryContatctId).toBeDefined();
        expect(res.body.contact.emails).toEqual(['lorraine@hillvalley.edu']);
        expect(res.body.contact.phoneNumbers).toEqual(['123456']);
        expect(res.body.contact.secondaryContactIds).toEqual([]);
    });

    it('should create a secondary contact when new email matches existing phone', async () => {
        await request(app)
            .post('/identify')
            .send({ email: 'lorraine@hillvalley.edu', phoneNumber: '123456' });

        const res = await request(app)
            .post('/identify')
            .send({ email: 'mcfly@hillvalley.edu', phoneNumber: '123456' });

        expect(res.status).toBe(200);
        expect(res.body.contact.emails).toEqual([
            'lorraine@hillvalley.edu',
            'mcfly@hillvalley.edu',
        ]);
        expect(res.body.contact.phoneNumbers).toEqual(['123456']);
        expect(res.body.contact.secondaryContactIds).toHaveLength(1);
    });

    it('should demote newer primary when two primary groups are linked', async () => {
        const first = await request(app)
            .post('/identify')
            .send({ email: 'george@hillvalley.edu', phoneNumber: '919191' });

        const second = await request(app)
            .post('/identify')
            .send({ email: 'biffsucks@hillvalley.edu', phoneNumber: '717171' });

        const firstId = first.body.contact.primaryContatctId;
        const secondId = second.body.contact.primaryContatctId;

        const res = await request(app)
            .post('/identify')
            .send({ email: 'george@hillvalley.edu', phoneNumber: '717171' });

        expect(res.status).toBe(200);
        expect(res.body.contact.primaryContatctId).toBe(firstId);
        expect(res.body.contact.emails).toContain('george@hillvalley.edu');
        expect(res.body.contact.emails).toContain('biffsucks@hillvalley.edu');
        expect(res.body.contact.phoneNumbers).toContain('919191');
        expect(res.body.contact.phoneNumbers).toContain('717171');
        expect(res.body.contact.secondaryContactIds).toContain(secondId);
    });

    it('should not create a new row for an exact duplicate request', async () => {
        await request(app)
            .post('/identify')
            .send({ email: 'lorraine@hillvalley.edu', phoneNumber: '123456' });

        const res = await request(app)
            .post('/identify')
            .send({ email: 'lorraine@hillvalley.edu', phoneNumber: '123456' });

        expect(res.status).toBe(200);
        expect(res.body.contact.secondaryContactIds).toEqual([]);
    });

    it('should return the full linked group when queried by phone only', async () => {
        await request(app)
            .post('/identify')
            .send({ email: 'lorraine@hillvalley.edu', phoneNumber: '123456' });

        await request(app)
            .post('/identify')
            .send({ email: 'mcfly@hillvalley.edu', phoneNumber: '123456' });

        const res = await request(app)
            .post('/identify')
            .send({ phoneNumber: '123456' });

        expect(res.status).toBe(200);
        expect(res.body.contact.emails).toHaveLength(2);
        expect(res.body.contact.secondaryContactIds).toHaveLength(1);
    });

    it('should return the full linked group when queried by email only', async () => {
        await request(app)
            .post('/identify')
            .send({ email: 'lorraine@hillvalley.edu', phoneNumber: '123456' });

        await request(app)
            .post('/identify')
            .send({ email: 'lorraine@hillvalley.edu', phoneNumber: '999999' });

        const res = await request(app)
            .post('/identify')
            .send({ email: 'lorraine@hillvalley.edu' });

        expect(res.status).toBe(200);
        expect(res.body.contact.phoneNumbers).toHaveLength(2);
        expect(res.body.contact.secondaryContactIds).toHaveLength(1);
    });

    it('should return 400 when neither email nor phoneNumber is provided', async () => {
        const res = await request(app)
            .post('/identify')
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
    });

    it('should not include null values in response arrays', async () => {
        await prisma.contact.create({
            data: {
                email: 'doc@hillvalley.edu',
                phoneNumber: null,
                linkPrecedence: 'primary',
            },
        });

        const res = await request(app)
            .post('/identify')
            .send({ email: 'doc@hillvalley.edu' });

        expect(res.status).toBe(200);
        expect(res.body.contact.emails).toEqual(['doc@hillvalley.edu']);
        expect(res.body.contact.phoneNumbers).toEqual([]);
        expect(res.body.contact.phoneNumbers).not.toContain(null);
    });
});

describe('GET /', () => {
    it('should return health check status', async () => {
        const res = await request(app).get('/');

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
    });
});

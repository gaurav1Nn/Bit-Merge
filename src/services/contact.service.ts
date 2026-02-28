import { PrismaClient, Contact, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

type TransactionClient = Prisma.TransactionClient;

interface IdentifyResponse {
    contact: {
        primaryContatctId: number;
        emails: string[];
        phoneNumbers: string[];
        secondaryContactIds: number[];
    };
}

async function findRootPrimary(tx: TransactionClient, contactId: number, maxDepth = 10): Promise<Contact> {
    let contact = await tx.contact.findUnique({ where: { id: contactId } });
    let depth = 0;

    while (contact?.linkPrecedence === 'secondary' && contact.linkedId) {
        if (++depth > maxDepth) {
            throw new Error(`Circular link detected at contact ${contactId}`);
        }
        contact = await tx.contact.findUnique({ where: { id: contact.linkedId } });
    }

    if (!contact) {
        throw new Error(`Contact ${contactId} not found`);
    }

    return contact;
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err: any) {
            const isRetryable =
                err.code === 'P2034' ||
                err?.meta?.code === '40001';

            if (isRetryable && i < retries - 1) {
                logger.warn(`Transaction conflict, retrying (${i + 1}/${retries})`);
                continue;
            }
            throw err;
        }
    }
    throw new Error('Max retries reached');
}

async function buildResponse(tx: TransactionClient, primaryContact: Contact): Promise<IdentifyResponse> {
    const secondaries = await tx.contact.findMany({
        where: {
            linkedId: primaryContact.id,
            deletedAt: null,
        },
        orderBy: { createdAt: 'asc' },
    });

    const allContacts = [primaryContact, ...secondaries];

    const emails = [...new Set(
        allContacts.map((c) => c.email).filter(Boolean) as string[]
    )];

    const phoneNumbers = [...new Set(
        allContacts.map((c) => c.phoneNumber).filter(Boolean) as string[]
    )];

    const secondaryContactIds = secondaries.map((c) => c.id);

    return {
        contact: {
            primaryContatctId: primaryContact.id,
            emails,
            phoneNumbers,
            secondaryContactIds,
        },
    };
}

export async function identifyContact(
    email: string | null,
    phoneNumber: string | null,
): Promise<IdentifyResponse> {
    return withRetry(() =>
        prisma.$transaction(
            async (tx) => {
                const emailContacts = email
                    ? await tx.contact.findMany({ where: { email, deletedAt: null } })
                    : [];

                const phoneContacts = phoneNumber
                    ? await tx.contact.findMany({ where: { phoneNumber, deletedAt: null } })
                    : [];

                const allMatches = [...emailContacts, ...phoneContacts];
                const uniqueMatches = allMatches.filter(
                    (contact, index, self) => self.findIndex((c) => c.id === contact.id) === index,
                );

                // Case 1: No matches — create new primary
                if (uniqueMatches.length === 0) {
                    const newContact = await tx.contact.create({
                        data: {
                            email,
                            phoneNumber,
                            linkPrecedence: 'primary',
                        },
                    });
                    return buildResponse(tx, newContact);
                }

                // Resolve all matches to their root primaries
                const primaryIds = new Set<number>();
                const primaryMap = new Map<number, Contact>();

                for (const match of uniqueMatches) {
                    const root = await findRootPrimary(tx, match.linkPrecedence === 'secondary' && match.linkedId ? match.linkedId : match.id);
                    primaryIds.add(root.id);
                    primaryMap.set(root.id, root);
                }

                const primaries = [...primaryMap.values()].sort(
                    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
                );

                const oldestPrimary = primaries[0];

                // Case 3: Two different primary groups — merge them
                if (primaries.length > 1) {
                    for (let i = 1; i < primaries.length; i++) {
                        const newerPrimary = primaries[i];

                        await tx.contact.updateMany({
                            where: { linkedId: newerPrimary.id, deletedAt: null },
                            data: { linkedId: oldestPrimary.id },
                        });

                        await tx.contact.update({
                            where: { id: newerPrimary.id },
                            data: {
                                linkedId: oldestPrimary.id,
                                linkPrecedence: 'secondary',
                            },
                        });

                        logger.info(`Demoted contact ${newerPrimary.id} to secondary under ${oldestPrimary.id}`);
                    }
                }

                // Case 4: Check if this is an exact duplicate (no new info)
                const existingEmails = new Set(uniqueMatches.map((c) => c.email).filter(Boolean));
                const existingPhones = new Set(uniqueMatches.map((c) => c.phoneNumber).filter(Boolean));

                const hasNewEmail = email && !existingEmails.has(email);
                const hasNewPhone = phoneNumber && !existingPhones.has(phoneNumber);

                // Case 2: Has new info — create secondary
                if (hasNewEmail || hasNewPhone) {
                    await tx.contact.create({
                        data: {
                            email,
                            phoneNumber,
                            linkedId: oldestPrimary.id,
                            linkPrecedence: 'secondary',
                        },
                    });
                }

                return buildResponse(tx, oldestPrimary);
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
    );
}

export { prisma };

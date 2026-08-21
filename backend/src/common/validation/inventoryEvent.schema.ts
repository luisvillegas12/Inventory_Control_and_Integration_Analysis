import { z } from 'zod';

// Data validation schema for inventory events, using Zod to enforce structure and constraints
export const inventoryEventSchema = z.object({
    merchantId: z.string().min(1),
    storeId: z.string().min(1),
    eventId: z.string().min(1),
    version: z.number().int().positive(),
    sentAt: z.string().refine((val) => !isNaN(Date.parse(val)), {
        message: 'sentAt must be a valid timestamp',
    }),
    items: z
        .array(
            z.object({
                sku: z.string().min(1), 
                stock: z.number().int().nonnegative(),
            })
        )
        .min(1)
        .refine(
            (items) => new Set(items.map((i) => i.sku)).size === items.length,
            { message: 'Duplicate SKUs are not allowed within a single event' }
        ),
});

export type ValidatedInventoryEvent = z.infer<typeof inventoryEventSchema>;

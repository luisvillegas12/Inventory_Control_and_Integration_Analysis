import { Router, Request, Response } from 'express';
import { InventoryQueryService } from '../services/InventoryQueryService';

// Routes for store-related operations, specifically fetching store health information


const router = Router();

// GET /api/v1/stores/:storeId/health?merchantId=
router.get('/:storeId/health', async (req: Request, res: Response) => {
    const correlationId = req.correlationId ?? 'unknown';
    const merchantId = req.query.merchantId as string | undefined;

    if (!merchantId) {
        return res.status(400).json({
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Query parameter merchantId is required.',
                retryable: false,
                details: null,
            },
            meta: { correlationId },
        });
    }

    try {
        const health = await InventoryQueryService.getStoreHealth(merchantId, req.params.storeId);
        return res.status(200).json({ data: health, meta: { correlationId } });
    } catch (error) {
        req.log?.error({ err: error, correlationId }, 'Error fetching store health');
        return res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error.', retryable: true, details: null },
            meta: { correlationId },
        });
    }
});

export default router;

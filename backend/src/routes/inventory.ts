import { Router, Request, Response } from 'express';
import { InventoryService } from '../services/InventoryService';
import { InventoryQueryService } from '../services/InventoryQueryService';
import { ReviewService } from '../services/ReviewService';


// Routes for inventory events: creation, listing, detail retrieval, and approval/rejection
const router = Router();

function sendError(
    res: Response,
    correlationId: string,
    statusCode: number,
    code: string,
    message: string,
    retryable = false,
    details: unknown = null
) {
    return res.status(statusCode).json({
        error: { code, message, retryable, details },
        meta: { correlationId },
    });
}

// POST /api/v1/inventory-events
router.post('/inventory-events', async (req: Request, res: Response) => {
    const correlationId = req.correlationId ?? 'unknown';
    const idempotencyKey = req.header('Idempotency-Key');

    if (!idempotencyKey) {
        return sendError(res, correlationId, 400, 'VALIDATION_ERROR', 'Header Idempotency-Key is required.');
    }

    try {
        const result = await InventoryService.processEvent(idempotencyKey, req.body);

        if (result.error) {
            return sendError(
                res,
                correlationId,
                result.statusCode,
                result.error.code,
                result.error.message,
                false,
                (result.error as any).details ?? null
            );
        }

        return res.status(result.statusCode).json({ data: result.data, meta: { correlationId } });
    } catch (error) {
        req.log?.error({ err: error, correlationId }, 'Error processing inventory event');
        return sendError(res, correlationId, 500, 'INTERNAL_ERROR', 'Unexpected server error.', true);
    }
});

// GET /api/v1/inventory-events?merchantId=&storeId=&status=&limit=&offset=
router.get('/inventory-events', async (req: Request, res: Response) => {
    const correlationId = req.correlationId ?? 'unknown';
    try {
        const { merchantId, storeId, status, limit, offset } = req.query;
        const rows = await InventoryQueryService.listEvents({
            merchantId: merchantId as string | undefined,
            storeId: storeId as string | undefined,
            status: status as string | undefined,
            limit: limit ? Number(limit) : undefined,
            offset: offset ? Number(offset) : undefined,
        });
        return res.status(200).json({ data: rows, meta: { correlationId } });
    } catch (error) {
        req.log?.error({ err: error, correlationId }, 'Error listing inventory events');
        return sendError(res, correlationId, 500, 'INTERNAL_ERROR', 'Unexpected server error.', true);
    }
});

// GET /api/v1/inventory-events/:eventId
router.get('/inventory-events/:eventId', async (req: Request, res: Response) => {
    const correlationId = req.correlationId ?? 'unknown';
    try {
        const event = await InventoryQueryService.getEventDetail(req.params.eventId);
        if (!event) {
            return sendError(res, correlationId, 404, 'NOT_FOUND', 'Event not found.');
        }
        return res.status(200).json({ data: event, meta: { correlationId } });
    } catch (error) {
        req.log?.error({ err: error, correlationId }, 'Error fetching event detail');
        return sendError(res, correlationId, 500, 'INTERNAL_ERROR', 'Unexpected server error.', true);
    }
});

// POST /api/v1/inventory-events/:eventId/approve
router.post('/inventory-events/:eventId/approve', async (req: Request, res: Response) => {
    const correlationId = req.correlationId ?? 'unknown';
    try {
        // TODO: replace with real authenticated reviewer identity once auth exists.
        const reviewer = req.body.reviewer ?? 'unknown-reviewer';
        const result = await ReviewService.review(req.params.eventId, 'APPROVED', reviewer, req.body.comment);

        if (result.error) {
            return sendError(res, correlationId, result.statusCode, result.error.code, result.error.message);
        }
        return res.status(200).json({ data: result.data, meta: { correlationId } });
    } catch (error) {
        req.log?.error({ err: error, correlationId }, 'Error approving event');
        return sendError(res, correlationId, 500, 'INTERNAL_ERROR', 'Unexpected server error.', true);
    }
});

// POST /api/v1/inventory-events/:eventId/reject
router.post('/inventory-events/:eventId/reject', async (req: Request, res: Response) => {
    const correlationId = req.correlationId ?? 'unknown';
    try {
        const reviewer = req.body.reviewer ?? 'unknown-reviewer';
        const result = await ReviewService.review(req.params.eventId, 'REJECTED', reviewer, req.body.comment);

        if (result.error) {
            return sendError(res, correlationId, result.statusCode, result.error.code, result.error.message);
        }
        return res.status(200).json({ data: result.data, meta: { correlationId } });
    } catch (error) {
        req.log?.error({ err: error, correlationId }, 'Error rejecting event');
        return sendError(res, correlationId, 500, 'INTERNAL_ERROR', 'Unexpected server error.', true);
    }
});

export default router;

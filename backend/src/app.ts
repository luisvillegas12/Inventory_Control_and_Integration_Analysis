import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import inventoryRouter from './routes/inventory';
import storesRouter from './routes/stores';

export function createApp() {
    const app = express();

    app.use(cors());
    app.use(express.json());
    app.use(requestLogger);
    app.use(morgan('dev'));

    app.get('/health', (_req, res) => {
        res.json({ status: 'ok' });
    });

    app.use('/api/v1', inventoryRouter);
    app.use('/api/v1/stores', storesRouter);

    // Error handler MUST be registered last.
    app.use(errorHandler);

    return app;
}

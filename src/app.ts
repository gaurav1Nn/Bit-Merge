import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import timeout from 'connect-timeout';
import identifyRouter from './routes/identify.route';
import { errorHandler } from './middlewares/errorHandler';
import { config } from './config';

const app = express();

app.use(timeout('10s'));
app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(morgan(config.isDev ? 'dev' : 'combined'));

app.get('/', (_req, res) => {
    res.json({ status: 'ok' });
});

app.use(identifyRouter);

app.use((req, _res, next) => {
    if (!req.timedout) next();
});

app.use(errorHandler);

export default app;

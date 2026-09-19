import express from 'express';
export const app = express();
app.use(express.json({ limit: '1mb' }));
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'learnbridge' });
});

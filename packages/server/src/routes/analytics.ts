/**
 * Analytics Routes — Advanced analytics endpoints
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../config/logger.js';

export function registerAnalyticsRoutes(server: FastifyInstance): void {
  /**
   * POST /analytics/predict
   * Predict future values based on historical data
   */
  server.post('/analytics/predict', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { data?: number[]; steps?: number };
    if (!body.data || !Array.isArray(body.data)) {
      return reply.status(400).send({ success: false, error: 'Missing data array' });
    }

    try {
      // Simple linear regression prediction
      const data = body.data;
      const steps = body.steps || 5;
      const n = data.length;

      if (n < 2) {
        return reply.status(400).send({ success: false, error: 'Need at least 2 data points' });
      }

      // Calculate linear regression
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
      for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += data[i]!;
        sumXY += i * data[i]!;
        sumX2 += i * i;
      }

      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;

      // Generate predictions
      const predictions = [];
      for (let i = 0; i < steps; i++) {
        const predicted = intercept + slope * (n + i);
        predictions.push({
          step: i + 1,
          predicted: Math.round(predicted * 100) / 100,
        });
      }

      return reply.send({
        success: true,
        predictions,
        model: { slope, intercept },
      });
    } catch (err) {
      logger.error({ err }, 'Analytics predict failed');
      return reply.status(500).send({ success: false, error: 'Prediction failed' });
    }
  });

  /**
   * POST /analytics/anomaly
   * Detect anomalies in data
   */
  server.post('/analytics/anomaly', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { data?: number[]; threshold?: number };
    if (!body.data || !Array.isArray(body.data)) {
      return reply.status(400).send({ success: false, error: 'Missing data array' });
    }

    try {
      const data = body.data;
      const threshold = body.threshold || 2;

      // Calculate mean and standard deviation
      const mean = data.reduce((a, b) => a + b, 0) / data.length;
      const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
      const stdDev = Math.sqrt(variance);

      // Find anomalies
      const anomalies = [];
      for (let i = 0; i < data.length; i++) {
        const zScore = Math.abs((data[i]! - mean) / stdDev);
        if (zScore > threshold) {
          anomalies.push({
            index: i,
            value: data[i],
            zScore: Math.round(zScore * 100) / 100,
            severity: zScore > 3 ? 'critical' : zScore > 2.5 ? 'high' : 'medium',
          });
        }
      }

      return reply.send({
        success: true,
        anomalies,
        stats: { mean, stdDev, threshold },
      });
    } catch (err) {
      logger.error({ err }, 'Analytics anomaly detection failed');
      return reply.status(500).send({ success: false, error: 'Anomaly detection failed' });
    }
  });
}

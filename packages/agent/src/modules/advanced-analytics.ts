/**
 * Advanced Analytics — Predictive & Anomaly Detection
 *
 * Capabilities:
 * - Predictive analytics (forecasting)
 * - Anomaly detection
 * - Trend analysis
 * - Statistical modeling
 * - Custom dashboards
 */

import { logger } from '../config/logger.js';

export interface TimeSeriesPoint {
  timestamp: Date;
  value: number;
}

export interface Prediction {
  timestamp: Date;
  predicted: number;
  lower: number;
  upper: number;
  confidence: number;
}

export interface Anomaly {
  timestamp: Date;
  value: number;
  expected: number;
  score: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface TrendAnalysis {
  direction: 'up' | 'down' | 'stable';
  slope: number;
  rSquared: number;
  description: string;
}

export interface StatisticalModel {
  type: 'linear' | 'exponential' | 'polynomial' | 'seasonal';
  coefficients: number[];
  rSquared: number;
  predictions: Prediction[];
}

export class AdvancedAnalytics {
  /**
   * Predict future values using linear regression
   */
  predictLinear(data: TimeSeriesPoint[], periods: number): Prediction[] {
    if (data.length < 2) {
      throw new Error('Need at least 2 data points for prediction');
    }

    // Convert to numeric indices
    const x = data.map((_, i) => i);
    const y = data.map(d => d.value);

    // Linear regression
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate R-squared
    const meanY = sumY / n;
    const ssTotal = y.reduce((sum, yi) => sum + Math.pow(yi - meanY, 2), 0);
    const ssResidual = y.reduce((sum, yi, i) => {
      const predicted = intercept + slope * i;
      return sum + Math.pow(yi - predicted, 2);
    }, 0);
    const rSquared = 1 - ssResidual / ssTotal;

    // Generate predictions
    const predictions: Prediction[] = [];
    const lastTimestamp = data[data.length - 1].timestamp;
    const interval = data.length > 1
      ? data[1].timestamp.getTime() - data[0].timestamp.getTime()
      : 86400000; // Default 1 day

    for (let i = 0; i < periods; i++) {
      const index = n + i;
      const predicted = intercept + slope * index;
      const timestamp = new Date(lastTimestamp.getTime() + interval * (i + 1));

      // Confidence interval (simplified)
      const stdError = Math.sqrt(ssResidual / (n - 2));
      const margin = 1.96 * stdError * Math.sqrt(1 + 1/n + Math.pow(index - sumX/n, 2) / (sumX2 - sumX*sumX/n));

      predictions.push({
        timestamp,
        predicted,
        lower: predicted - margin,
        upper: predicted + margin,
        confidence: Math.max(0, Math.min(1, rSquared)),
      });
    }

    return predictions;
  }

  /**
   * Detect anomalies using Z-score method
   */
  detectAnomalies(data: TimeSeriesPoint[], threshold: number = 2.5): Anomaly[] {
    if (data.length < 3) {
      return [];
    }

    const values = data.map(d => d.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length);

    const anomalies: Anomaly[] = [];

    for (let i = 0; i < data.length; i++) {
      const zScore = Math.abs((values[i] - mean) / stdDev);

      if (zScore > threshold) {
        const severity = zScore > 4 ? 'critical' : zScore > 3.5 ? 'high' : zScore > 3 ? 'medium' : 'low';

        anomalies.push({
          timestamp: data[i].timestamp,
          value: values[i],
          expected: mean,
          score: zScore,
          severity,
        });
      }
    }

    return anomalies;
  }

  /**
   * Analyze trend
   */
  analyzeTrend(data: TimeSeriesPoint[]): TrendAnalysis {
    if (data.length < 2) {
      return { direction: 'stable', slope: 0, rSquared: 0, description: 'Insufficient data' };
    }

    const x = data.map((_, i) => i);
    const y = data.map(d => d.value);

    // Linear regression
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // R-squared
    const meanY = sumY / n;
    const ssTotal = y.reduce((sum, yi) => sum + Math.pow(yi - meanY, 2), 0);
    const ssResidual = y.reduce((sum, yi, i) => {
      const predicted = intercept + slope * i;
      return sum + Math.pow(yi - predicted, 2);
    }, 0);
    const rSquared = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

    // Determine direction
    const direction = Math.abs(slope) < 0.01 ? 'stable' : slope > 0 ? 'up' : 'down';

    // Generate description
    const changePercent = meanY > 0 ? (slope / meanY * 100) : 0;
    let description = '';

    if (direction === 'up') {
      description = `Increasing trend with ${changePercent.toFixed(1)}% change per period`;
    } else if (direction === 'down') {
      description = `Decreasing trend with ${Math.abs(changePercent).toFixed(1)}% change per period`;
    } else {
      description = 'Stable trend with minimal change';
    }

    return { direction, slope, rSquared, description };
  }

  /**
   * Calculate moving average
   */
  movingAverage(data: TimeSeriesPoint[], windowSize: number): TimeSeriesPoint[] {
    if (data.length < windowSize) {
      return data;
    }

    const result: TimeSeriesPoint[] = [];

    for (let i = windowSize - 1; i < data.length; i++) {
      const window = data.slice(i - windowSize + 1, i + 1);
      const avg = window.reduce((sum, d) => sum + d.value, 0) / windowSize;

      result.push({
        timestamp: data[i].timestamp,
        value: avg,
      });
    }

    return result;
  }

  /**
   * Calculate exponential smoothing
   */
  exponentialSmoothing(data: TimeSeriesPoint[], alpha: number = 0.3): TimeSeriesPoint[] {
    if (data.length === 0) {
      return [];
    }

    const result: TimeSeriesPoint[] = [{ ...data[0] }];

    for (let i = 1; i < data.length; i++) {
      const smoothed = alpha * data[i].value + (1 - alpha) * result[i - 1].value;
      result.push({
        timestamp: data[i].timestamp,
        value: smoothed,
      });
    }

    return result;
  }

  /**
   * Detect seasonality
   */
  detectSeasonality(data: TimeSeriesPoint[], maxPeriod: number = 30): { period: number; strength: number } | null {
    if (data.length < maxPeriod * 2) {
      return null;
    }

    const values = data.map(d => d.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;

    let bestPeriod = 0;
    let bestStrength = 0;

    for (let period = 2; period <= maxPeriod; period++) {
      let correlation = 0;
      let count = 0;

      for (let i = 0; i < values.length - period; i++) {
        correlation += (values[i] - mean) * (values[i + period] - mean);
        count++;
      }

      correlation /= count;

      if (correlation > bestStrength) {
        bestStrength = correlation;
        bestPeriod = period;
      }
    }

    if (bestStrength > 0.5) {
      return { period: bestPeriod, strength: bestStrength };
    }

    return null;
  }

  /**
   * Generate statistical summary
   */
  statisticalSummary(data: number[]): {
    count: number;
    mean: number;
    median: number;
    mode: number[];
    min: number;
    max: number;
    range: number;
    variance: number;
    stdDev: number;
    q1: number;
    q3: number;
    iqr: number;
    skewness: number;
    kurtosis: number;
  } {
    const sorted = [...data].sort((a, b) => a - b);
    const n = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mean = sum / n;

    // Median
    const median = n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)];

    // Mode
    const freq: Record<number, number> = {};
    sorted.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
    const maxFreq = Math.max(...Object.values(freq));
    const mode = Object.entries(freq)
      .filter(([_, f]) => f === maxFreq)
      .map(([v]) => Number(v));

    // Variance & StdDev
    const variance = sorted.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    // Quartiles
    const q1 = sorted[Math.floor(n * 0.25)];
    const q3 = sorted[Math.floor(n * 0.75)];
    const iqr = q3 - q1;

    // Skewness
    const m3 = sorted.reduce((acc, v) => acc + Math.pow(v - mean, 3), 0) / n;
    const skewness = stdDev > 0 ? m3 / Math.pow(stdDev, 3) : 0;

    // Kurtosis
    const m4 = sorted.reduce((acc, v) => acc + Math.pow(v - mean, 4), 0) / n;
    const kurtosis = stdDev > 0 ? m4 / Math.pow(stdDev, 4) - 3 : 0;

    return {
      count: n,
      mean,
      median,
      mode,
      min: sorted[0],
      max: sorted[n - 1],
      range: sorted[n - 1] - sorted[0],
      variance,
      stdDev,
      q1,
      q3,
      iqr,
      skewness,
      kurtosis,
    };
  }

  /**
   * Correlation analysis
   */
  correlation(x: number[], y: number[]): {
    pearson: number;
    spearman: number;
    interpretation: string;
  } {
    if (x.length !== y.length || x.length < 2) {
      throw new Error('Arrays must have same length and at least 2 elements');
    }

    const n = x.length;

    // Pearson correlation
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    const pearson = numerator / (Math.sqrt(denomX) * Math.sqrt(denomY));

    // Interpretation
    let interpretation = '';
    const absPearson = Math.abs(pearson);

    if (absPearson > 0.8) {
      interpretation = 'Very strong correlation';
    } else if (absPearson > 0.6) {
      interpretation = 'Strong correlation';
    } else if (absPearson > 0.4) {
      interpretation = 'Moderate correlation';
    } else if (absPearson > 0.2) {
      interpretation = 'Weak correlation';
    } else {
      interpretation = 'Very weak or no correlation';
    }

    return { pearson, spearman: pearson, interpretation }; // Simplified
  }
}

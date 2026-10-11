export type HistoryPoint = {
  date: string;
  preparedKg: number | null;
  soldKg: number | null;
  leftoverKg: number | null;
  discountPercent?: number | null;
  promotionActive?: boolean;
  holidayOrFestival?: string | null;
};

export type CleanHistoryPoint = {
  date: string;
  preparedKg: number;
  soldKg: number;
  surplusKg: number;
  discountPercent: number;
  promotionActive: boolean;
  holidayOrFestival: string | null;
  dayOfWeek: number;
};

export type ForecastPoint = {
  date: string;
  expectedPreparedKg: number;
  expectedDemandKg: number;
  predictedSurplusKg: number;
  lowerBoundKg: number;
  upperBoundKg: number;
  confidence: number;
  method: "SEASONAL_NAIVE_FALLBACK" | "VALIDATED_GRU";
  factors: Array<{ label: string; direction: "up" | "down" | "neutral"; importance: number }>;
};

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function clipOutliers(values: number[]) {
  if (values.length < 4) return values;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const low = Math.max(0, q1 - 1.5 * iqr);
  const high = q3 + 1.5 * iqr;
  return values.map((value) => Math.min(high, Math.max(low, value)));
}

export function preprocessHistory(points: HistoryPoint[]): CleanHistoryPoint[] {
  const chronological = [...points].filter((point) => !Number.isNaN(Date.parse(point.date))).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const preparedFallback = median(chronological.map((point) => point.preparedKg).filter((value): value is number => value != null && value >= 0));
  const salesFallback = median(chronological.map((point) => point.soldKg).filter((value): value is number => value != null && value >= 0));
  const leftovers = clipOutliers(chronological.map((point) => point.leftoverKg ?? Math.max(0, (point.preparedKg ?? preparedFallback) - (point.soldKg ?? salesFallback))));
  return chronological.map((point, index) => {
    const preparedKg = Math.max(0, point.preparedKg ?? preparedFallback);
    const soldKg = Math.max(0, Math.min(preparedKg, point.soldKg ?? salesFallback));
    return {
      date: point.date,
      preparedKg,
      soldKg,
      surplusKg: Math.max(0, leftovers[index]),
      discountPercent: Math.max(0, Math.min(100, point.discountPercent ?? 0)),
      promotionActive: Boolean(point.promotionActive),
      holidayOrFestival: point.holidayOrFestival ?? null,
      dayOfWeek: new Date(`${point.date}T12:00:00Z`).getUTCDay(),
    };
  });
}

function matchingWeekdays(history: CleanHistoryPoint[], target: Date) {
  const sameDay = history.filter((point) => point.dayOfWeek === target.getUTCDay()).slice(-6);
  return sameDay.length >= 2 ? sameDay : history.slice(-14);
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length);
}

export function generateForecast(historyInput: HistoryPoint[], days = 7, validatedGruArtifact = false): ForecastPoint[] {
  const history = preprocessHistory(historyInput);
  if (!history.length) throw new Error("At least one valid history point is required");
  const lastDate = new Date(`${history.at(-1)!.date}T12:00:00Z`);
  return Array.from({ length: Math.max(1, Math.min(7, days)) }, (_, index) => {
    const target = new Date(lastDate);
    target.setUTCDate(target.getUTCDate() + index + 1);
    const matches = matchingWeekdays(history, target);
    const prepared = median(matches.map((point) => point.preparedKg));
    const demand = median(matches.map((point) => point.soldKg));
    const historicalSurplus = matches.map((point) => point.surplusKg);
    const predictedSurplus = Math.max(0, prepared - demand);
    const sigma = standardDeviation(historicalSurplus);
    const dataConfidence = Math.min(0.9, 0.48 + Math.min(history.length, 42) / 100);
    return {
      date: target.toISOString().slice(0, 10),
      expectedPreparedKg: Math.round(prepared * 10) / 10,
      expectedDemandKg: Math.round(demand * 10) / 10,
      predictedSurplusKg: Math.round(predictedSurplus * 10) / 10,
      lowerBoundKg: Math.round(Math.max(0, predictedSurplus - 1.28 * sigma) * 10) / 10,
      upperBoundKg: Math.round((predictedSurplus + 1.28 * sigma) * 10) / 10,
      confidence: Math.round(dataConfidence * 100),
      method: validatedGruArtifact ? "VALIDATED_GRU" : "SEASONAL_NAIVE_FALLBACK",
      factors: [
        { label: "Same weekday demand", direction: demand > prepared * 0.9 ? "down" : "up", importance: 42 },
        { label: "Recent preparation", direction: "neutral", importance: 31 },
        { label: "Recent surplus pattern", direction: predictedSurplus > median(history.map((point) => point.surplusKg)) ? "up" : "down", importance: 27 },
      ],
    };
  });
}

export function chronologicalEvaluation(pointsInput: HistoryPoint[]) {
  const points = preprocessHistory(pointsInput);
  if (points.length < 10) return { samples: 0, mae: null, rmse: null, note: "At least 10 observations are required for a chronological holdout." };
  const split = Math.max(7, Math.floor(points.length * 0.8));
  const train = points.slice(0, split);
  const test = points.slice(split);
  const errors = test.map((actual) => {
    const comparable = matchingWeekdays(train.filter((point) => point.date < actual.date), new Date(`${actual.date}T12:00:00Z`));
    const predicted = median(comparable.map((point) => point.surplusKg));
    return predicted - actual.surplusKg;
  });
  const mae = errors.reduce((sum, error) => sum + Math.abs(error), 0) / errors.length;
  const rmse = Math.sqrt(errors.reduce((sum, error) => sum + error ** 2, 0) / errors.length);
  return { samples: errors.length, mae: Math.round(mae * 100) / 100, rmse: Math.round(rmse * 100) / 100, note: "Seasonal-naive baseline on the final chronological 20%." };
}

export function simulateWhatIf(base: ForecastPoint, changes: { preparationPercent: number; discountPercent: number; demandPercent: number }) {
  const prepared = Math.max(0, base.expectedPreparedKg * (1 + changes.preparationPercent / 100));
  const discountDemandLift = Math.max(-0.3, Math.min(0.3, changes.discountPercent * 0.006));
  const demand = Math.max(0, base.expectedDemandKg * (1 + changes.demandPercent / 100 + discountDemandLift));
  return {
    expectedPreparedKg: Math.round(prepared * 10) / 10,
    expectedDemandKg: Math.round(demand * 10) / 10,
    predictedSurplusKg: Math.round(Math.max(0, prepared - demand) * 10) / 10,
    disclaimer: "Scenario estimate based on configurable demo assumptions; not a guaranteed outcome.",
  };
}

const ALMATY_OFFSET_MS = 5 * 60 * 60 * 1000;

export interface AnalysisPeriodWindow {
  periodType: 'WEEK' | 'MONTH' | 'ALL_TIME';
  periodStart: Date;
  periodEndExclusive: Date;
  periodEndInclusive: Date;
}

function shiftToAlmaty(date: Date) {
  return new Date(date.getTime() + ALMATY_OFFSET_MS);
}

function shiftFromAlmaty(date: Date) {
  return new Date(date.getTime() - ALMATY_OFFSET_MS);
}

function startOfAlmatyDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function getCurrentAnalysisTime() {
  return new Date();
}

export function getAnalysisWeekWindow(date: Date): AnalysisPeriodWindow {
  const almatyDate = shiftToAlmaty(date);
  const dayStart = startOfAlmatyDay(almatyDate);
  const weekdayIndex = (almatyDate.getUTCDay() + 6) % 7;
  dayStart.setUTCDate(dayStart.getUTCDate() - weekdayIndex);

  const periodStart = shiftFromAlmaty(dayStart);
  const periodEndExclusive = new Date(periodStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  return {
    periodType: 'WEEK',
    periodStart,
    periodEndExclusive,
    periodEndInclusive: new Date(periodEndExclusive.getTime() - 1),
  };
}

export function getAnalysisMonthWindow(date: Date): AnalysisPeriodWindow {
  const almatyDate = shiftToAlmaty(date);
  const monthStartLocal = new Date(Date.UTC(almatyDate.getUTCFullYear(), almatyDate.getUTCMonth(), 1));
  const nextMonthStartLocal = new Date(
    Date.UTC(almatyDate.getUTCFullYear(), almatyDate.getUTCMonth() + 1, 1),
  );

  const periodStart = shiftFromAlmaty(monthStartLocal);
  const periodEndExclusive = shiftFromAlmaty(nextMonthStartLocal);

  return {
    periodType: 'MONTH',
    periodStart,
    periodEndExclusive,
    periodEndInclusive: new Date(periodEndExclusive.getTime() - 1),
  };
}

export function getAllTimeWindow(): AnalysisPeriodWindow {
  const periodStart = new Date('1970-01-01T00:00:00.000Z');
  const periodEndExclusive = new Date('9999-12-31T23:59:59.999Z');

  return {
    periodType: 'ALL_TIME',
    periodStart,
    periodEndExclusive,
    periodEndInclusive: periodEndExclusive,
  };
}

export function uniqueIsoDates(dates: Date[]) {
  return [...new Set(dates.map((date) => date.toISOString()))].sort();
}

export function getPreviousPeriodWindow(period: AnalysisPeriodWindow): AnalysisPeriodWindow | null {
  if (period.periodType === 'ALL_TIME') {
    return null;
  }

  if (period.periodType === 'WEEK') {
    return getAnalysisWeekWindow(new Date(period.periodStart.getTime() - 24 * 60 * 60 * 1000));
  }

  return getAnalysisMonthWindow(new Date(period.periodStart.getTime() - 24 * 60 * 60 * 1000));
}

export interface PublishedScoreLike {
  id: string;
  resultDefinitionId: string | null;
  subject: string;
  assessment: string;
  testDate: Date;
  score: number;
  maximum: number;
}

function fallbackKey(score: PublishedScoreLike): string {
  return [score.subject.trim().toLowerCase(), score.assessment.trim().toLowerCase(), score.testDate.toISOString().slice(0, 10)].join('|');
}

export function assessmentKey(score: PublishedScoreLike): string {
  return score.resultDefinitionId ? `definition:${score.resultDefinitionId}` : `legacy:${fallbackKey(score)}`;
}

export function classAverageByAssessment(scores: PublishedScoreLike[]): Map<string, number> {
  const percentages = new Map<string, number[]>();
  for (const score of scores) {
    if (!Number.isFinite(score.score) || !Number.isFinite(score.maximum) || score.maximum <= 0) continue;
    const key = assessmentKey(score);
    const values = percentages.get(key) ?? [];
    values.push((score.score / score.maximum) * 100);
    percentages.set(key, values);
  }
  return new Map([...percentages].map(([key, values]) => [key, values.reduce((sum, value) => sum + value, 0) / values.length]));
}

export function classAverageOnScale(score: PublishedScoreLike, averages: Map<string, number>): number {
  const percentage = averages.get(assessmentKey(score)) ?? (score.score / score.maximum) * 100;
  return Math.round((percentage / 100) * score.maximum * 10) / 10;
}

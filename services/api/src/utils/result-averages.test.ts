import assert from 'node:assert/strict';
import test from 'node:test';
import { classAverageByAssessment, classAverageOnScale } from './result-averages';

const date = new Date('2026-09-01T00:00:00.000Z');

test('calculates a privacy-safe class average for a shared result definition', () => {
  const rows = [
    { id: 'a', resultDefinitionId: 'exam-1', subject: 'Math', assessment: 'Term test', testDate: date, score: 80, maximum: 100 },
    { id: 'b', resultDefinitionId: 'exam-1', subject: 'Math', assessment: 'Term test', testDate: date, score: 60, maximum: 100 },
  ];
  const averages = classAverageByAssessment(rows);
  assert.equal(classAverageOnScale(rows[0], averages), 70);
});

test('normalizes mixed maximum marks before returning the average on the student scale', () => {
  const rows = [
    { id: 'a', resultDefinitionId: 'exam-2', subject: 'Science', assessment: 'Quiz', testDate: date, score: 18, maximum: 20 },
    { id: 'b', resultDefinitionId: 'exam-2', subject: 'Science', assessment: 'Quiz', testDate: date, score: 40, maximum: 50 },
  ];
  const averages = classAverageByAssessment(rows);
  assert.equal(classAverageOnScale(rows[0], averages), 17);
});

test('groups legacy scores by normalized subject, assessment, and test date', () => {
  const rows = [
    { id: 'a', resultDefinitionId: null, subject: ' English ', assessment: 'Essay', testDate: date, score: 7, maximum: 10 },
    { id: 'b', resultDefinitionId: null, subject: 'english', assessment: 'essay', testDate: date, score: 9, maximum: 10 },
  ];
  const averages = classAverageByAssessment(rows);
  assert.equal(classAverageOnScale(rows[0], averages), 8);
});

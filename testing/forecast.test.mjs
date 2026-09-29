import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const dateLabels = Array.from({ length: 15 }, (_, index) => {
  const date = new Date(2026, 8, 15 + index);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
});

function forecastFor(appPath, labels, observed, today = '2026-09-29T12:00:00') {
  const script = readFileSync(new URL(appPath, import.meta.url), 'utf8');
  const forecastSource = script.slice(
    script.indexOf('function predictedUsageData('),
    script.indexOf('function buildStackedEnvironmentBarChart(', script.indexOf('function predictedUsageData(')),
  );
  const daily = new Map(observed);
  const actualData = labels.map(() => null);
  let latestTotal = null;
  for (let index = 0; index < labels.length; index += 1) {
    if (daily.has(labels[index])) latestTotal = daily.get(labels[index]);
    actualData[index] = latestTotal;
  }
  const lastActualIndex = labels.findLastIndex((label) => daily.has(label));
  const FixedDate = class extends Date {
    constructor(...args) {
      super(...(args.length ? args : [today]));
    }
  };
  const context = {
    Date: FixedDate,
    number: Number,
    parseDateOnlyValue: (value) => new FixedDate(...value.split('-').map((part, index) => Number(part) - (index === 1 ? 1 : 0))),
    formatDateInputValue: (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
  };
  const predict = runInNewContext(`${forecastSource}\npredictedUsageData`, context);
  return Array.from(predict(labels, actualData, lastActualIndex, daily));
}

for (const appPath of ['../chrome-ext/app.js', '../public/app.js']) {
  test(`${appPath}: flat rolling totals do not predict a jump`, () => {
    const labels = [...dateLabels.slice(-7), '2026-09-30'];
    const observed = labels.slice(0, -2).map((label) => [label, 28000]);
    const forecast = forecastFor(appPath, labels, observed);
    assert.deepEqual(forecast.slice(-3), [28000, 28000, 28000]);
  });

  test(`${appPath}: missing and zero days before launch are not forecast samples`, () => {
    const labels = dateLabels.slice(-7);
    const forecast = forecastFor(appPath, labels, [
      [labels[1], 0], [labels[3], 15], [labels[4], 20],
    ]);
    assert.deepEqual(forecast.slice(-3), [20, 30, 40]);
  });

  test(`${appPath}: observed weekday usage overrides the overall daily rate`, () => {
    const observed = dateLabels.slice(0, -2).map((label, index) => [label, index === 0 ? 100 : 100 + (index - 1) * 10]);
    observed[12][1] = observed[11][1] + 30;
    const forecast = forecastFor(appPath, dateLabels, observed);
    assert.equal(forecast.at(-2), observed.at(-1)[1] + 10);
    assert.equal(forecast.at(-1), observed.at(-1)[1] + 20);
  });

  test(`${appPath}: Saturday and Sunday retain different observed rates`, () => {
    const observed = dateLabels.slice(0, 11).map((label, index) => [label, 100 + index * 5]);
    observed[4][1] = observed[3][1] + 2;
    observed[5][1] = observed[4][1] + 8;
    for (let index = 6; index < observed.length; index += 1) {
      observed[index][1] = observed[index - 1][1] + 5;
    }
    const forecast = forecastFor(appPath, dateLabels, observed, '2026-09-26T12:00:00');
    assert.equal(forecast[11], observed.at(-1)[1] + 2);
    assert.equal(forecast[12], observed.at(-1)[1] + 10);
  });
}
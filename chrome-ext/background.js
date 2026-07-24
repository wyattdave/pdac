// PDAC extension service worker.
//
// The toolbar button opens the full-page app. A five-minute alarm invokes the
// same durable scheduled-report pipeline as the original Node server, with a
// catch-up check whenever the browser starts.

// ExcelJS must attach itself to globalThis before server-core is evaluated.
import './lib/exceljs.min.js';
import {
  AUTOMATED_REPORT_CHECK_INTERVAL_MS,
  checkAutomatedReportSchedule,
} from './src/server-core.js';

const APP_URL = chrome.runtime.getURL('app.html');
const ALARM_NAME = 'report-check';

chrome.action.onClicked.addListener(async () => {
  const [existing] = await chrome.tabs.query({ url: APP_URL });
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url: APP_URL });
});

function ensureAlarm() {
  return chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: AUTOMATED_REPORT_CHECK_INTERVAL_MS / (60 * 1000),
  });
}

function logScheduleError(error) {
  console.error(`Scheduled report check failed: ${error?.message || error}`);
}

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  checkAutomatedReportSchedule().catch(logScheduleError);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkAutomatedReportSchedule().catch(logScheduleError);
  }
});

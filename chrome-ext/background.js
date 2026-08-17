// PDAC extension service worker.
//
// The toolbar button opens the full-page app. Separate alarms run daily-report
// checks every five minutes and weekly-report checks hourly, with catch-up
// checks whenever the browser starts.

// ExcelJS must attach itself to globalThis before server-core is evaluated.
import './lib/exceljs.min.js';
import {
  AUTOMATED_REPORT_CHECK_INTERVAL_MS,
  WEEKLY_REPORT_CHECK_INTERVAL_MS,
  checkAutomatedReportSchedule,
  checkWeeklyReportTracking,
} from './src/server-core.js';

const APP_URL = chrome.runtime.getURL('app.html');
const AUTOMATED_REPORT_ALARM_NAME = 'report-check';
const WEEKLY_REPORT_ALARM_NAME = 'weekly-report-check';

chrome.action.onClicked.addListener(async () => {
  await chrome.tabs.create({ url: APP_URL });
});

function ensureAlarm() {
  chrome.alarms.create(AUTOMATED_REPORT_ALARM_NAME, {
    periodInMinutes: AUTOMATED_REPORT_CHECK_INTERVAL_MS / (60 * 1000),
  });
  chrome.alarms.create(WEEKLY_REPORT_ALARM_NAME, {
    periodInMinutes: WEEKLY_REPORT_CHECK_INTERVAL_MS / (60 * 1000),
  });
}

function logScheduleError(error) {
  console.error(`Scheduled report check failed: ${error?.message || error}`);
}

async function checkBackgroundReports() {
  await checkAutomatedReportSchedule();
  await checkWeeklyReportTracking();
}

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm();
  checkBackgroundReports().catch(logScheduleError);
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  checkBackgroundReports().catch(logScheduleError);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === AUTOMATED_REPORT_ALARM_NAME) {
    checkAutomatedReportSchedule().catch(logScheduleError);
  }
  if (alarm.name === WEEKLY_REPORT_ALARM_NAME) {
    checkWeeklyReportTracking().catch(logScheduleError);
  }
});

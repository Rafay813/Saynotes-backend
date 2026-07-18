import { DateTime } from 'luxon';

/**
 * Parse date string with support for multiple formats
 */
function parseDateString(dateStr, timezone) {
  if (!dateStr) return null;

  const now = DateTime.now().setZone(timezone);
  const lower = dateStr.toLowerCase().trim();

  console.log(`📅 Parsing date string: "${dateStr}"`);

  // ✅ Relative dates
  const relativeMap = {
    'today': now.startOf('day'),
    'tomorrow': now.plus({ days: 1 }).startOf('day'),
    'yesterday': now.minus({ days: 1 }).startOf('day'),
  };

  if (relativeMap[lower]) {
    console.log('✅ Parsed as relative date:', lower);
    return relativeMap[lower];
  }

  // ✅ Weekdays
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  
  // "next Monday"
  for (let i = 0; i < weekdays.length; i++) {
    if (lower.includes(`next ${weekdays[i]}`)) {
      let targetDay = i;
      let currentDay = now.weekday % 7;
      let diff = targetDay - currentDay;
      if (diff <= 0) diff += 7;
      const result = now.plus({ days: diff + 7 }).startOf('day');
      console.log(`✅ Parsed as "next ${weekdays[i]}"`);
      return result;
    }
  }

  // "this Friday" or "Friday"
  for (let i = 0; i < weekdays.length; i++) {
    if (lower.includes(weekdays[i]) && !lower.includes('next')) {
      let targetDay = i;
      let currentDay = now.weekday % 7;
      let diff = targetDay - currentDay;
      if (diff <= 0) diff += 7;
      const result = now.plus({ days: diff }).startOf('day');
      console.log(`✅ Parsed as "${weekdays[i]}"`);
      return result;
    }
  }

  // ✅ Try various formats with year
  const formatsWithYear = [
    'd MMMM yyyy',     // 20 July 2026
    'MMMM d, yyyy',    // July 20, 2026
    'd MMM yyyy',      // 20 Jul 2026
    'yyyy-MM-dd',      // 2026-07-20
    'MM/dd/yyyy',      // 07/20/2026
    'dd/MM/yyyy',      // 20/07/2026
    'd MMMM, yyyy',    // 20 July, 2026
  ];

  for (const format of formatsWithYear) {
    const dt = DateTime.fromFormat(dateStr, format, { zone: timezone });
    if (dt.isValid) {
      console.log(`✅ Parsed with format "${format}"`);
      return dt;
    }
  }

  // ✅ Try formats without year (use current year)
  const formatsNoYear = [
    'd MMMM',          // 20 July
    'MMMM d',          // July 20
    'd MMM',           // 20 Jul
    'MM/dd',           // 07/20
    'dd/MM',           // 20/07
    'd MMMM',          // 20 July
  ];

  for (const format of formatsNoYear) {
    const dt = DateTime.fromFormat(dateStr, format, { zone: timezone });
    if (dt.isValid) {
      console.log(`✅ Parsed with format "${format}", using current year ${now.year}`);
      return dt.set({ year: now.year });
    }
  }

  console.warn(`⚠️ Could not parse date: "${dateStr}"`);
  return null;
}

/**
 * Parse time string
 */
function parseTimeString(timeStr) {
  if (!timeStr) return null;

  const trimmed = timeStr.trim().toLowerCase();
  console.log(`⏰ Parsing time string: "${timeStr}"`);

  // Special cases
  if (trimmed === 'noon') return { hours: 12, minutes: 0 };
  if (trimmed === 'midnight') return { hours: 0, minutes: 0 };

  // ✅ HH:MM format (24-hour)
  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const result = { hours: parseInt(match24[1]), minutes: parseInt(match24[2]) };
    console.log(`✅ Parsed as 24-hour: ${result.hours}:${result.minutes}`);
    return result;
  }

  // ✅ 12-hour format with AM/PM
  const match12 = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (match12) {
    let hours = parseInt(match12[1]);
    const minutes = parseInt(match12[2]) || 0;
    const meridian = match12[3];
    if (meridian === 'pm' && hours !== 12) hours += 12;
    if (meridian === 'am' && hours === 12) hours = 0;
    const result = { hours, minutes };
    console.log(`✅ Parsed as 12-hour: ${result.hours}:${result.minutes} ${meridian}`);
    return result;
  }

  // ✅ Just a number (e.g., "7" → 7:00)
  const matchHour = trimmed.match(/^(\d{1,2})$/);
  if (matchHour) {
    let hours = parseInt(matchHour[1]);
    // If > 12, assume 24-hour format
    if (hours > 12) {
      const result = { hours, minutes: 0 };
      console.log(`✅ Parsed as 24-hour number: ${result.hours}:00`);
      return result;
    }
    // Otherwise, assume AM (morning)
    const result = { hours, minutes: 0 };
    console.log(`✅ Parsed as hour number: ${result.hours}:00 (assuming AM)`);
    return result;
  }

  console.warn(`⚠️ Could not parse time: "${timeStr}"`);
  return null;
}

/**
 * Parse duration string
 */
function parseDuration(durationStr) {
  if (!durationStr) return null;

  const trimmed = durationStr.trim().toLowerCase();
  console.log(`⏱️ Parsing duration: "${durationStr}"`);

  // Hours
  const hoursMatch = trimmed.match(/(\d+)\s*hours?/);
  if (hoursMatch) {
    const minutes = parseInt(hoursMatch[1]) * 60;
    console.log(`✅ Parsed as ${minutes} minutes`);
    return minutes;
  }

  // Minutes
  const minutesMatch = trimmed.match(/(\d+)\s*minutes?/);
  if (minutesMatch) {
    const minutes = parseInt(minutesMatch[1]);
    console.log(`✅ Parsed as ${minutes} minutes`);
    return minutes;
  }

  // "1 hour 30 minutes"
  const combined = trimmed.match(/(\d+)\s*hours?\s*(?:and)?\s*(\d+)\s*minutes?/);
  if (combined) {
    const minutes = parseInt(combined[1]) * 60 + parseInt(combined[2]);
    console.log(`✅ Parsed combined as ${minutes} minutes`);
    return minutes;
  }

  // Just a number (e.g., "30" → 30 minutes)
  const numberMatch = trimmed.match(/^(\d+)$/);
  if (numberMatch) {
    const minutes = parseInt(numberMatch[1]);
    console.log(`✅ Parsed as ${minutes} minutes`);
    return minutes;
  }

  console.warn(`⚠️ Could not parse duration: "${durationStr}"`);
  return null;
}

/**
 * Extract email from text
 */
export function extractEmail(text) {
  if (!text) return null;

  // Try direct email match
  const directMatch = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  if (directMatch) return directMatch[0];

  // Try voice email (john at gmail dot com)
  const voiceMatch = text.match(/([A-Za-z0-9._%+-]+)\s+at\s+([A-Za-z0-9.-]+)\s+dot\s+([A-Za-z]{2,})/i);
  if (voiceMatch) {
    return `${voiceMatch[1]}@${voiceMatch[2]}.${voiceMatch[3]}`;
  }

  return null;
}

/**
 * Detect if this is a client booking
 */
export function detectClientBooking(text, person) {
  if (!person) return false;

  const patterns = [
    /meeting with/i,
    /meet with/i,
    /call with/i,
    /appointment with/i,
    /discussion with/i,
    /client/i,
    /customer/i,
    /interview with/i,
    /demo with/i,
    /consultation with/i,
    /zoom with/i,
    /google meet with/i,
    /conference with/i,
    /presentation with/i,
    /session with/i,
  ];

  return patterns.some(pattern => pattern.test(text));
}

/**
 * Main function: Parse date and time, return UTC Date
 */
export function parseDateTime(dateStr, timeStr, timezone) {
  if (!dateStr) {
    console.warn('⚠️ No date string provided');
    return null;
  }

  console.log(`📅 parseDateTime: date="${dateStr}", time="${timeStr}", tz="${timezone}"`);

  // ✅ Parse date
  let dt = parseDateString(dateStr, timezone);
  if (!dt) {
    console.warn(`⚠️ Could not parse date: "${dateStr}"`);
    return null;
  }

  // ✅ Parse time
  if (timeStr) {
    const time = parseTimeString(timeStr);
    if (time) {
      dt = dt.set({ hour: time.hours, minute: time.minutes });
      console.log(`⏰ Set time to ${time.hours}:${time.minutes}`);
    } else {
      console.warn(`⚠️ Could not parse time: "${timeStr}"`);
    }
  }

  // ✅ Ensure date is in the future (for relative dates like "Friday")
  const now = DateTime.now().setZone(timezone);
  if (dt < now.startOf('day')) {
    // If parsed date is in the past, add 7 days (next occurrence)
    dt = dt.plus({ days: 7 });
    console.log(`📅 Date was in the past, moved to next occurrence: ${dt.toISO()}`);
  }

  // ✅ Convert to UTC
  const utcDate = dt.toUTC().toJSDate();
  console.log(`✅ Final UTC: ${utcDate.toISOString()}`);

  return utcDate;
}

/**
 * Calculate end time
 */
export function calculateEndTime(startTime, endTimeStr, durationStr, timezone) {
  if (!startTime) return null;

  const start = new Date(startTime);
  console.log(`⏱️ Calculating end time from start: ${start.toISOString()}`);

  // ✅ If endTime is provided, parse it
  if (endTimeStr) {
    const endDate = parseDateTime(
      start.toISOString().split('T')[0],
      endTimeStr,
      timezone || 'UTC'
    );
    if (endDate) {
      console.log(`✅ End time from endTimeStr: ${endDate.toISOString()}`);
      return endDate;
    }
  }

  // ✅ If duration is provided, calculate
  if (durationStr) {
    const minutes = parseDuration(durationStr);
    if (minutes) {
      const end = new Date(start);
      end.setMinutes(end.getMinutes() + minutes);
      console.log(`✅ End time from duration (${minutes}min): ${end.toISOString()}`);
      return end;
    }
  }

  // ✅ Default: 30 minutes
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + 30);
  console.log(`✅ End time default (30min): ${end.toISOString()}`);
  return end;
}

export default {
  parseDateTime,
  calculateEndTime,
  extractEmail,
  detectClientBooking,
  parseDuration,
};
import { DateTime } from 'luxon';

/**
 * Parse date string with support for multiple formats
 */
function parseDateString(dateStr, timezone) {
  if (!dateStr) return null;

  const now = DateTime.now().setZone(timezone);
  let lower = dateStr.trim().toLowerCase();

  console.log(`📅 Parsing date string: "${dateStr}"`);

  // Clean ordinal suffixes (th, st, nd, rd) from dates
  let cleanedDateStr = dateStr.replace(/(\d+)(st|nd|rd|th)/, '$1');

  // ✅ Relative dates
  const relativeMap = {
    'today': now.startOf('day'),
    'tomorrow': now.plus({ days: 1 }).startOf('day'),
    'yesterday': now.minus({ days: 1 }).startOf('day'),
    'next week': now.plus({ weeks: 1 }).startOf('day'),
    'this week': now.startOf('day'),
    'day after tomorrow': now.plus({ days: 2 }).startOf('day'),
    'this weekend': now.endOf('week').minus({ days: 2 }).startOf('day'),
    'next month': now.plus({ months: 1 }).startOf('day'),
    'next year': now.plus({ years: 1 }).startOf('day'),
  };

  // Check for exact matches
  if (relativeMap[lower]) {
    console.log('✅ Parsed as relative date:', lower);
    return relativeMap[lower];
  }

  // ✅ "coming Monday" or "coming Friday"
  const comingMatch = lower.match(/coming\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/);
  if (comingMatch) {
    const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDay = weekdays.indexOf(comingMatch[1]);
    let currentDay = now.weekday % 7;
    let diff = targetDay - currentDay;
    if (diff <= 0) diff += 7;
    const result = now.plus({ days: diff }).startOf('day');
    console.log(`✅ Parsed as "coming ${comingMatch[1]}"`);
    return result;
  }

  // ✅ "in X days" or "in X weeks"
  const inMatch = lower.match(/in\s+(\d+)\s+(days?|weeks?)/);
  if (inMatch) {
    const amount = parseInt(inMatch[1]);
    const unit = inMatch[2].startsWith('w') ? 'weeks' : 'days';
    const result = now.plus({ [unit]: amount }).startOf('day');
    console.log(`✅ Parsed as "in ${amount} ${unit}"`);
    return result;
  }

  // Weekdays
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  
  // "next Monday"
  for (let i = 0; i < weekdays.length; i++) {
    if (lower.includes(`next ${weekdays[i]}`)) {
      let targetDay = i;
      let currentDay = now.weekday % 7;
      let diff = targetDay - currentDay;
      // ✅ FIXED: diff check and removed extra + 7
      if (diff <= 0) diff += 7;
      const result = now.plus({ days: diff }).startOf('day');
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
      if (diff < 0) diff += 7;
      const result = now.plus({ days: diff }).startOf('day');
      console.log(`✅ Parsed as "${weekdays[i]}"`);
      return result;
    }
  }

  // Try various formats with year (using cleaned date string)
  const formatsWithYear = [
    'd MMMM yyyy',     // 27 July 2026
    'MMMM d, yyyy',    // July 27, 2026
    'd MMM yyyy',      // 27 Jul 2026
    'yyyy-MM-dd',      // 2026-07-27
    'MM/dd/yyyy',      // 07/27/2026
    'dd/MM/yyyy',      // 27/07/2026
    'd MMMM, yyyy',    // 27 July, 2026
    'yyyy/MM/dd',      // 2026/07/27
    'dd-MM-yyyy',      // 27-07-2026
    'MM-dd-yyyy',      // 07-27-2026
  ];

  for (const format of formatsWithYear) {
    const dt = DateTime.fromFormat(cleanedDateStr, format, { zone: timezone });
    if (dt.isValid) {
      console.log(`✅ Parsed with format "${format}"`);
      return dt;
    }
  }

  // Try formats without year (use current year)
  const formatsNoYear = [
    'd MMMM',          // 27 July
    'MMMM d',          // July 27
    'd MMM',           // 27 Jul
    'MM/dd',           // 07/27
    'dd/MM',           // 27/07
    'MM-dd',           // 07-27
    'dd-MM',           // 27-07
  ];

  for (const format of formatsNoYear) {
    const dt = DateTime.fromFormat(cleanedDateStr, format, { zone: timezone });
    if (dt.isValid) {
      console.log(`✅ Parsed with format "${format}", using current year ${now.year}`);
      return dt.set({ year: now.year });
    }
  }

  console.warn(`⚠️ Could not parse date: "${dateStr}"`);
  return null;
}

/**
 * ✅ EXPORTED: Parse time string - correctly handles all formats
 */
export function parseTimeString(timeStr) {
  if (!timeStr) return null;

  let trimmed = timeStr.trim().toLowerCase();
  
  // ✅ Remove timezone abbreviations (PST, PKT, EST, etc.)
  trimmed = trimmed.replace(/\s*(pst|pdt|pkt|est|edt|cst|cdt|mst|mdt|gmt|bst|ist|jst|aest|acst|nzst)\b/i, '');
  
  console.log(`⏰ Parsing time string: "${timeStr}" → normalized: "${trimmed}"`);

  // Special cases
  if (trimmed === 'noon') return { hours: 12, minutes: 0 };
  if (trimmed === 'midnight') return { hours: 0, minutes: 0 };
  
  // ✅ Time of day mappings
  const timeOfDayMap = {
    'morning': { hours: 9, minutes: 0 },
    'afternoon': { hours: 14, minutes: 0 },
    'evening': { hours: 18, minutes: 0 },
    'night': { hours: 20, minutes: 0 },
  };
  
  if (timeOfDayMap[trimmed]) {
    console.log(`✅ Parsed as time of day: "${trimmed}" → ${timeOfDayMap[trimmed].hours}:${timeOfDayMap[trimmed].minutes}`);
    return timeOfDayMap[trimmed];
  }

  // HH:MM:SS format (24-hour with seconds)
  const match24WithSeconds = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (match24WithSeconds) {
    const result = { 
      hours: parseInt(match24WithSeconds[1]), 
      minutes: parseInt(match24WithSeconds[2]),
      seconds: parseInt(match24WithSeconds[3])
    };
    console.log(`✅ Parsed as 24-hour with seconds: ${result.hours}:${result.minutes}:${result.seconds}`);
    return result;
  }

  // HH:MM format (24-hour)
  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const result = { hours: parseInt(match24[1]), minutes: parseInt(match24[2]) };
    console.log(`✅ Parsed as 24-hour: ${result.hours}:${result.minutes}`);
    return result;
  }

  // ✅ 12-hour format with AM/PM - handles all variations
  let match12 = null;
  
  // Pattern 1: "10:30:45 PM" (with seconds)
  match12 = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})\s*(am|pm)$/);
  
  // Pattern 2: "10:30 PM" or "10:30 pm"
  if (!match12) {
    match12 = trimmed.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/);
  }
  
  // Pattern 3: "10.30 PM" or "10.30 pm"
  if (!match12) {
    match12 = trimmed.match(/^(\d{1,2})\.(\d{2})\s*(am|pm)$/);
  }
  
  // Pattern 4: "10:30pm" (no space)
  if (!match12) {
    match12 = trimmed.match(/^(\d{1,2}):(\d{2})(am|pm)$/);
  }
  
  // Pattern 5: "10.30pm" (no space)
  if (!match12) {
    match12 = trimmed.match(/^(\d{1,2})\.(\d{2})(am|pm)$/);
  }
  
  // Pattern 6: "10 PM" or "10 pm"
  if (!match12) {
    match12 = trimmed.match(/^(\d{1,2})\s*(am|pm)$/);
  }
  
  // Pattern 7: "10pm" (no space)
  if (!match12) {
    match12 = trimmed.match(/^(\d{1,2})(am|pm)$/);
  }

  if (match12) {
    let hours = parseInt(match12[1]);
    let minutes = 0;
    let seconds = 0;
    
    // Check if we have minutes (patterns with 3+ captures)
    if (match12.length >= 4) {
      minutes = parseInt(match12[2]) || 0;
      const meridianIndex = match12.length === 5 ? 3 : 4;
      const meridian = match12[meridianIndex] || match12[match12.length - 1];
      
      // ✅ CORRECT PM conversion
      if (meridian === 'pm' && hours !== 12) {
        hours += 12;
      }
      if (meridian === 'am' && hours === 12) {
        hours = 0;
      }
      
      // Check for seconds (pattern with 5 captures)
      if (match12.length === 5) {
        seconds = parseInt(match12[3]) || 0;
      }
      
      console.log(`✅ Parsed as 12-hour: ${hours}:${minutes}:${seconds} ${meridian}`);
    } else if (match12.length === 3) {
      const meridian = match12[2];
      if (meridian === 'pm' && hours !== 12) {
        hours += 12;
      }
      if (meridian === 'am' && hours === 12) {
        hours = 0;
      }
      console.log(`✅ Parsed as 12-hour: ${hours}:00 ${meridian}`);
    }
    
    // Validate hours (0-23) and minutes (0-59)
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return { hours, minutes, seconds };
    }
  }

  // ✅ "half past 10" → 10:30
  const halfPastMatch = trimmed.match(/half\s+past\s+(\d{1,2})/);
  if (halfPastMatch) {
    let hours = parseInt(halfPastMatch[1]);
    if (hours < 6) hours += 12; // Assume PM if small number
    const result = { hours, minutes: 30 };
    console.log(`✅ Parsed as "half past": ${result.hours}:${result.minutes}`);
    return result;
  }

  // ✅ "quarter past 7" → 7:15
  const quarterPastMatch = trimmed.match(/quarter\s+past\s+(\d{1,2})/);
  if (quarterPastMatch) {
    let hours = parseInt(quarterPastMatch[1]);
    if (hours < 6) hours += 12;
    const result = { hours, minutes: 15 };
    console.log(`✅ Parsed as "quarter past": ${result.hours}:${result.minutes}`);
    return result;
  }

  // ✅ "quarter to 5" → 4:45
  const quarterToMatch = trimmed.match(/quarter\s+to\s+(\d{1,2})/);
  if (quarterToMatch) {
    let hours = parseInt(quarterToMatch[1]);
    if (hours < 6) hours += 12;
    const result = { hours: hours - 1, minutes: 45 };
    console.log(`✅ Parsed as "quarter to": ${result.hours}:${result.minutes}`);
    return result;
  }

  // Just a number (e.g., "7" → 7:00)
  const matchHour = trimmed.match(/^(\d{1,2})$/);
  if (matchHour) {
    let hours = parseInt(matchHour[1]);
    // If > 12, assume 24-hour format
    if (hours > 12) {
      const result = { hours, minutes: 0 };
      console.log(`✅ Parsed as 24-hour number: ${result.hours}:00`);
      return result;
    }
    // No heuristic - use as-is
    const result = { hours, minutes: 0 };
    console.log(`✅ Parsed as hour number: ${result.hours}:00`);
    return result;
  }

  console.warn(`⚠️ Could not parse time: "${timeStr}"`);
  return null;
}

/**
 * ✅ FIXED: Parse duration string - supports all common formats
 */
function parseDuration(durationStr) {
  if (!durationStr) return null;

  let trimmed = durationStr.trim().toLowerCase();
  console.log(`⏱️ Parsing duration: "${durationStr}"`);

  // ✅ "1h 30m" format
  const compactMatch = trimmed.match(/^(\d+)\s*h\s*(?:(\d+)\s*m)?$/);
  if (compactMatch) {
    let minutes = parseInt(compactMatch[1]) * 60;
    if (compactMatch[2]) {
      minutes += parseInt(compactMatch[2]);
    }
    console.log(`✅ Parsed compact as ${minutes} minutes`);
    return minutes;
  }

  // ✅ "1 hour 30 minutes" format
  const combined = trimmed.match(/(\d+)\s*hours?\s*(?:and)?\s*(\d+)\s*minutes?/);
  if (combined) {
    const minutes = parseInt(combined[1]) * 60 + parseInt(combined[2]);
    console.log(`✅ Parsed combined as ${minutes} minutes`);
    return minutes;
  }

  // ✅ "90 mins" or "90 min"
  const minMatch = trimmed.match(/(\d+)\s*mins?/);
  if (minMatch) {
    const minutes = parseInt(minMatch[1]);
    console.log(`✅ Parsed as ${minutes} minutes`);
    return minutes;
  }

  // ✅ "1 hr" or "2 hrs"
  const hourMatch = trimmed.match(/(\d+)\s*hrs?/);
  if (hourMatch) {
    const minutes = parseInt(hourMatch[1]) * 60;
    console.log(`✅ Parsed as ${minutes} minutes`);
    return minutes;
  }

  // Then check hours
  const hoursMatch = trimmed.match(/(\d+)\s*hours?/);
  if (hoursMatch) {
    const minutes = parseInt(hoursMatch[1]) * 60;
    console.log(`✅ Parsed as ${minutes} minutes`);
    return minutes;
  }

  // Then check minutes
  const minutesMatch = trimmed.match(/(\d+)\s*minutes?/);
  if (minutesMatch) {
    const minutes = parseInt(minutesMatch[1]);
    console.log(`✅ Parsed as ${minutes} minutes`);
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

// ✅ FIXED: Add helper to apply default time dynamically
function applyDefaultTime(dt, now) {
  if (dt.hasSame(now, 'day')) {
    const soon = now.plus({ hours: 2 });
    return dt.set({ hour: soon.hour, minute: soon.minute, second: 0 });
  }
  return dt.set({ hour: 9, minute: 0, second: 0 });
}

/**
 * ✅ FIXED: Main function - Parse date and time, return UTC Date
 */
export function parseDateTime(dateStr, timeStr, timezone) {
  if (!dateStr) {
    console.warn('⚠️ No date string provided');
    return null;
  }

  // ✅ Normalize the date string
  let normalizedDateStr = dateStr.trim();
  
  console.log(`📅 parseDateTime: date="${dateStr}", time="${timeStr}", tz="${timezone}"`);

  // ✅ Get current time in user's timezone
  const now = DateTime.now().setZone(timezone);
  console.log(`🕐 Current time in ${timezone}: ${now.toFormat('yyyy-MM-dd HH:mm')}`);

  // Parse date
  let dt = parseDateString(normalizedDateStr, timezone);
  if (!dt) {
    console.warn(`⚠️ Could not parse date: "${dateStr}"`);
    return null;
  }

  // Parse time
  // ✅ FIXED: Defaulting to applyDefaultTime handling instead of hardcoded 9 AM
  if (timeStr) {
    const time = parseTimeString(timeStr);
    if (time) {
      dt = dt.set({ 
        hour: time.hours, 
        minute: time.minutes || 0,
        second: time.seconds || 0 
      });
      console.log(`⏰ Set time to ${time.hours}:${time.minutes}:${time.seconds || 0}`);
    } else {
      console.warn(`⚠️ Could not parse time: "${timeStr}"`);
      dt = applyDefaultTime(dt, now);
    }
  } else {
    console.log('⏰ No time specified, applying default time');
    dt = applyDefaultTime(dt, now);
  }

  // ✅ Check if the time is in the past for TODAY
  if (dt.hasSame(now, 'day')) {
    if (dt < now) {
      // Time has passed today - move to tomorrow
      dt = dt.plus({ days: 1 });
      console.log(`⏰ Time ${timeStr} is in the past today, moved to tomorrow`);
    } else {
      console.log(`✅ Time ${timeStr} is in the future today, keeping as today`);
    }
  } else if (dt < now.startOf('day')) {
    // ✅ Only add 7 days for weekdays (Monday, Tuesday, etc.)
    // NOT for explicit dates like "July 20, 2026"
    const lowerDate = dateStr.toLowerCase();
    const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const isWeekday = weekdays.some(day => lowerDate.includes(day));
    
    if (isWeekday) {
      // Weekday was in the past (e.g., "last Friday") - move to next occurrence
      dt = dt.plus({ days: 7 });
      console.log(`📅 Weekday was in the past, moved to next occurrence: ${dt.toISO()}`);
    } else {
      // Explicit date like "July 20, 2026" - keep as-is
      console.log(`📅 Explicit date in the past: "${dateStr}" - keeping as-is`);
    }
  }

  // ✅ Convert to UTC
  const utcDate = dt.toUTC().toJSDate();
  console.log(`✅ Final UTC: ${utcDate.toISOString()}`);

  return utcDate;
}

/**
 * ✅ FIXED: Calculate end time with proper timezone handling
 */
export function calculateEndTime(startTime, endTimeStr, durationStr, timezone) {
  if (!startTime) return null;

  const start = new Date(startTime);
  console.log(`⏱️ Calculating end time from start: ${start.toISOString()}`);

  if (endTimeStr) {
    // ✅ FIXED: Use local date, not UTC date
    const localDate = DateTime
      .fromJSDate(start)
      .setZone(timezone)
      .toFormat('yyyy-MM-dd');
    
    const endDate = parseDateTime(
      localDate,
      endTimeStr,
      timezone
    );
    
    if (endDate) {
      // ✅ If end time is before start time, add a day
      if (endDate <= start) {
        const adjustedEnd = DateTime.fromJSDate(endDate)
          .setZone(timezone)
          .plus({ days: 1 })
          .toJSDate();
        console.log(`✅ End time adjusted (was before start): ${adjustedEnd.toISOString()}`);
        return adjustedEnd;
      }
      console.log(`✅ End time from endTimeStr: ${endDate.toISOString()}`);
      return endDate;
    }
  }

  if (durationStr) {
    const minutes = parseDuration(durationStr);
    if (minutes) {
      const end = new Date(start);
      end.setMinutes(end.getMinutes() + minutes);
      console.log(`✅ End time from duration (${minutes}min): ${end.toISOString()}`);
      return end;
    }
  }

  // Default: 30 minutes after start
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
  parseTimeString,
  parseDuration,
};
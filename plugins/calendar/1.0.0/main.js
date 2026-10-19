// @calendar: dates, worked out on the Mac, on one line (in Chinese or English: like the input, else the input method, else the system).
//   @calendar +10              周二 10月27日 · 10天后 / Tue, Oct 27 · in 10 days
//   @calendar 明天 / tomorrow   also 后天, 大后天, 昨天, 前天, yesterday
//   @calendar 3天前 / -3        also 10, 10d, 10 days, 10天后, 3 days ago
//   @calendar 2w 1个月 1y       weeks, calendar months and years (Jan 31 + 1m = Feb 28)
//   @calendar fri / 周五        the next Friday, today if it is one
//   @calendar next fri / 下周五  Friday of next week; this fri / 本周五, last fri / 上周五 (weeks start on Monday)
//   @calendar 11/3 / 11月3日    that day this year; also nov 3, 3 nov, 2026-11-3, 2026年11月3日, 3号
//   @calendar 11/3+30           a day, then + or - an offset: fri+1w, 明天+3
//   @calendar 12/25 - today     69天（周五 12月25日） / 69 days (Fri, Dec 25)
//   @calendar today to 12/25    the same: B − A for to / 到 / 至 (and from A to B), A − B for -
// Whole days in local time: no clock times or time zones, and nothing leaves the Mac.

const WEEKDAYS_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MAX_OFFSET = 100000;

/** Words for days near today. */
const DAY_WORDS = { today: 0, tomorrow: 1, yesterday: -1, 今天: 0, 今日: 0, 明天: 1, 明日: 1, 昨天: -1, 昨日: -1,
  后天: 2, 大后天: 3, 前天: -2, 大前天: -3 };

// Each pattern starts where the last part ended (the y flag) and skips the spaces before it.
const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?" +
  "|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?(?![a-z])";
const YEAR = "(?:\\s*,?\\s*(\\d{4})(?!\\d))?";
const YMD = /\s*(\d{4})\s*([-/.])\s*(\d{1,2})\s*\2\s*(\d{1,2})(?!\d)/y;            // 2026-11-3
const YMD_ZH = /\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})(?!\d)\s*[日号]?/y;      // 2026年11月3日
const MD_ZH = /\s*(\d{1,2})\s*月\s*(\d{1,2})(?!\d)\s*[日号]?/y;                       // 11月3日
const MD = /\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})(?!\d)/y;                                  // 11/3
const NAME_D = new RegExp("\\s*" + MONTH + "\\s*(\\d{1,2})(?!\\d)" + YEAR, "iy");     // nov 3
const D_NAME = new RegExp("\\s*(\\d{1,2})\\s*" + MONTH + YEAR, "iy");                 // 3 nov
const D_ZH = /\s*(\d{1,2})\s*[号日](?!\s*[以之]?[前后])/y;                             // 3号 (but 3日后 is an offset)
const WEEKDAY_EN = /\s*(?:(next|this|last)\s+)?(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)(?![a-z])/iy;
const WEEKDAY_ZH = /\s*(?:(下|上|本|这)\s*个?\s*)?(?:周|星期|礼拜)\s*([一二三四五六日天1-7])/y;
const DAY_WORD = /\s*(today|tomorrow|yesterday|今天|今日|明天|明日|昨天|昨日|大后天|后天|大前天|前天)(?![a-z])/iy;
// +10, 10d, 10 days, 2w, 1个月, 1y, 3天前, 3 days ago; it must end where another part can begin.
const OFFSET = /\s*([+-])?\s*(\d+)(?!\d)\s*(days?|d|weeks?|wks?|w|months?|mos?|m|years?|yrs?|y|天|日|个?星期|个?礼拜|周|个?月|年)?\s*(ago|later|after|from\s+now|[以之]?[前后])?(?=\s*(?:$|[-+\d]|to(?![a-z])|到|至))/iy;
const FROM = /\s*(?:from(?![a-z])|从)/iy;
const RANGE = /\s*(to(?![a-z])|到|至|-)/iy;
const DASH = /\s*-/y;
const END = /\s*$/y;

// A day is a number, counted from 1970-01-01 with UTC dates: every UTC day is 24 hours long, so a
// daylight-saving change never moves one.

/** 2026, 10, 17 → that day's number. */
function dayOf(y, m, d) {
  const t = new Date(0);
  t.setUTCFullYear(y, m - 1, d);
  return Math.round(t.getTime() / 864e5);
}

/** A day's number → {y, m, d, weekday} (weekday 0 is Sunday). */
function partsOf(day) {
  const t = new Date(day * 864e5);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), weekday: t.getUTCDay() };
}

function lastDayOf(y, m) { return partsOf(dayOf(y, m + 1, 1) - 1).d; }

/** "nov" / "November" → 11. */
function monthOf(name) { return MONTHS_EN.map(m => m.toLowerCase()).indexOf(name.slice(0, 3).toLowerCase()) + 1; }

/** `day` moved by `n` calendar months, kept in the month it lands in (Jan 31 + 1 = Feb 28). */
function addMonths(day, n) {
  const p = partsOf(day);
  const index = p.y * 12 + p.m - 1 + n;
  const y = Math.floor(index / 12), m = index - y * 12 + 1;
  return dayOf(y, m, Math.min(p.d, lastDayOf(y, m)));
}

/** "周二 10月27日" / "Tue, Oct 27", with the year when it isn't this one. */
function dayName(day, today, zh) {
  const p = partsOf(day), otherYear = p.y !== partsOf(today).y;
  if (zh) return WEEKDAYS_ZH[p.weekday] + " " + (otherYear ? p.y + "年" : "") + p.m + "月" + p.d + "日";
  return WEEKDAYS_EN[p.weekday] + ", " + MONTHS_EN[p.m - 1] + " " + p.d + (otherYear ? ", " + p.y : "");
}

/** One day, and how far it is from today. */
function dayLine(day, today, zh) {
  const n = day - today;
  let when;
  if (zh) when = { "-2": "前天", "-1": "昨天", 0: "今天", 1: "明天", 2: "后天" }[n] || (n > 0 ? n + "天后" : -n + "天前");
  else when = { "-1": "yesterday", 0: "today", 1: "tomorrow" }[n] || (n > 0 ? "in " + n + " days" : -n + " days ago");
  return dayName(day, today, zh) + " · " + when;
}

/** The days between two days (`n` may be negative), and the later of them. */
function spanLine(n, later, today, zh) {
  const count = Math.abs(n);
  if (zh) return (n < 0 ? "已过 " : "") + count + "天（" + dayName(later, today, true) + "）";
  return count + (count === 1 ? " day" : " days") + (n < 0 ? " ago" : "") + " (" + dayName(later, today, false) + ")";
}

/** The line for `input`, worked out from `now` (a local Date); throws an Error with the line to show. */
function dateFor(input, now, lang) {
  const zh = lang === "zh";
  const today = dayOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const year = partsOf(today).y, month = partsOf(today).m;
  const text = String(input == null ? "" : input).normalize("NFKC")
    .replace(/[−–—]/g, "-").replace(/[\s=?]+$/, "").trim();
  const bare = /^\d+$/.test(text);  // "10" alone is in 10 days
  let pos = 0;

  function take(pattern) {
    pattern.lastIndex = pos;
    const match = pattern.exec(text);
    if (match) pos = pattern.lastIndex;
    return match;
  }

  function fail() {
    throw new Error((zh ? "看不懂这个日期：" : "Can't read this date: ") + (text.slice(pos).trim() || text));
  }

  function check(y, m, d) {
    if (m >= 1 && m <= 12 && d >= 1 && d <= lastDayOf(y, m)) return dayOf(y, m, d);
    const pad = (n, width) => String(n).padStart(width, "0");
    throw new Error(zh ? "没有这一天：" + y + "-" + m + "-" + d
      : "No such date: " + pad(y, 4) + "-" + pad(m, 2) + "-" + pad(d, 2));
  }

  /** Weekday `wd` (0 is Sunday): the next one, or the one of this / next / last week (from Monday). */
  function weekday(which, wd) {
    const dow = partsOf(today).weekday;
    if (!which) return today + (wd - dow + 7) % 7;
    const monday = today - (dow + 6) % 7;
    return monday + (wd + 6) % 7 + ({ next: 7, 下: 7, last: -7, 上: -7 }[which.toLowerCase()] || 0);
  }

  /** A date, weekday or word for a day; null if there's none here. */
  function base() {
    let m;
    if ((m = take(YMD))) return check(+m[1], +m[3], +m[4]);
    if ((m = take(YMD_ZH))) return check(+m[1], +m[2], +m[3]);
    if ((m = take(MD_ZH) || take(MD))) return check(year, +m[1], +m[2]);
    if ((m = take(NAME_D))) return check(m[3] ? +m[3] : year, monthOf(m[1]), +m[2]);
    if ((m = take(D_NAME))) return check(m[3] ? +m[3] : year, monthOf(m[2]), +m[1]);
    if ((m = take(D_ZH))) return check(year, month, +m[1]);
    if ((m = take(WEEKDAY_EN))) return weekday(m[1], WEEKDAYS_EN.map(w => w.slice(0, 2).toLowerCase()).indexOf(m[2].slice(0, 2).toLowerCase()));
    if ((m = take(WEEKDAY_ZH))) return weekday(m[1], /\d/.test(m[2]) ? m[2] % 7 : "日一二三四五六天".indexOf(m[2]) % 7);
    if ((m = take(DAY_WORD))) return today + DAY_WORDS[m[1].toLowerCase()];
    return null;
  }

  /** `day` moved by the offset here (+10, 2w, 3天前…); null if there's none. */
  function offset(day, origin) {
    const start = pos;
    const m = take(OFFSET);
    if (!m) return null;
    const sign = m[1], unit = m[3], way = m[4];
    // Unsigned, a number needs a unit (3日 and 11月 are dates); "10" is days only as the whole input.
    if (!sign && !way && (unit ? /^[日月]$/.test(unit) : !bare)) { pos = start; return null; }
    const tooFar = () => new Error((zh ? "太远了，最多 ±" + MAX_OFFSET + " 天：" : "Too far, at most ±" + MAX_OFFSET + " days: ")
      + text.slice(start, pos).trim());
    if (+m[2] > MAX_OFFSET) throw tooFar();
    const n = +m[2] * (sign === "-" ? -1 : 1) * (way && /^(ago|[以之]?前)$/i.test(way) ? -1 : 1);
    const u = unit ? unit.toLowerCase().replace("个", "")[0] : "d";
    const months = { m: 1, 月: 1, y: 12, 年: 12 }[u];
    const next = months ? addMonths(day, n * months) : day + n * ({ w: 7, 星: 7, 礼: 7, 周: 7 }[u] || 1);
    if (Math.abs(next - origin) > MAX_OFFSET) throw tooFar();
    return next;
  }

  /** A day: a date, weekday or word, then any offsets; or offsets from today. */
  function point() {
    const start = pos;
    const from = base();
    const origin = from === null ? today : from;
    let day = origin, read = from !== null;
    for (;;) {
      const at = pos;
      if (read && take(DASH) && base() !== null) { pos = at; break; }  // "A - B": the days between
      pos = at;
      const next = offset(day, origin);
      if (next === null) break;
      day = next;
      read = true;
    }
    if (!read) { pos = start; fail(); }
    return day;
  }

  if (text === "") return dayLine(today, today, zh);
  const fromWord = take(FROM);
  const a = point();
  const range = take(RANGE);
  if (fromWord && !range) fail();
  const b = range ? point() : null;
  if (!take(END)) fail();
  if (!range) return dayLine(a, today, zh);
  return spanLine(range[1] === "-" ? a - b : b - a, Math.max(a, b), today, zh);
}

/** Chinese if the input has any, or if the system is in Chinese; otherwise English. */
/** Chinese input answers in Chinese; else the input method's own language when it says (`context.language`,
 *  from 0.6.5), else the system's. */
function languageFor(input, context) {
  if (/[　-〿぀-ヿ㐀-䶿一-鿿豈-﫿＀-￯]/.test(String(input))) return "zh";
  var told = context && typeof context === "object" ? context.language : undefined;
  if (told === "zh" || told === "en") return told;
  try {
    if (/^zh/i.test(Intl.DateTimeFormat().resolvedOptions().locale)) return "zh";
  } catch (e) {}
  return "en";
}

function run(input, context) {
  return dateFor(input, new Date(), languageFor(input, context));
}

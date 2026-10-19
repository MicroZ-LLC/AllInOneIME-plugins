// @calculator: arithmetic worked out on this Mac, offline (nothing is sent anywhere), on one line.
//   @calculator 23*17               391
//   @calculator 0.1+0.2             0.3      + - * /, % and whole powers are exact: 2^100 → 1267650600228229401496703205376
//   @calculator 100+10%             110      a percentage added or subtracted is one of what comes before: 100-10% → 90
//   @calculator 200*5%              10       anywhere else it is a number: 50% → 0.5
//   @calculator 2^3^2               512      ^ or **, right to left and before signs: -2^2 → -4, 2^-1 → 0.5
//   @calculator sqrt(2)             1.4142135623731
//   @calculator round(2.675, 2)     2.68     sqrt abs round floor ceil ln log exp sin cos tan min max pow, pi (π), e
//   @calculator （２＋３）×４          20       full-width digits and signs from Chinese typing; × ÷; a trailing = is ignored
//   @calculator 23*17 元             391 元   inside a sentence: the result, then the rest as typed (23*17. Done → 391. Done)
// log is base 10, angles are radians, names in any case. Results have no float noise or trailing zeros:
// 15 significant digits unless exact (1/3 → 0.333333333333333, 2^200 → 1.60693804425899e+60).
// A port of the app's own calculator (Calculator.swift, the built-in @calculate until 0.6.5): the same rules,
// results and errors. Errors are in Chinese if the input has a CJK character, else in the input method's
// language (from AllInOneIME 0.6.5: run(input, {language: "zh" | "en"})), else in the system's.

/** `input` worked out, as one line; errors in the language for it. */
function run(input, context) {
  return calculate(input, languageFor(input, context));
}

/** `input` worked out: "23*17" → "391", "23*17 元" → "391 元". Throws an Error in `lang`, "zh" or "en". */
function calculate(input, lang) {
  return Calculator.calculate(input, lang);
}

/** "zh" if `input` has a CJK character; else the input method's language, `context.language`; else the system's. */
function languageFor(input, context) {
  const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}\u3000-\u303F\uFF00-\uFFEF]/u;
  if (cjk.test(input == null ? "" : String(input))) return "zh";
  try {
    const language = context && context.language;
    if (language === "zh" || language === "en") return language;
  } catch (e) {}
  try {
    if (String(Intl.DateTimeFormat().resolvedOptions().locale).startsWith("zh")) return "zh";
  } catch (e) {}
  return "en";
}

const Calculator = (function () {
  "use strict";

  /** Longest expression worked out, in characters. */
  const maxLength = 1000;
  /** Deepest nesting of parentheses, function calls and powers. */
  const maxDepth = 50;

  // MARK: - Errors

  class CalcError {
    constructor(kind, detail) {
      this.kind = kind;
      this.detail = detail;
    }
  }

  function fail(kind, detail) {
    return new CalcError(kind, detail);
  }

  /** The app's wording (UIText), in Chinese or English. */
  function message(error, zh) {
    const d = error.detail;
    switch (error.kind) {
      case "empty": return zh ? "没有要算的式子" : "Nothing to calculate";
      case "tooLong": return zh ? "算式太长：最多 " + maxLength + " 个字符" : "The expression is too long: " + maxLength + " characters at most";
      case "tooDeep": return zh ? "算式嵌套太深：最多 " + maxDepth + " 层" : "The expression is nested too deeply: " + maxDepth + " levels at most";
      case "unexpected": return zh ? "算式有误：「" + d + "」这里不对" : "Invalid expression near \"" + d + "\"";
      case "incomplete": return zh ? "算式不完整" : "The expression is incomplete";
      case "missingParenthesis": return zh ? "缺少右括号" : "A closing parenthesis is missing";
      case "unknownName": return zh ? "不认识的函数或常数：" + d : "Unknown function or constant: " + d;
      case "badArguments": return zh ? d + " 的参数不对" : "Wrong arguments for " + d;
      case "divisionByZero": return zh ? "不能除以 0" : "Division by zero";
      default: return zh ? "结果不是有限的实数" : "The result isn't a finite real number";
    }
  }

  function calculate(input, lang) {
    try {
      return work(input == null ? "" : String(input));
    } catch (error) {
      if (error instanceof CalcError) throw new Error(message(error, lang === "zh"));
      throw error;
    }
  }

  /** The expression; or, when plain text follows the expression at its start, its result and then the text. */
  function work(text) {
    const typed = characters(text, maxLength);
    if (typed.length > maxLength) throw fail("tooLong");
    const chars = typed.map(halfWidth);
    const { end, stop } = expressionEnd(chars);
    if (end > 0 && end < chars.length && textFollows(chars, end, stop)) {
      return evaluate(typed.slice(0, end)) + typed.slice(end).join("");
    }
    return evaluate(typed);
  }

  // MARK: - Inside a sentence

  /** Where the expression at the start ends, as the app finds it inside a sentence (Calculator.argument): before
   *  other text, a word that isn't a function or constant, a `,` or `)` that closes nothing, or periods at its
   *  end; spaces after it stay with the rest. `stop` is where the scan stopped. `end` is 0 if no expression starts. */
  function expressionEnd(chars) {
    let i = 0, end = 0, depth = 0;
    scan: while (i < chars.length) {
      const c = chars[i];
      if (isWhitespace(c)) {
        i += 1;
        continue;
      }
      if (isDigit(c) || c === ".") {
        i = number(chars, i).end;
      } else if (isLetter(c)) {
        const j = wordEnd(chars, i);
        if (!isName(chars.slice(i, j).join(""))) break scan;
        i = j;
      } else if (c === "(") {
        depth += 1;
        i += 1;
      } else if (c === ")" || c === ",") {
        if (depth === 0) break scan;
        if (c === ")") depth -= 1;
        i += 1;
      } else if (SYMBOLS.has(c) || c === "π") {
        i += 1;
      } else {
        break scan;
      }
      end = i;
    }
    while (end > 0 && (chars[end - 1] === "." || isWhitespace(chars[end - 1]))) end -= 1;
    return { end, stop: i };
  }

  /** Whether what stopped the expression is plain text: a word, CJK, sentence punctuation (`. , ! ? ; : )`, also
   *  full-width), or a period at its end. Not a stray symbol such as `=` or `&`: then the whole input is the
   *  expression, with its error. */
  function textFollows(chars, end, stop) {
    if (stop === chars.length) return chars.slice(end).indexOf(".") >= 0;
    const c = chars[stop];
    return isLetter(c) || PUNCTUATION.has(c) || !isAscii(c);
  }

  const PUNCTUATION = new Set([".", ",", "!", "?", ";", ":", ")"]);

  // MARK: - Reading

  const FUNCTIONS = new Set(["sqrt", "abs", "round", "floor", "ceil", "ln", "log", "exp", "sin", "cos", "tan", "min", "max", "pow"]);
  const CONSTANTS = new Set(["pi", "e"]);

  /** Operators and punctuation, after `halfWidth` (`**` is a power too). */
  const SYMBOLS = new Map([
    ["+", "+"], ["-", "-"], ["−", "-"], ["*", "*"], ["×", "*"], ["/", "/"], ["÷", "/"],
    ["^", "^"], ["%", "%"], ["(", "("], [")", ")"], [",", ","],
  ]);

  /** A character as Swift counts them (a grapheme cluster: "é" written with a combining accent, "👍🏽", "\r\n"). */
  const CHARACTER = /\r\n|\p{Regional_Indicator}{2}|[\s\S](?:\u200D\p{Extended_Pictographic}|[\p{M}\u200C\u200D\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}])*/gu;

  /** `text` as characters, `limit` + 1 at most. */
  function characters(text, limit) {
    const result = [];
    CHARACTER.lastIndex = 0;
    let match;
    while (result.length <= limit && (match = CHARACTER.exec(text)) !== null) result.push(match[0]);
    return result;
  }

  /** Swift's Character.isWhitespace: its first scalar is White_Space. */
  function isWhitespace(c) {
    return /^[\t\n\v\f\r \u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/.test(c);
  }

  function isAscii(c) {
    return c === "\r\n" || (c.length === 1 && c.charCodeAt(0) < 0x80);
  }

  function isDigit(c) {
    return c.length === 1 && c >= "0" && c <= "9";
  }

  function isLetter(c) {
    return c.length === 1 && ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z"));
  }

  /** A full-width form as its ASCII character, as Chinese typing gives them: "２" → "2", "（" → "(", "　" → " ". */
  function halfWidth(c) {
    if (c.length !== 1) return c;
    const code = c.charCodeAt(0);
    if (code >= 0xFF01 && code <= 0xFF5E) return String.fromCharCode(code - 0xFEE0);
    if (code === 0x3000) return " ";
    return c;
  }

  function isName(word) {
    const name = word.toLowerCase();
    return FUNCTIONS.has(name) || CONSTANTS.has(name);
  }

  /** Where the name starting at `start` ends: a letter, then letters and digits (`log10` is one name). */
  function wordEnd(chars, start) {
    let j = start + 1;
    while (j < chars.length && (isLetter(chars[j]) || isDigit(chars[j]))) j += 1;
    return j;
  }

  /** The number starting at `start` (digits, a point and more digits, an exponent: `1.5e-3`) as an ASCII literal
   *  ("0.5" for ".5", "5" for "5."), and where it ends. */
  function number(chars, start) {
    let i = start;
    const digits = () => {
      const from = i;
      while (i < chars.length && isDigit(chars[i])) i += 1;
      return chars.slice(from, i).join("");
    };
    const whole = digits();
    let fraction = "";
    if (i < chars.length && chars[i] === ".") {
      i += 1;
      fraction = digits();
    }
    let exponent = "";
    if (i < chars.length && (chars[i] === "e" || chars[i] === "E")) {
      // Only with digits after it: in `2e` the e is the constant.
      let j = i + 1;
      let sign = "";
      if (j < chars.length && (chars[j] === "+" || chars[j] === "-")) {
        sign = chars[j];
        j += 1;
      }
      const from = j;
      while (j < chars.length && isDigit(chars[j])) j += 1;
      if (j > from) {
        exponent = "e" + sign + chars.slice(from, j).join("");
        i = j;
      }
    }
    return { end: i, literal: (whole === "" ? "0" : whole) + (fraction === "" ? "" : "." + fraction) + exponent };
  }

  /** Tokens: {kind, value, text}; `text` as typed, for error messages. */
  function tokens(typed) {
    const chars = typed.map(halfWidth);
    const result = [];
    let i = 0;
    while (i < chars.length) {
      const c = chars[i];
      if (isWhitespace(c)) {
        i += 1;
        continue;
      }
      const start = i;
      let kind, value;
      if (isDigit(c) || (c === "." && i + 1 < chars.length && isDigit(chars[i + 1]))) {
        const read = number(chars, i);
        kind = "number";
        value = read.literal;
        i = read.end;
      } else if (isLetter(c)) {
        i = wordEnd(chars, i);
        kind = "name";
        value = chars.slice(start, i).join("").toLowerCase();
      } else if (c === "π") {
        kind = "name";
        value = "pi";
        i += 1;
      } else if (c === "*" && i + 1 < chars.length && chars[i + 1] === "*") {
        kind = "^";
        i += 2;
      } else if (SYMBOLS.has(c)) {
        kind = SYMBOLS.get(c);
        i += 1;
      } else {
        throw fail("unexpected", typed[i]);
      }
      result.push({ kind, value, text: typed.slice(start, i).join("") });
    }
    return result;
  }

  /** A token as an error message quotes it. */
  function shortened(text) {
    const chars = characters(text, 16);
    return chars.length > 16 ? chars.slice(0, 16).join("") + "…" : text;
  }

  /** `typed` (characters) worked out, as it is inserted: "23*17" → "391". */
  function evaluate(typed) {
    if (typed.length > maxLength) throw fail("tooLong");
    // Spaces around it, and an "=" at its end (a calculator habit: "23*17=").
    let start = 0, end = typed.length;
    while (end > 0 && (isWhitespace(typed[end - 1]) || halfWidth(typed[end - 1]) === "=")) end -= 1;
    while (start < end && isWhitespace(typed[start])) start += 1;
    if (start === end) throw fail("empty");
    return format(parse(tokens(typed.slice(start, end))));
  }

  /** Recursive descent: sum → product → signed → power → percent → primary. Only parentheses, calls and powers
   *  recurse (counted against `maxDepth`); runs of signs and operators are loops. An operand is {value,
   *  isPercentage}: a value with `%` after it that isn't multiplied, divided or raised, which `sum` adds or
   *  subtracts as a part of what comes before. */
  function parse(tokens) {
    let index = 0, depth = 0;
    const next = () => (index < tokens.length ? tokens[index].kind : null);
    const here = () => shortened(tokens[index].text);

    function enter() {
      depth += 1;
      if (depth > maxDepth) throw fail("tooDeep");
    }

    // Terms added and subtracted, left to right; a ± b% is a ± a×b/100, as on a calculator.
    function sum() {
      let value = product().value;
      let op;
      while ((op = next()) === "+" || op === "-") {
        index += 1;
        const term = product();
        const change = term.isPercentage ? times(value, term.value) : term.value;
        value = op === "+" ? plus(value, change) : minus(value, change);
      }
      return value;
    }

    // Factors multiplied and divided, left to right.
    function product() {
      const first = signed();
      let value = first.value, isPercentage = first.isPercentage;
      let op;
      while ((op = next()) === "*" || op === "/") {
        index += 1;
        const factor = signed().value;
        value = op === "*" ? times(value, factor) : divide(value, factor);
        isPercentage = false;
      }
      return { value, isPercentage };
    }

    // Signs before a power: `-2^2` is −(2^2), `--3` is 3.
    function signed() {
      let negative = false;
      let op;
      while ((op = next()) === "+" || op === "-") {
        if (op === "-") negative = !negative;
        index += 1;
      }
      const operand = power();
      return { value: negative ? negate(operand.value) : operand.value, isPercentage: operand.isPercentage };
    }

    // `a^b`, right to left (`2^3^2` is 2^9); the exponent may have a sign (`2^-1`).
    function power() {
      const base = percent();
      if (next() !== "^") return base;
      index += 1;
      enter();
      const value = raised(base.value, signed().value);
      depth -= 1;
      return { value, isPercentage: false };
    }

    // `50%` is 0.5.
    function percent() {
      let value = primary();
      let isPercentage = false;
      while (next() === "%") {
        index += 1;
        value = divide(value, HUNDRED);
        isPercentage = true;
      }
      return { value, isPercentage };
    }

    // A number, a constant, a function call or an expression in parentheses.
    function primary() {
      if (index >= tokens.length) throw fail("incomplete");
      const token = tokens[index];
      index += 1;
      switch (token.kind) {
        case "number":
          return fromLiteral(token.value);
        case "(": {
          enter();
          const value = sum();
          close();
          depth -= 1;
          return value;
        }
        case "name": {
          if (token.value === "pi") return Math.PI;
          if (token.value === "e") return Math.exp(1);
          const typed = shortened(token.text);
          if (!FUNCTIONS.has(token.value)) throw fail("unknownName", typed);
          // A function takes its arguments in parentheses: `sqrt(4)`, not `sqrt 4`.
          if (next() !== "(") throw fail("badArguments", typed);
          index += 1;
          enter();
          const args = [];
          if (next() !== ")") {
            args.push(sum());
            while (next() === ",") {
              index += 1;
              args.push(sum());
            }
          }
          close();
          depth -= 1;
          return call(token.value, args, typed);
        }
        default:
          throw fail("unexpected", shortened(token.text));
      }
    }

    // The `)` that ends a group or a call.
    function close() {
      const kind = next();
      if (kind === null) throw fail("missingParenthesis");
      if (kind !== ")") throw fail("unexpected", here());
      index += 1;
    }

    if (tokens.length === 0) throw fail("empty");
    const value = sum();
    if (index < tokens.length) throw fail("unexpected", here());
    return value;
  }

  // MARK: - Working out

  // A value is an exact decimal while the arithmetic keeps it one ({neg, m, e}: a sign, a BigInt mantissa and a
  // power of ten), otherwise a Double (a JS number).

  /** Where decimal arithmetic is used. Foundation's Decimal holds 38 digits only from about 1e-90 on, and past
   *  its ends products and quotients can go wrong: there, Doubles. */
  function inDecimalRange(x) {
    return x >= 1e-90 && x <= 1e125;
  }

  function finite(x) {
    if (!Number.isFinite(x)) throw fail("notFinite");
    return x;
  }

  function isDecimal(v) {
    return typeof v !== "number";
  }

  function toDouble(v) {
    if (!isDecimal(v)) return v;
    return v.m === 0n ? 0 : Number((v.neg ? "-" : "") + v.m + "e" + v.e);
  }

  function isZero(v) {
    return isDecimal(v) ? v.m === 0n : v === 0;
  }

  function negate(v) {
    if (!isDecimal(v)) return -v;
    return v.m === 0n ? v : { neg: !v.neg, m: v.m, e: v.e };
  }

  function magnitude(v) {
    return isDecimal(v) ? { neg: false, m: v.m, e: v.e } : Math.abs(v);
  }

  function less(a, b) {
    if (isDecimal(a) && isDecimal(b)) return compareDecimals(a, b) < 0;
    return toDouble(a) < toDouble(b);
  }

  /** A literal from `number`: a decimal, exactly, when it is in the decimal range. */
  function fromLiteral(literal) {
    const estimate = Number(literal);
    if (Number.isNaN(estimate)) throw fail("unexpected", literal);
    const value = finite(estimate);
    const parts = literal.split("e");
    const mantissa = parts[0].split(".");
    const fraction = mantissa.length > 1 ? mantissa[1] : "";
    const digits = (mantissa[0] + fraction).replace(/^0+/, "");
    if (digits === "") return ZERO;
    if (estimate !== 0 && inDecimalRange(Math.abs(estimate))) {
      // Decimal(string:): the leading digits that fit in the mantissa; the others only count as tens.
      let m = 0n, dropped = 0;
      for (const digit of digits) {
        const longer = m * 10n + BigInt(digit);
        if (dropped === 0 && longer < LIMIT) m = longer;
        else dropped += 1;
      }
      const exact = makeDecimal(false, m, Number(parts.length > 1 ? parts[1] : "0") + dropped - fraction.length);
      if (exact !== null) return exact;
    }
    return value;
  }

  /** `operation` on two decimals while the result stays in the decimal range, else `double` on Doubles. A product
   *  or quotient must also agree with the Double estimate (`checked`), as in the app. */
  function combine(a, b, checked, operation, double) {
    const estimate = double(toDouble(a), toDouble(b));
    if (isDecimal(a) && isDecimal(b) && (estimate === 0 || inDecimalRange(Math.abs(estimate)))) {
      const result = operation(a, b);
      if (result !== null && (!checked || agrees(result, estimate))) return result;
    }
    return finite(estimate);
  }

  function agrees(value, estimate) {
    return Math.abs(toDouble(value) - estimate) <= Math.abs(estimate) * 1e-9;
  }

  /** A sum of Doubles that cancels to within their rounding error is 0: `sqrt(2)^2 - 2`. */
  function cancelled(sum, x, y) {
    return Math.abs(sum) < Math.max(Math.abs(x), Math.abs(y)) * 1e-15 ? 0 : sum;
  }

  function plus(a, b) {
    return combine(a, b, false, addDecimals, (x, y) => cancelled(x + y, x, y));
  }

  function minus(a, b) {
    return combine(a, b, false, (x, y) => addDecimals(x, negate(y)), (x, y) => cancelled(x - y, x, y));
  }

  function times(a, b) {
    return combine(a, b, true, multiplyDecimals, (x, y) => x * y);
  }

  function divide(a, b) {
    if (isZero(b)) throw fail("divisionByZero");
    return combine(a, b, true, divideDecimals, (x, y) => x / y);
  }

  /** A whole decimal within ±1e15, as a number; else null. */
  function wholeNumber(d) {
    if (d.m === 0n) return 0;
    if (d.e < 0 || d.m * tenTo(d.e) > 1000000000000000n) return null;
    const n = Number(d.m * tenTo(d.e));
    return d.neg ? -n : n;
  }

  /** `base` to the power `exponent`: exact for a decimal to a whole power in the decimal range, else pow on Doubles. */
  function raised(base, exponent) {
    const estimate = pow(toDouble(base), toDouble(exponent));
    if (isZero(base) && (estimate === Infinity || estimate === -Infinity)) throw fail("divisionByZero"); // 0^-1
    if (isDecimal(base) && isDecimal(exponent)) {
      const n = wholeNumber(exponent);
      if (n !== null && (estimate === 0 ? isZero(base) : inDecimalRange(Math.abs(estimate)))) {
        const exact = decimalPower(base, n);
        if (exact !== null && agrees(exact, estimate)) return exact;
      }
    }
    return finite(estimate);
  }

  /** Rounded to `scale` decimals (negative: to tens, hundreds…): "plain" rounds halves away from zero, "down" and
   *  "up" are floor and ceiling. */
  function rounded(v, scale, mode) {
    if (isDecimal(v)) return roundDecimal(v, scale, mode);
    const factor = Number("1e" + scale);
    const scaled = v * factor;
    // From 2^53 on every Double is whole: nothing left to round there.
    if (!Number.isFinite(scaled) || Math.abs(scaled) >= 9007199254740992) return v;
    let whole;
    if (mode === "down") whole = Math.floor(scaled);
    else if (mode === "up") whole = Math.ceil(scaled);
    else {
      whole = Math.trunc(scaled);
      if (Math.abs(scaled - whole) >= 0.5) whole += scaled < 0 ? -1 : 1;
    }
    return whole / factor;
  }

  /** A function applied to its arguments. */
  function call(name, args, typed) {
    const only = () => {
      if (args.length !== 1) throw fail("badArguments", typed);
      return args[0];
    };
    const real = f => finite(f(toDouble(only())));
    switch (name) {
      case "sqrt": return real(Math.sqrt);
      case "ln": return real(Math.log);
      case "log": return real(Math.log10);
      case "exp": return real(Math.exp);
      case "sin": case "cos": case "tan": return finite(trigonometry(name, toDouble(only())));
      case "abs": return magnitude(only());
      case "floor": return rounded(only(), 0, "down");
      case "ceil": return rounded(only(), 0, "up");
      case "round": {
        if (args.length < 1 || args.length > 2) throw fail("badArguments", typed);
        let scale = 0;
        if (args.length === 2) {
          // Whole decimals to keep; negative ones round to tens, hundreds…
          const n = isDecimal(args[1]) ? wholeNumber(args[1]) : null;
          if (n === null || Math.abs(n) > 100) throw fail("badArguments", typed);
          scale = n;
        }
        return rounded(args[0], scale, "plain");
      }
      case "min": case "max": {
        if (args.length === 0) throw fail("badArguments", typed);
        let best = args[0];
        for (const value of args.slice(1)) {
          if (name === "min" ? less(value, best) : less(best, value)) best = value;
        }
        return best;
      }
      case "pow":
        if (args.length !== 2) throw fail("badArguments", typed);
        return raised(args[0], args[1]);
      default:
        throw fail("unknownName", typed);
    }
  }

  /** sin, cos or tan of `x` radians without the noise an inexact π leaves: `sin(pi)` and `cos(pi/2)` are 0, and
   *  `tan(pi/2)` is undefined. */
  function trigonometry(name, x) {
    const clean = value => (Math.abs(x) < 1e9 && Math.abs(value) < Math.abs(x) * 1e-15 ? 0 : value);
    if (name === "sin") return clean(Math.sin(x));
    if (name === "cos") return clean(Math.cos(x));
    if (clean(Math.cos(x)) === 0) throw fail("notFinite");
    return clean(Math.sin(x)) === 0 ? 0 : Math.tan(x);
  }

  // MARK: - Doubles, as the system's libm and printf give them

  const bitsView = new DataView(new ArrayBuffer(8));

  /** |x| as [m, e], m·2^e exactly (m a BigInt). */
  function binary(x) {
    bitsView.setFloat64(0, Math.abs(x));
    const high = bitsView.getUint32(0), low = bitsView.getUint32(4);
    const biased = high >>> 20;
    const fraction = (BigInt(high & 0xFFFFF) << 32n) | BigInt(low);
    return biased === 0 ? [fraction, -1074] : [fraction | (1n << 52n), biased - 1075];
  }

  /** n·2^k (n > 0) as the nearest Double, halves to even. */
  function nearest(n, k) {
    const bits = n.toString(2).length;
    const top = bits - 1 + k;
    if (top > 1023) return Infinity;
    const drop = bits - Math.min(53, top + 1075); // subnormals keep fewer bits
    if (drop <= 0) return timesTwoTo(Number(n), k);
    let q = n >> BigInt(drop);
    const rest = n - (q << BigInt(drop)), half = 1n << BigInt(drop - 1);
    if (rest > half || (rest === half && (q & 1n) === 1n)) q += 1n;
    return timesTwoTo(Number(q), k + drop);
  }

  /** x·2^e, exact when the result is a Double. */
  function timesTwoTo(x, e) {
    while (e < -1000) {
      x *= Math.pow(2, -1000);
      e += 1000;
    }
    return x * Math.pow(2, e);
  }

  /** pow(x, y). JavaScriptCore multiplies out whole powers from 2 to 1000 itself, a few ulps off the system's
   *  pow; those are worked out exactly and rounded once here. */
  function pow(x, y) {
    if (!(Number.isInteger(y) && y >= 2 && y <= 1000 && Number.isFinite(x) && x !== 0)) return Math.pow(x, y);
    let [m, e] = binary(x);
    while ((m & 1n) === 0n) {
      m >>= 1n;
      e += 1;
    }
    const result = nearest(m ** BigInt(y), e * y);
    return x < 0 && y % 2 === 1 ? -result : result;
  }

  /** String(format: "%.14e", x): 15 digits and the power of ten of the first, rounded exactly, halves to even. */
  function scientific(x) {
    const negative = x < 0 || Object.is(x, -0);
    if (x === 0) return { negative, digits: "000000000000000", exponent: 0 };
    const [m, e] = binary(x);
    // |x| = digits × 10^tens
    const digits = e >= 0 ? (m << BigInt(e)).toString() : (m * 5n ** BigInt(-e)).toString();
    const tens = e >= 0 ? 0 : e;
    let exponent = digits.length - 1 + tens;
    if (digits.length <= 15) return { negative, digits: digits.padEnd(15, "0"), exponent };
    let kept = BigInt(digits.slice(0, 15));
    const first = digits.charCodeAt(15) - 48;
    const beyond = /[1-9]/.test(digits.slice(16));
    if (first > 5 || (first === 5 && (beyond || (kept & 1n) === 1n))) kept += 1n;
    let shown = kept.toString();
    if (shown.length > 15) {
      shown = shown.slice(0, 15);
      exponent += 1;
    }
    return { negative, digits: shown, exponent };
  }

  // MARK: - Decimal, as Foundation's
  //
  // A sign, a mantissa of up to 128 bits (8 words of 16 bits: 38 digits and some) and a power of ten from -128 to
  // 127, with Foundation's rules for when digits are cut. Values here are compact: no trailing zeros in the mantissa.

  const LIMIT = 1n << 128n; // a mantissa fits in 8 words
  const ZERO = { neg: false, m: 0n, e: 0 };
  const ONE = { neg: false, m: 1n, e: 0 };
  const HUNDRED = { neg: false, m: 1n, e: 2 };

  function tenTo(n) {
    return 10n ** BigInt(n);
  }

  /** How many 16-bit words the mantissa takes. */
  function words(m) {
    return m === 0n ? 0 : Math.ceil(m.toString(16).length / 4);
  }

  /** A decimal, compacted; null when its exponent is out of range (Foundation's overflow or underflow). */
  function makeDecimal(neg, m, e) {
    if (m === 0n) return ZERO;
    while (m % 10n === 0n) {
      m /= 10n;
      e += 1;
    }
    while (e > 127 && m * 10n < LIMIT) {
      m *= 10n;
      e -= 1;
    }
    return e < -128 || e > 127 ? null : { neg, m, e };
  }

  /** A mantissa cut to 8 words (fitMantissa): the last digits dropped, not rounded, as Foundation does here. */
  function fit(m, e) {
    while (m >= LIMIT) {
      m /= 10n;
      e += 1;
    }
    return [m, e];
  }

  /** `a` and `b` with one exponent (NSDecimalNormalize): the one with the larger exponent gets more digits. If they
   *  don't fit, it gets about as many as surely do (4.8 a free word), and the other one loses its last digits. */
  function normalize(a, b) {
    if (a.e === b.e) return [a, b];
    const swap = a.e < b.e;
    let large = swap ? b : a, small = swap ? a : b;
    const diff = large.e - small.e;
    const scaled = large.m * tenTo(diff);
    if (scaled < LIMIT) {
      large = { neg: large.neg, m: scaled, e: small.e };
    } else {
      const most = Math.floor((8 - words(large.m)) * 4.81647993);
      const m = small.m / tenTo(diff - most);
      if (m === 0n) {
        small = { neg: small.neg, m, e: large.e };
      } else {
        small = { neg: small.neg, m, e: large.e - most };
        large = { neg: large.neg, m: large.m * tenTo(most), e: large.e - most };
      }
    }
    return swap ? [small, large] : [large, small];
  }

  function addDecimals(a, b) {
    if (a.m === 0n) return b;
    if (b.m === 0n) return a;
    const [x, y] = normalize(a, b);
    if (x.m === 0n) return y;
    if (y.m === 0n) return x;
    if (x.neg === y.neg) {
      const [m, e] = fit(x.m + y.m, x.e);
      return makeDecimal(x.neg, m, e);
    }
    if (x.m === y.m) return ZERO;
    return x.m > y.m ? makeDecimal(x.neg, x.m - y.m, x.e) : makeDecimal(y.neg, y.m - x.m, x.e);
  }

  function multiplyDecimals(a, b) {
    if (a.m === 0n || b.m === 0n) return ZERO;
    const [m, e] = fit(a.m * b.m, a.e + b.e);
    return makeDecimal(a.neg !== b.neg, m, e);
  }

  /** The dividend's mantissa times 10^38, divided by the divisor's, and cut to fit (NSDecimalDivide). */
  function divideDecimals(a, b) {
    if (b.m === 0n) return null;
    if (a.m === 0n) return ZERO;
    let x = a, y = b;
    if (a.e - b.e >= 19) {
      [x, y] = normalize(a, b);
      if (x.m === 0n || y.m === 0n) [x, y] = [a, b];
    }
    const [m, shift] = fit((x.m * tenTo(38)) / y.m, 0);
    const e = x.e - y.e - 38 + shift;
    return e < -128 || e > 127 ? null : makeDecimal(a.neg !== b.neg, m, e);
  }

  /** `base` to the whole power `n` (NSDecimalPower, squaring; 1/x for a negative `n`), or null. */
  function decimalPower(base, n) {
    let p = Math.abs(n);
    let result;
    if (p === 0) result = ONE;
    else if (p === 1) result = base;
    else {
      let x = base, t = ONE;
      while (p > 1) {
        if (p % 2 === 1) {
          t = multiplyDecimals(t, x);
          if (t === null) return null;
          p -= 1;
        }
        if (p !== 0) {
          x = multiplyDecimals(x, x);
          if (x === null) return null;
          p /= 2;
        }
      }
      result = multiplyDecimals(x, t);
    }
    return result === null || n >= 0 ? result : divideDecimals(ONE, result);
  }

  /** NSDecimalRound: to `scale` decimals, "plain" (halves away from zero), "down" (floor) or "up" (ceiling). */
  function roundDecimal(d, scale, mode) {
    const drop = -(scale + d.e);
    if (drop <= 0) return d;
    const unit = tenTo(drop);
    let m = d.m / unit;
    const rest = d.m % unit;
    if (rest !== 0n && (mode === "plain" ? rest * 2n >= unit : mode === "down" ? d.neg : !d.neg)) m += 1n;
    return makeDecimal(d.neg, m, -scale) || d;
  }

  /** NSDecimalCompare: the signs, then the mantissas with one exponent. */
  function compareDecimals(a, b) {
    const sa = a.m === 0n ? 0 : a.neg ? -1 : 1, sb = b.m === 0n ? 0 : b.neg ? -1 : 1;
    if (sa !== sb || sa === 0) return sa - sb;
    const [x, y] = normalize(a, b);
    return x.m === y.m ? 0 : (x.m < y.m) === (sa > 0) ? -1 : 1;
  }

  /** Decimal.description: plain notation, "-0.00123", "391". */
  function describeDecimal(d) {
    if (d.m === 0n) return "0";
    let text = d.m.toString();
    if (d.e >= 0) text += "0".repeat(d.e);
    else if (text.length > -d.e) text = text.slice(0, text.length + d.e) + "." + text.slice(text.length + d.e);
    else text = "0." + "0".repeat(-d.e - text.length) + text;
    return (d.neg ? "-" : "") + text;
  }

  // MARK: - Writing

  /** A result as it is inserted, without float noise or trailing zeros. A whole decimal of up to 38 digits is
   *  written out in full; anything else is rounded to 15 significant digits, written plainly from 1e-9 up to 1e15
   *  and beyond that as `1.60693804425899e+60`. */
  function format(value) {
    let negative, digits, exponent; // exponent: the power of ten of the first digit
    if (isDecimal(value)) {
      const text = describeDecimal(value);
      negative = text.startsWith("-");
      const parts = text.replace(/^-+/, "").split(".");
      const whole = parts[0];
      const fraction = (parts.length > 1 ? parts[1] : "").replace(/0+$/, "");
      if (fraction === "" && whole.length <= 38) return /^0*$/.test(whole) ? "0" : (negative ? "-" : "") + whole;
      const all = (whole + fraction).split("").map(Number);
      let zeros = 0;
      while (zeros < all.length && all[zeros] === 0) zeros += 1;
      digits = all.slice(zeros);
      exponent = whole.length - 1 - zeros;
      if (digits.length > 15) {
        // Half away from zero, on the digits Decimal kept.
        const up = digits[15] >= 5;
        digits = digits.slice(0, 15);
        if (up) {
          let i = 14;
          while (i >= 0 && digits[i] === 9) {
            digits[i] = 0;
            i -= 1;
          }
          if (i >= 0) digits[i] += 1;
          else {
            digits = [1].concat(digits.slice(0, -1));
            exponent += 1;
          }
        }
      }
    } else {
      const s = scientific(value);
      negative = s.negative;
      digits = s.digits.split("").map(Number);
      exponent = s.exponent;
    }
    while (digits.length > 0 && digits[digits.length - 1] === 0) digits.pop();
    if (digits.length === 0) return "0";
    const sign = negative ? "-" : "";
    const shown = digits.join("");
    if (exponent < -9 || exponent >= 15) {
      const mantissa = digits.length === 1 ? shown : shown.slice(0, 1) + "." + shown.slice(1);
      return sign + mantissa + "e" + (exponent < 0 ? "-" : "+") + Math.abs(exponent);
    }
    if (exponent < 0) return sign + "0." + "0".repeat(-exponent - 1) + shown;
    if (digits.length <= exponent + 1) return sign + shown + "0".repeat(exponent + 1 - digits.length);
    return sign + shown.slice(0, exponent + 1) + "." + shown.slice(exponent + 1);
  }

  return { calculate: calculate };
})();

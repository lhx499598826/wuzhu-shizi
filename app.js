const STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const ELEMENTS = ["金", "木", "水", "火", "土"];
const STEM_ELEMENTS = ["木", "木", "火", "火", "土", "土", "金", "金", "水", "水"];
const BRANCH_ELEMENTS = ["水", "土", "木", "木", "土", "火", "火", "土", "金", "金", "土", "水"];
const STEM_POLARITY = ["阳", "阴", "阳", "阴", "阳", "阴", "阳", "阴", "阳", "阴"];
const BRANCH_POLARITY = ["阳", "阴", "阳", "阴", "阳", "阴", "阳", "阴", "阳", "阴", "阳", "阴"];
const MS_PER_MINUTE = 60 * 1000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;
const JIA_ZI_DAY_UTC = Date.UTC(1912, 1, 18);
const YEAR_ANCHOR = 1984;
const MAX_SEARCH_MINUTES = 366 * 24 * 60;
const TIMEZONE_LABELS = new Map([
  [480, "中国 / 北京时间"],
  [540, "日本 / 韩国时间"],
  [420, "泰国 / 越南时间"],
  [0, "英国 / 格林尼治时间"],
  [-300, "美国东部时间"],
  [-360, "美国中部时间"],
  [-420, "美国山地时间"],
  [-480, "美国太平洋时间"],
]);

const SOLAR_MONTH_TERMS = [
  { degree: 315, name: "立春" },
  { degree: 345, name: "惊蛰" },
  { degree: 15, name: "清明" },
  { degree: 45, name: "立夏" },
  { degree: 75, name: "芒种" },
  { degree: 105, name: "小暑" },
  { degree: 135, name: "立秋" },
  { degree: 165, name: "白露" },
  { degree: 195, name: "寒露" },
  { degree: 225, name: "立冬" },
  { degree: 255, name: "大雪" },
  { degree: 285, name: "小寒" },
];

const TERM_GUESSES = {
  15: [3, 5],
  45: [4, 6],
  75: [5, 6],
  105: [6, 7],
  135: [7, 8],
  165: [8, 8],
  195: [9, 8],
  225: [10, 7],
  255: [11, 7],
  285: [0, 6],
  315: [1, 4],
  345: [2, 6],
};

const solarTermCache = new Map();

function mod(value, base) {
  return ((value % base) + base) % base;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function degToRad(degree) {
  return (degree * Math.PI) / 180;
}

function normalizeDegree(degree) {
  return mod(degree, 360);
}

function angleDelta(current, target) {
  return mod(current - target + 180, 360) - 180;
}

function julianDayFromUtcMs(utcMs) {
  return utcMs / MS_PER_DAY + 2440587.5;
}

function apparentSolarLongitude(utcMs) {
  const jd = julianDayFromUtcMs(utcMs);
  const t = (jd - 2451545.0) / 36525;
  const l0 = normalizeDegree(280.46646 + t * (36000.76983 + 0.0003032 * t));
  const m = normalizeDegree(357.52911 + t * (35999.05029 - 0.0001537 * t));
  const center =
    Math.sin(degToRad(m)) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(degToRad(2 * m)) * (0.019993 - 0.000101 * t) +
    Math.sin(degToRad(3 * m)) * 0.000289;
  const trueLongitude = l0 + center;
  const omega = 125.04 - 1934.136 * t;
  return normalizeDegree(trueLongitude - 0.00569 - 0.00478 * Math.sin(degToRad(omega)));
}

function solarTermUtcMs(year, degree) {
  const key = `${year}:${degree}`;
  if (solarTermCache.has(key)) {
    return solarTermCache.get(key);
  }

  const guess = TERM_GUESSES[degree];
  if (!guess) {
    throw new Error(`Unsupported solar term degree: ${degree}`);
  }

  let low = Date.UTC(year, guess[0], guess[1], 0, 0, 0) - 5 * MS_PER_DAY;
  let high = Date.UTC(year, guess[0], guess[1], 0, 0, 0) + 5 * MS_PER_DAY;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const lowDelta = angleDelta(apparentSolarLongitude(low), degree);
    const highDelta = angleDelta(apparentSolarLongitude(high), degree);
    if (lowDelta <= 0 && highDelta >= 0) {
      break;
    }
    low -= 5 * MS_PER_DAY;
    high += 5 * MS_PER_DAY;
  }

  for (let i = 0; i < 64; i += 1) {
    const mid = (low + high) / 2;
    if (angleDelta(apparentSolarLongitude(mid), degree) < 0) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const value = Math.round((low + high) / 2);
  solarTermCache.set(key, value);
  return value;
}

function pillarFromIndex(index) {
  const normalized = mod(index, 60);
  const stemIndex = normalized % 10;
  const branchIndex = normalized % 12;
  return makePillar(stemIndex, branchIndex, normalized);
}

function makePillar(stemIndex, branchIndex, index = null) {
  return {
    index,
    stemIndex,
    branchIndex,
    stem: STEMS[stemIndex],
    branch: BRANCHES[branchIndex],
    name: `${STEMS[stemIndex]}${BRANCHES[branchIndex]}`,
    stemElement: STEM_ELEMENTS[stemIndex],
    branchElement: BRANCH_ELEMENTS[branchIndex],
    stemPolarity: STEM_POLARITY[stemIndex],
    branchPolarity: BRANCH_POLARITY[branchIndex],
  };
}

function pillarFromStemBranch(stemIndex, branchIndex) {
  for (let i = 0; i < 60; i += 1) {
    if (i % 10 === stemIndex && i % 12 === branchIndex) {
      return makePillar(stemIndex, branchIndex, i);
    }
  }
  throw new Error("Invalid stem and branch pairing");
}

function parseLocalDateTime(value, offsetMinutes) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error("请输入精确到分钟的出生时间。");
  }

  const [, year, month, day, hour, minute] = match.map(Number);
  const utcMs = Date.UTC(year, month - 1, day, hour, minute) - offsetMinutes * MS_PER_MINUTE;
  return { utcMs, local: localPartsFromUtc(utcMs, offsetMinutes) };
}

function localPartsFromUtc(utcMs, offsetMinutes) {
  const localDate = new Date(utcMs + offsetMinutes * MS_PER_MINUTE);
  return {
    year: localDate.getUTCFullYear(),
    month: localDate.getUTCMonth() + 1,
    day: localDate.getUTCDate(),
    hour: localDate.getUTCHours(),
    minute: localDate.getUTCMinutes(),
  };
}

function localDateAfterDays(year, month, day, days) {
  const date = new Date(Date.UTC(year, month - 1, day) + days * MS_PER_DAY);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function formatLocalTime(utcMs, offsetMinutes) {
  const local = localPartsFromUtc(utcMs, offsetMinutes);
  return `${local.year}-${pad2(local.month)}-${pad2(local.day)} ${pad2(local.hour)}:${pad2(local.minute)}`;
}

function formatOffset(minutes) {
  return TIMEZONE_LABELS.get(minutes) || "出生地时区";
}

function sexagenaryYear(localYear, utcMs) {
  const lichun = solarTermUtcMs(localYear, 315);
  return utcMs < lichun ? localYear - 1 : localYear;
}

function solarMonthIndex(utcMs, solarYear) {
  for (let i = SOLAR_MONTH_TERMS.length - 1; i >= 0; i -= 1) {
    const term = SOLAR_MONTH_TERMS[i];
    const termYear = term.degree === 285 ? solarYear + 1 : solarYear;
    if (utcMs >= solarTermUtcMs(termYear, term.degree)) {
      return i;
    }
  }
  return 11;
}

function dayPillarIndex(local, useEarlyZiDay) {
  let date = { year: local.year, month: local.month, day: local.day };
  if (useEarlyZiDay && local.hour === 23) {
    date = localDateAfterDays(local.year, local.month, local.day, 1);
  }
  const days = Math.floor((Date.UTC(date.year, date.month - 1, date.day) - JIA_ZI_DAY_UTC) / MS_PER_DAY);
  return mod(days, 60);
}

function buildChart(utcMs, offsetMinutes, options = {}) {
  const useEarlyZiDay = options.useEarlyZiDay !== false;
  const local = localPartsFromUtc(utcMs, offsetMinutes);
  const solarYear = sexagenaryYear(local.year, utcMs);
  const yearPillar = pillarFromIndex(solarYear - YEAR_ANCHOR);

  const monthIndex = solarMonthIndex(utcMs, solarYear);
  const firstMonthStem = mod(yearPillar.stemIndex * 2 + 2, 10);
  const monthPillar = pillarFromStemBranch(mod(firstMonthStem + monthIndex, 10), mod(2 + monthIndex, 12));

  const dayPillar = pillarFromIndex(dayPillarIndex(local, useEarlyZiDay));
  const hourBranchIndex = Math.floor((local.hour + 1) / 2) % 12;
  const firstHourStem = mod(dayPillar.stemIndex % 5, 5) * 2;
  const hourPillar = pillarFromStemBranch(mod(firstHourStem + hourBranchIndex, 10), hourBranchIndex);

  const minutePillar = pillarFromIndex(local.minute);
  const pillars = [
    { key: "year", label: "年柱", ...yearPillar },
    { key: "month", label: "月柱", ...monthPillar },
    { key: "day", label: "日柱", ...dayPillar },
    { key: "hour", label: "时柱", ...hourPillar },
    { key: "minute", label: "分柱", ...minutePillar },
  ];
  const counts = countElements(pillars);

  return {
    local,
    utcMs,
    offsetMinutes,
    offsetLabel: formatOffset(offsetMinutes),
    solarYear,
    pillars,
    counts,
    perfect: isPerfect(counts),
  };
}

function countElements(pillars) {
  const counts = Object.fromEntries(ELEMENTS.map((element) => [element, 0]));
  pillars.forEach((pillar) => {
    counts[pillar.stemElement] += 1;
    counts[pillar.branchElement] += 1;
  });
  return counts;
}

function isPerfect(counts) {
  return ELEMENTS.every((element) => counts[element] === 2);
}

function findNearestPerfects(utcMs, offsetMinutes, useEarlyZiDay) {
  const matches = [];

  for (let radius = 0; radius <= MAX_SEARCH_MINUTES && matches.length < 5; radius += 1) {
    const deltas = radius === 0 ? [0] : [-radius, radius];
    for (const delta of deltas) {
      const candidateUtc = utcMs + delta * MS_PER_MINUTE;
      const chart = buildChart(candidateUtc, offsetMinutes, { useEarlyZiDay });
      if (chart.perfect) {
        matches.push({ deltaMinutes: delta, chart });
        if (matches.length >= 5) {
          break;
        }
      }
    }
  }

  return matches.sort((a, b) => {
    const distance = Math.abs(a.deltaMinutes) - Math.abs(b.deltaMinutes);
    return distance === 0 ? a.deltaMinutes - b.deltaMinutes : distance;
  });
}

function formatDistance(deltaMinutes) {
  if (deltaMinutes === 0) {
    return "正值生辰";
  }

  const abs = Math.abs(deltaMinutes);
  const days = Math.floor(abs / (24 * 60));
  const hours = Math.floor((abs % (24 * 60)) / 60);
  const minutes = abs % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}日`);
  if (hours > 0) parts.push(`${hours}时`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}分`);
  return `${deltaMinutes < 0 ? "前" : "后"} ${parts.join("")}`;
}

function tenCharacters(chart) {
  return chart.pillars.map((pillar) => pillar.name).join("");
}

function pillarElementPairs(chart) {
  return chart.pillars.map((pillar) => `${pillar.stemElement}${pillar.branchElement}`).join(" · ");
}

function renderPillars(chart) {
  const grid = document.querySelector("#pillar-grid");
  grid.innerHTML = chart.pillars
    .map(
      (pillar) => `
        <article class="pillar-card">
          <div class="pillar-label">${pillar.label}</div>
          <div class="pillar-name">${pillar.name}</div>
          <div class="element-pair" aria-label="${pillar.name}五行">
            <span class="chip ${pillar.stemElement}">${pillar.stemPolarity}${pillar.stemElement}</span>
            <span class="chip ${pillar.branchElement}">${pillar.branchPolarity}${pillar.branchElement}</span>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderElements(chart) {
  const bars = document.querySelector("#element-bars");
  bars.innerHTML = ELEMENTS.map(
    (element) => `
      <div class="element-row">
        <strong>${element}</strong>
        <div class="bar-track">
          <div class="bar-fill ${element}" style="width: ${chart.counts[element] * 10}%"></div>
        </div>
        <span>${chart.counts[element]}</span>
      </div>
    `,
  ).join("");

  const dayPillar = chart.pillars[2];
  document.querySelector("#day-master").textContent = `日主 ${dayPillar.stemPolarity}${dayPillar.stemElement}`;
}

function renderNearest(matches, offsetMinutes) {
  const list = document.querySelector("#nearest-list");
  if (matches.length === 0) {
    list.innerHTML = '<p class="empty-state">一年内未寻得完美十字。</p>';
    return;
  }

  list.innerHTML = matches
    .map(
      ({ deltaMinutes, chart }) => `
        <article class="nearest-item">
          <div>
            <div class="nearest-time">${formatLocalTime(chart.utcMs, offsetMinutes)}</div>
            <div class="nearest-distance">${formatDistance(deltaMinutes)}</div>
          </div>
          <div class="nearest-detail">
            <div class="nearest-pillars">${tenCharacters(chart)}</div>
            <div class="nearest-elements">${pillarElementPairs(chart)}</div>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderChart(chart, nearest) {
  document.querySelector("#chart-title").textContent = `${formatLocalTime(chart.utcMs, chart.offsetMinutes)} ${chart.offsetLabel}`;
  const badge = document.querySelector("#perfect-badge");
  badge.textContent = chart.perfect ? "完美十字" : "未均衡";
  badge.classList.toggle("perfect", chart.perfect);
  renderPillars(chart);
  renderElements(chart);
  renderNearest(nearest, chart.offsetMinutes);
}

function setDefaultDateTime() {
  const input = document.querySelector("#birth-time");
  const offsetMinutes = Number(document.querySelector("#timezone-offset").value);
  const now = Date.now();
  const local = localPartsFromUtc(now, offsetMinutes);
  input.value = `${local.year}-${pad2(local.month)}-${pad2(local.day)}T${pad2(local.hour)}:${pad2(local.minute)}`;
}

function calculateFromForm() {
  const birthInput = document.querySelector("#birth-time");
  const offsetMinutes = Number(document.querySelector("#timezone-offset").value);
  const useEarlyZiDay = document.querySelector("#early-zi").checked;
  const parsed = parseLocalDateTime(birthInput.value, offsetMinutes);
  const chart = buildChart(parsed.utcMs, offsetMinutes, { useEarlyZiDay });
  const nearest = findNearestPerfects(parsed.utcMs, offsetMinutes, useEarlyZiDay);
  renderChart(chart, nearest);
}

function initApp() {
  const form = document.querySelector("#birth-form");
  setDefaultDateTime();
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    calculateFromForm();
  });
  document.querySelector("#timezone-offset").addEventListener("change", calculateFromForm);
  document.querySelector("#early-zi").addEventListener("change", calculateFromForm);
  document.querySelector("#birth-time").addEventListener("change", calculateFromForm);
  calculateFromForm();
}

if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", initApp);
}

if (typeof module !== "undefined") {
  module.exports = {
    buildChart,
    findNearestPerfects,
    formatLocalTime,
    isPerfect,
    pillarFromIndex,
    solarTermUtcMs,
  };
}

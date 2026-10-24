(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const number = (id, fallback) => {
    const value = Number($(id).value);
    return Number.isFinite(value) ? value : fallback;
  };
  const randomNormal = () => {
    const u = Math.max(Math.random(), 1e-9);
    const v = Math.max(Math.random(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const compoundNames = { S: '软胎', M: '中性胎', H: '硬胎', I: '半雨胎', W: '全雨胎' };
  const defaultTyres = {
    S: { pace: -0.38, deg: 0.115, life: 28 },
    M: { pace: 0, deg: 0.065, life: 36 },
    H: { pace: 0.28, deg: 0.04, life: 48 },
    I: { pace: 3.8, deg: 0.055, life: 36 },
    W: { pace: 9.5, deg: 0.05, life: 30 }
  };

  function readTyres() {
    const tyres = structuredClone(defaultTyres);
    document.querySelectorAll('.tyre-input').forEach((input) => {
      const key = input.dataset.key;
      const tyre = input.dataset.tyre;
      const value = Number(input.value);
      if (Number.isFinite(value)) tyres[tyre][key] = value;
    });
    return tyres;
  }

  function makePlans(laps, rainPct, tyres, dryRule) {
    const plans = [];
    const add = (compounds, ratios, label) => {
      const cuts = ratios.map((ratio) => Math.round(laps * ratio));
      const boundaries = [0, ...cuts, laps];
      const stints = compounds.map((compound, index) => ({
        compound,
        laps: boundaries[index + 1] - boundaries[index],
        from: boundaries[index] + 1,
        to: boundaries[index + 1]
      }));
      if (stints.some((stint) => stint.laps < 7 || stint.laps > tyres[stint.compound].life)) return;
      const dryCompounds = new Set(compounds.filter((compound) => ['S', 'M', 'H'].includes(compound)));
      if (dryRule && dryCompounds.size < 2) return;
      plans.push({ id: label + '-' + cuts.join('-') + '-' + plans.length, compounds, stints, stops: compounds.length - 1, label });
    };
    const oneStop = [
      ['H', 'M'], ['M', 'H'], ['S', 'H'], ['H', 'S'], ['S', 'M'], ['M', 'S']
    ];
    oneStop.forEach((pair) => {
      [0.42, 0.50, 0.58].forEach((ratio) => add(pair, [ratio], pair.map((x) => compoundNames[x]).join(' → ')));
    });
    const twoStop = [
      { c: ['H', 'M', 'H'], name: '硬 → 中 → 硬', r: [[0.33, 0.67], [0.38, 0.70], [0.28, 0.64]] },
      { c: ['M', 'H', 'M'], name: '中 → 硬 → 中', r: [[0.32, 0.68], [0.38, 0.72], [0.27, 0.63]] },
      { c: ['S', 'M', 'H'], name: '软 → 中 → 硬', r: [[0.27, 0.64], [0.32, 0.68], [0.23, 0.62]] },
      { c: ['H', 'M', 'S'], name: '硬 → 中 → 软', r: [[0.35, 0.72], [0.38, 0.76], [0.31, 0.70]] },
      { c: ['S', 'M', 'S'], name: '软 → 中 → 软', r: [[0.25, 0.74], [0.28, 0.72], [0.22, 0.67]] },
      { c: ['M', 'S', 'H'], name: '中 → 软 → 硬', r: [[0.36, 0.66], [0.41, 0.71], [0.30, 0.64]] },
      { c: ['H', 'S', 'M'], name: '硬 → 软 → 中', r: [[0.37, 0.70], [0.40, 0.73], [0.32, 0.68]] }
    ];
    if (rainPct >= 20) {
      twoStop.push({ c: ['I', 'M', 'H'], name: '半雨 → 中 → 硬', r: [[0.23, 0.58], [0.28, 0.62], [0.20, 0.58]] });
      twoStop.push({ c: ['W', 'I', 'M'], name: '全雨 → 半雨 → 中', r: [[0.18, 0.48], [0.23, 0.55], [0.20, 0.54]] });
    }
    if (rainPct >= 45) twoStop.push({ c: ['W', 'I', 'W'], name: '全雨 → 半雨 → 全雨', r: [[0.24, 0.72], [0.28, 0.70], [0.20, 0.65]] });
    twoStop.forEach((row) => row.r.forEach((ratios) => add(row.c, ratios, row.name)));
    return plans;
  }

  function readRaceConfig() {
    return {
      circuit: $('circuitName').value.trim() || '自定义赛道',
      laps: clamp(Math.round(number('raceLaps', 56)), 12, 90),
      baseLap: clamp(number('baseLap', 92), 45, 180),
      pitLoss: clamp(number('pitLoss', 21.5), 10, 45),
      scChance: clamp(number('scChance', 32), 0, 100) / 100,
      scSaving: clamp(number('scSaving', 9), 0, 25),
      rainChance: clamp(number('rainChance', 12), 0, 100),
      freshBonus: clamp(number('freshBonus', 0.65), 0, 3),
      trafficChance: clamp(number('trafficChance', 22), 0, 100) / 100,
      trafficLoss: clamp(number('trafficLoss', 2.2), 0, 15),
      runs: clamp(Math.round(number('simCount', 600)), 100, 3000),
      dryRule: $('dryRule').checked,
      tyres: readTyres()
    };
  }

  function sampleRace(plan, config, outcome) {
    let time = config.laps * (config.baseLap + outcome.baseSwing);
    plan.stints.forEach((stint, stintIndex) => {
      const tyre = config.tyres[stint.compound];
      const wearScale = 0.88 + Math.random() * 0.24;
      for (let age = 1; age <= stint.laps; age += 1) {
        let pace = tyre.pace;
        if (outcome.wet) {
          if (stint.compound === 'S' || stint.compound === 'M' || stint.compound === 'H') pace += 3.4;
          else if (stint.compound === 'I') pace += 0.25;
          else pace -= 0.65;
        } else {
          if (stint.compound === 'I') pace += 2.9;
          if (stint.compound === 'W') pace += 7.4;
        }
        const degradation = tyre.deg * Math.pow(Math.max(0, age - 1), 1.12) * wearScale;
        let outlapGain = 0;
        if (stintIndex > 0 && age <= 3) outlapGain = config.freshBonus * [1, 0.62, 0.3][age - 1];
        time += pace + degradation - outlapGain + randomNormal() * 0.105;
      }
    });
    plan.stints.slice(0, -1).forEach((stint) => {
      time += config.pitLoss;
      if (outcome.scLap && stint.to >= outcome.scLap && stint.to <= outcome.scLap + 2) time -= config.scSaving;
      if (Math.random() < config.trafficChance) time += config.trafficLoss;
    });
    return time;
  }

  function quantile(values, q) {
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted[Math.floor((sorted.length - 1) * q)];
  }
  function formatRaceTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const rest = (seconds - mins * 60).toFixed(1).padStart(4, '0');
    return mins + ':' + rest;
  }

  async function runStrategy() {
    const button = $('runSimulation');
    const config = readRaceConfig();
    const plans = makePlans(config.laps, config.rainChance, config.tyres, config.dryRule);
    if (!plans.length) {
      $('strategyStatus').textContent = '无有效方案';
      $('strategyChart').innerHTML = '<div class="empty-state">当前轮胎寿命与比赛圈数无法组成有效策略。请延长轮胎寿命或调整比赛参数。</div>';
      return;
    }
    button.disabled = true;
    button.querySelector('span').textContent = '模拟中…';
    $('strategyStatus').textContent = '0 / ' + config.runs + ' 场';
    const samples = plans.map(() => []);
    let completed = 0;
    const batchSize = 24;
    while (completed < config.runs) {
      const end = Math.min(config.runs, completed + batchSize);
      for (let run = completed; run < end; run += 1) {
        const outcome = {
          wet: Math.random() < config.rainChance / 100,
          scLap: Math.random() < config.scChance ? 1 + Math.floor(Math.random() * config.laps) : 0,
          baseSwing: randomNormal() * 0.28
        };
        plans.forEach((plan, index) => samples[index].push(sampleRace(plan, config, outcome)));
      }
      completed = end;
      $('strategyStatus').textContent = completed + ' / ' + config.runs + ' 场';
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
    const winCounts = plans.map(() => 0);
    for (let run = 0; run < config.runs; run += 1) {
      let winner = 0;
      for (let index = 1; index < plans.length; index += 1) {
        if (samples[index][run] < samples[winner][run]) winner = index;
      }
      winCounts[winner] += 1;
    }
    const results = plans.map((plan, index) => {
      const values = samples[index];
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      return { plan, mean, median: quantile(values, 0.5), p10: quantile(values, 0.1), p90: quantile(values, 0.9), winRate: winCounts[index] / config.runs };
    }).sort((a, b) => a.mean - b.mean);
    renderStrategy(results, config);
    button.disabled = false;
    button.querySelector('span').textContent = '重新运行模拟';
    $('strategyStatus').textContent = config.runs + ' 场模拟 · 完成';
  }

  function renderStrategy(results, config) {
    const best = results[0];
    $('bestPlanName').textContent = best.plan.label;
    $('bestPlanMeta').textContent = config.circuit + ' · ' + config.laps + ' 圈 · ' + best.plan.stops + ' 次进站';
    $('bestPlanTime').innerHTML = formatRaceTime(best.mean) + '<small>总计</small>';
    $('bestWinRate').textContent = (best.winRate * 100).toFixed(1) + '%';
    $('bestMedian').textContent = (best.median / config.laps).toFixed(3) + ' 秒';
    $('bestRange').textContent = formatRaceTime(best.p10) + ' — ' + formatRaceTime(best.p90);
    const chart = results.slice(0, 5);
    const min = chart[0].mean;
    const max = chart[chart.length - 1].mean;
    $('strategyChart').innerHTML = chart.map((row, index) => {
      const width = max === min ? 100 : 42 + (1 - (row.mean - min) / (max - min)) * 58;
      return '<div class="chart-row ' + (index === 0 ? 'best' : '') + '">' +
        '<div class="chart-name" title="' + esc(row.plan.label) + '">' + esc(row.plan.label) + '</div>' +
        '<div class="chart-track"><div class="chart-bar" style="width:' + width.toFixed(1) + '%"></div></div>' +
        '<div class="chart-time">' + formatRaceTime(row.mean) + '<span class="chart-win">胜率 ' + (row.winRate * 100).toFixed(1) + '%</span></div>' +
        '</div>';
    }).join('');
    const stintsHtml = best.plan.stints.map((stint) => {
      const width = stint.laps / config.laps * 100;
      return '<div class="stint-segment ' + stint.compound + '" style="width:' + width.toFixed(2) + '%" title="' + compoundNames[stint.compound] + ' · ' + stint.laps + ' 圈">' + stint.laps + ' 圈</div>';
    }).join('');
    const pitLaps = best.plan.stints.slice(0, -1).map((stint) => 'L' + stint.to).join(' / ') || '无进站';
    $('selectedPlan').innerHTML = '<div class="stint-head"><strong>' + esc(best.plan.label) + '</strong><span>' + best.plan.stops + ' STOPS</span></div>' +
      '<div class="stint-bar">' + stintsHtml + '</div>' +
      '<div class="stint-legend"><span>L1 · ' + config.laps + '圈终点</span><span>建议进站：' + pitLaps + '</span></div>';
    const rainy = config.rainChance > 0 ? '模型包含 ' + config.rainChance + '% 降雨可能性；' : '';
    $('scInsight').textContent = rainy + '安全车概率 ' + Math.round(config.scChance * 100) +
      '%，进站损失约 ' + config.pitLoss.toFixed(1) + ' 秒；首选策略的平均用时比第五名方案快 ' +
      (results.length > 4 ? (results[4].mean - best.mean).toFixed(1) : '0.0') + ' 秒。';
  }

  const racePoints = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
  const sprintPoints = [8, 7, 6, 5, 4, 3, 2, 1];
  const pointsFor = (position, table) => table[Math.round(position) - 1] || 0;
  const randomPosition = (mean, sigma) => clamp(Math.round(mean + randomNormal() * sigma), 1, 20);

  function runChampionship() {
    const runs = clamp(Math.round(number('champRuns', 5000)), 500, 20000);
    const races = clamp(Math.round(number('remainingRaces', 8)), 1, 24);
    const sprints = clamp(Math.round(number('remainingSprints', 2)), 0, races);
    const a = {
      name: $('driverAName').value.trim() || '车手 A',
      points: clamp(number('driverAPoints', 0), 0, 1000),
      finish: clamp(number('driverAFinish', 4), 1, 20),
      sprint: clamp(number('driverASprint', 4), 1, 20),
      sigma: clamp(number('driverASigma', 2), 0, 10)
    };
    const b = {
      name: $('driverBName').value.trim() || '车手 B',
      points: clamp(number('driverBPoints', 0), 0, 1000),
      finish: clamp(number('driverBFinish', 4), 1, 20),
      sprint: clamp(number('driverBSprint', 4), 1, 20),
      sigma: clamp(number('driverBSigma', 2), 0, 10)
    };
    let winsA = 0;
    let winsB = 0;
    let ties = 0;
    let sumA = 0;
    let sumB = 0;
    for (let run = 0; run < runs; run += 1) {
      let totalA = a.points;
      let totalB = b.points;
      for (let race = 0; race < races; race += 1) {
        totalA += pointsFor(randomPosition(a.finish, a.sigma), racePoints);
        totalB += pointsFor(randomPosition(b.finish, b.sigma), racePoints);
        if (race < sprints) {
          totalA += pointsFor(randomPosition(a.sprint, a.sigma), sprintPoints);
          totalB += pointsFor(randomPosition(b.sprint, b.sigma), sprintPoints);
        }
      }
      sumA += totalA;
      sumB += totalB;
      if (totalA > totalB) winsA += 1;
      else if (totalB > totalA) winsB += 1;
      else ties += 1;
    }
    const oddsA = winsA / runs;
    const oddsB = winsB / runs;
    const oddsTie = ties / runs;
    const meanA = sumA / runs;
    const meanB = sumB / runs;
    $('champStatus').textContent = runs.toLocaleString() + ' 场模拟 · 完成';
    $('oddsAName').textContent = a.name;
    $('oddsBName').textContent = b.name;
    $('oddsA').textContent = (oddsA * 100).toFixed(1) + '%';
    $('oddsB').textContent = (oddsB * 100).toFixed(1) + '%';
    $('oddsTrackA').style.width = (oddsA * 100) + '%';
    $('oddsTrackTie').style.width = (oddsTie * 100) + '%';
    $('oddsTrackB').style.width = (oddsB * 100) + '%';
    $('meanPointsA').textContent = meanA.toFixed(1);
    $('meanPointsB').textContent = meanB.toFixed(1);
    const gap = meanA - meanB;
    $('meanGap').textContent = (gap > 0 ? '+' : '') + gap.toFixed(1);
    $('tieOdds').textContent = (oddsTie * 100).toFixed(1) + '%';
    const favorite = oddsA === oddsB ? '两位车手' : oddsA > oddsB ? a.name : b.name;
    $('champReadout').textContent = favorite + ' 在此场景中更可能最终领先。模型将预期名次按波动值抽样，再套用默认积分表；事故、退赛、车队指令和加赛等因素未纳入。';
  }

  const defaultTasks = [
    { id: 'calendar', text: '确认赛程时间与本地时区', done: false, fixed: true },
    { id: 'practice', text: '看完练习赛后记录长距离节奏', done: false, fixed: true },
    { id: 'qualifying', text: '排位赛后检查发车顺位与处罚', done: false, fixed: true },
    { id: 'strategy', text: '赛前比较一停与两停窗口', done: false, fixed: true },
    { id: 'race', text: '正赛开始前准备直播与计时', done: false, fixed: true }
  ];
  const loadStore = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value === null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  };
  let sessions = loadStore('pitwall-sessions-v1', []);
  let tasks = loadStore('pitwall-checklist-v1', defaultTasks);
  if (!Array.isArray(sessions)) sessions = [];
  if (!Array.isArray(tasks)) tasks = defaultTasks;
  const saveWeekend = () => {
    localStorage.setItem('pitwall-sessions-v1', JSON.stringify(sessions));
    localStorage.setItem('pitwall-checklist-v1', JSON.stringify(tasks));
  };
  const sessionDate = (session) => new Date(session.when);
  const dateLabel = (date) => new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'short' }).format(date);
  const timeLabel = (date) => new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date);

  function renderSessions() {
    sessions = sessions.filter((session) => session && session.name && Number.isFinite(sessionDate(session).getTime()));
    sessions.sort((a, b) => sessionDate(a) - sessionDate(b));
    $('scheduleCount').textContent = sessions.length + ' 场赛程';
    if (!sessions.length) {
      $('sessionList').innerHTML = '<div class="empty-state">暂无赛程。先添加一场比赛周末活动。</div>';
      $('nextCountdown').textContent = '添加一场赛程';
      $('nextSessionLabel').textContent = '时间按照此设备的本地时区解析。';
      return;
    }
    const now = Date.now();
    const next = sessions.find((session) => sessionDate(session).getTime() > now);
    if (next) {
      const ms = sessionDate(next).getTime() - now;
      const hours = Math.floor(ms / 3600000);
      const days = Math.floor(hours / 24);
      const remainHours = hours % 24;
      const mins = Math.floor((ms % 3600000) / 60000);
      $('nextCountdown').textContent = days > 0 ? days + '天 ' + remainHours + '小时' : hours + '小时 ' + mins + '分钟';
      $('nextSessionLabel').textContent = next.name + ' · ' + dateLabel(sessionDate(next)) + ' ' + timeLabel(sessionDate(next));
    } else {
      $('nextCountdown').textContent = '所有赛程已结束';
      $('nextSessionLabel').textContent = '添加下一场比赛周末活动。';
    }
    $('sessionList').innerHTML = sessions.map((session) => {
      const date = sessionDate(session);
      return '<div class="session-row"><div class="session-date">' + dateLabel(date) + '</div>' +
        '<div><div class="session-name">' + esc(session.name) + '</div><div class="session-time">' + date.toLocaleDateString('zh-CN') + ' · ' + timeLabel(date) + '</div></div>' +
        '<button class="delete-session" type="button" data-delete-session="' + esc(session.id) + '" aria-label="删除 ' + esc(session.name) + '">×</button></div>';
    }).join('');
  }

  function renderTasks() {
    const completed = tasks.filter((task) => task.done).length;
    const percent = tasks.length ? Math.round(completed / tasks.length * 100) : 0;
    $('checkProgress').textContent = percent + '%';
    $('checkProgressBar').style.width = percent + '%';
    $('checklist').innerHTML = tasks.map((task) => '<label class="check-row ' + (task.done ? 'done' : '') + '">' +
      '<input type="checkbox" data-task="' + esc(task.id) + '"' + (task.done ? ' checked' : '') + '>' +
      '<span>' + esc(task.text) + '</span>' +
      (task.fixed ? '' : '<button class="remove-task" type="button" data-delete-task="' + esc(task.id) + '" aria-label="删除事项">×</button>') +
      '</label>').join('');
  }

  function escapeIcs(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }
  function toIcsDate(date) { return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); }
  function exportCalendar() {
    if (!sessions.length) {
      $('nextSessionLabel').textContent = '先添加赛程，再导出日历。';
      return;
    }
    const events = sessions.map((session) => {
      const start = sessionDate(session);
      const end = new Date(start.getTime() + 90 * 60000);
      return [
        'BEGIN:VEVENT', 'UID:' + session.id + '@pitwall-lab', 'DTSTAMP:' + toIcsDate(new Date()),
        'DTSTART:' + toIcsDate(start), 'DTEND:' + toIcsDate(end),
        'SUMMARY:' + escapeIcs(session.name), 'DESCRIPTION:' + escapeIcs('Pitwall Lab 周末作战板'),
        'END:VEVENT'
      ].join('\r\n');
    });
    const content = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//C130AIR-Bot//Pitwall Lab//ZH', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR'].join('\r\n');
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pitwall-race-weekend.ics';
    link.click();
    URL.revokeObjectURL(url);
  }

  function updateClock() {
    $('localClock').textContent = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(new Date()).toUpperCase();
  }
  function initializeTabs() {
    document.querySelectorAll('.tab-button').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.tab-button').forEach((tab) => tab.classList.toggle('active', tab === button));
        document.querySelectorAll('.module').forEach((module) => module.classList.toggle('active', module.id === 'module-' + button.dataset.tab));
      });
    });
  }
  function initializeWeekend() {
    renderSessions();
    renderTasks();
    $('sessionForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const name = $('sessionName').value.trim();
      const when = $('sessionTime').value;
      if (!name || !when) return;
      sessions.push({ id: 'session-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8), name, when });
      $('sessionName').value = '';
      $('sessionTime').value = '';
      saveWeekend();
      renderSessions();
    });
    $('sessionList').addEventListener('click', (event) => {
      const button = event.target.closest('[data-delete-session]');
      if (!button) return;
      sessions = sessions.filter((session) => session.id !== button.dataset.deleteSession);
      saveWeekend();
      renderSessions();
    });
    $('checklist').addEventListener('change', (event) => {
      const input = event.target.closest('[data-task]');
      if (!input) return;
      const task = tasks.find((item) => item.id === input.dataset.task);
      if (task) task.done = input.checked;
      saveWeekend();
      renderTasks();
    });
    $('checklist').addEventListener('click', (event) => {
      const button = event.target.closest('[data-delete-task]');
      if (!button) return;
      tasks = tasks.filter((task) => task.id !== button.dataset.deleteTask);
      saveWeekend();
      renderTasks();
    });
    $('taskForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const text = $('newTask').value.trim();
      if (!text) return;
      tasks.push({ id: 'custom-' + Date.now(), text, done: false, fixed: false });
      $('newTask').value = '';
      saveWeekend();
      renderTasks();
    });
    $('exportCalendar').addEventListener('click', exportCalendar);
    window.setInterval(() => { renderSessions(); updateClock(); }, 30000);
  }
  function initialize() {
    initializeTabs();
    initializeWeekend();
    updateClock();
    $('runSimulation').addEventListener('click', runStrategy);
    $('runChampionship').addEventListener('click', runChampionship);
    document.querySelectorAll('#module-championship input').forEach((input) => {
      input.addEventListener('change', () => {
        if ($('champStatus').textContent !== '等待计算') $('champStatus').textContent = '参数已变更 · 需重新推演';
      });
    });
    runStrategy();
    runChampionship();
  }
  document.addEventListener('DOMContentLoaded', initialize);
})();


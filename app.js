(() => {
  'use strict';

  const STORAGE_KEY = 'xiaocai-journal-v1';
  const DLT_MAX_BETS = 10000;
  const SSQ_MAX_BETS = 10000;
  const DLT_PACKAGES = {
    18: { singles: 6, multiples: [{ front: 5, back: 3 }] },
    28: { singles: 8, multiples: [{ front: 6, back: 2 }] },
    36: { singles: 8, multiples: [{ front: 5, back: 5 }] },
    58: { singles: 8, multiples: [{ front: 7, back: 2 }] },
    66: { singles: 5, multiples: [{ front: 6, back: 3 }, { front: 5, back: 5 }] },
    88: { singles: 5, multiples: [{ front: 7, back: 2 }, { front: 6, back: 3 }] }
  };
  const QUICK_GAMES = {
    p3: { label: '排列3', type: 'digits', length: 3 },
    p5: { label: '排列5', type: 'digits', length: 5 },
    fc3d: { label: '福彩3D', type: 'digits', length: 3 },
    kl8: { label: '快乐8', type: 'numbers', max: 80 }
  };
  const data = loadData();
  const ui = {
    view: 'today', rollPending: false, ...data.lottery
  };

  function loadData() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const records = Array.isArray(parsed.records) ? parsed.records : [];
      return { records: records.map(cleanRecord).filter(Boolean), lottery: cleanLotteryState(parsed.lottery) };
    } catch (_) {
      return { records: [], lottery: cleanLotteryState(null) };
    }
  }

  function cleanNumbers(values, max) {
    if (!Array.isArray(values)) return [];
    return [...new Set(values.map(Number).filter(value => Number.isInteger(value) && value >= 1 && value <= max))].sort((a, b) => a - b);
  }

  function packageComponentDefinitions(amount) {
    const format = DLT_PACKAGES[amount];
    if (!format) return [];
    const components = Array.from({ length: format.singles }, (_, index) => ({
      id: `s${index + 1}`, kind: 'single', label: `单式 ${index + 1}`, frontCount: 5, backCount: 2
    }));
    format.multiples.forEach((multiple, index) => components.push({
      id: `m${index + 1}`, kind: 'multiple', label: `复式 ${multiple.front}+${multiple.back}`,
      frontCount: multiple.front, backCount: multiple.back
    }));
    return components;
  }

  function cleanPackageDrafts(raw) {
    const drafts = {};
    Object.keys(DLT_PACKAGES).forEach(amount => {
      const source = raw && raw[amount] && typeof raw[amount] === 'object' ? raw[amount] : {};
      drafts[amount] = {};
      packageComponentDefinitions(Number(amount)).forEach(component => {
        const value = source[component.id] || {};
        drafts[amount][component.id] = { front: cleanNumbers(value.front, 35), back: cleanNumbers(value.back, 12) };
      });
    });
    return drafts;
  }

  function cleanSavedTicket(ticket) {
    if (!ticket || typeof ticket !== 'object') return null;
    const kind = ['single', 'multiple', 'package', 'banker'].includes(ticket.kind) ? ticket.kind : null;
    const game = ticket.game === 'dlt' || ticket.game === 'ssq' ? ticket.game : null;
    if (!kind || !game) return null;
    const maxFront = game === 'dlt' ? 35 : 33;
    const maxBack = game === 'dlt' ? 12 : 16;
    const clean = {
      id: String(ticket.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48),
      game, kind, label: String(ticket.label || '已保存号码').slice(0, 80),
      savedAt: /^\d{4}-\d{2}-\d{2}/.test(ticket.savedAt || '') ? String(ticket.savedAt).slice(0, 25) : new Date().toISOString(),
      front: cleanNumbers(ticket.front, maxFront), back: cleanNumbers(ticket.back, maxBack),
      lines: Math.max(1, Math.floor(Number(ticket.lines) || 1)), price: Math.max(0, Number(ticket.price) || 0)
    };
    if (kind === 'package' && Array.isArray(ticket.components)) {
      clean.amount = Number(DLT_PACKAGES[ticket.amount] ? ticket.amount : 18);
      clean.components = ticket.components.map(component => ({
        label: String(component.label || '投注组合').slice(0, 30),
        kind: component.kind === 'multiple' ? 'multiple' : 'single',
        front: cleanNumbers(component.front, 35), back: cleanNumbers(component.back, 12)
      }));
    }
    if (kind === 'banker' && ticket.banker && typeof ticket.banker === 'object') {
      const cleanGroup = (group, max) => group && typeof group === 'object' ? {
        bankers: cleanNumbers(group.bankers, max), drags: cleanNumbers(group.drags, max), plain: Boolean(group.plain)
      } : null;
      clean.banker = { front: cleanGroup(ticket.banker.front, 35), back: cleanGroup(ticket.banker.back, 12) };
    }
    if (kind === 'banker') clean.banker ||= { front: null, back: null };
    return clean;
  }

  function cleanBankerResult(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const group = (value, max) => value && typeof value === 'object' ? {
      bankers: cleanNumbers(value.bankers, max), drags: cleanNumbers(value.drags, max), plain: Boolean(value.plain)
    } : null;
    const lines = Math.floor(Number(raw.lines));
    if (!Number.isFinite(lines) || lines < 1 || lines > DLT_MAX_BETS) return null;
    return { front: group(raw.front, 35), back: group(raw.back, 12), lines };
  }

  function cleanSavedTickets(tickets, game) {
    return Array.isArray(tickets)
      ? tickets.map(ticket => cleanSavedTicket({ ...ticket, game })).filter(Boolean).slice(-100)
      : [];
  }

  function cleanLotteryState(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const dltMode = ['single', 'multiple', 'dan-tuo', 'package'].includes(source.dltMode) ? source.dltMode : 'single';
    const ssqMode = ['single', 'multiple'].includes(source.ssqMode) ? source.ssqMode : 'single';
    const dltDraftSource = source.dltDrafts && typeof source.dltDrafts === 'object' ? source.dltDrafts : {};
    const ssqDraftSource = source.ssqDrafts && typeof source.ssqDrafts === 'object' ? source.ssqDrafts : {};
    const currentDlt = { front: cleanNumbers(source.dltFront, 35), back: cleanNumbers(source.dltBack, 12) };
    const currentSsq = { front: cleanNumbers(source.ssqRed, 33), back: cleanNumbers(source.ssqBlue, 16) };
    const dltDrafts = {
      single: { front: cleanNumbers(dltDraftSource.single?.front ?? (dltMode === 'single' ? currentDlt.front : []), 35), back: cleanNumbers(dltDraftSource.single?.back ?? (dltMode === 'single' ? currentDlt.back : []), 12) },
      multiple: { front: cleanNumbers(dltDraftSource.multiple?.front ?? (dltMode === 'multiple' ? currentDlt.front : []), 35), back: cleanNumbers(dltDraftSource.multiple?.back ?? (dltMode === 'multiple' ? currentDlt.back : []), 12) }
    };
    const ssqDrafts = {
      single: { front: cleanNumbers(ssqDraftSource.single?.front ?? (ssqMode === 'single' ? currentSsq.front : []), 33), back: cleanNumbers(ssqDraftSource.single?.back ?? (ssqMode === 'single' ? currentSsq.back : []), 16) },
      multiple: { front: cleanNumbers(ssqDraftSource.multiple?.front ?? (ssqMode === 'multiple' ? currentSsq.front : []), 33), back: cleanNumbers(ssqDraftSource.multiple?.back ?? (ssqMode === 'multiple' ? currentSsq.back : []), 16) }
    };
    const amount = DLT_PACKAGES[Number(source.packageAmount)] ? Number(source.packageAmount) : 18;
    const dltBankerResult = cleanBankerResult(source.dltBankerResult);
    return {
      dltMode, ssqMode,
      dltFront: dltDrafts[dltMode === 'multiple' ? 'multiple' : 'single'].front,
      dltBack: dltDrafts[dltMode === 'multiple' ? 'multiple' : 'single'].back,
      ssqRed: ssqDrafts[ssqMode].front, ssqBlue: ssqDrafts[ssqMode].back,
      dltDrafts, ssqDrafts,
      dltRandomFrontCount: Math.max(5, Math.min(35, Math.floor(Number(source.dltRandomFrontCount) || 6))),
      dltRandomBackCount: Math.max(2, Math.min(12, Math.floor(Number(source.dltRandomBackCount) || 3))),
      ssqRandomRedCount: Math.max(6, Math.min(33, Math.floor(Number(source.ssqRandomRedCount) || 7))),
      ssqRandomBlueCount: Math.max(1, Math.min(16, Math.floor(Number(source.ssqRandomBlueCount) || 2))),
      quickK8PlayCount: Math.max(1, Math.min(10, Math.floor(Number(source.quickK8PlayCount) || 5))),
      packageAmount: amount, packageTarget: String(source.packageTarget || 's1'),
      packageDrafts: cleanPackageDrafts(source.packageDrafts), dltBankerResult,
      savedDlt: cleanSavedTickets(source.savedDlt, 'dlt'), savedSsq: cleanSavedTickets(source.savedSsq, 'ssq')
    };
  }

  function cleanRecord(row) {
    if (!row || typeof row !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) return null;
    const diceValue = Math.floor(Number(row.dice));
    const dice = diceValue >= 1 && diceValue <= 6 ? diceValue : null;
    const bought = dice !== null && [2, 4, 6].includes(dice);
    const spend = Number(row.spend);
    const win = Number(row.win);
    const tickets = Array.isArray(row.tickets) ? row.tickets.map(cleanDailyTicket).filter(Boolean).slice(-500) : [];
    if (dice === null && tickets.length === 0) return null;
    return {
      date: row.date,
      dice,
      bought,
      spend: bought && Number.isFinite(spend) && spend >= 0 ? spend : 0,
      win: Number.isFinite(win) && win >= 0 ? win : 0,
      tickets
    };
  }

  function cleanDailyTicket(ticket) {
    if (!ticket || typeof ticket !== 'object') return null;
    const id = String(ticket.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || `${ticket.game}-${Date.now()}`;
    const recordedAt = /^\d{4}-\d{2}-\d{2}T/.test(ticket.recordedAt || '') ? String(ticket.recordedAt).slice(0, 25) : new Date().toISOString();
    if (QUICK_GAMES[ticket.game]) {
      const game = QUICK_GAMES[ticket.game];
      const numbers = Array.isArray(ticket.numbers) ? ticket.numbers.map(Number) : [];
      const validDigits = game.type === 'digits' && numbers.length === game.length && numbers.every(value => Number.isInteger(value) && value >= 0 && value <= 9);
      const validKeno = game.type === 'numbers' && numbers.length >= 1 && numbers.length <= 10 && numbers.every(value => Number.isInteger(value) && value >= 1 && value <= game.max) && new Set(numbers).size === numbers.length;
      if (!validDigits && !validKeno) return null;
      return {
        id, game: ticket.game,
        play: game.type === 'numbers' ? `选${numbers.length}` : '直选单式',
        numbers: game.type === 'numbers' ? [...numbers].sort((a, b) => a - b) : numbers,
        cost: 2, recordedAt
      };
    }
    if (ticket.game !== 'dlt' && ticket.game !== 'ssq') return null;
    const kind = ['single', 'multiple', 'banker', 'package'].includes(ticket.kind) ? ticket.kind : null;
    const lines = Math.floor(Number(ticket.lines));
    const cost = Number(ticket.cost);
    if (!kind || !Number.isInteger(lines) || lines < 1 || lines > 10000 || !Number.isFinite(cost) || cost < 0) return null;
    const maxFront = ticket.game === 'dlt' ? 35 : 33;
    const maxBack = ticket.game === 'dlt' ? 12 : 16;
    const clean = {
      id, game: ticket.game, kind,
      label: String(ticket.label || (ticket.game === 'dlt' ? '大乐透随机号码' : '双色球随机号码')).slice(0, 100),
      play: String(ticket.play || ticket.label || '').slice(0, 100),
      lines, cost: Math.round(cost * 100) / 100,
      front: cleanNumbers(ticket.front, maxFront), back: cleanNumbers(ticket.back, maxBack), recordedAt
    };
    if (kind === 'package') {
      const amount = Number(ticket.amount);
      if (ticket.game !== 'dlt' || !DLT_PACKAGES[amount] || !Array.isArray(ticket.components)) return null;
      clean.amount = amount;
      clean.components = ticket.components.map(component => ({
        label: String(component.label || '组合').slice(0, 30),
        kind: component.kind === 'multiple' ? 'multiple' : 'single',
        front: cleanNumbers(component.front, 35), back: cleanNumbers(component.back, 12)
      }));
      if (!clean.components.length) return null;
    }
    if (kind === 'banker') {
      if (ticket.game !== 'dlt') return null;
      const banker = cleanBankerResult({ front: ticket.banker?.front, back: ticket.banker?.back, lines });
      if (!banker) return null;
      clean.banker = { front: banker.front, back: banker.back };
    }
    if ((kind === 'single' || kind === 'multiple') && (!clean.front.length || !clean.back.length)) return null;
    return clean;
  }

  function persist() {
    try {
      const lottery = { ...ui };
      delete lottery.view;
      delete lottery.rollPending;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ records: data.records, lottery }));
      return true;
    } catch (_) {
      return false;
    }
  }

  function todayKey() {
    const now = new Date();
    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  }

  function formatDate(dateKey, includeWeekday = false) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const options = includeWeekday
      ? { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }
      : { year: 'numeric', month: 'short', day: 'numeric' };
    return new Intl.DateTimeFormat('zh-CN', options).format(date);
  }

  function money(value) {
    const amount = Number(value) || 0;
    return '¥' + amount.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function randomInt(maxExclusive) {
    if (maxExclusive <= 1) return 0;
    if (window.crypto && window.crypto.getRandomValues) {
      const ceiling = 0x100000000 - (0x100000000 % maxExclusive);
      const value = new Uint32Array(1);
      do { window.crypto.getRandomValues(value); } while (value[0] >= ceiling);
      return value[0] % maxExclusive;
    }
    return Math.floor(Math.random() * maxExclusive);
  }

  function randomUnique(max, count) {
    const values = Array.from({ length: max }, (_, index) => index + 1);
    for (let index = 0; index < count; index += 1) {
      const swapIndex = index + randomInt(max - index);
      [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
    }
    return values.slice(0, count).sort((a, b) => a - b);
  }

  function combination(n, k) {
    if (k < 0 || n < k) return 0;
    let result = 1;
    const steps = Math.min(k, n - k);
    for (let index = 1; index <= steps; index += 1) result = result * (n - steps + index) / index;
    return Math.round(result);
  }

  function getRecord(dateKey) {
    return data.records.find(record => record.date === dateKey);
  }

  function totalRecordSpend(record) {
    if (!record) return 0;
    return record.spend + (record.tickets || []).reduce((total, ticket) => total + ticket.cost, 0);
  }

  function upsertRecord(record) {
    const index = data.records.findIndex(item => item.date === record.date);
    if (index >= 0) data.records[index] = record;
    else data.records.push(record);
    data.records.sort((a, b) => a.date.localeCompare(b.date));
    persist();
  }

  function renderDie(dice) {
    const activeByNumber = {
      1: [4], 2: [0, 8], 3: [0, 4, 8],
      4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 3, 6, 2, 5, 8]
    };
    const die = document.getElementById('die');
    [...die.children].forEach((pip, index) => pip.classList.toggle('on', (activeByNumber[dice] || []).includes(index)));
    die.setAttribute('aria-label', dice ? `骰子点数 ${dice}` : '尚未掷骰子');
    die.classList.remove('rolling');
  }

  function totals() {
    return data.records.reduce((result, record) => {
      result.spend += totalRecordSpend(record);
      result.win += record.win;
      return result;
    }, { spend: 0, win: 0 });
  }

  function renderTotals() {
    const sum = totals();
    const net = sum.win - sum.spend;
    document.getElementById('total-spend').textContent = money(sum.spend);
    document.getElementById('total-win').textContent = money(sum.win);
    const netNode = document.getElementById('total-net');
    netNode.textContent = money(net);
    netNode.style.color = net >= 0 ? '#dff09f' : '#f09a8c';
    document.getElementById('net-caption').textContent = data.records.length ? (net >= 0 ? '目前为正' : '目前为负') : '从今天开始记录';
    document.getElementById('record-days').textContent = `${data.records.length} 天`;
    document.getElementById('records-spend').textContent = money(sum.spend);
    const recordsNet = document.getElementById('records-net');
    recordsNet.textContent = money(net);
    recordsNet.classList.toggle('net-positive', net >= 0);
    recordsNet.classList.toggle('net-negative', net < 0);
  }

  function renderToday() {
    const dateKey = todayKey();
    const record = getRecord(dateKey);
    const hasDice = Boolean(record && record.dice);
    const daySpend = totalRecordSpend(record);
    document.getElementById('today-date').textContent = formatDate(dateKey, true);
    const title = document.getElementById('decision-title');
    const detail = document.getElementById('decision-detail');
    const kicker = document.getElementById('result-kicker');
    const spend = document.getElementById('spend-value');
    const rollButton = document.getElementById('roll-dice');
    const lockedHint = document.getElementById('locked-hint');
    const winInput = document.getElementById('today-win');
    const saveButton = document.getElementById('save-today-win');

    if (!hasDice) {
      renderDie(null);
      kicker.textContent = record?.tickets?.length ? '今天的随机号码已记入记录' : '轮到好运气做决定';
      title.textContent = record?.tickets?.length ? '今天的号码和支出已保存' : '掷一下，看看今天';
      detail.textContent = record?.tickets?.length
        ? `已记录 ${record.tickets.length} 注、${money(daySpend)}；仍可掷骰子记录今日决定。`
        : '1、3、5 休息 · 2、4、6 购彩';
      spend.textContent = daySpend > 0 ? money(daySpend) : '¥ —';
      rollButton.disabled = ui.rollPending;
      rollButton.innerHTML = '<span class="button-icon">↻</span>掷骰子';
      lockedHint.textContent = record?.tickets?.length ? '今天已经记录的随机号码不会因掷骰子而覆盖。' : '掷出后会自动保存，今天不能重复掷。';
      winInput.disabled = !record;
      winInput.value = record?.win || '';
      saveButton.disabled = !record;
      document.getElementById('today-feedback').textContent = record ? '填入实际中奖金额并保存；未中奖可填 0。' : '先掷骰子或生成随机号码，开始今天的记录。';
      return;
    }

    renderDie(record.dice);
    rollButton.disabled = true;
    rollButton.innerHTML = '<span class="button-icon">✓</span>今日已完成';
    lockedHint.textContent = '今天的结果已保存，明天再掷。';
    winInput.disabled = false;
    winInput.value = record.win || '';
    saveButton.disabled = false;
    document.getElementById('today-feedback').textContent = record.win > 0 ? '中奖金额已记录，可随时修改。' : '填入实际中奖金额并保存；未中奖可填 0。';

    if (record.bought) {
      kicker.textContent = `今天掷到 ${record.dice} · 随机选定购彩金额`;
      title.textContent = '今天按计划购彩';
      detail.textContent = record.tickets?.length
        ? `骰子金额 ${money(record.spend)}，另有 ${record.tickets.length} 注随机号码；今日共记 ${money(daySpend)}。`
        : '可按这个金额购买所选玩法的彩票。';
      spend.textContent = money(daySpend);
    } else {
      kicker.textContent = `今天掷到 ${record.dice} · 休息日`;
      title.textContent = '今天不购彩';
      detail.textContent = record.tickets?.length
        ? `骰子建议休息；今天另记了 ${record.tickets.length} 注随机号码，合计 ${money(daySpend)}。`
        : '把预算留在手里，也是一种好选择。';
      spend.textContent = money(daySpend);
    }
  }

  function quickTicketNumbers(ticket) {
    const game = QUICK_GAMES[ticket.game];
    if (game?.type === 'digits') return ticket.numbers.join('');
    if (game?.type === 'numbers') return ticket.numbers.map(value => String(value).padStart(2, '0')).join(' ');
    const format = values => values.map(value => String(value).padStart(2, '0')).join(' ');
    if (ticket.kind === 'package') {
      return ticket.components.map(component => `${component.label} ${format(component.front)} + ${format(component.back)}`).join('；');
    }
    if (ticket.kind === 'banker') {
      const group = (name, value) => !value ? '' : value.plain
        ? `${name} ${format(value.drags)}`
        : `${name}胆 ${format(value.bankers)} 拖 ${format(value.drags)}`;
      return [group('前区', ticket.banker.front), group('后区', ticket.banker.back)].filter(Boolean).join('；') + ` · ${ticket.lines} 注`;
    }
    return `${format(ticket.front)} + ${format(ticket.back)}${ticket.lines > 1 ? ` · ${ticket.lines} 注` : ''}`;
  }

  function dailyTicketTitle(ticket) {
    return QUICK_GAMES[ticket.game]?.label
      ? `${QUICK_GAMES[ticket.game].label} · ${ticket.play}`
      : ticket.label;
  }

  function dailyTicketsMarkup(tickets) {
    if (!tickets?.length) return '<span class="record-no-tickets">—</span>';
    return `<div class="daily-ticket-list">${tickets.map(ticket => `<div class="daily-ticket"><strong>${escapeHtml(dailyTicketTitle(ticket))}</strong><span>${escapeHtml(quickTicketNumbers(ticket))}</span><em>${money(ticket.cost)}</em></div>`).join('')}</div>`;
  }

  function renderRecords() {
    const body = document.getElementById('records-body');
    const empty = document.getElementById('empty-records');
    const records = [...data.records].sort((a, b) => b.date.localeCompare(a.date));
    document.getElementById('record-count').textContent = `${records.length} 条`;
    empty.classList.toggle('visible', records.length === 0);
    body.innerHTML = records.map(record => {
      const daySpend = totalRecordSpend(record);
      const net = record.win - daySpend;
      const result = record.dice
        ? (record.bought ? '骰子 · 购彩' : '骰子 · 休息')
        : '仅选号记录';
      return `<tr>
        <td>${formatDate(record.date)}</td>
        <td>${record.dice ? `<span class="dice-pill">${record.dice}</span>` : '<span class="record-no-tickets">—</span>'}</td>
        <td class="${record.bought ? 'status-bought' : 'status-rest'}">${result}</td>
        <td>${dailyTicketsMarkup(record.tickets)}</td>
        <td class="table-spend">${money(daySpend)}</td>
        <td><input class="table-win-input" type="number" min="0" step="0.01" inputmode="decimal" value="${record.win || ''}" placeholder="0" aria-label="${formatDate(record.date)}中奖金额"></td>
        <td class="${net >= 0 ? 'net-positive' : 'net-negative'}">${money(net)}</td>
        <td><button class="table-save" type="button" data-save-win="${record.date}">保存</button></td>
      </tr>`;
    }).join('');
    renderTotals();
  }

  function showView(viewName) {
    ui.view = viewName;
    document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === `view-${viewName}`));
    document.querySelectorAll('[data-nav]').forEach(button => button.classList.toggle('active', button.dataset.nav === viewName));
    if (viewName === 'today') renderToday();
    if (viewName === 'records') renderRecords();
    if (viewName === 'dlt') renderDlt();
    if (viewName === 'ssq') renderSsq();
    if (viewName === 'quick-picks') renderQuickPicks();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function rollToday() {
    const date = todayKey();
    const existing = getRecord(date);
    if (existing?.dice || ui.rollPending) return;
    ui.rollPending = true;
    document.getElementById('roll-dice').disabled = true;
    const die = document.getElementById('die');
    die.classList.add('rolling');
    const dice = randomInt(6) + 1;
    const bought = [2, 4, 6].includes(dice);
    const spendOptions = [10, 20, 30, 50];
    const spend = bought ? spendOptions[randomInt(spendOptions.length)] : 0;
    window.setTimeout(() => {
      const latestRecord = getRecord(date);
      upsertRecord({
        ...(latestRecord || {}), date, dice, bought, spend,
        win: latestRecord?.win || 0, tickets: latestRecord?.tickets || []
      });
      ui.rollPending = false;
      renderToday();
      renderTotals();
    }, 330);
  }

  function saveWin(dateKey, input) {
    const record = getRecord(dateKey);
    if (!record) return;
    const value = input.value.trim() === '' ? 0 : Number(input.value);
    if (!Number.isFinite(value) || value < 0) {
      input.setCustomValidity('请输入不小于 0 的中奖金额');
      input.reportValidity();
      input.setCustomValidity('');
      return;
    }
    upsertRecord({ ...record, win: Math.round(value * 100) / 100 });
    if (dateKey === todayKey()) renderToday();
    renderRecords();
  }

  function ballGrid(max, selected, group, color = '') {
    return `<div class="number-grid">${Array.from({ length: max }, (_, index) => index + 1).map(value => {
      const isSelected = selected.includes(value);
      return `<button type="button" class="number-ball ${color} ${isSelected ? 'selected' : ''}" data-pick="${group}" data-value="${value}" aria-pressed="${isSelected}">${String(value).padStart(2, '0')}</button>`;
    }).join('')}</div>`;
  }

  function miniBalls(values, color = 'dark') {
    return `<span class="mini-balls">${values.map(value => `<span class="mini-ball ${color}">${String(value).padStart(2, '0')}</span>`).join('')}</span>`;
  }

  function ticketRows(tickets, sport = false, totalCost = null) {
    if (!tickets.length) return '<div class="empty-result">生成的号码会显示在这里。</div>';
    const countText = totalCost === null ? `${tickets.length} 组` : `${tickets.length} 注 · ${money(totalCost)}`;
    return `<div class="result-area"><div class="result-heading"><strong>${totalCost === null ? '随机号码' : '号码预览'}</strong><span>${countText}</span></div>${tickets.map((ticket, index) => `<div class="ticket-row"><span class="ticket-index">${String(index + 1).padStart(2, '0')}</span>${miniBalls(ticket.front, 'red')}${sport ? '<span class="ticket-divider">＋</span>' : '<span class="ticket-divider">+</span>'}${miniBalls(ticket.back, 'blue')}</div>`).join('')}</div>`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function savedTicketsMarkup(game) {
    const tickets = game === 'dlt' ? ui.savedDlt : ui.savedSsq;
    const title = game === 'dlt' ? '已保存的大乐透号码' : '已保存的双色球号码';
    const rows = tickets.map(ticket => {
      let details = '';
      if (ticket.kind === 'package') {
        details = ticket.components.map(component => `<div class="saved-line"><span>${escapeHtml(component.label)}</span>${miniBalls(component.front, 'red')}<span class="ticket-divider">+</span>${miniBalls(component.back, 'blue')}</div>`).join('');
      } else if (ticket.kind === 'banker') {
        const group = (name, values, color) => !values ? '' : values.plain
          ? `<div class="saved-line"><span>${name}</span>${miniBalls(values.drags, color)}<span class="package-label">单式号码</span></div>`
          : `<div class="saved-line"><span>${name}</span>${miniBalls(values.bankers, color)}<span class="package-label">胆码</span>${miniBalls(values.drags, 'dark')}<span class="package-label">拖码</span></div>`;
        details = group('前区', ticket.banker.front, 'red') + group('后区', ticket.banker.back, 'blue');
      } else {
        details = `<div class="saved-line">${miniBalls(ticket.front, 'red')}<span class="ticket-divider">+</span>${miniBalls(ticket.back, 'blue')}</div>`;
      }
      return `<article class="saved-ticket"><div class="saved-ticket-head"><div><strong>${escapeHtml(ticket.label)}</strong><small>${escapeHtml(ticket.savedAt.slice(0, 10))} · ${ticket.lines} 注 · ${money(ticket.price)}</small></div><div class="saved-ticket-actions"><button type="button" class="saved-use" data-load-saved-game="${game}" data-load-saved-id="${escapeHtml(ticket.id)}">载入</button><button type="button" class="saved-delete" data-delete-saved-game="${game}" data-delete-saved-id="${escapeHtml(ticket.id)}" aria-label="删除已保存号码">删除</button></div></div>${details}</article>`;
    }).join('');
    return `<section class="saved-section"><div class="saved-section-head"><div><h3>${title}</h3><p>号码草稿会自动保存；点“保存号码”可留作常用组合。</p></div><span class="count-pill">${tickets.length} 组</span></div>${ui.savedNotice === game ? '<p class="saved-notice">号码已保存到本机列表。</p>' : ''}${rows || '<div class="empty-result">还没有单独保存的号码组合。</div>'}</section>`;
  }

  function syncCurrentDraft() {
    if (ui.dltMode === 'single' || ui.dltMode === 'multiple') {
      ui.dltDrafts[ui.dltMode] = { front: [...ui.dltFront], back: [...ui.dltBack] };
    }
    if (ui.ssqMode === 'single' || ui.ssqMode === 'multiple') {
      ui.ssqDrafts[ui.ssqMode] = { front: [...ui.ssqRed], back: [...ui.ssqBlue] };
    }
  }

  function persistLottery() {
    syncCurrentDraft();
    persist();
  }

  function currentPackageEntries() {
    const draft = ui.packageDrafts[ui.packageAmount];
    return packageComponentDefinitions(ui.packageAmount).map(component => ({
      ...component,
      selection: draft[component.id]
    }));
  }

  function packageReady(entries = currentPackageEntries()) {
    return entries.every(component => component.selection.front.length === component.frontCount && component.selection.back.length === component.backCount);
  }

  function packageLines(entries = currentPackageEntries()) {
    return entries.reduce((total, component) => total + (component.kind === 'single'
      ? 1
      : combination(component.frontCount, 5) * combination(component.backCount, 2)), 0);
  }

  function renderPackageResult(entries) {
    if (!packageReady(entries)) return '<div class="empty-result result-area">请为这套套餐中的每个单式和复式组合选好号码。</div>';
    return `<div class="result-area"><div class="result-heading"><strong>${ui.packageAmount} 元固定套餐预览</strong><span>${packageLines(entries)} 注 · ${money(ui.packageAmount)}</span></div>${entries.map(component => `<div class="ticket-row"><span class="ticket-index">${escapeHtml(component.label)}</span>${miniBalls(component.selection.front, 'red')}<span class="ticket-divider">+</span>${miniBalls(component.selection.back, 'blue')}<span class="package-label">${component.kind === 'single' ? '单式 1 注' : `${combination(component.frontCount, 5) * combination(component.backCount, 2)} 注`}</span></div>`).join('')}</div>`;
  }

  function renderPackageMode(content) {
    const entries = currentPackageEntries();
    let target = entries.find(component => component.id === ui.packageTarget);
    if (!target) {
      target = entries[0];
      ui.packageTarget = target.id;
    }
    const selection = target.selection;
    const dailyAlreadyRecorded = packageReady(entries) && hasLotteryTicketToday('dlt', currentTicketSnapshot('dlt'));
    const formatText = packageComponentDefinitions(ui.packageAmount).map(component => component.kind === 'single'
      ? '单式 5+2' : `复式 ${component.frontCount}+${component.backCount}`).reduce((summary, label) => {
        summary[label] = (summary[label] || 0) + 1;
        return summary;
      }, {});
    const formatSummary = Object.entries(formatText).map(([label, count]) => `${label} × ${count}`).join(' · ');
    content.innerHTML = `<div class="tool-intro"><div><div class="tool-kicker">FIXED PACKAGE</div><h2>固定格式套餐票</h2><p>手动选齐整套号码后，可点“记入今日支出”；“保存号码”会放入常用号码库。</p></div><span class="tiny-note">按固定模板</span></div>
      <div class="choice-row package-picker"><label class="select-label" for="package-amount">固定金额</label><select id="package-amount" class="select-field">${Object.keys(DLT_PACKAGES).map(amount => `<option value="${amount}" ${Number(amount) === ui.packageAmount ? 'selected' : ''}>${amount} 元</option>`).join('')}</select><span class="package-format-summary">${formatSummary}</span></div>
      <div class="package-components">${entries.map(component => {
        const done = component.selection.front.length === component.frontCount && component.selection.back.length === component.backCount;
        return `<button type="button" class="package-component ${component.id === target.id ? 'active' : ''} ${done ? 'complete' : ''}" data-package-target="${component.id}"><strong>${escapeHtml(component.label)}</strong><small>${done ? '号码已选好' : `前 ${component.selection.front.length}/${component.frontCount} · 后 ${component.selection.back.length}/${component.backCount}`}</small></button>`;
      }).join('')}</div>
      <div class="number-group"><div class="number-group-head"><strong><span class="red-text">●</span> ${escapeHtml(target.label)} · 前区号码</strong><span>请选择 ${target.frontCount} 个</span></div>${ballGrid(35, selection.front, 'package-front')}</div>
      <div class="number-group"><div class="number-group-head"><strong><span class="blue-text">●</span> ${escapeHtml(target.label)} · 后区号码</strong><span>请选择 ${target.backCount} 个</span></div>${ballGrid(12, selection.back, 'package-back')}</div>
      <div class="tool-actions"><span class="ticket-cost">整套金额固定<strong>${money(ui.packageAmount)}</strong><span class="muted-cost">号码齐全后计入支出</span></span><div class="inline-controls"><button class="light-button" id="random-package-part">随机当前组合</button><button class="light-button" id="random-package-all">整套随机并记支出</button><button class="light-button" data-record-ticket="dlt" ${packageReady(entries) && !dailyAlreadyRecorded ? '' : 'disabled'}>${dailyAlreadyRecorded ? '已记入今日' : '记入今日支出'}</button><button class="light-button" id="clear-package-part">清空当前</button><button class="primary-button" id="save-dlt-ticket" ${packageReady(entries) ? '' : 'disabled'}>保存号码</button></div></div>
      ${renderPackageResult(entries)}${savedTicketsMarkup('dlt')}`;
  }

  function renderDlt() {
    document.querySelectorAll('[data-dlt-mode]').forEach(button => button.classList.toggle('active', button.dataset.dltMode === ui.dltMode));
    const content = document.getElementById('dlt-mode-content');
    if (ui.dltMode === 'single') {
      const valid = ui.dltFront.length === 5 && ui.dltBack.length === 2;
      const dailyAlreadyRecorded = valid && hasLotteryTicketToday('dlt', currentTicketSnapshot('dlt'));
      content.innerHTML = `<div class="tool-intro"><div><div class="tool-kicker">SINGLE BET</div><h2>单式选号</h2><p>手动选好号码后点“记入今日支出”；“保存号码”会放入常用号码库。</p></div><span class="tiny-note">5 + 2 · ¥2</span></div>
        <div class="number-group"><div class="number-group-head"><strong><span class="red-text">●</span> 前区号码</strong><span>已选 ${ui.dltFront.length} / 5</span></div>${ballGrid(35, ui.dltFront, 'dlt-front')}</div>
        <div class="number-group"><div class="number-group-head"><strong><span class="blue-text">●</span> 后区号码</strong><span>已选 ${ui.dltBack.length} / 2</span></div>${ballGrid(12, ui.dltBack, 'dlt-back')}</div>
        <div class="tool-actions"><span class="ticket-cost">${valid ? '单式金额' : '选满 5 + 2 个号码'}<strong>${valid ? money(2) : '—'}</strong></span><div class="inline-controls"><button class="light-button" id="clear-dlt-single">清空</button><button class="primary-button" id="random-dlt-single">随机一注并记支出 <span>→</span></button><button class="light-button" data-record-ticket="dlt" ${valid && !dailyAlreadyRecorded ? '' : 'disabled'}>${dailyAlreadyRecorded ? '已记入今日' : '记入今日支出'}</button><button class="light-button" id="save-dlt-ticket" ${valid ? '' : 'disabled'}>保存号码</button></div></div>${valid ? ticketRows([{ front: ui.dltFront, back: ui.dltBack }], false, 2) : '<div class="empty-result result-area">继续选择号码，选满后会显示单式预览。</div>'}${savedTicketsMarkup('dlt')}`;
      return;
    }
    if (ui.dltMode === 'multiple') {
      const lineCount = combination(ui.dltFront.length, 5) * combination(ui.dltBack.length, 2);
      const valid = ui.dltFront.length >= 5 && ui.dltBack.length >= 2 && lineCount <= DLT_MAX_BETS;
      const dailyAlreadyRecorded = valid && hasLotteryTicketToday('dlt', currentTicketSnapshot('dlt'));
      const cost = lineCount * 2;
      const randomLines = combination(ui.dltRandomFrontCount, 5) * combination(ui.dltRandomBackCount, 2);
      const randomValid = randomLines > 0 && randomLines <= DLT_MAX_BETS;
      const frontOptions = Array.from({ length: 31 }, (_, index) => index + 5);
      const backOptions = Array.from({ length: 11 }, (_, index) => index + 2);
      content.innerHTML = `<div class="tool-intro"><div><div class="tool-kicker">MULTIPLE SELECTION</div><h2>选择复式号码</h2><p>号码选好后可点“记入今日支出”；“保存号码”会放入常用号码库。</p></div></div>
        <div class="number-group"><div class="number-group-head"><strong><span class="red-text">●</span> 前区号码</strong><span>已选 ${ui.dltFront.length} 个 · 需至少 5 个</span></div>${ballGrid(35, ui.dltFront, 'dlt-front')}<div class="helper-row"><span>01–35 中选择号码</span><span>${ui.dltFront.length > 5 ? `${combination(ui.dltFront.length, 5)} 种前区组合` : ''}</span></div></div>
        <div class="number-group"><div class="number-group-head"><strong><span class="blue-text">●</span> 后区号码</strong><span>已选 ${ui.dltBack.length} 个 · 需至少 2 个</span></div>${ballGrid(12, ui.dltBack, 'dlt-back')}<div class="helper-row"><span>01–12 中选择号码</span><span>${ui.dltBack.length > 2 ? `${combination(ui.dltBack.length, 2)} 种后区组合` : ''}</span></div></div>
        <div class="choice-row random-counts"><span class="select-label">随机选号数量</span><label for="dlt-random-front-count">前区</label><select id="dlt-random-front-count" class="select-field">${frontOptions.map(count => `<option value="${count}" ${count === ui.dltRandomFrontCount ? 'selected' : ''}>${count} 个</option>`).join('')}</select><label for="dlt-random-back-count">后区</label><select id="dlt-random-back-count" class="select-field">${backOptions.map(count => `<option value="${count}" ${count === ui.dltRandomBackCount ? 'selected' : ''}>${count} 个</option>`).join('')}</select><span class="subtle-caption">${randomValid ? `随机后为 ${randomLines.toLocaleString('zh-CN')} 注 · ${money(randomLines * 2)}` : '组合超过单票金额上限，请减少号码数'}</span></div>
        <div class="tool-actions"><div class="ticket-cost">${valid ? `组合注数 <strong>${lineCount.toLocaleString('zh-CN')} 注</strong><span class="muted-cost">应付 ${money(cost)}</span>` : `<span>${lineCount > DLT_MAX_BETS ? '金额超过单票 20,000 元上限' : '请按要求选择号码'}</span>`}</div><div class="inline-controls"><button class="light-button" id="random-dlt-multiple" ${randomValid ? '' : 'disabled'}>随机并记支出</button><button class="light-button" data-record-ticket="dlt" ${valid && !dailyAlreadyRecorded ? '' : 'disabled'}>${dailyAlreadyRecorded ? '已记入今日' : '记入今日支出'}</button><button class="light-button" id="clear-dlt-multiple">清空</button><button class="light-button" id="save-dlt-ticket" ${valid ? '' : 'disabled'}>保存号码</button></div></div>
        ${!valid && lineCount > DLT_MAX_BETS ? '<p class="subtle-caption">请减少已选号码；当前票面超过单张彩票的金额上限。</p>' : ''}${savedTicketsMarkup('dlt')}`;
      return;
    }
    if (ui.dltMode === 'dan-tuo') {
      const mode = document.getElementById('banker-kind')?.value || 'both';
      const frontBankers = Number(document.getElementById('front-bankers')?.value || 2);
      const frontTotal = Number(document.getElementById('front-total')?.value || 6);
      const backTotal = Number(document.getElementById('back-total')?.value || 3);
      const showFront = mode !== 'back';
      const showBack = mode !== 'front';
      content.innerHTML = `<div class="tool-intro"><div><div class="tool-kicker">DAN-TUO RANDOM</div><h2>随机生成胆码 + 拖码</h2><p>胆码固定出现在每注里，拖码与胆码组合；页面按组合数计算票价。</p></div></div>
        <div class="choice-row"><label class="select-label" for="banker-kind">胆拖区域</label><select id="banker-kind" class="select-field"><option value="both" ${mode === 'both' ? 'selected' : ''}>前后区双区胆拖</option><option value="front" ${mode === 'front' ? 'selected' : ''}>仅前区胆拖</option><option value="back" ${mode === 'back' ? 'selected' : ''}>仅后区胆拖</option></select></div>
        ${showFront ? `<div class="choice-row"><label class="select-label" for="front-bankers">前区胆码</label><select id="front-bankers" class="select-field">${[1,2,3,4].map(n => `<option value="${n}" ${n === frontBankers ? 'selected' : ''}>${n} 个</option>`).join('')}</select><label class="select-label" for="front-total">前区总数</label><select id="front-total" class="select-field">${[6,7,8,9,10,11,12].map(n => `<option value="${n}" ${n === frontTotal ? 'selected' : ''}>${n} 个</option>`).join('')}</select></div>` : ''}
        ${showBack ? `<div class="choice-row"><label class="select-label" for="back-total">后区总数</label><select id="back-total" class="select-field">${[3,4,5,6,7,8].map(n => `<option value="${n}" ${n === backTotal ? 'selected' : ''}>${n} 个</option>`).join('')}</select><span class="subtle-caption">含 1 个后区胆码，至少 2 个拖码</span></div>` : ''}
        <div class="tool-actions"><span class="ticket-cost">随机后会按注数计价并记入今日支出</span><div class="inline-controls"><button class="primary-button" id="random-dlt-banker">随机生成并记支出 <span>→</span></button><button class="light-button" id="save-dlt-ticket" ${ui.dltBankerResult ? '' : 'disabled'}>保存号码</button></div></div>${renderBankerResult()}${savedTicketsMarkup('dlt')}`;
      return;
    }
    renderPackageMode(content);
  }

  function renderBankerResult() {
    const result = ui.dltBankerResult;
    if (!result) return '<div class="empty-result result-area">生成的胆码、拖码和注数会显示在这里。</div>';
    const cost = result.lines * 2;
    const groups = [];
    if (result.front?.plain) groups.push(`<div class="ticket-row"><span class="ticket-index">前区</span>${miniBalls(result.front.drags, 'red')}<span class="package-label">单式号码</span></div>`);
    else if (result.front) groups.push(`<div class="ticket-row"><span class="ticket-index">前区</span>${miniBalls(result.front.bankers, 'red')}<span class="package-label">胆码</span>${miniBalls(result.front.drags, 'dark')}<span class="package-label">拖码</span></div>`);
    if (result.back?.plain) groups.push(`<div class="ticket-row"><span class="ticket-index">后区</span>${miniBalls(result.back.drags, 'blue')}<span class="package-label">单式号码</span></div>`);
    else if (result.back) groups.push(`<div class="ticket-row"><span class="ticket-index">后区</span>${miniBalls(result.back.bankers, 'blue')}<span class="package-label">胆码</span>${miniBalls(result.back.drags, 'dark')}<span class="package-label">拖码</span></div>`);
    return `<div class="result-area"><div class="result-heading"><strong>随机胆拖组合</strong><span>${result.lines} 注 · ${money(cost)}</span></div>${groups.join('')}<p class="subtle-caption">每注包含全部胆码，再从对应拖码中按规则补足。实际出票与奖金以销售终端及官方结果为准。</p></div>`;
  }

  function createDltTicket() {
    return { front: randomUnique(35, 5), back: randomUnique(12, 2) };
  }

  function togglePick(group, value) {
    const target = {
      'dlt-front': ui.dltFront, 'dlt-back': ui.dltBack,
      'ssq-red': ui.ssqRed, 'ssq-blue': ui.ssqBlue,
      'package-front': ui.packageDrafts[ui.packageAmount][ui.packageTarget]?.front,
      'package-back': ui.packageDrafts[ui.packageAmount][ui.packageTarget]?.back
    }[group];
    if (!target) return;
    const index = target.indexOf(value);
    if (index >= 0) target.splice(index, 1);
    else {
      const packageComponent = group.startsWith('package-') ? packageComponentDefinitions(ui.packageAmount).find(component => component.id === ui.packageTarget) : null;
      const limits = {
        'dlt-front': 5, 'dlt-back': 2, 'ssq-red': 6, 'ssq-blue': 1,
        'package-front': packageComponent?.frontCount, 'package-back': packageComponent?.backCount
      };
      const isSingle = group.startsWith('dlt-') ? ui.dltMode === 'single' : ui.ssqMode === 'single';
      if ((isSingle || packageComponent) && target.length >= limits[group]) return;
      target.push(value);
    }
    target.sort((a, b) => a - b);
  }

  function currentTicketSnapshot(game) {
    if (game === 'dlt') {
      if (ui.dltMode === 'single') {
        if (ui.dltFront.length !== 5 || ui.dltBack.length !== 2) return null;
        return { kind: 'single', label: '大乐透单式', lines: 1, price: 2, front: [...ui.dltFront], back: [...ui.dltBack] };
      }
      if (ui.dltMode === 'multiple') {
        const lines = combination(ui.dltFront.length, 5) * combination(ui.dltBack.length, 2);
        if (ui.dltFront.length < 5 || ui.dltBack.length < 2 || lines < 1 || lines > DLT_MAX_BETS) return null;
        return { kind: 'multiple', label: `大乐透复式 ${ui.dltFront.length}+${ui.dltBack.length}`, lines, price: lines * 2, front: [...ui.dltFront], back: [...ui.dltBack] };
      }
      if (ui.dltMode === 'package') {
        const entries = currentPackageEntries();
        if (!packageReady(entries)) return null;
        return {
          kind: 'package', label: `大乐透 ${ui.packageAmount} 元套餐`, amount: ui.packageAmount,
          lines: packageLines(entries), price: ui.packageAmount,
          components: entries.map(component => ({ label: component.label, kind: component.kind, front: [...component.selection.front], back: [...component.selection.back] }))
        };
      }
      if (ui.dltMode === 'dan-tuo' && ui.dltBankerResult) {
        const result = ui.dltBankerResult;
        return {
          kind: 'banker', label: '大乐透随机胆拖', lines: result.lines, price: result.lines * 2,
          banker: {
            front: result.front ? { bankers: [...result.front.bankers], drags: [...result.front.drags], plain: Boolean(result.front.plain) } : null,
            back: result.back ? { bankers: [...result.back.bankers], drags: [...result.back.drags], plain: Boolean(result.back.plain) } : null
          }
        };
      }
      return null;
    }
    if (ui.ssqMode === 'single') {
      if (ui.ssqRed.length !== 6 || ui.ssqBlue.length !== 1) return null;
      return { kind: 'single', label: '双色球单式', lines: 1, price: 2, front: [...ui.ssqRed], back: [...ui.ssqBlue] };
    }
    const lines = combination(ui.ssqRed.length, 6) * ui.ssqBlue.length;
    if (ui.ssqRed.length < 6 || ui.ssqBlue.length < 1 || lines < 1 || lines > SSQ_MAX_BETS) return null;
    return { kind: 'multiple', label: `双色球复式 ${ui.ssqRed.length}+${ui.ssqBlue.length}`, lines, price: lines * 2, front: [...ui.ssqRed], back: [...ui.ssqBlue] };
  }

  function saveCurrentTicket(game) {
    const snapshot = currentTicketSnapshot(game);
    if (!snapshot) return;
    const saved = {
      id: `${Date.now().toString(36)}-${randomInt(1000000).toString(36)}`,
      game, savedAt: new Date().toISOString(), ...snapshot
    };
    const target = game === 'dlt' ? ui.savedDlt : ui.savedSsq;
    target.push(saved);
    if (target.length > 100) target.shift();
    ui.savedNotice = game;
    persistLottery();
    if (game === 'dlt') renderDlt();
    else renderSsq();
  }

  function loadSavedTicket(game, id) {
    const list = game === 'dlt' ? ui.savedDlt : ui.savedSsq;
    const ticket = list.find(item => item.id === id);
    if (!ticket) return;
    if (game === 'dlt') {
      if (ticket.kind === 'package') {
        ui.packageAmount = ticket.amount;
        ui.packageDrafts[ticket.amount] = {};
        packageComponentDefinitions(ticket.amount).forEach((component, index) => {
          const stored = ticket.components[index] || {};
          ui.packageDrafts[ticket.amount][component.id] = { front: [...stored.front], back: [...stored.back] };
        });
        ui.packageTarget = 's1';
        ui.dltMode = 'package';
      } else if (ticket.kind === 'banker') {
        ui.dltBankerResult = { ...ticket.banker, lines: ticket.lines };
        ui.dltMode = 'dan-tuo';
      } else {
        ui.dltMode = ticket.kind === 'multiple' ? 'multiple' : 'single';
        ui.dltFront = [...ticket.front]; ui.dltBack = [...ticket.back];
        ui.dltDrafts[ui.dltMode] = { front: [...ui.dltFront], back: [...ui.dltBack] };
      }
      persistLottery();
      showView('dlt');
    } else {
      ui.ssqMode = ticket.kind === 'multiple' ? 'multiple' : 'single';
      ui.ssqRed = [...ticket.front]; ui.ssqBlue = [...ticket.back];
      ui.ssqDrafts[ui.ssqMode] = { front: [...ui.ssqRed], back: [...ui.ssqBlue] };
      persistLottery();
      showView('ssq');
    }
  }

  function makeDltBankerResult() {
    const kind = document.getElementById('banker-kind').value;
    const result = { front: null, back: null, lines: 1 };
    if (kind !== 'back') {
      const bankerCount = Number(document.getElementById('front-bankers').value);
      const totalCount = Number(document.getElementById('front-total').value);
      const values = randomUnique(35, totalCount);
      result.front = { bankers: values.slice(0, bankerCount), drags: values.slice(bankerCount) };
      result.lines *= combination(totalCount - bankerCount, 5 - bankerCount);
    } else {
      result.front = { bankers: [], drags: randomUnique(35, 5), plain: true };
    }
    if (kind !== 'front') {
      const totalCount = Number(document.getElementById('back-total').value);
      const values = randomUnique(12, totalCount);
      result.back = { bankers: values.slice(0, 1), drags: values.slice(1) };
      result.lines *= combination(totalCount - 1, 1);
    } else {
      result.back = { bankers: [], drags: randomUnique(12, 2), plain: true };
    }
    return result;
  }

  function renderSsq() {
    document.querySelectorAll('[data-ssq-mode]').forEach(button => button.classList.toggle('active', button.dataset.ssqMode === ui.ssqMode));
    const content = document.getElementById('ssq-mode-content');
    if (ui.ssqMode === 'single') {
      const valid = ui.ssqRed.length === 6 && ui.ssqBlue.length === 1;
      const dailyAlreadyRecorded = valid && hasLotteryTicketToday('ssq', currentTicketSnapshot('ssq'));
      content.innerHTML = `<div class="tool-intro"><div><div class="tool-kicker">SINGLE BET</div><h2>单式选号</h2><p>手动选好号码后点“记入今日支出”；“保存号码”会放入常用号码库。</p></div><span class="tiny-note">6 + 1 · ¥2</span></div>
        <div class="number-group"><div class="number-group-head"><strong><span class="red-text">●</span> 红色球</strong><span>已选 ${ui.ssqRed.length} / 6</span></div>${ballGrid(33, ui.ssqRed, 'ssq-red', 'red-ball')}</div>
        <div class="number-group"><div class="number-group-head"><strong><span class="blue-text">●</span> 蓝色球</strong><span>已选 ${ui.ssqBlue.length} / 1</span></div>${ballGrid(16, ui.ssqBlue, 'ssq-blue', 'blue-ball')}</div>
        <div class="tool-actions"><span class="ticket-cost">${valid ? '单式金额' : '选满 6 + 1 个号码'}<strong>${valid ? money(2) : '—'}</strong></span><div class="inline-controls"><button class="light-button" id="clear-ssq-single">清空</button><button class="primary-button" id="random-ssq-single">随机一注并记支出 <span>→</span></button><button class="light-button" data-record-ticket="ssq" ${valid && !dailyAlreadyRecorded ? '' : 'disabled'}>${dailyAlreadyRecorded ? '已记入今日' : '记入今日支出'}</button><button class="light-button" id="save-ssq-ticket" ${valid ? '' : 'disabled'}>保存号码</button></div></div>${valid ? ticketRows([{ front: ui.ssqRed, back: ui.ssqBlue }], true, 2) : '<div class="empty-result result-area">继续选择号码，选满后会显示单式预览。</div>'}${savedTicketsMarkup('ssq')}`;
      return;
    }
    const lineCount = combination(ui.ssqRed.length, 6) * ui.ssqBlue.length;
    const valid = ui.ssqRed.length >= 6 && ui.ssqBlue.length >= 1 && lineCount <= SSQ_MAX_BETS;
    const dailyAlreadyRecorded = valid && hasLotteryTicketToday('ssq', currentTicketSnapshot('ssq'));
    const randomLines = combination(ui.ssqRandomRedCount, 6) * ui.ssqRandomBlueCount;
    const randomValid = randomLines > 0 && randomLines <= SSQ_MAX_BETS;
    const redOptions = Array.from({ length: 28 }, (_, index) => index + 6);
    const blueOptions = Array.from({ length: 16 }, (_, index) => index + 1);
    content.innerHTML = `<div class="tool-intro"><div><div class="tool-kicker">MULTIPLE SELECTION</div><h2>选择复式号码</h2><p>号码选好后可点“记入今日支出”；“保存号码”会放入常用号码库。</p></div></div>
      <div class="number-group"><div class="number-group-head"><strong><span class="red-text">●</span> 红色球</strong><span>已选 ${ui.ssqRed.length} 个 · 需至少 6 个</span></div>${ballGrid(33, ui.ssqRed, 'ssq-red', 'red-ball')}<div class="helper-row"><span>01–33 中选择号码</span><span>${ui.ssqRed.length > 6 ? `${combination(ui.ssqRed.length, 6)} 种红球组合` : ''}</span></div></div>
      <div class="number-group"><div class="number-group-head"><strong><span class="blue-text">●</span> 蓝色球</strong><span>已选 ${ui.ssqBlue.length} 个 · 需至少 1 个</span></div>${ballGrid(16, ui.ssqBlue, 'ssq-blue', 'blue-ball')}<div class="helper-row"><span>01–16 中选择号码</span><span>${ui.ssqBlue.length > 1 ? `${ui.ssqBlue.length} 种蓝球组合` : ''}</span></div></div>
      <div class="choice-row random-counts"><span class="select-label">随机选号数量</span><label for="ssq-random-red-count">红球</label><select id="ssq-random-red-count" class="select-field">${redOptions.map(count => `<option value="${count}" ${count === ui.ssqRandomRedCount ? 'selected' : ''}>${count} 个</option>`).join('')}</select><label for="ssq-random-blue-count">蓝球</label><select id="ssq-random-blue-count" class="select-field">${blueOptions.map(count => `<option value="${count}" ${count === ui.ssqRandomBlueCount ? 'selected' : ''}>${count} 个</option>`).join('')}</select><span class="subtle-caption">${randomValid ? `随机后为 ${randomLines.toLocaleString('zh-CN')} 注 · ${money(randomLines * 2)}` : '组合超过单票金额上限，请减少号码数'}</span></div>
      <div class="tool-actions"><div class="ticket-cost">${valid ? `组合注数 <strong>${lineCount.toLocaleString('zh-CN')} 注</strong><span class="muted-cost">应付 ${money(lineCount * 2)}</span>` : `<span>${lineCount > SSQ_MAX_BETS ? '金额超过单票 20,000 元上限' : '请按要求选择号码'}</span>`}</div><div class="inline-controls"><button class="light-button" id="random-ssq-multiple" ${randomValid ? '' : 'disabled'}>随机并记支出</button><button class="light-button" data-record-ticket="ssq" ${valid && !dailyAlreadyRecorded ? '' : 'disabled'}>${dailyAlreadyRecorded ? '已记入今日' : '记入今日支出'}</button><button class="light-button" id="clear-ssq-multiple">清空</button><button class="light-button" id="save-ssq-ticket" ${valid ? '' : 'disabled'}>保存号码</button></div></div>
      ${!valid && lineCount > SSQ_MAX_BETS ? '<p class="subtle-caption">请减少已选号码；当前票面超过单张彩票的金额上限。</p>' : ''}${savedTicketsMarkup('ssq')}`;
  }

  function createSsqTicket() {
    return { front: randomUnique(33, 6), back: randomUnique(16, 1) };
  }

  function renderQuickPicks() {
    const host = document.getElementById('quick-games-content');
    if (!host) return;
    const today = getRecord(todayKey());
    const tickets = (today?.tickets || []).slice().reverse();
    const kenoOptions = Array.from({ length: 10 }, (_, index) => index + 1);
    host.innerHTML = `<div class="quick-games-grid">
      <article class="quick-game-card"><div class="quick-game-heading"><span class="quick-game-icon">3</span><div><h2>排列3</h2><p>百位、十位、个位各随机 0–9，按直选单式计。</p></div></div><div class="quick-game-meta"><span>直选 · 3 位有序数字</span><strong>¥2 / 注</strong></div><button class="primary-button full-width" data-quick-pick="p3">随机一注并记支出</button></article>
      <article class="quick-game-card"><div class="quick-game-heading"><span class="quick-game-icon">5</span><div><h2>排列5</h2><p>从 00000–99999 随机一个五位数，按单式计。</p></div></div><div class="quick-game-meta"><span>5 位有序数字</span><strong>¥2 / 注</strong></div><button class="primary-button full-width" data-quick-pick="p5">随机一注并记支出</button></article>
      <article class="quick-game-card"><div class="quick-game-heading"><span class="quick-game-icon">3D</span><div><h2>福彩3D</h2><p>百位、十位、个位各随机 0–9，按单选计。</p></div></div><div class="quick-game-meta"><span>单选 · 3 位有序数字</span><strong>¥2 / 注</strong></div><button class="primary-button full-width" data-quick-pick="fc3d">随机一注并记支出</button></article>
      <article class="quick-game-card"><div class="quick-game-heading"><span class="quick-game-icon">快</span><div><h2>快乐8</h2><p>从 01–80 随机号码，选择玩法后生成一注。</p></div></div><label class="quick-k8-control" for="quick-k8-count"><span>玩法</span><select id="quick-k8-count" class="select-field">${kenoOptions.map(count => `<option value="${count}" ${count === ui.quickK8PlayCount ? 'selected' : ''}>选${count}</option>`).join('')}</select><strong>¥2 / 注</strong></label><button class="primary-button full-width" data-quick-pick="kl8">随机一注并记支出</button></article>
    </div>
    <section class="records-card quick-today-records"><div class="records-card-heading"><div><h2>今天生成的号码</h2><p>随机生成后会新增记录，并将对应支出计入今天。</p></div><span class="count-pill">${tickets.length} 组 · ${money(tickets.reduce((sum, ticket) => sum + ticket.cost, 0))}</span></div>
      ${tickets.length ? `<div class="quick-ticket-list">${tickets.map(ticket => `<div class="quick-ticket-record"><div><strong>${escapeHtml(dailyTicketTitle(ticket))}</strong><small>${escapeHtml(ticket.recordedAt.replace('T', ' ').slice(0, 16))}</small></div><span>${escapeHtml(quickTicketNumbers(ticket))}</span><em>${money(ticket.cost)}</em></div>`).join('')}</div>` : '<div class="empty-result">今天还没有生成随机号码。</div>'}
    </section>`;
  }

  function appendDailyTicket(ticketData) {
    const ticket = cleanDailyTicket(ticketData);
    if (!ticket) return;
    const date = todayKey();
    const record = getRecord(date) || { date, dice: null, bought: false, spend: 0, win: 0, tickets: [] };
    record.tickets = [...(record.tickets || []), ticket].slice(-500);
    upsertRecord(record);
    renderQuickPicks();
    renderToday();
    renderRecords();
  }

  function lotteryTicketSignature(ticket) {
    return JSON.stringify([
      ticket.game, ticket.kind, ticket.label, ticket.play, ticket.lines, ticket.cost,
      ticket.amount || null, ticket.front || [], ticket.back || [], ticket.components || null, ticket.banker || null
    ]);
  }

  function hasLotteryTicketToday(game, snapshot) {
    if (!snapshot) return false;
    const candidate = cleanDailyTicket({
      ...snapshot, game, play: snapshot.label, cost: snapshot.price
    });
    const record = getRecord(todayKey());
    return Boolean(candidate && record?.tickets?.some(ticket => lotteryTicketSignature(ticket) === lotteryTicketSignature(candidate)));
  }

  function addLotteryRandomTicket(game, snapshot) {
    if (!snapshot) return;
    appendDailyTicket({
      ...snapshot,
      id: `${game}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      game, play: snapshot.label, cost: snapshot.price,
      recordedAt: new Date().toISOString()
    });
  }

  function addQuickPick(gameKey) {
    const game = QUICK_GAMES[gameKey];
    if (!game) return;
    const numbers = game.type === 'digits'
      ? Array.from({ length: game.length }, () => randomInt(10))
      : randomUnique(game.max, ui.quickK8PlayCount);
    const ticket = cleanDailyTicket({
      id: `${gameKey}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      game: gameKey, numbers, recordedAt: new Date().toISOString()
    });
    if (!ticket) return;
    appendDailyTicket(ticket);
  }

  document.addEventListener('click', event => {
    const nav = event.target.closest('[data-nav]');
    if (nav) {
      event.preventDefault();
      showView(nav.dataset.nav);
      return;
    }
    const quickPick = event.target.closest('[data-quick-pick]');
    if (quickPick) { addQuickPick(quickPick.dataset.quickPick); return; }
    const recordTicket = event.target.closest('[data-record-ticket]');
    if (recordTicket) {
      const game = recordTicket.dataset.recordTicket;
      const snapshot = currentTicketSnapshot(game);
      if (!snapshot) return;
      addLotteryRandomTicket(game, snapshot);
      if (game === 'dlt') renderDlt();
      else renderSsq();
      const feedback = document.getElementById(`${game}-daily-feedback`);
      if (feedback) feedback.textContent = `已将${snapshot.label}记入今天，计入 ${money(snapshot.price)} 支出。`;
      return;
    }
    const dltMode = event.target.closest('[data-dlt-mode]');
    if (dltMode) {
      syncCurrentDraft();
      ui.dltMode = dltMode.dataset.dltMode;
      const draftMode = ui.dltMode === 'multiple' ? 'multiple' : 'single';
      ui.dltFront = [...ui.dltDrafts[draftMode].front];
      ui.dltBack = [...ui.dltDrafts[draftMode].back];
      ui.savedNotice = '';
      persistLottery();
      renderDlt();
      return;
    }
    const ssqMode = event.target.closest('[data-ssq-mode]');
    if (ssqMode) {
      syncCurrentDraft();
      ui.ssqMode = ssqMode.dataset.ssqMode;
      ui.ssqRed = [...ui.ssqDrafts[ui.ssqMode].front];
      ui.ssqBlue = [...ui.ssqDrafts[ui.ssqMode].back];
      ui.savedNotice = '';
      persistLottery();
      renderSsq();
      return;
    }
    const packageTarget = event.target.closest('[data-package-target]');
    if (packageTarget) {
      ui.packageTarget = packageTarget.dataset.packageTarget;
      ui.savedNotice = '';
      persistLottery();
      renderDlt();
      return;
    }
    const pick = event.target.closest('[data-pick]');
    if (pick) {
      togglePick(pick.dataset.pick, Number(pick.dataset.value));
      ui.savedNotice = '';
      persistLottery();
      if (pick.dataset.pick.startsWith('dlt-')) renderDlt();
      else if (pick.dataset.pick.startsWith('ssq-')) renderSsq();
      else renderDlt();
      return;
    }
    if (event.target.closest('#roll-dice')) { rollToday(); return; }
    if (event.target.closest('#save-today-win')) { saveWin(todayKey(), document.getElementById('today-win')); return; }
    if (event.target.closest('#random-dlt-single')) { const ticket = createDltTicket(); ui.dltFront = ticket.front; ui.dltBack = ticket.back; ui.savedNotice = ''; persistLottery(); addLotteryRandomTicket('dlt', { kind: 'single', label: '大乐透单式', lines: 1, price: 2, front: ticket.front, back: ticket.back }); renderDlt(); return; }
    if (event.target.closest('#clear-dlt-single')) { ui.dltFront = []; ui.dltBack = []; ui.savedNotice = ''; persistLottery(); renderDlt(); return; }
    if (event.target.closest('#random-dlt-multiple')) {
      ui.dltRandomFrontCount = Number(document.getElementById('dlt-random-front-count').value);
      ui.dltRandomBackCount = Number(document.getElementById('dlt-random-back-count').value);
      ui.dltFront = randomUnique(35, ui.dltRandomFrontCount);
      ui.dltBack = randomUnique(12, ui.dltRandomBackCount);
      const lines = combination(ui.dltFront.length, 5) * combination(ui.dltBack.length, 2);
      ui.savedNotice = '';
      persistLottery();
      addLotteryRandomTicket('dlt', { kind: 'multiple', label: `大乐透复式 ${ui.dltFront.length}+${ui.dltBack.length}`, lines, price: lines * 2, front: ui.dltFront, back: ui.dltBack });
      renderDlt();
      return;
    }
    if (event.target.closest('#clear-dlt-multiple')) { ui.dltFront = []; ui.dltBack = []; ui.savedNotice = ''; persistLottery(); renderDlt(); return; }
    if (event.target.closest('#random-dlt-banker')) { ui.dltBankerResult = makeDltBankerResult(); ui.savedNotice = ''; persistLottery(); addLotteryRandomTicket('dlt', currentTicketSnapshot('dlt')); renderDlt(); return; }
    if (event.target.closest('#random-package-part')) {
      const component = packageComponentDefinitions(ui.packageAmount).find(item => item.id === ui.packageTarget);
      ui.packageDrafts[ui.packageAmount][ui.packageTarget] = { front: randomUnique(35, component.frontCount), back: randomUnique(12, component.backCount) };
      ui.savedNotice = '';
      persistLottery();
      if (packageReady()) addLotteryRandomTicket('dlt', currentTicketSnapshot('dlt'));
      renderDlt(); return;
    }
    if (event.target.closest('#random-package-all')) {
      packageComponentDefinitions(ui.packageAmount).forEach(component => {
        ui.packageDrafts[ui.packageAmount][component.id] = { front: randomUnique(35, component.frontCount), back: randomUnique(12, component.backCount) };
      });
      ui.savedNotice = '';
      persistLottery();
      addLotteryRandomTicket('dlt', currentTicketSnapshot('dlt'));
      renderDlt(); return;
    }
    if (event.target.closest('#clear-package-part')) {
      ui.packageDrafts[ui.packageAmount][ui.packageTarget] = { front: [], back: [] };
      ui.savedNotice = '';
      persistLottery(); renderDlt(); return;
    }
    if (event.target.closest('#random-ssq-single')) { const ticket = createSsqTicket(); ui.ssqRed = ticket.front; ui.ssqBlue = ticket.back; ui.savedNotice = ''; persistLottery(); addLotteryRandomTicket('ssq', { kind: 'single', label: '双色球单式', lines: 1, price: 2, front: ticket.front, back: ticket.back }); renderSsq(); return; }
    if (event.target.closest('#clear-ssq-single')) { ui.ssqRed = []; ui.ssqBlue = []; ui.savedNotice = ''; persistLottery(); renderSsq(); return; }
    if (event.target.closest('#random-ssq-multiple')) {
      ui.ssqRandomRedCount = Number(document.getElementById('ssq-random-red-count').value);
      ui.ssqRandomBlueCount = Number(document.getElementById('ssq-random-blue-count').value);
      ui.ssqRed = randomUnique(33, ui.ssqRandomRedCount); ui.ssqBlue = randomUnique(16, ui.ssqRandomBlueCount);
      const lines = combination(ui.ssqRed.length, 6) * ui.ssqBlue.length;
      ui.savedNotice = ''; persistLottery();
      addLotteryRandomTicket('ssq', { kind: 'multiple', label: `双色球复式 ${ui.ssqRed.length}+${ui.ssqBlue.length}`, lines, price: lines * 2, front: ui.ssqRed, back: ui.ssqBlue });
      renderSsq(); return;
    }
    if (event.target.closest('#clear-ssq-multiple')) { ui.ssqRed = []; ui.ssqBlue = []; ui.savedNotice = ''; persistLottery(); renderSsq(); return; }
    if (event.target.closest('#save-dlt-ticket')) { saveCurrentTicket('dlt'); return; }
    if (event.target.closest('#save-ssq-ticket')) { saveCurrentTicket('ssq'); return; }
    const deleteSaved = event.target.closest('[data-delete-saved-id]');
    if (deleteSaved) {
      const game = deleteSaved.dataset.deleteSavedGame;
      const key = game === 'dlt' ? 'savedDlt' : 'savedSsq';
      ui[key] = ui[key].filter(ticket => ticket.id !== deleteSaved.dataset.deleteSavedId);
      ui.savedNotice = '';
      persistLottery();
      if (game === 'dlt') renderDlt(); else renderSsq();
      return;
    }
    const loadSaved = event.target.closest('[data-load-saved-id]');
    if (loadSaved) { loadSavedTicket(loadSaved.dataset.loadSavedGame, loadSaved.dataset.loadSavedId); return; }
    const saveRow = event.target.closest('[data-save-win]');
    if (saveRow) {
      const row = saveRow.closest('tr');
      saveWin(saveRow.dataset.saveWin, row.querySelector('.table-win-input'));
      return;
    }
    if (event.target.closest('#export-csv')) { exportCsv(); return; }
    if (event.target.closest('#show-rules')) { document.getElementById('rules-dialog').showModal(); return; }
    if (event.target.closest('#close-rules') || event.target.closest('#dialog-done')) { document.getElementById('rules-dialog').close(); }
  });

  document.addEventListener('change', event => {
    if (event.target.id === 'quick-k8-count') {
      ui.quickK8PlayCount = Number(event.target.value);
      persistLottery();
      renderQuickPicks();
      return;
    }
    if (['banker-kind', 'front-bankers', 'front-total', 'back-total'].includes(event.target.id) && ui.dltMode === 'dan-tuo') {
      ui.dltBankerResult = null;
      ui.savedNotice = '';
      persistLottery();
      renderDlt();
      return;
    }
    if (event.target.id === 'dlt-random-front-count') {
      ui.dltRandomFrontCount = Number(event.target.value); ui.savedNotice = ''; persistLottery(); renderDlt(); return;
    }
    if (event.target.id === 'dlt-random-back-count') {
      ui.dltRandomBackCount = Number(event.target.value); ui.savedNotice = ''; persistLottery(); renderDlt(); return;
    }
    if (event.target.id === 'ssq-random-red-count') {
      ui.ssqRandomRedCount = Number(event.target.value); ui.savedNotice = ''; persistLottery(); renderSsq(); return;
    }
    if (event.target.id === 'ssq-random-blue-count') {
      ui.ssqRandomBlueCount = Number(event.target.value); ui.savedNotice = ''; persistLottery(); renderSsq(); return;
    }
    if (event.target.id === 'package-amount') {
      ui.packageAmount = Number(event.target.value);
      ui.packageTarget = 's1';
      ui.savedNotice = '';
      persistLottery(); renderDlt(); return;
    }
  });

  function exportCsv() {
    const rows = [['日期', '骰子点数', '骰子结果', '随机号码 / 玩法', '花费金额', '中奖金额', '净收支']];
    [...data.records].sort((a, b) => a.date.localeCompare(b.date)).forEach(record => {
      const ticketSummary = (record.tickets || []).map(ticket => `${QUICK_GAMES[ticket.game]?.label || ticket.game} ${ticket.play} ${quickTicketNumbers(ticket)} ${money(ticket.cost)}`).join('；');
      const daySpend = totalRecordSpend(record);
      rows.push([record.date, record.dice || '', record.dice ? (record.bought ? '购彩' : '休息') : '', ticketSummary, daySpend.toFixed(2), record.win.toFixed(2), (record.win - daySpend).toFixed(2)]);
    });
    const csv = '\uFEFF' + rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `小彩日记-${todayKey()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  document.getElementById('today-date').textContent = formatDate(todayKey(), true);
  renderToday();
  renderTotals();
  renderDlt();
  renderSsq();
  renderQuickPicks();
})();

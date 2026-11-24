(() => {
  'use strict';
  const games = {
    dlt: { name: '大乐透', issueLength: 5, front: ['前区', 5, 35], back: ['后区', 2, 12] },
    ssq: { name: '双色球', issueLength: 7, front: ['红球', 6, 33], back: ['蓝球', 1, 16] }
  };
  const byId = id => document.getElementById(id);
  const editor = byId('editor');
  const form = byId('draw-form');
  const drawKey = 'xiaocai-draw-overrides-v1';
  const scratchKey = 'xiaocai-scratch-v1';
  let overrides = readStorage(drawKey) || {};
  let scratch = readStorage(scratchKey);
  let activeGame = 'dlt';

  function readStorage(key) {
    try { return JSON.parse(localStorage.getItem(key)); }
    catch { return null; }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch { return false; }
  }

  function today() {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Hong_Kong' }).format(new Date());
  }

  function renderScratch() {
    const current = scratch?.date === today();
    byId('die').textContent = current ? '⚀⚁⚂⚃⚄⚅'[scratch.dice - 1] : '⚄';
    byId('die').setAttribute('aria-label', current ? '点数 ' + scratch.dice : '未掷骰子');
    byId('decision').textContent = current
      ? (scratch.amount ? '今天刮 ¥' + scratch.amount : '今天休息')
      : '';
    byId('roll').disabled = current;
    byId('roll').textContent = current ? '今日已掷' : '掷骰子';
    if (!current) byId('scratch-status').textContent = '';
  }

  function drawRows(game) {
    const rows = new Map((window.LOTTERY_DRAWS?.[game] || []).map(row => [row[0], row]));
    for (const row of Array.isArray(overrides[game]) ? overrides[game] : []) {
      if (Array.isArray(row) && Array.isArray(row[2]) && Array.isArray(row[3])) rows.set(row[0], row);
    }
    return [...rows.values()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 50);
  }

  function renderHistory() {
    const rows = drawRows(activeGame);
    byId('game-name').textContent = games[activeGame].name;
    byId('draw-summary').textContent = rows.length
      ? '最近 ' + rows.length + ' 期 · 截至 ' + rows[0][1]
      : '暂无开奖数据';
    byId('draw-list').replaceChildren(...rows.map(([issue, date, front, back]) => {
      const row = document.createElement('li');
      const meta = document.createElement('div');
      meta.className = 'draw-meta';
      const title = document.createElement('strong');
      title.textContent = issue + ' 期';
      const time = document.createElement('time');
      time.dateTime = date;
      time.textContent = date;
      meta.append(title, time);
      const numbers = document.createElement('div');
      numbers.className = 'balls';
      for (const [group, values] of [['front', front], ['back', back]]) {
        for (const value of values) {
          const ball = document.createElement('span');
          ball.className = 'ball ' + group;
          ball.textContent = String(value).padStart(2, '0');
          numbers.append(ball);
        }
      }
      row.append(meta, numbers);
      return row;
    }));
  }

  function route() {
    const hash = location.hash.slice(1);
    const showHistory = Object.hasOwn(games, hash);
    if (editor.open) editor.close();
    if (byId('picker').open) byId('picker').close();
    byId('today').hidden = showHistory;
    byId('history').hidden = !showHistory;
    document.querySelectorAll('nav a').forEach(link => {
      if (link.hash === (showHistory ? '#' + hash : '#today')) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    if (showHistory) {
      activeGame = hash;
      renderHistory();
    } else renderScratch();
  }

  function parseBalls(raw, [label, count, max]) {
    const tokens = raw.trim().split(/[\s,，、]+/);
    const values = tokens.map(Number);
    if (tokens.length !== count || tokens.some(token => !/^\d{1,2}$/.test(token)) ||
        values.some(value => value < 1 || value > max) || new Set(values).size !== count) {
      throw new Error(label + '需填写 ' + count + ' 个不同的 1–' + max + ' 号码');
    }
    return values.sort((a, b) => a - b);
  }

  byId('roll').addEventListener('click', () => {
    const date = today();
    const saved = readStorage(scratchKey);
    if (saved?.date === date || scratch?.date === date) {
      if (saved?.date === date) scratch = saved;
      renderScratch();
      return;
    }
    const dice = Math.floor(Math.random() * 6) + 1;
    const amounts = [10, 20, 30, 50];
    scratch = { date, dice, amount: dice % 2 ? 0 : amounts[Math.floor(Math.random() * amounts.length)] };
    if (!writeStorage(scratchKey, scratch)) byId('scratch-status').textContent = '浏览器无法保存本次结果';
    renderScratch();
  });

  byId('open-editor').addEventListener('click', () => {
    const game = games[activeGame];
    form.reset();
    form.elements.issue.maxLength = game.issueLength;
    form.elements.date.max = today();
    form.elements.date.value = today();
    byId('front-label').textContent = game.front[0] + ' · ' + game.front[1] + ' 个';
    byId('back-label').textContent = game.back[0] + ' · ' + game.back[1] + ' 个';
    byId('editor-status').textContent = '';
    editor.showModal();
  });

  byId('close-editor').addEventListener('click', () => editor.close());

  form.addEventListener('submit', event => {
    event.preventDefault();
    const status = byId('editor-status');
    try {
      const game = games[activeGame];
      const issue = form.elements.issue.value.trim();
      const date = form.elements.date.value;
      const expectedYear = game.issueLength === 5 ? date.slice(2, 4) : date.slice(0, 4);
      if (!/^\d+$/.test(issue) || issue.length !== game.issueLength ||
          !issue.startsWith(expectedYear) || issue.endsWith('000')) {
        throw new Error('请输入与开奖年份匹配的 ' + game.issueLength + ' 位期号');
      }
      const front = parseBalls(form.elements.front.value, game.front);
      const back = parseBalls(form.elements.back.value, game.back);
      const previous = drawRows(activeGame);
      if (previous.length === 50 && issue < previous.at(-1)[0]) {
        throw new Error('该期号早于当前显示的最近 50 期');
      }
      const updates = { ...overrides, [activeGame]: [
        [issue, date, front, back],
        ...(Array.isArray(overrides[activeGame]) ? overrides[activeGame] : []).filter(row => row[0] !== issue)
      ].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 50) };
      if (!writeStorage(drawKey, updates)) throw new Error('浏览器无法保存数据，请检查存储权限');
      overrides = updates;
      renderHistory();
      status.textContent = '已保存第 ' + issue + ' 期';
    } catch (error) {
      status.textContent = error.message;
    }
  });

  byId('download').addEventListener('click', () => {
    const data = Object.fromEntries(Object.keys(games).map(game => [game, drawRows(game)]));
    const content = 'window.LOTTERY_DRAWS = {\n' + Object.entries(data).map(([game, rows]) =>
      '  "' + game + '": [\n' + rows.map(row => '    ' + JSON.stringify(row)).join(',\n') + '\n  ]'
    ).join(',\n') + '\n};\n';
    const url = URL.createObjectURL(new Blob([content], { type: 'text/javascript;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'draws.js';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  const picker = byId('picker');
  const picksKey = 'xiaocai-number-picks-v1';
  const maxPickLines = 10000;
  const groupKeys = ['front', 'back'];
  let pickGame = 'dlt';
  const drafts = {};
  let draft;

  function combinations(n, k) {
    if (n < k) return 0;
    let result = 1;
    for (let i = 1; i <= k; i++) result = result * (n - i + 1) / i;
    return Math.round(result);
  }

  function countLines(front, back) {
    const game = games[pickGame];
    return combinations(front, game.front[1]) * combinations(back, game.back[1]);
  }

  function summary(lines) {
    return lines.toLocaleString('zh-CN') + ' 注 · ¥' + (lines * 2).toLocaleString('zh-CN');
  }

  function renderPickPrice() {
    const game = games[pickGame];
    const lines = countLines(draft.front.size, draft.back.size);
    const valid = lines > 0 && (draft.mode === 'single' || lines > 1) && lines <= maxPickLines;
    byId('picker-price').textContent = !lines
      ? '请至少选满 ' + game.front[1] + ' + ' + game.back[1] + ' 个号码'
      : lines > maxPickLines ? summary(lines) + '，超过 10,000 注上限'
      : !valid ? '复式需在至少一组多选一个号码'
      : summary(lines);
    byId('picker-save').disabled = !valid;
    byId('picker-balls').querySelectorAll('button').forEach(button => {
      button.setAttribute('aria-pressed', String(draft[button.dataset.group].has(Number(button.value))));
    });
    return valid;
  }

  function renderPickControls() {
    const counts = byId('picker-counts');
    counts.hidden = draft.mode !== 'multiple';
    counts.replaceChildren();
    const groups = byId('picker-balls');
    groups.replaceChildren();
    for (const group of groupKeys) {
      const [name, min, max] = games[pickGame][group];
      const label = document.createElement('label');
      label.textContent = '随机' + name + '个数';
      const select = document.createElement('select');
      select.id = 'pick-count-' + group;
      for (let count = min; count <= max; count++) select.add(new Option(String(count), String(count)));
      select.value = String(draft.counts[group]);
      select.addEventListener('change', () => { draft.counts[group] = Number(select.value); });
      label.append(select);
      counts.append(label);

      const fieldset = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = name;
      fieldset.append(legend);
      const balls = document.createElement('div');
      balls.className = 'balls';
      for (let value = 1; value <= max; value++) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ball ' + group;
        button.dataset.group = group;
        button.value = String(value);
        button.textContent = String(value).padStart(2, '0');
        balls.append(button);
      }
      fieldset.append(balls);
      groups.append(fieldset);
    }
    renderPickPrice();
  }

  function savedPicks() {
    const data = readStorage(picksKey);
    return Array.isArray(data) ? data : [];
  }

  function renderSavedPicks() {
    const list = byId('picker-saved');
    list.replaceChildren();
    const rows = savedPicks().filter(row => row?.game === pickGame);
    if (!rows.length) {
      const empty = document.createElement('li');
      empty.textContent = '暂无已保存方案';
      list.append(empty);
    }
    for (const row of rows) {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = (row.mode === 'multiple' ? '复式' : '单式') + ' · ' + summary(countLines(row.front.length, row.back.length));
      const numbers = document.createElement('p');
      numbers.textContent = [row.front, row.back].map(values => values.map(value => String(value).padStart(2, '0')).join(' ')).join(' + ');
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'secondary';
      remove.textContent = '删除';
      remove.addEventListener('click', () => {
        if (!writeStorage(picksKey, savedPicks().filter(pick => pick?.id !== row.id))) {
          byId('picker-status').textContent = '删除失败，请检查浏览器存储权限';
          return;
        }
        renderSavedPicks();
        byId('picker-status').textContent = '已删除方案';
      });
      item.append(title, numbers, remove);
      list.append(item);
    }
  }

  byId('open-picker').addEventListener('click', () => {
    pickGame = activeGame;
    const game = games[pickGame];
    drafts[pickGame] ??= {
      mode: 'single', front: new Set(), back: new Set(),
      counts: { front: game.front[1] + 1, back: game.back[1] }
    };
    draft = drafts[pickGame];
    byId('picker-title').textContent = game.name + '选号';
    byId('picker-mode').value = draft.mode;
    byId('picker-status').textContent = '';
    renderPickControls();
    renderSavedPicks();
    picker.showModal();
  });

  byId('close-picker').addEventListener('click', () => picker.close());

  byId('picker-mode').addEventListener('change', event => {
    draft.mode = event.target.value;
    if (draft.mode === 'single') {
      for (const group of groupKeys) {
        if (draft[group].size > games[pickGame][group][1]) draft[group].clear();
      }
    }
    byId('picker-status').textContent = '';
    renderPickControls();
  });

  byId('picker-balls').addEventListener('click', event => {
    const button = event.target.closest('button[data-group]');
    if (!button) return;
    const group = button.dataset.group;
    const value = Number(button.value);
    const selected = draft[group];
    if (selected.has(value)) selected.delete(value);
    else if (draft.mode === 'single' && selected.size >= games[pickGame][group][1]) {
      byId('picker-status').textContent = '请先取消一个已选号码';
      return;
    } else selected.add(value);
    byId('picker-status').textContent = '';
    renderPickPrice();
  });

  byId('picker-random').addEventListener('click', () => {
    const game = games[pickGame];
    const counts = draft.mode === 'multiple' ? draft.counts : { front: game.front[1], back: game.back[1] };
    const lines = countLines(counts.front, counts.back);
    if (draft.mode === 'multiple' && (lines < 2 || lines > maxPickLines)) {
      byId('picker-status').textContent = lines < 2 ? '请增加至少一组随机号码个数' : '随机方案超过 10,000 注，请减少号码个数';
      return;
    }
    for (const group of groupKeys) {
      const pool = Array.from({ length: game[group][2] }, (_, index) => index + 1);
      const selected = new Set();
      while (selected.size < counts[group]) {
        selected.add(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      }
      draft[group] = selected;
    }
    byId('picker-status').textContent = '';
    renderPickPrice();
  });

  byId('picker-clear').addEventListener('click', () => {
    for (const group of groupKeys) draft[group].clear();
    byId('picker-status').textContent = '';
    renderPickPrice();
  });

  byId('picker-save').addEventListener('click', () => {
    if (!renderPickPrice()) return;
    const [front, back] = groupKeys.map(group => [...draft[group]].sort((a, b) => a - b));
    const row = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      game: pickGame, mode: draft.mode, front, back
    };
    if (!writeStorage(picksKey, [row, ...savedPicks()])) {
      byId('picker-status').textContent = '保存失败，请检查浏览器存储权限';
      return;
    }
    renderSavedPicks();
    byId('picker-status').textContent = '已保存到当前浏览器';
  });

  window.addEventListener('hashchange', route);
  window.addEventListener('focus', () => {
    if (!byId('today').hidden) renderScratch();
  });
  route();
})();

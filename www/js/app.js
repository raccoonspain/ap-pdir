// Пульт руководителя — фронт. Контракт данных: www/api/dashboard-data.php
// (fetchDashboardData) отдаёт через www/api/dashboard.php дерево
// сделка → этапы → модули с готовыми агрегатами. Раскрытие строк —
// чистый рендер уже загруженного дерева, без новых REST-вызовов.
// См. docs/superpowers/specs/2026-07-13-pult-rukovoditelya-design.md.

(function () {
  'use strict';

  var ENTITY_TYPE_ID = { DEAL: 1050, MILESTONE: 1054, MODULE: 1062 };

  var DEAL_STAGES = [
    { code: 'NEW',         order: 1, name: 'Подписание' },
    { code: 'UC_WRET3K',   order: 2, name: 'Авансирование' },
    { code: 'CLIENT',      order: 3, name: 'Работа' },
    { code: 'PREPARATION', order: 4, name: 'Закрытие' },
    { code: 'SUCCESS',     order: 5, name: 'Завершено' },
    { code: 'FAIL',        order: 6, name: 'Разрыв' },
  ];

  var state = {
    preset: 'active',
    deals: [],
    kpi: null,
    searchCode: '',
    searchTitle: '',
    checkedStages: new Set(DEAL_STAGES.map(function (s) { return s.code; })),
    sortField: 'code',
    sortDir: 'asc',
    expandedDeals: new Set(),
    expandedMilestones: new Set(),
    domain: '',
  };

  var els = {
    errorBanner: document.getElementById('error-banner'),
    errorMessage: document.getElementById('error-message'),
    retryBtn: document.getElementById('retry-btn'),
    kpiCount: document.getElementById('kpi-count'),
    kpiCost: document.getElementById('kpi-cost'),
    kpiBroken: document.getElementById('kpi-broken'),
    kpiAwaiting: document.getElementById('kpi-awaiting'),
    searchCode: document.getElementById('search-code'),
    searchTitle: document.getElementById('search-title'),
    presetGroup: document.getElementById('preset-group'),
    stageChecks: document.getElementById('stage-checks'),
    loading: document.getElementById('loading'),
    emptyState: document.getElementById('empty-state'),
    table: document.getElementById('deals-table'),
    tbody: document.getElementById('deals-tbody'),
  };

  // ── формат ────────────────────────────────────────────────────────────

  function fmtMoney(v) {
    if (v === null || v === undefined) return '—';
    return Math.round(v).toLocaleString('ru-RU') + ' ₽';
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('ru-RU');
  }

  function fmtLag(v) {
    if (v === null || v === undefined) return '—';
    var sign = v > 0 ? '+' : '';
    return sign + Math.round(v) + ' дн.';
  }

  function fmtCounts(counts) {
    if (!counts) return '—';
    var parts = Object.keys(counts).map(function (label) {
      return counts[label] + ' ' + label;
    });
    return parts.length ? parts.join(' · ') : '—';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ── переход на сущность в Б24 ───────────────────────────────────────────

  function entityUrl(entityTypeId, id) {
    if (!state.domain) return null;
    return 'https://' + state.domain + '/crm/type/' + entityTypeId + '/details/' + id + '/';
  }

  function entityLinkHtml(entityTypeId, id) {
    var url = entityUrl(entityTypeId, id);
    if (!url) return '';
    return '<a class="entity-link" href="' + esc(url) + '" target="_blank" rel="noopener" title="Открыть в Битрикс24">↗</a>';
  }

  // ── загрузка ──────────────────────────────────────────────────────────

  function showError(message) {
    els.errorMessage.textContent = message;
    els.errorBanner.hidden = false;
    els.loading.hidden = true;
    els.table.hidden = true;
    els.emptyState.hidden = true;
  }

  function hideError() {
    els.errorBanner.hidden = true;
  }

  function loadData() {
    hideError();
    els.loading.hidden = false;
    els.table.hidden = true;
    els.emptyState.hidden = true;

    window.api('GET', 'api/dashboard.php?filter=' + encodeURIComponent(state.preset))
      .then(function (data) {
        state.deals = data.deals || [];
        state.kpi = data.kpi || null;
        state.checkedStages = new Set(DEAL_STAGES.map(function (s) { return s.code; }));
        els.loading.hidden = true;
        renderKpi();
        renderStageChecks();
        renderTable();
      })
      .catch(function (err) {
        showError('Не удалось загрузить данные: ' + err.message);
      });
  }

  // ── KPI ───────────────────────────────────────────────────────────────

  function renderKpi() {
    if (!state.kpi) return;
    els.kpiCount.textContent = state.kpi.activeCount;
    els.kpiCost.textContent = fmtMoney(state.kpi.totalCost);
    els.kpiBroken.textContent = state.kpi.brokenScheduleCount;
    els.kpiAwaiting.textContent = state.kpi.awaitingPaymentCount;
  }

  // ── тулбар: пресеты + чекбоксы стадий ───────────────────────────────────

  function renderPresetButtons() {
    var btns = els.presetGroup.querySelectorAll('.preset-btn');
    btns.forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.preset === state.preset);
    });
  }

  function renderStageChecks() {
    els.stageChecks.innerHTML = DEAL_STAGES.map(function (s) {
      var checked = state.checkedStages.has(s.code) ? 'checked' : '';
      return '<label><input type="checkbox" data-stage="' + s.code + '" ' + checked + '> ' + esc(s.name) + '</label>';
    }).join('');
  }

  // ── фильтр + сортировка ──────────────────────────────────────────────

  function getFilteredSortedDeals() {
    var code = state.searchCode.trim().toLowerCase();
    var title = state.searchTitle.trim().toLowerCase();

    var rows = state.deals.filter(function (d) {
      if (code && String(d.code || '').toLowerCase().indexOf(code) === -1) return false;
      if (title && String(d.title || '').toLowerCase().indexOf(title) === -1) return false;
      if (!state.checkedStages.has(d.stageCode)) return false;
      return true;
    });

    rows.sort(function (a, b) {
      var dir = state.sortDir === 'asc' ? 1 : -1;
      if (state.sortField === 'stage') {
        return (a.stageOrder - b.stageOrder) * dir;
      }
      var av = String(a.code || ''), bv = String(b.code || '');
      return av.localeCompare(bv) * dir;
    });

    return rows;
  }

  // ── таблица ──────────────────────────────────────────────────────────

  // Цвет стадии — как в воронке Б24 (снят через crm.status.list, см. D-007).
  // Текст чёрный/белый по контрасту с фоном (относительная яркость WCAG-упрощённо).
  function contrastTextColor(hex) {
    var c = String(hex || '').replace('#', '');
    if (c.length !== 6) return '#111';
    var r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
    var luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#161616' : '#ffffff';
  }

  function stageBadge(name, color) {
    var style = 'background:' + esc(color) + ';color:' + contrastTextColor(color) + ';';
    return '<span class="stage-badge" style="' + style + '">' + esc(name) + '</span>';
  }

  function indicatorDots(indicators) {
    if (!indicators || !indicators.length) return '';
    var out = '';
    if (indicators.indexOf('broken_schedule') !== -1) out += '<span class="indicator-dot red" title="Срыв графика"></span>';
    if (indicators.indexOf('awaiting_payment') !== -1) out += '<span class="indicator-dot yellow" title="Ожидание оплаты"></span>';
    return out;
  }

  function moduleRowHtml(mod) {
    return '<tr>'
      + '<td>' + esc(mod.number || '') + '</td>'
      + '<td>' + esc(mod.title) + ' ' + entityLinkHtml(ENTITY_TYPE_ID.MODULE, mod.id) + '</td>'
      + '<td>' + stageBadge(mod.stageName, mod.stageColor) + '</td>'
      + '<td>' + esc(mod.developer || '—') + '</td>'
      + '<td>' + esc(mod.lastActivity || '') + (mod.lastActivityAt ? ' <span class="muted">(' + fmtDate(mod.lastActivityAt) + ')</span>' : '') + '</td>'
      + '</tr>';
  }

  function milestoneModulesHtml(milestone) {
    if (!milestone.modules.length) {
      return '<div class="module-wrap muted">Модулей нет.</div>';
    }
    return '<div class="module-wrap"><table class="sub-table"><thead><tr>'
      + '<th>Номер</th><th>Название</th><th>Стадия</th><th>Разработчик</th><th>Последняя активность</th>'
      + '</tr></thead><tbody>'
      + milestone.modules.map(moduleRowHtml).join('')
      + '</tbody></table></div>';
  }

  function milestoneRowHtml(deal, milestone) {
    var key = deal.id + ':' + milestone.id;
    var expanded = state.expandedMilestones.has(key);
    var rows = '<tr class="milestone-row" data-milestone-key="' + key + '">'
      + '<td>' + esc(milestone.number || '') + '</td>'
      + '<td>' + esc(milestone.title) + ' ' + entityLinkHtml(ENTITY_TYPE_ID.MILESTONE, milestone.id) + '</td>'
      + '<td>' + stageBadge(milestone.stageName, milestone.stageColor) + '</td>'
      + '<td class="num">' + fmtMoney(milestone.cost) + '</td>'
      + '<td class="num">' + fmtLag(milestone.lagDays) + '</td>'
      + '<td>' + esc(milestone.lastActivity || '') + (milestone.lastActivityAt ? ' <span class="muted">(' + fmtDate(milestone.lastActivityAt) + ')</span>' : '') + '</td>'
      + '</tr>';
    if (expanded) {
      rows += '<tr><td colspan="6" style="padding:0">' + milestoneModulesHtml(milestone) + '</td></tr>';
    }
    return rows;
  }

  function dealMilestonesHtml(deal) {
    if (!deal.milestones.length) {
      return '<div class="muted">' + (deal.stageOrder <= 2 ? 'Этапы ещё не заведены на этой стадии.' : 'Этапов нет.') + '</div>';
    }
    return '<table class="sub-table"><thead><tr>'
      + '<th>Номер</th><th>Название</th><th>Стадия</th><th class="num">Цена</th><th class="num">Дни КП-План</th><th>Последняя активность</th>'
      + '</tr></thead><tbody>'
      + deal.milestones.map(function (m) { return milestoneRowHtml(deal, m); }).join('')
      + '</tbody></table>';
  }

  function dealRowHtml(deal) {
    var expanded = state.expandedDeals.has(deal.id);
    var html = '<tr class="deal-row' + (expanded ? ' expanded' : '') + '" data-deal-id="' + deal.id + '">'
      + '<td class="col-expand"><span class="expand-icon">▶</span></td>'
      + '<td class="deal-code">' + esc(deal.code) + '</td>'
      + '<td>' + esc(deal.title) + ' ' + entityLinkHtml(ENTITY_TYPE_ID.DEAL, deal.id) + '</td>'
      + '<td>' + stageBadge(deal.stageName, deal.stageColor) + '</td>'
      + '<td class="num">' + fmtMoney(deal.cost) + '</td>'
      + '<td class="num">' + fmtMoney(deal.balance) + '</td>'
      + '<td>' + indicatorDots(deal.indicators) + '</td>'
      + '<td>' + fmtCounts(deal.milestoneCounts) + '</td>'
      + '<td>' + fmtCounts(deal.moduleCounts) + '</td>'
      + '<td class="num ' + (deal.lagDays !== null && deal.lagDays < 0 ? 'lag-negative' : 'lag-positive') + '">' + fmtLag(deal.lagDays) + '</td>'
      + '</tr>';
    if (expanded) {
      html += '<tr class="detail-row"><td colspan="10"><div class="detail-wrap">' + dealMilestonesHtml(deal) + '</div></td></tr>';
    }
    return html;
  }

  function renderTable() {
    renderPresetButtons();
    var rows = getFilteredSortedDeals();

    document.querySelectorAll('th.sortable .sort-arrow').forEach(function (el) { el.remove(); });
    var activeTh = document.querySelector('th.sortable[data-sort="' + state.sortField + '"]');
    if (activeTh) {
      var arrow = document.createElement('span');
      arrow.className = 'sort-arrow';
      arrow.textContent = state.sortDir === 'asc' ? '▲' : '▼';
      activeTh.appendChild(arrow);
    }

    if (!rows.length) {
      els.table.hidden = true;
      els.emptyState.hidden = false;
      return;
    }
    els.emptyState.hidden = true;
    els.table.hidden = false;
    els.tbody.innerHTML = rows.map(dealRowHtml).join('');
  }

  // ── события ──────────────────────────────────────────────────────────

  els.retryBtn.addEventListener('click', loadData);

  els.searchCode.addEventListener('input', function () {
    state.searchCode = els.searchCode.value;
    renderTable();
  });
  els.searchTitle.addEventListener('input', function () {
    state.searchTitle = els.searchTitle.value;
    renderTable();
  });

  els.presetGroup.addEventListener('click', function (e) {
    var btn = e.target.closest('.preset-btn');
    if (!btn) return;
    state.preset = btn.dataset.preset;
    state.expandedDeals.clear();
    state.expandedMilestones.clear();
    loadData();
  });

  els.stageChecks.addEventListener('change', function (e) {
    var input = e.target.closest('input[data-stage]');
    if (!input) return;
    if (input.checked) state.checkedStages.add(input.dataset.stage);
    else state.checkedStages.delete(input.dataset.stage);
    renderTable();
  });

  document.querySelectorAll('th.sortable').forEach(function (th) {
    th.addEventListener('click', function () {
      var field = th.dataset.sort;
      if (state.sortField === field) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortField = field;
        state.sortDir = 'asc';
      }
      renderTable();
    });
  });

  els.tbody.addEventListener('click', function (e) {
    if (e.target.closest('.entity-link')) return;
    var milestoneRow = e.target.closest('tr.milestone-row');
    if (milestoneRow) {
      var key = milestoneRow.dataset.milestoneKey;
      if (state.expandedMilestones.has(key)) state.expandedMilestones.delete(key);
      else state.expandedMilestones.add(key);
      renderTable();
      return;
    }
    var dealRow = e.target.closest('tr.deal-row');
    if (dealRow) {
      var dealId = Number(dealRow.dataset.dealId);
      if (state.expandedDeals.has(dealId)) state.expandedDeals.delete(dealId);
      else state.expandedDeals.add(dealId);
      renderTable();
    }
  });

  // ── helper для вызовов нашего бэкенда с прикреплённым session-token ────
  window.api = function (method, path, body) {
    return fetch(path, {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'X-App-Session': window.APP_SESSION || '',
      },
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      if (!r.ok) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          throw new Error(j.error || ('HTTP ' + r.status));
        });
      }
      return r.json();
    });
  };

  // ── старт ────────────────────────────────────────────────────────────

  function boot() {
    if (!window.APP_SESSION) {
      showError('Нет активной сессии. Открой приложение из левого меню Bitrix24.');
      return;
    }
    if (window.BX24 && BX24.getDomain) {
      state.domain = BX24.getDomain() || '';
    }
    loadData();
  }

  if (window.BX24) {
    BX24.init(boot);
  } else {
    boot();
  }
})();

(() => {
  'use strict';

  const dataset = window.RRAM_DATA || {};
  const opportunities = dataset.opportunities || [];
  const allProfileTopics = [
    'RRAM', 'Device physics', 'Compact modeling', 'Reliability', 'Fabrication',
    'In-memory computing', 'Device-circuit co-design', 'Oxide electronics'
  ];
  const defaultProfile = ['RRAM', 'Device physics', 'Compact modeling', 'Reliability', 'In-memory computing'];
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  function storedSet(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
      return new Set(Array.isArray(value) ? value : fallback);
    } catch {
      return new Set(fallback);
    }
  }

  const state = {
    query: '',
    publisher: 'all',
    type: 'all',
    topic: 'all',
    sort: 'personal',
    showArchive: false,
    favoritesOnly: false,
    view: 'cards',
    favorites: storedSet('rramFavorites', []),
    profile: storedSet('rramProfile', defaultProfile)
  };

  const dateFmt = new Intl.DateTimeFormat(undefined, {year: 'numeric', month: 'short', day: 'numeric'});
  const fullDateFmt = new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  });

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[character]));
  }

  function deadlineDate(item) {
    return item.deadline ? new Date(item.deadline) : null;
  }

  function liveStatus(item) {
    const deadline = deadlineDate(item);
    if (item.status === 'closed') return 'closed';
    if (deadline && deadline.getTime() < Date.now()) return 'closed';
    return item.status || 'watch';
  }

  function daysUntil(item) {
    const deadline = deadlineDate(item);
    return deadline ? Math.ceil((deadline - Date.now()) / 86400000) : null;
  }

  function deadlineText(item) {
    const deadline = deadlineDate(item);
    if (!deadline) return 'Deadline not announced';
    return item.deadline_precision === 'date' ? dateFmt.format(deadline) : fullDateFmt.format(deadline);
  }

  function countdownText(item) {
    const days = daysUntil(item);
    if (days === null) return ['TBA', 'watch source'];
    if (days < 0) return ['CLOSED', `${Math.abs(days)} days ago`];
    if (days === 0) return ['TODAY', 'deadline'];
    if (days === 1) return ['1 DAY', 'remaining'];
    return [`${days} DAYS`, 'remaining'];
  }

  function personalizedFit(item) {
    const matches = (item.topics || []).filter((topic) => state.profile.has(topic)).length;
    const possible = Math.max(1, state.profile.size);
    return Math.min(100, Math.round(item.fit_score * 0.72 + (matches / possible) * 28));
  }

  function statusLabel(status) {
    return status === 'open' ? 'Open' : status === 'watch' ? 'Watch' : 'Closed';
  }

  function formatEventDate(value) {
    if (!value) return 'Not announced';
    const [startValue, endValue] = value.split('/');
    const start = new Date(`${startValue}T12:00:00`);
    if (!endValue) return dateFmt.format(start);
    const end = new Date(`${endValue}T12:00:00`);
    return `${dateFmt.format(start)} – ${dateFmt.format(end)}`;
  }

  function journalMetrics(item) {
    return Array.isArray(item.journal_metrics) ? item.journal_metrics : [];
  }

  function impactFactorSummary(item) {
    const metrics = journalMetrics(item);
    if (!metrics.length) return '';
    return metrics.map((metric) => {
      const value = metric.impact_factor ?? 'Not assigned';
      return metrics.length > 1 ? `${metric.short_name || metric.journal}: ${value}` : String(value);
    }).join(' · ');
  }

  function impactFactorLabel(item) {
    const years = [...new Set(journalMetrics(item).map((metric) => metric.impact_factor_year).filter(Boolean))];
    return years.length === 1 ? `Impact factor (${years[0]})` : 'Impact factor';
  }

  function publicationSpeedSummary(item) {
    const metrics = journalMetrics(item);
    if (!metrics.length) return '';
    return metrics.map((metric) => {
      const value = metric.publication_speed || 'Not publicly reported';
      return metrics.length > 1 ? `${metric.short_name || metric.journal}: ${value}` : value;
    }).join(' · ');
  }

  function venueFactsHtml(item) {
    const facts = [];
    if (item.event_date || item.conference_rank) {
      facts.push(`<div><small>CONFERENCE DATES</small><strong>${escapeHtml(formatEventDate(item.event_date))}</strong></div>`);
    }
    if (item.conference_rank) {
      facts.push(`<div><small>CURATED REPUTATION</small><strong>${escapeHtml(item.conference_rank)} · ${escapeHtml(item.conference_reputation || '')}</strong></div>`);
    }
    if (journalMetrics(item).length) {
      facts.push(`<div><small>${escapeHtml(impactFactorLabel(item).toUpperCase())}</small><strong>${escapeHtml(impactFactorSummary(item))}</strong></div>`);
      facts.push(`<div><small>PUBLICATION SPEED</small><strong>${escapeHtml(publicationSpeedSummary(item))}</strong></div>`);
    }
    return facts.length ? `<div class="venue-facts">${facts.join('')}</div>` : '';
  }

  function venueSummaryHtml(item) {
    if (item.event_date) {
      const rank = item.conference_rank ? `<small>${escapeHtml(item.conference_rank)} · ${escapeHtml(item.conference_reputation || '')}</small>` : '';
      return `<strong>${escapeHtml(formatEventDate(item.event_date))}</strong>${rank}`;
    }
    if (journalMetrics(item).length) {
      return `<strong>IF ${escapeHtml(impactFactorSummary(item))}</strong><small>${escapeHtml(publicationSpeedSummary(item))}</small>`;
    }
    return '<small>See official source</small>';
  }

  function relevantText(item) {
    return [
      item.title, item.short_title, item.publisher, item.publisher_group, item.publisher_family,
      item.venue, item.type, item.fit_reason, item.requirements, item.notes,
      item.conference_rank, item.conference_reputation, impactFactorSummary(item),
      ...(item.topics || [])
    ].join(' ').toLowerCase();
  }

  function filteredItems() {
    const result = opportunities.filter((item) => {
      const status = liveStatus(item);
      if (!state.showArchive && status !== 'open') return false;
      if (state.favoritesOnly && !state.favorites.has(item.id)) return false;
      if (state.publisher !== 'all' && item.publisher_group !== state.publisher) return false;
      if (state.type !== 'all' && item.type !== state.type) return false;
      if (state.topic !== 'all' && !(item.topics || []).includes(state.topic)) return false;
      if (state.query && !relevantText(item).includes(state.query.toLowerCase())) return false;
      return true;
    });

    result.sort((a, b) => {
      if (state.sort === 'fit') return b.fit_score - a.fit_score;
      if (state.sort === 'updated') return String(b.verified).localeCompare(String(a.verified));
      if (state.sort === 'deadline') {
        return (deadlineDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER) -
          (deadlineDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER);
      }
      const fitDifference = personalizedFit(b) - personalizedFit(a);
      if (fitDifference) return fitDifference;
      return (deadlineDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER) -
        (deadlineDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER);
    });
    return result;
  }

  function renderProfile() {
    $('#profileTopics').innerHTML = allProfileTopics.map((topic) => (
      `<button class="topic-pill ${state.profile.has(topic) ? 'active' : ''}" type="button" data-profile-topic="${escapeHtml(topic)}">${escapeHtml(topic)}</button>`
    )).join('');
    $$('[data-profile-topic]').forEach((button) => button.addEventListener('click', () => {
      const topic = button.dataset.profileTopic;
      state.profile.has(topic) ? state.profile.delete(topic) : state.profile.add(topic);
      localStorage.setItem('rramProfile', JSON.stringify([...state.profile]));
      renderProfile();
      render();
    }));
  }

  function publisherLine(item) {
    const family = item.publisher_family ? ` · ${escapeHtml(item.publisher_family)}` : '';
    return `<span class="publisher-chip">${escapeHtml(item.publisher_group)}</span><span>${escapeHtml(item.publisher)}${family}</span>`;
  }

  function cardHtml(item) {
    const status = liveStatus(item);
    const [count, unit] = countdownText(item);
    const fit = personalizedFit(item);
    return `<article class="opportunity-card">
      <div class="card-top"><span class="status-badge status-${status}">${statusLabel(status)}</span><span class="type-label">${escapeHtml(item.type)}</span><button class="favorite-button ${state.favorites.has(item.id) ? 'active' : ''}" data-favorite="${item.id}" type="button" aria-label="Toggle favorite">${state.favorites.has(item.id) ? '★' : '☆'}</button></div>
      <h2>${escapeHtml(item.short_title || item.title)}</h2>
      <div class="publisher">${publisherLine(item)}</div>
      <div class="deadline-row"><div><small>${status === 'closed' ? 'CLOSED DEADLINE' : item.deadline ? 'SUBMISSION DEADLINE' : 'DEADLINE STATUS'}</small><strong>${escapeHtml(deadlineText(item))}</strong></div><div class="countdown"><b>${escapeHtml(count)}</b><span>${escapeHtml(unit)}</span></div></div>
      ${venueFactsHtml(item)}
      <div class="fit-block"><span class="fit-score">${fit}</span><div><strong>${escapeHtml(item.fit_label)}</strong><p>${escapeHtml(item.fit_reason)}</p></div></div>
      <div class="tag-list">${(item.topics || []).slice(0, 4).map((topic) => `<span class="tag">${escapeHtml(topic)}</span>`).join('')}${item.topics?.length > 4 ? `<span class="tag">+${item.topics.length - 4}</span>` : ''}</div>
      <div class="card-actions"><button class="detail-button" data-details="${item.id}" type="button">Details</button><a class="source-button" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">Official source ↗</a>${item.deadline ? `<button class="calendar-button" data-calendar="${item.id}" title="Add deadline to calendar" type="button">＋</button>` : ''}</div>
    </article>`;
  }

  function tableRowHtml(item) {
    const status = liveStatus(item);
    return `<tr>
      <td><strong>${escapeHtml(item.short_title || item.title)}</strong><small>${escapeHtml(item.publisher)}</small></td>
      <td><span class="status-badge status-${status}">${statusLabel(status)}</span><small>${escapeHtml(item.type)}</small></td>
      <td><strong>${escapeHtml(item.deadline ? dateFmt.format(deadlineDate(item)) : 'TBA')}</strong><small>${escapeHtml(countdownText(item).join(' '))}</small></td>
      <td>${venueSummaryHtml(item)}</td>
      <td><span class="fit-score">${personalizedFit(item)}</span><small>${escapeHtml(item.fit_label)}</small></td>
      <td><button class="detail-button" data-details="${item.id}" type="button">Details</button></td>
    </tr>`;
  }

  function bindResultActions() {
    $$('[data-favorite]').forEach((button) => button.addEventListener('click', () => {
      const id = button.dataset.favorite;
      state.favorites.has(id) ? state.favorites.delete(id) : state.favorites.add(id);
      localStorage.setItem('rramFavorites', JSON.stringify([...state.favorites]));
      render();
    }));
    $$('[data-details]').forEach((button) => button.addEventListener('click', () => openDetails(button.dataset.details)));
    $$('[data-calendar]').forEach((button) => button.addEventListener('click', () => {
      downloadIcs(opportunities.find((item) => item.id === button.dataset.calendar));
    }));
  }

  function activeFilterSummary() {
    const parts = [state.showArchive ? 'open, watch list & archive' : 'open calls only'];
    if (state.publisher !== 'all') parts.push(state.publisher);
    if (state.type !== 'all') parts.push(state.type);
    if (state.topic !== 'all') parts.push(state.topic);
    if (state.favoritesOnly) parts.push('favorites');
    return parts.join(' · ');
  }

  function render() {
    const items = filteredItems();
    $('#resultCount').textContent = `${items.length} opportunit${items.length === 1 ? 'y' : 'ies'}`;
    $('#activeFilterText').textContent = activeFilterSummary();
    $('#cardsView').innerHTML = items.map(cardHtml).join('');
    $('#tableBody').innerHTML = items.map(tableRowHtml).join('');
    $('#emptyState').classList.toggle('hidden', items.length > 0);
    $('#cardsView').classList.toggle('hidden', state.view !== 'cards' || !items.length);
    $('#tableView').classList.toggle('hidden', state.view !== 'table' || !items.length);
    bindResultActions();
  }

  function metricSourcesHtml(item) {
    const links = journalMetrics(item).filter((metric) => metric.source_url).map((metric) => (
      `<a href="${escapeHtml(metric.source_url)}" target="_blank" rel="noreferrer">${escapeHtml(metric.short_name || metric.journal)} metrics ↗</a>`
    ));
    return links.length ? `<div class="metric-sources">${links.join('')}</div>` : '';
  }

  function openDetails(id) {
    const item = opportunities.find((entry) => entry.id === id);
    if (!item) return;
    const status = liveStatus(item);
    const fit = personalizedFit(item);
    const eventOrPublication = item.event_date ? formatEventDate(item.event_date) : (item.publication_date || 'Continuous');
    const reputation = item.conference_rank ? `<div class="dialog-section"><h3>Conference reputation</h3><p><strong>${escapeHtml(item.conference_rank)} · ${escapeHtml(item.conference_reputation || '')}</strong> — ${escapeHtml(item.conference_rank_note || 'Curated for this tracker; not an official ranking.')}</p></div>` : '';
    const metrics = journalMetrics(item).length ? `<div class="dialog-section"><h3>Journal metrics</h3>${journalMetrics(item).map((metric) => `<div class="journal-metric"><strong>${escapeHtml(metric.journal)}</strong><span>Impact factor: ${escapeHtml(metric.impact_factor ?? 'Not assigned')}${metric.impact_factor_year ? ` (${escapeHtml(metric.impact_factor_year)})` : ''}</span><span>Publication speed: ${escapeHtml(metric.publication_speed || 'Not publicly reported')}</span></div>`).join('')}${metricSourcesHtml(item)}<p class="metric-note">Publisher-reported metrics change over time and should not be treated as a complete measure of journal quality.</p></div>` : '';
    $('#dialogContent').innerHTML = `<div class="dialog-inner"><span class="status-badge status-${status}">${statusLabel(status)}</span><h2>${escapeHtml(item.title)}</h2><div class="dialog-meta"><span class="publisher-chip">${escapeHtml(item.publisher_group)}</span><span>${escapeHtml(item.publisher)}${item.publisher_family ? ` · ${escapeHtml(item.publisher_family)}` : ''}</span><span>Verified ${escapeHtml(item.verified)}</span></div>
      <div class="dialog-grid"><div class="dialog-stat"><small>SUBMISSION DEADLINE</small><strong>${escapeHtml(deadlineText(item))}</strong></div><div class="dialog-stat"><small>PERSONALIZED FIT</small><strong>${fit}/100 · ${escapeHtml(item.fit_label)}</strong></div><div class="dialog-stat"><small>EVENT / PUBLICATION</small><strong>${escapeHtml(eventOrPublication)}</strong></div><div class="dialog-stat"><small>LOCATION</small><strong>${escapeHtml(item.location || 'Online / not specified')}</strong></div></div>
      ${reputation}${metrics}
      <div class="dialog-section"><h3>Why it matches</h3><p>${escapeHtml(item.fit_reason || '—')}</p></div><div class="dialog-section"><h3>Submission shape</h3><p>${escapeHtml(item.requirements || 'See the official source for article types and requirements.')}</p></div><div class="dialog-section"><h3>Researcher note</h3><p>${escapeHtml(item.notes || '—')}</p></div><div class="tag-list">${(item.topics || []).map((topic) => `<span class="tag">${escapeHtml(topic)}</span>`).join('')}</div>
      <div class="dialog-actions"><a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">Open official source ↗</a>${item.deadline ? `<button type="button" data-dialog-calendar="${item.id}">Add deadline to calendar</button>` : ''}</div></div>`;
    $('#detailDialog').showModal();
    const calendarButton = $('[data-dialog-calendar]');
    if (calendarButton) calendarButton.addEventListener('click', () => downloadIcs(item));
  }

  function icsDate(value) {
    return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  function downloadIcs(item) {
    if (!item?.deadline) return;
    const due = new Date(item.deadline);
    const start = new Date(due.getTime() - 30 * 60000);
    const safe = (value) => String(value || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
    const content = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RRAM Opportunity Tracker//EN', 'BEGIN:VEVENT',
      `UID:${item.id}@rram-opportunity-tracker`, `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(start)}`, `DTEND:${icsDate(due)}`,
      `SUMMARY:${safe(item.short_title || item.title)} submission deadline`,
      `DESCRIPTION:${safe(item.publisher_group)} — ${safe(item.notes)}\\n${safe(item.url)}`,
      `URL:${item.url}`, 'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n');
    downloadBlob(content, `${item.id}-deadline.ics`, 'text/calendar;charset=utf-8');
  }

  function downloadBlob(content, name, type) {
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(new Blob([content], {type}));
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(() => {
      URL.revokeObjectURL(anchor.href);
      anchor.remove();
    }, 0);
  }

  function exportCsv() {
    const rows = [[
      'Title', 'Publisher', 'Journal / Venue', 'Type', 'Deadline', 'Conference Dates',
      'Conference Reputation', 'Impact Factor', 'Publication Speed', 'Status',
      'Personalized Fit', 'Topics', 'Official URL'
    ]];
    filteredItems().forEach((item) => rows.push([
      item.title, item.publisher_group, item.venue || item.publisher, item.type, item.deadline || '',
      item.event_date || '', item.conference_rank ? `${item.conference_rank} · ${item.conference_reputation || ''}` : '',
      impactFactorSummary(item), publicationSpeedSummary(item), liveStatus(item), personalizedFit(item),
      (item.topics || []).join('; '), item.url
    ]));
    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadBlob(csv, 'rram-open-calls.csv', 'text/csv;charset=utf-8');
  }

  function addOptions(select, values) {
    select.insertAdjacentHTML('beforeend', values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join(''));
  }

  function initFilters() {
    addOptions($('#publisherFilter'), [...new Set(opportunities.map((item) => item.publisher_group).filter(Boolean))].sort());
    addOptions($('#typeFilter'), [...new Set(opportunities.map((item) => item.type))].sort());
    addOptions($('#topicFilter'), [...new Set(opportunities.flatMap((item) => item.topics || []))].sort());

    $('#searchInput').addEventListener('input', (event) => { state.query = event.target.value.trim(); render(); });
    $('#publisherFilter').addEventListener('change', (event) => { state.publisher = event.target.value; render(); });
    $('#typeFilter').addEventListener('change', (event) => { state.type = event.target.value; render(); });
    $('#topicFilter').addEventListener('change', (event) => { state.topic = event.target.value; render(); });
    $('#sortFilter').addEventListener('change', (event) => { state.sort = event.target.value; render(); });
    $('#archiveToggle').addEventListener('change', (event) => { state.showArchive = event.target.checked; render(); });
    $('#favoriteToggle').addEventListener('change', (event) => { state.favoritesOnly = event.target.checked; render(); });
    $$('.segmented').forEach((button) => button.addEventListener('click', () => {
      state.view = button.dataset.view;
      $$('.segmented').forEach((entry) => entry.classList.toggle('active', entry === button));
      render();
    }));
  }

  function initSummary() {
    const dates = opportunities.map((item) => item.verified).filter(Boolean).sort();
    $('#lastUpdated').textContent = dates.length ? dateFmt.format(new Date(`${dates.at(-1)}T12:00:00`)) : '—';
  }

  function initTheme() {
    const saved = localStorage.getItem('rramTheme');
    document.documentElement.dataset.theme = saved || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    $('#themeToggle').addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      document.documentElement.dataset.theme = next;
      localStorage.setItem('rramTheme', next);
    });
  }

  $('#resetProfile').addEventListener('click', () => {
    state.profile = new Set(defaultProfile);
    localStorage.setItem('rramProfile', JSON.stringify(defaultProfile));
    renderProfile();
    render();
  });
  $('#exportCsv').addEventListener('click', exportCsv);
  $('#dialogClose').addEventListener('click', () => $('#detailDialog').close());
  $('#detailDialog').addEventListener('click', (event) => {
    if (event.target === $('#detailDialog')) $('#detailDialog').close();
  });

  initTheme();
  initFilters();
  renderProfile();
  initSummary();
  render();
})();

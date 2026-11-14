// Token Radar — the page. No network: every byte it shows is in data.js beside it.
// The board ranks pre-token protocols by implied launch value; the detail view shows one
// protocol's model breakdown and farm plan; the model tab shows the calibration, the
// six pricing rules the validation actually ran, and a sandbox that re-ranks live.

const R = window.RADAR;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** $2.75B, $512.4M, $48.2K, $950. */
function money(n) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2).replace(/\.00$/, '') + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return '$' + Math.round(n);
}

function pct(n) {
  if (n === null || n === undefined) return '—';
  return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
}

function ageText(days) {
  if (days === null || days === undefined) return '—';
  if (days < 30) return days + 'd';
  if (days < 365) return Math.round(days / 30) + 'mo';
  return (days / 365).toFixed(1) + 'y';
}

/** A calibration shift in decades, signed and coloured: negative pulls down, positive lifts up. */
function shiftText(s) {
  if (s === null || s === undefined) return '—';
  const cls = s < 0 ? 'shift-down' : s > 0 ? 'shift-up' : '';
  return `<span class="${cls}">${s > 0 ? '+' : ''}${s.toFixed(2)} dex</span>`;
}

const watchSet = new Set(R.watchlist_slugs || []);

/** The rows after the current filters, in the current sort. */
function filteredRows() {
  const q = $('q').value.trim().toLowerCase();
  const chain = $('chain').value;
  const cat = $('cat').value;
  const onlyWatch = $('watchonly').checked;
  const onlyHot = $('hotonly').checked;
  const onlyEarly = $('earlyonly').checked;
  const rows = R.rows.filter((r) => {
    if (q && !(r.name.toLowerCase().includes(q) || r.slug.includes(q))) return false;
    if (chain && !r.chains.includes(chain)) return false;
    if (cat && (r.category || 'Uncategorised') !== cat) return false;
    if (onlyWatch && !watchSet.has(r.slug)) return false;
    if (onlyHot && !(r.change_7d !== null && r.change_7d >= 20)) return false;
    if (onlyEarly && !(r.age_days !== null && r.age_days < 180)) return false;
    return true;
  });
  const sort = $('sort').value;
  const by = {
    implied: (a, b) => b.implied_value_usd - a.implied_value_usd,
    tvl: (a, b) => b.tvl_usd - a.tvl_usd,
    growth: (a, b) => (b.change_7d ?? -1e9) - (a.change_7d ?? -1e9),
    age: (a, b) => (b.age_days ?? -1) - (a.age_days ?? -1),
    name: (a, b) => (a.name < b.name ? -1 : 1),
  }[sort];
  return rows.sort(by);
}

function badge(s) {
  const cls = s === 'heating up' || s === 'early mover' ? 'badge hot' : 'badge';
  return `<span class="${cls}">${esc(s)}</span>`;
}

/** The three picks at the top of the board: the value leader, the hottest grower, the youngest in the top 20. */
function renderPicks() {
  const top = R.rows[0];
  const top50 = R.rows.slice(0, 50);
  const hottest = top50.reduce((a, b) => ((b.change_7d ?? -1e9) > (a.change_7d ?? -1e9) ? b : a), top50[0]);
  const young20 = R.rows.slice(0, 20).filter((r) => r.age_days !== null);
  const youngest = young20.reduce((a, b) => (b.age_days < a.age_days ? b : a), young20[0]);
  const pick = (label, r, why) => `<div class="pick"><span class="pick-label">${esc(label)}</span><a href="#/protocol/${esc(r.slug)}">${esc(r.name)}</a><span class="pick-why">${esc(why)}</span></div>`;
  $('picks').innerHTML =
    pick('Top value', top, `${money(top.implied_value_usd)} implied · ${money(top.tvl_usd)} TVL`) +
    pick('Heating up', hottest, `${pct(hottest.change_7d)} TVL in 7 days · rank #${hottest.rank}`) +
    pick('Youngest in the top 20', youngest, `tracked ${ageText(youngest.age_days)} · rank #${youngest.rank}`);
}

/**
 * The model strip on the board tab: the formula in one line and what the 5-fold
 * check on the 119 live tokens actually measured — the numbers live here, on the
 * page the reader studies, not only behind the Model tab.
 */
function renderModelStrip() {
  const v = R.calibration.tilt_validation;
  const pl = R.calibration.power_law;
  const rep = R.calibration.calibration_report;
  const cal = R.calibration.calibration;
  const losing = v.by_category.filter((c) => c.median_ape_sized_pct > c.median_ape_flat_pct).length;
  $('modelstrip').innerHTML =
    `<span class="ms-label">How this board is priced</span>` +
    `<span class="ms-formula">implied = calibrate(TVL × category median × size tilt × growth × maturity × chain reach)</span>` +
    `<span class="ms-valid">Size tilt: one pooled fit on ${pl.peers} live peers (slope ${pl.slope.toFixed(2)}, R² ${pl.r2.toFixed(2)}), half strength. ` +
    `5-fold check, multiple only: median error ${v.median_ape_sized_pct.toFixed(1)}% vs ${v.median_ape_flat_pct.toFixed(1)}% for the flat median, ` +
    `log error ${v.log_mae_sized.toFixed(3)} vs ${v.log_mae_flat.toFixed(3)}, ${v.sized_wins} of ${v.peers} priced closer. ` +
    `Full formula: median error ${v.full_median_ape_sized_pct.toFixed(1)}%, trimmed mean ${v.full_trimmed_mean_ape_sized_pct.toFixed(1)}% vs ${v.full_trimmed_mean_ape_flat_pct.toFixed(1)}% flat. ` +
    `${cal.identity ? 'The calibration fit was degenerate, so the layer is an identity and does nothing.' : `Calibration (log map slope ${cal.slope.toFixed(2)}, R² ${cal.r2.toFixed(2)}, shift capped at ±${cal.shift_cap_dex} dex): nested 5-fold full formula — trimmed mean ${v.full_cal_trimmed_mean_ape_pct.toFixed(1)}% vs ${v.full_trimmed_mean_ape_sized_pct.toFixed(1)}% uncalibrated, log error ${v.full_cal_log_mae.toFixed(3)} vs ${v.full_log_mae_sized.toFixed(3)}.`} ` +
    `Per-category fits were tested and rejected — see The model. ` +
    `The tilt loses the median-error comparison in ${losing} of ${v.by_category.length} categories, named there.</span>`;
}

function renderBoard() {
  const rows = filteredRows();
  $('count').textContent = `${rows.length} of ${R.rows.length} protocols — ranked by implied launch value`;
  $('rows').innerHTML = rows.map((r) => {
    const g = r.change_7d === null ? '<span class="dim">—</span>' : `<span class="${r.change_7d >= 0 ? 'up' : 'down'}">${pct(r.change_7d)}</span>`;
    const watch = watchSet.has(r.slug) ? '<span class="badge watch">watchlist</span>' : '';
    return `<tr>
      <td class="num">${r.rank}</td>
      <td><span class="name">${esc(r.name)}</span><span class="sub">${esc(r.slug)}</span></td>
      <td>${esc(r.category || '—')}</td>
      <td>${r.chains.slice(0, 3).map(esc).join(', ')}${r.chains.length > 3 ? ' +' + (r.chains.length - 3) : ''}</td>
      <td class="num">${money(r.tvl_usd)}</td>
      <td class="num">${g}</td>
      <td class="num">${ageText(r.age_days)}</td>
      <td class="num val">${money(r.implied_value_usd)}</td>
      <td>${watch}${r.signals.map(badge).join('')}</td>
      <td><button class="link" type="button" data-slug="${esc(r.slug)}">Farm plan →</button></td>
    </tr>`;
  }).join('');
}

function renderLive() {
  $('live').innerHTML = R.live.map((p) => `<tr>
    <td><span class="name">${esc(p.name)}</span><span class="sub">${esc(p.slug)}</span></td>
    <td>${esc(p.category || '—')}</td>
    <td class="num">${money(p.tvl_usd)}</td>
    <td class="num">${p.mcap_usd === null ? '—' : money(p.mcap_usd)}</td>
    <td class="num">${p.ratio === null ? '—' : p.ratio.toFixed(3) + '×'}</td>
    <td class="num">${p.change_7d === null ? '—' : pct(p.change_7d)}</td>
  </tr>`).join('');
}

function renderCalib() {
  $('calib').innerHTML = R.calibration.categories.map((c) => `<tr>
    <td>${esc(c.category)}</td><td class="num">${c.multiple.toFixed(3)}×</td>
    <td class="num">${c.peers}</td><td>${c.fallback ? 'whole-market median (too few peers)' : 'median of live peers'}</td>
  </tr>`).join('');
  const v = R.calibration.tilt_validation;
  const pl = R.calibration.power_law;
  $('cand').innerHTML = v.candidates.map((c) => `<tr>
    <td>${esc(c.candidate)}</td><td class="num">${c.median_ape_pct.toFixed(1)}%</td>
    <td class="num">${c.trimmed_mean_ape_pct.toFixed(1)}%</td><td class="num">${c.wins} / ${c.peers}</td>
    <td class="num">${c.spearman.toFixed(2)}</td><td class="num">${c.log_mae.toFixed(3)}</td>
    <td class="num">${c.within2x_pct.toFixed(1)}%</td>
  </tr>`).join('');
  $('valid').innerHTML = `<strong>The tilt, checked on six metrics:</strong> one pooled regression of log(market cap) on log(TVL) over ${pl.peers} live peers (slope ${pl.slope.toFixed(2)}, R² ${pl.r2.toFixed(2)}, reference TVL ${money(pl.median_tvl_usd)}). A 5-fold check prices each held-out token two ways — the pooled tilt's median error is ${v.median_ape_sized_pct.toFixed(1)}% against ${v.median_ape_flat_pct.toFixed(1)}% for the flat category median, its log-space error ${v.log_mae_sized.toFixed(3)} against ${v.log_mae_flat.toFixed(3)}, and it ranks the held-out tokens at Spearman ${v.spearman_sized.toFixed(2)} against ${v.spearman_flat.toFixed(2)} flat. It prices ${v.sized_wins} of ${v.peers} tokens closer, and ${v.within2x_sized_pct.toFixed(1)}% of them land within twice their true value (flat: ${v.within2x_flat_pct.toFixed(1)}%). <strong>The full formula</strong> (tilt plus growth, maturity and chain reach) is checked the same way: median error ${v.full_median_ape_sized_pct.toFixed(1)}% vs ${v.full_median_ape_flat_pct.toFixed(1)}% flat, trimmed mean ${v.full_trimmed_mean_ape_sized_pct.toFixed(1)}% vs ${v.full_trimmed_mean_ape_flat_pct.toFixed(1)}%, log error ${v.full_log_mae_sized.toFixed(3)} vs ${v.full_log_mae_flat.toFixed(3)}. Pricing from TVL alone is very noisy either way; the tilt is a small, measured edge, so it is applied at half strength and clamped.`;
  renderByCategory();
  renderCalibration();
}

/**
 * The per-category tilt table: median error per category, flat median vs
 * pooled tilt, with the verdict. A category the tilt loses in is named here,
 * not hidden by the global median — the same table the run summary draws its
 * losing-categories line from.
 */
function renderByCategory() {
  const v = R.calibration.tilt_validation;
  $('bycat').innerHTML = v.by_category.map((c) => {
    const wins = c.median_ape_sized_pct < c.median_ape_flat_pct;
    return `<tr>
    <td>${esc(c.category)}</td><td class="num">${c.peers}</td>
    <td class="num">${c.median_ape_flat_pct.toFixed(1)}%</td><td class="num">${c.median_ape_sized_pct.toFixed(1)}%</td>
    <td class="num">${c.sized_wins} / ${c.peers}</td><td>${wins ? 'tilt wins' : 'tilt loses'}</td>
  </tr>`;
  }).join('');
}

/**
 * The calibration tables: the fitted map and its before/after on the out-of-fold
 * predictions, plus the ten board rows it moved the most. The fitted-view numbers
 * are labelled as such — the honest measure is the nested row in the candidates
 * table above, where each fold's map never saw the tokens it priced.
 */
function renderCalibration() {
  const rep = R.calibration.calibration_report;
  const cal = R.calibration.calibration;
  const v = R.calibration.tilt_validation;
  $('calibtext').innerHTML = cal.identity
    ? `<strong>The calibration:</strong> the log-log fit on the out-of-fold predictions was degenerate (too few pairs or a non-positive slope), so the layer is deliberately an identity — it changes no value. The board below is the raw formula, and the nested validation row for the calibrated formula equals the uncalibrated one.`
    : `<strong>The calibration:</strong> a winsorized log-space line fitted on the out-of-fold full-formula predictions of ${cal.peers} live peers — log(calibrated) = ${cal.slope.toFixed(3)} × log(raw) + ${cal.intercept.toFixed(3)} (R² ${cal.r2.toFixed(2)}), training predictions clipped to [${cal.winsor_lo.toFixed(2)}, ${cal.winsor_hi.toFixed(2)}] in log10, every row's shift capped at ±${cal.shift_cap_dex} decades. A slope below 1 means the raw formula's spread is wider than the market's: the extremes come back toward the middle. The nested 5-fold measure — each fold's map fitted without that fold's peers — is median error ${v.full_cal_median_ape_pct.toFixed(1)}% vs ${v.full_median_ape_sized_pct.toFixed(1)}% uncalibrated, trimmed mean ${v.full_cal_trimmed_mean_ape_pct.toFixed(1)}% vs ${v.full_trimmed_mean_ape_sized_pct.toFixed(1)}%, log error ${v.full_cal_log_mae.toFixed(3)} vs ${v.full_log_mae_sized.toFixed(3)}, within 2× ${v.full_cal_within2x_pct.toFixed(1)}% vs ${v.full_within2x_sized_pct.toFixed(1)}%.`;
  $('calibtable').innerHTML =
    `<tr><td>Before calibration (raw full formula)</td><td class="num">${rep.oof_log_mae_before.toFixed(3)}</td><td class="num">${rep.oof_median_ape_before_pct.toFixed(1)}%</td><td class="num">${rep.oof_trimmed_mean_ape_before_pct.toFixed(1)}%</td></tr>` +
    `<tr><td>After calibration (fitted view — same predictions the map was fitted on)</td><td class="num">${rep.oof_log_mae_after.toFixed(3)}</td><td class="num">${rep.oof_median_ape_after_pct.toFixed(1)}%</td><td class="num">${rep.oof_trimmed_mean_ape_after_pct.toFixed(1)}%</td></tr>`;
  $('shrunk').innerHTML = rep.most_shrunk.map((s) => `<tr>
    <td><span class="name">${esc(s.name)}</span><span class="sub">${esc(s.slug)}</span></td>
    <td class="num">${money(s.raw_implied_value_usd)}</td>
    <td class="num">${money(s.calibrated_implied_value_usd)}</td>
    <td class="num">${shiftText(s.shift_dex)}</td>
  </tr>`).join('');
}

/** Split a farm step's trailing "Cost: … Time: …" from its action text. */
function splitStep(s) {
  const m = s.match(/^(.*?) Cost: (.*?)\. Time: (.*?)\.?$/);
  if (!m) return { text: s, cost: '', time: '' };
  return { text: m[1], cost: m[2], time: m[3] };
}

function calibEntry(r) {
  return R.calibration.categories.find((c) => c.category === (r.category || 'Uncategorised'));
}
function calibPeers(r) { return calibEntry(r)?.peers ?? 0; }
function calibFallback(r) { return calibEntry(r)?.fallback ?? true; }

function openDetail(slug) {
  const r = R.rows.find((x) => x.slug === slug);
  if (!r) return;
  const tvl = r.tvl_usd;
  const base = tvl * r.fitted_multiple;
  const steps = r.farm_steps.map((s) => {
    const p = splitStep(s);
    return `<li>${esc(p.text)}<br><span class="ct">Cost: ${esc(p.cost)} · Time: ${esc(p.time)}</span></li>`;
  }).join('');
  const basis = R.calibration.category_basis.find((c) => c.category === (r.category || 'Uncategorised'));
  const pl = R.calibration.power_law;
  const fitLine = `Size tilt: one pooled fit on all ${pl.peers} live-token peers (slope ${pl.slope.toFixed(2)}, damped ${pl.slope_damped.toFixed(2)}, R² ${pl.r2.toFixed(2)}), measured against the market's median live TVL of ${money(pl.median_tvl_usd)}. Per-category fits were tested and rejected — they lose to this fit on five of six validation checks, so no category carries its own slope.`;
  const catVal = R.calibration.tilt_validation.by_category.find((c) => c.category === (r.category || 'Uncategorised'));
  const tiltLine = !catVal ? '' : `<p>In ${esc(r.category || 'Uncategorised')} the tilt ${catVal.median_ape_sized_pct < catVal.median_ape_flat_pct ? 'wins' : 'loses'} the median-error comparison on ${catVal.peers} live-token peer${catVal.peers === 1 ? '' : 's'} (${catVal.median_ape_sized_pct.toFixed(1)}% vs ${catVal.median_ape_flat_pct.toFixed(1)}% flat; ${catVal.sized_wins} of ${catVal.peers} priced closer). See the per-category table in The model.</p>`;
  const basisHtml = !basis ? '' : `
    <h3>Peer basis — the live tokens this multiple stands on</h3>
    <p>${calibFallback(r)
      ? `This category has only ${basis.peers.length} live-token peer${basis.peers.length === 1 ? '' : 's'} — too few for its own median — so the multiple borrows the whole-market median (${r.category_multiple.toFixed(3)}×). The peer${basis.peers.length === 1 ? '' : 's'} below ${basis.peers.length === 1 ? 'is' : 'are'} shown for reference: quartiles ${basis.q1.toFixed(3)}× / ${basis.median.toFixed(3)}× / ${basis.q3.toFixed(3)}× (Q1 / median / Q3).`
      : `The category multiple is the median market-cap / TVL of these ${basis.peers.length} live-token peer${basis.peers.length === 1 ? '' : 's'} in ${esc(r.category || 'Uncategorised')}: quartiles ${basis.q1.toFixed(3)}× / ${basis.median.toFixed(3)}× / ${basis.q3.toFixed(3)}× (Q1 / median / Q3).`} ${esc(fitLine)}</p>
    <div class="tablewrap"><table>
      <thead><tr><th>Peer</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">mcap / TVL</th></tr></thead>
      <tbody>${basis.peers.map((p) => `<tr>
      <td><span class="name">${esc(p.name)}</span><span class="sub">${esc(p.slug)}</span></td>
      <td class="num">${money(p.tvl_usd)}</td><td class="num">${money(p.mcap_usd)}</td>
      <td class="num">${p.ratio.toFixed(3)}×</td>
    </tr>`).join('')}</tbody>
    </table></div>`;
  const calLine = r.calibration_shift_dex === 0
    ? `Calibration: no shift — the raw value stands as priced.`
    : `Calibration: ${money(r.raw_implied_value_usd)} raw → ${money(r.implied_value_usd)} calibrated, a shift of ${r.calibration_shift_dex > 0 ? '+' : ''}${r.calibration_shift_dex.toFixed(2)} decades — the out-of-fold map pulls this row's extreme ${r.calibration_shift_dex < 0 ? 'overestimate down' : 'underestimate up'} toward the market's own spread.`;
  $('detail-body').innerHTML = `
    <h2>${esc(r.name)} <span class="sub">#${r.rank} · ${esc(r.slug)}</span></h2>
    <p>${esc(r.category || 'Uncategorised')} · ${r.chains.map(esc).join(', ') || 'no chain listed'} · tracked since ${esc(r.listed_at || 'unknown date')} (${ageText(r.age_days)}).
    DefiLlama's record carries no token for this protocol — that is the record, not proof it has none.</p>
    <div class="facts">
      <div><b>${money(r.implied_value_usd)}</b><span>implied launch value</span></div>
      <div><b>${money(tvl)}</b><span>TVL</span></div>
      <div><b>${pct(r.change_7d)}</b><span>TVL change, 7 days</span></div>
      <div><b>${r.fitted_multiple.toFixed(3)}×</b><span>fitted multiple</span></div>
      <div><b>${r.growth_multiplier.toFixed(2)}×</b><span>growth</span></div>
      <div><b>${r.maturity_multiplier.toFixed(2)}×</b><span>maturity</span></div>
      <div><b>${r.chain_multiplier.toFixed(2)}×</b><span>chain reach</span></div>
    </div>
    <h3>How the value is built</h3>
    <div class="breakdown">${money(tvl)} TVL × ${r.fitted_multiple.toFixed(3)} fitted multiple × ${r.growth_multiplier.toFixed(2)} growth × ${r.maturity_multiplier.toFixed(2)} maturity × ${r.chain_multiplier.toFixed(2)} chains = ${money(r.raw_implied_value_usd)} raw
    <div class="bar" style="width:${Math.min(100, (r.implied_value_usd / R.rows[0].implied_value_usd) * 100).toFixed(1)}%"></div>
    Fitted ${r.fitted_multiple.toFixed(3)}× = ${r.category_multiple.toFixed(3)}× ${esc(r.category || 'market')} median × ${r.size_tilt.toFixed(2)} size tilt. The tilt is the pooled fit (${esc(r.size_tilt_basis)}, R² ${r.size_tilt_r2.toFixed(2)}). Base ${money(base)} · the category multiple is ${calibFallback(r) ? 'the whole-market median (too few live-token peers in this category)' : `the median market-cap/TVL of ${calibPeers(r)} live-token peer${calibPeers(r) === 1 ? '' : 's'} in this category`}.
    <div class="calibline">${esc(calLine)}</div></div>
    ${basisHtml}
    ${tiltLine}
    <h3>Farm plan — seven steps</h3>
    <ol class="steps">${steps}</ol>
    <p class="note">Costs are the plan's own estimates in gas and capital for this protocol's own chain; they move with the chain. Never pay to claim: a real claim costs gas only, from the protocol's own page.</p>`;
  $('detail').hidden = false;
  $('detail').scrollIntoView({ behavior: 'auto', block: 'start' });
}

function closeDetail() {
  $('detail').hidden = true;
  if (location.hash.startsWith('#/protocol/')) history.replaceState(null, '', '#');
}

/** Re-rank the top 10 under the sandbox dials, including the calibration strength. */
function renderSandbox() {
  const gw = parseFloat($('sb-growth').value);
  const mw = parseFloat($('sb-mat').value);
  const ts = parseFloat($('sb-tilt').value);
  const cap = parseFloat($('sb-cap').value);
  const cs = parseFloat($('sb-cal').value);
  $('sb-growth-v').textContent = gw.toFixed(2);
  $('sb-mat-v').textContent = mw.toFixed(2);
  $('sb-tilt-v').textContent = ts.toFixed(2);
  $('sb-cap-v').textContent = cap.toFixed(2);
  $('sb-cal-v').textContent = cs.toFixed(2);
  const scored = R.rows.map((r) => {
    const growth = 1 + (Math.min(100, Math.max(-50, r.change_7d ?? 0)) / 100) * gw;
    const age = r.age_days ?? 365;
    const mat = (1 - mw) + (Math.min(Math.max(age, 0), 1095) / 1095) * mw;
    const tilt = 1 + (r.size_tilt - 1) * ts;
    const mult = Math.min(r.category_multiple * tilt, cap);
    const raw = Math.max(1, Math.round(r.tvl_usd * mult * growth * mat * r.chain_multiplier));
    const v = Math.max(1, Math.round(raw * Math.pow(10, cs * (r.calibration_shift_dex ?? 0))));
    return { r, v };
  }).sort((a, b) => b.v - a.v).slice(0, 10);
  $('sb-top').innerHTML = scored.map((s, i) => `<li>#${i + 1} ${esc(s.r.name)} — ${money(s.v)} (published rank ${s.r.rank})</li>`).join('');
}

function switchTab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + name));
}

function init() {
  if (!R || !R.rows) {
    document.querySelector('main').innerHTML = '<p>data.js did not load: open this page from the built output, where data.js sits beside dashboard/.</p>';
    return;
  }
  $('meta').textContent = `Snapshot ${R.as_of} · ${R.source} · floor ${money(R.floor_usd)} · model ${R.model_version}`;
  $('src').textContent = `${R.source} (as of ${R.as_of})`;
  $('stats').innerHTML = `
    <div class="stat"><b>${R.watchlist_size}</b><span>watchlist</span></div>
    <div class="stat"><b>${R.board_size}</b><span>board rows</span></div>
    <div class="stat"><b>${R.early_size}</b><span>below the floor</span></div>
    <div class="stat"><b>${money(R.rows[0].implied_value_usd)}</b><span>top implied value</span></div>
    <div class="stat"><b>${R.live_size}</b><span>live tokens set aside</span></div>`;
  const chains = [...new Set(R.rows.flatMap((r) => r.chains))].sort();
  const cats = [...new Set(R.rows.map((r) => r.category || 'Uncategorised'))].sort();
  $('chain').innerHTML = '<option value="">All chains</option>' + chains.map((c) => `<option>${esc(c)}</option>`).join('');
  $('cat').innerHTML = '<option value="">All categories</option>' + cats.map((c) => `<option>${esc(c)}</option>`).join('');
  renderPicks();
  renderModelStrip();
  renderBoard();
  renderLive();
  renderCalib();
  renderSandbox();

  ['q', 'chain', 'cat', 'sort', 'watchonly', 'hotonly', 'earlyonly'].forEach((id) => $(id).addEventListener('input', renderBoard));
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  $('rows').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-slug]');
    if (btn) location.hash = '#/protocol/' + btn.dataset.slug;
  });
  $('detail-close').addEventListener('click', closeDetail);
  ['sb-growth', 'sb-mat', 'sb-tilt', 'sb-cap', 'sb-cal'].forEach((id) => $(id).addEventListener('input', renderSandbox));
  window.addEventListener('hashchange', route);
  route();
}

/** Deep link: #/protocol/<slug> opens that protocol's detail view. */
function route() {
  const m = location.hash.match(/^#\/protocol\/(.+)$/);
  if (m) { switchTab('board'); openDetail(decodeURIComponent(m[1])); }
  else $('detail').hidden = true;
}

init();

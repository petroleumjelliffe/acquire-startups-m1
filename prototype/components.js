/* ============================================================
   components.js — shared presentational layer (config + atoms).
   Pure / props-in: safe to use without the live game engine.
   Used by index.html (the live app) AND states.html (the catalog).
   ============================================================ */

const ROWS = "ABCDEFGHI".split("");
const COLS = Array.from({length:12},(_,i)=>i+1);

const STARTUPS = {
  Gobble:{tier:2, ticker:"$G"}, Scrapple:{tier:2, ticker:"$S"}, PaperfulPost:{tier:0, ticker:"$PP"},
  CamCrooned:{tier:1, ticker:"$C"}, Messla:{tier:0, ticker:"$M"}, ZuckFace:{tier:1, ticker:"$Z"},
  WrecksonMobil:{tier:1, ticker:"$W"},
};

function ticker(id){ return id==='Cash' ? '$$' : (STARTUPS[id] && STARTUPS[id].ticker) || id; }

function cash(amount, opts={}){
  const abs = Math.abs(amount);
  let cls = 'cash', text;
  if(amount===0){ cls += ' zero'; text = '$0'; }
  else if(opts.sign==='delta'){ if(amount<0) cls += ' neg'; text = `${amount<0?'−':'+'}$${abs.toLocaleString()}`; }
  else { if(amount<0) cls += ' neg'; text = `$${abs.toLocaleString()}`; }
  return `<span class="${cls}">${text}</span>`;
}

function price(value, opts={}){
  if(opts.next!=null && opts.next!==value){
    const up = opts.next>value, dir = up ? 'up' : 'down';
    return `<span class="price">$${value.toLocaleString()}`
      + `<span class="price-arrow ${dir}">${up?'↑':'↓'}</span>`
      + `<span class="price-next ${dir}">$${opts.next.toLocaleString()}</span></span>`;
  }
  return `<span class="price">$${value.toLocaleString()}</span>`;
}

function brand(id, opts={}){
  const {mode='static', selected=false, disabled=false, size=null, onclick=null} = opts;
  const interactive = mode==='select';
  const tag = interactive ? 'button' : 'span';
  const cls = ['brand', `brand-${id}`];
  if(selected) cls.push('selected');
  if(disabled) cls.push('disabled');
  if(size) cls.push(size);
  const attrs = (interactive && onclick ? ` onclick="${onclick}"` : '') + (tag==='button' && disabled ? ' disabled' : '');
  return `<${tag} class="${cls.join(' ')}"${attrs}>${id}</${tag}>`;
}

function stockCard(id, opts={}){
  const {mode='static', selected=false, disabled=false, price:pr=null, size=null, depth=0, badge=null, onclick=null} = opts;
  const isCash = id==='Cash';   // money: a landscape "bill", $$ only — no per-share price
  const interactive = mode==='select' || mode==='add' || mode==='remove';
  const tag = interactive ? 'button' : 'span';
  const cls = ['stock', `brand-${id}`];
  if(isCash) cls.push('cash-card');
  if(selected) cls.push('selected');
  if(disabled) cls.push('disabled');
  if(size) cls.push(size);
  if(depth>0) cls.push(`depth-${Math.min(depth,2)}`);   // layered card edges behind, reinforcing a stack's count
  const attrs = (interactive && onclick ? ` onclick="${onclick}"` : '') + (tag==='button' && disabled ? ' disabled' : '');
  const value = pr!=null ? pr : (typeof game!=="undefined" && game.startups[id] && game.startups[id].price);   // a share card always shows a price
  return `<${tag} class="${cls.join(' ')}"${attrs} title="${id}">`
    + `<span class="stock-name">${ticker(id)}</span>`
    + (!isCash && value ? price(value) : '')
    + (mode==='remove' ? `<span class="x">×</span>` : '')
    + (badge ? `<span class="stock-badge">${badge}</span>` : '')
    + `</${tag}>`;
}

function stackDepth(count){ const n=Math.abs(count); if(n>=6) return 2; if(n>=2) return 1; return 0; }   // magnitude: leaving (−) stacks layer like their positive twin

function stockStack(id, count, opts={}){
  const {size=null, price:pr=null, onClick=null, onRemove=null, disabled=false, leaving=false} = opts;
  const cls = ['stock-stack']; if(size) cls.push(size); if(disabled) cls.push('disabled'); if(leaving) cls.push('leaving');
  const isCash = id==='Cash';
  const qcls = ['stack-qty']; if(count===0) qcls.push('zero'); if(isCash && count>0) qcls.push('cash-total');
  const depth = stackDepth(count);   // number of layers scales with size; the 3rd card is reserved for big stacks
  // cash is money: the label under the bills is the total dollars (bills × unit price), not ×N
  const qtyLabel = isCash ? `$${((pr||0)*count).toLocaleString()}` : `${leaving?'−':'×'}${count}`;
  const body = `${stockCard(id, {size, price:pr, depth})}<span class="${qcls.join(' ')}">${qtyLabel}</span>`;
  const bodyEl = (onClick && !disabled)
    ? `<button class="stock-stack-body" onclick="${onClick}">${body}</button>`
    : `<span class="stock-stack-body">${body}</span>`;
  const x = (onRemove && count>0 && !disabled)
    ? `<button class="stack-x" title="Remove one" onclick="${onRemove}">×</button>` : '';
  return `<span class="${cls.join(' ')}">${bodyEl}${x}</span>`;
}

function tile(coord, opts={}){
  const {state='empty', brand:brandId=null, onclick=null} = opts;
  const interactive = state==='hand' || !!onclick;
  const tag = interactive ? 'button' : 'span';
  const cls = ['tile', `t-${state}`];
  if((state==='chain' || state==='founded') && brandId) cls.push(`brand-${brandId}`);
  const attrs = interactive && onclick ? ` onclick="${onclick}"` : '';
  const label = (state==='founded' && brandId) ? ticker(brandId) : coord;
  return `<${tag} class="${cls.join(' ')}"${attrs} title="${coord}">${label}</${tag}>`;
}

function player(p, opts={}){
  const {active=false} = opts;
  return `<div class="player-row ${active?'active':''}">
    <span class="player-emoji">${p.emoji || '•'}</span>
    <span class="nm">${p.name}</span>
    ${active?'<span class="turn-tag">turn</span>':''}
    <span class="csh">${cash(p.cash)}</span>
    ${active?`<span class="chips">${stacksFor(p.portfolio)}</span>`:''}
  </div>`;
}

function stacksFor(portfolio){
  const entries = Object.entries(portfolio).filter(([,n])=>n>0);
  if(!entries.length) return `<span class="no-shares">no shares</span>`;
  return entries.map(([id,n])=>stockStack(id, n, {size:'sm'})).join('');
}

function boughtStacks(bought){
  const counts = {};
  bought.forEach(b=> counts[b.id] = (counts[b.id]||0) + 1);
  return Object.entries(counts).map(([id,n])=>stockStack(id, n, {size:'sm'})).join(' ');
}

/* ============================================================
   Composite views — the step-level components (props-in).
   These are the units the React port maps to 1:1. The live app
   (index.html) and the catalog (states.html) both render from these.
   ============================================================ */

/* a completed step in the stack. `undo` is optional trailing HTML (the ↺ button). */
function stepEntry({phase, detail, undo=''}){
  return `<div class="step-block">
    <div class="stage-label">${phase}${undo}</div>
    <div class="step-done">${detail}</div>
  </div>`;
}

/* the active-step panel: a titled region with a body and optional primary button. */
function activeStep({label, body, button=''}){
  return `<div class="active-step">
    <div class="stage-label">${label}</div>
    ${body}
    ${button}
  </div>`;
}

/* merger payout lines. bonuses: [{player, emoji, qty, type:'majority'|'minority', amount}]
   qty = shares of the absorbed chain the player held (why they earned majority/minority). */
function payoutLines(bonuses){
  return `<div class="payout-lines">
    ${bonuses.length ? bonuses.map(b=>
      `<div class="bonus-line"><span class="player-emoji">${b.emoji||''}</span><span class="pnm">${b.player}</span>${b.qty!=null?`<span class="pqty">×${b.qty}</span>`:''}<span class="role">· ${b.type==='majority'?'Majority':'Minority'}</span>${cash(b.amount,{sign:'delta'})}</div>`
    ).join('') : '<div class="bonus-line">No shareholders to pay.</div>'}
  </div>`;
}

/* the two liquidation exchange buttons: sell one → cash, trade 2 → 1 survivor. */
function liqActions({absorbedId, survivorId, unitPrice, canSell, canTrade, onSell='', onTrade=''}){
  return `<div class="liq-actions">
    <button class="liq-act" ${canSell?`onclick="${onSell}"`:'disabled'}>${stockCard(absorbedId,{size:'sm',price:unitPrice})}<span class="liq-arrow">→</span>${cash(unitPrice)}</button>
    <button class="liq-act" ${canTrade?`onclick="${onTrade}"`:'disabled'}>${stockStack(absorbedId,2,{size:'sm',price:unitPrice})}<span class="liq-arrow">→</span>${stockCard(survivorId,{size:'sm'})}</button>
  </div>`;
}

/* the staging zone: label + pile + always-present Net placeholder + optional action.
   sharesHtml is pre-rendered stacks; empty string → the "empty" placeholder. */
function stagingZone({label, sharesHtml='', cashDelta=0, action=''}){
  const sign = cashDelta>0?'+':cashDelta<0?'−':'';
  const net = `<div class="cart-total"><span class="ctl">Net</span><span class="ct ${cashDelta>0?'pos':cashDelta<0?'':'zero'}">${sign}$${Math.abs(cashDelta).toLocaleString()}</span></div>`;
  return `<div class="staging-zone">
    <div class="zone-label">${label}</div>
    <div class="staging-pile">${sharesHtml || '<span class="stage-empty">empty</span>'}</div>
    ${net}
    <div class="staging-action-slot">${action}</div>
  </div>`;   // slot always present → the zone is the same height with or without a button
}

/* the 9×12 board — pure over a board fixture (Record<coord,{placed,startupId}>).
   opts: hand[] (highlighted placeable), placed (the tile placed this turn),
   owners{coord:initial}, blocked[] (illegal-merge hand tiles), hqTiles[] (founding tiles). */
function boardHtml(board, opts={}){
  const {hand=[], placed=null, owners={}, blocked=[], hqTiles=[]} = opts;
  let html = `<div></div>` + COLS.map(c=>`<div class="colhead">${c}</div>`).join('');
  ROWS.forEach(r=>{
    html += `<div class="rowhead">${r}</div>`;
    COLS.forEach(c=>{
      const id = r+c, cell = board[id] || {placed:false};
      const founded = !!cell.startupId, isHQ = founded && hqTiles.includes(id);
      const inHand = hand.includes(id) && !cell.placed;
      const blockd = inHand && blocked.includes(id);
      const selected = placed === id;
      const classes = ["cell"];
      if(founded) classes.push(`brand-${cell.startupId}`, isHQ ? "hq" : "chain");
      else if(cell.placed) classes.push("placed");
      if(inHand) classes.push("hand");
      if(blockd) classes.push("blocked");
      if(selected) classes.push("selected");
      const clickable = (inHand && !blockd) || selected;
      const label = isHQ ? ticker(cell.startupId) : id;
      html += `<button class="${classes.join(' ')}" ${clickable ? `onclick="onBoardCellClick('${id}')"` : 'tabindex="-1"'} title="${id}">`
        + `<span class="coord">${label}</span>`
        + (owners[id] ? `<span class="tile-owner">${owners[id]}</span>` : '')
        + `</button>`;
    });
  });
  return html;
}

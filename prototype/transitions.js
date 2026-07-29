/* ============================================================
   transitions.js — shared motion layer (live app + motion lab).
   Pure DOM animation over the presentational atoms; no game engine.
   Tune MOTION in motion.html, then commit the settled values here.
   Loaded after components.js; all exports are globals.
   ============================================================ */

const MOTION = {
  t1: { tuckScale: 0.9, stagger: 30, dur: 320, ease: 'cubic-bezier(.2,.7,.3,1)' },   // converge
  t2: { rise: 40, dur: 300, ease: 'cubic-bezier(.2,.7,.3,1)' },                       // push-up / reveal
  speed: 1,   // lab-only slow-mo multiplier (1 / .5 / .25); the app leaves it at 1
};

function reducedMotion(){
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/* mirror the scalar tokens onto CSS custom properties (so CSS-driven bits can read them) */
function applyMotionVars(root){
  const el = root || document.documentElement;
  el.style.setProperty('--t1-dur', (MOTION.t1.dur / MOTION.speed) + 'ms');
  el.style.setProperty('--t1-ease', MOTION.t1.ease);
  el.style.setProperty('--t2-dur', (MOTION.t2.dur / MOTION.speed) + 'ms');
  el.style.setProperty('--t2-ease', MOTION.t2.ease);
}

/* WAAPI wrapper: resolve when the animation finishes; no-op under reduced motion. */
function runAnim(el, keyframes, opts){
  if(reducedMotion()) return Promise.resolve();
  const anim = el.animate(keyframes, opts);
  return anim.finished.catch(()=>{});   // swallow cancellation
}

/* Step advance (T2) — every step resolves IN PLACE, then this pushes it up: the
   outgoing (now-completed) step rises up and out of the active slot (on its way into
   the log) while the incoming step rises from below (behind staging) to fill the slot.
   The new step shoves the old one up. Either element may be null (first reveal has no
   outgoing). The caller reparents the outgoing node into the log once this resolves. */
function stepAdvance(outgoingEl, incomingEl){
  if(reducedMotion()) return Promise.resolve();
  const { rise, dur, ease } = MOTION.t2;
  const d = dur / MOTION.speed;
  const anims = [];
  if(outgoingEl){
    const h = outgoingEl.getBoundingClientRect().height;
    anims.push(runAnim(outgoingEl, [
      { transform: 'translateY(0)' },
      { transform: 'translateY(' + (-h) + 'px)' },
    ], { duration: d, easing: ease, fill: 'forwards' }));   // stays visible — it becomes the log entry
  }
  if(incomingEl){
    anims.push(runAnim(incomingEl, [
      { transform: 'translateY(' + rise + 'px)', opacity: 0 },
      { transform: 'translateY(0)', opacity: 1 },
    ], { duration: d, easing: ease }));
  }
  return Promise.all(anims);
}

/* first reveal (no outgoing step to push up) — the toaster rise on its own. */
function t2Toaster(activeStepEl){
  if(!activeStepEl) return Promise.resolve();
  return stepAdvance(null, activeStepEl);
}

/* T1 — the tile step resolves IN PLACE: the selected tile slides LEFT to the row's
   start and the unused tiles converge BEHIND it (descending z-index, scaled + faded).
   One step updating — no separate section. The push-up (stepAdvance) happens after. */
function t1TileConverge(rowEl, selectedEl){
  if(reducedMotion()) return Promise.resolve();
  const { tuckScale, stagger, dur, ease } = MOTION.t1;
  const d = dur / MOTION.speed;
  const rowRect = rowEl.getBoundingClientRect();
  const selRect = selectedEl.getBoundingClientRect();
  const others = Array.prototype.slice.call(rowEl.children).filter(function(el){ return el !== selectedEl; });
  selectedEl.style.position = 'relative';
  selectedEl.style.zIndex = String(others.length + 1);   // selected on top
  const sel = runAnim(selectedEl, [
    { transform: 'translateX(0)' },
    { transform: 'translateX(' + (rowRect.left - selRect.left) + 'px)' },
  ], { duration: d, easing: ease, fill: 'forwards' });
  const tucks = others.map(function(el, i){
    const r = el.getBoundingClientRect();
    el.style.position = 'relative';
    el.style.zIndex = String(others.length - i);   // behind the selected, descending
    return runAnim(el, [
      { transform: 'translateX(0) scale(1)', opacity: 1 },
      { transform: 'translateX(' + (rowRect.left - r.left) + 'px) scale(' + tuckScale + ')', opacity: 0.4 },
    ], { duration: d, easing: ease, delay: i * (stagger / MOTION.speed), fill: 'forwards' });
  });
  return Promise.all([sel].concat(tucks));
}

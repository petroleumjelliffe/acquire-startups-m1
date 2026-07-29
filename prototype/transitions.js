/* ============================================================
   transitions.js — shared motion layer (live app + motion lab).
   Pure DOM animation over the presentational atoms; no game engine.
   Tune MOTION in motion.html, then commit the settled values here.
   Loaded after components.js; all exports are globals.
   ============================================================ */

const MOTION = {
  t1: { slide: 140, tuckScale: 0.9, stagger: 30, dur: 320, ease: 'cubic-bezier(.2,.7,.3,1)' },
  t2: { rise: 40, dur: 280, ease: 'cubic-bezier(.2,.7,.3,1)' },
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

/* T2 — reveal. The active step toasts up from behind the staging band. */
function t2Toaster(activeStepEl){
  if(!activeStepEl || reducedMotion()) return Promise.resolve();
  const { rise, dur, ease } = MOTION.t2;
  return runAnim(activeStepEl, [
    { transform: 'translateY(' + rise + 'px)', opacity: 0 },
    { transform: 'translateY(0)', opacity: 1 },
  ], { duration: dur / MOTION.speed, easing: ease });
}

/* T1 (part 1) — the unused hand tiles slide toward the selected and tuck behind it
   (descending z-index, scale down, fade), staggered; the selected slides right.
   Resolves with the selected tile's final on-screen rect (for the FLIP-to-log). */
function t1TileTuck(rowEl, selectedEl){
  if(reducedMotion()) return Promise.resolve(selectedEl.getBoundingClientRect());
  const { slide, tuckScale, stagger, dur, ease } = MOTION.t1;
  const d = dur / MOTION.speed;
  const selRect = selectedEl.getBoundingClientRect();
  const others = Array.prototype.slice.call(rowEl.children).filter(function(el){ return el !== selectedEl; });
  const tucks = others.map(function(el, i){
    const r = el.getBoundingClientRect();
    el.style.zIndex = String(others.length - i);
    return runAnim(el, [
      { transform: 'translateX(0) scale(1)', opacity: 1 },
      { transform: 'translateX(' + (selRect.left - r.left) + 'px) scale(' + tuckScale + ')', opacity: 0.35 },
    ], { duration: d, easing: ease, delay: i * (stagger / MOTION.speed), fill: 'forwards' });
  });
  selectedEl.style.position = 'relative';
  selectedEl.style.zIndex = String(others.length + 1);
  const slid = runAnim(selectedEl, [
    { transform: 'translateX(0)' },
    { transform: 'translateX(' + slide + 'px)' },
  ], { duration: d, easing: ease, fill: 'forwards' });
  return Promise.all(tucks.concat([slid])).then(function(){
    return selectedEl.getBoundingClientRect();
  });
}

/* T1 (part 2) — FLIP a freshly-built filled tile from fromRect up to the log row.
   Built from `coord` (not the live node) so it survives the innerHTML re-render. */
function flyTileToLog(fromRect, toRect, coord){
  if(reducedMotion() || !fromRect || !toRect) return Promise.resolve();
  const { dur, ease } = MOTION.t1;
  const holder = document.createElement('div');
  holder.innerHTML = tile(coord, { state: 'filled' });
  const clone = holder.firstElementChild;
  clone.style.cssText += 'position:fixed; margin:0; left:' + fromRect.left + 'px; top:' + fromRect.top +
    'px; width:' + fromRect.width + 'px; height:' + fromRect.height + 'px; z-index:9999; pointer-events:none;';
  document.body.appendChild(clone);
  const dx = toRect.left - fromRect.left, dy = toRect.top - fromRect.top;
  const sx = toRect.width / fromRect.width, sy = toRect.height / fromRect.height;
  return runAnim(clone, [
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')', opacity: 0.6 },
  ], { duration: dur / MOTION.speed, easing: ease }).then(function(){ clone.remove(); });
}

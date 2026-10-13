import { SKILLS, SKILL_ORDER } from '../game/skills.js';
import { CHAPTERS, FREE_CHAPTER, GUIDE, chapterFor, chapterNumeral } from '../game/story.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class StoryUI {
  constructor() {
    this.dlg = $('dialogue');
    this.dlgWho = this.dlg.querySelector('.who');
    this.dlgLine = this.dlg.querySelector('.line');
    this.queue = [];
    this.current = null;
    this.mem = $('memory');
    this.memTimer = 0;
    this.chapter = $('chapter-card');
    this.chTimer = 0;
    this.bar = $('skillbar');
    this.slots = {};
    this.storyEl = $('story');
    this.storyLine = $('story-line');
    this.storyChoices = $('story-choices');
    this.journal = $('journal');
    this.onBlip = null;
  }

  // ─── Répliques de Lueur (non bloquantes) ───────────────────────────
  say(text, who = GUIDE) {
    if (this.queue.some((q) => q.text === text) || this.current?.text === text) return;
    this.queue.push({ text, who });
  }
  clearDialogue() {
    this.queue = [];
    this.current = null;
    this.dlg.classList.remove('show');
  }

  update(dt) {
    if (!this.current && this.queue.length) {
      this.current = this.queue.shift();
      this.current.shown = 0;
      this.current.hold = 2.2 + this.current.text.length * 0.045;
      this.dlgWho.textContent = this.current.who;
      this.dlgLine.textContent = '';
      this.dlg.classList.add('show');
    }
    if (this.current) {
      const c = this.current;
      const before = Math.floor(c.shown);
      c.shown += dt * 55; // lettres par seconde
      const n = Math.min(Math.floor(c.shown), c.text.length);
      if (n !== before && n <= c.text.length) {
        this.dlgLine.textContent = c.text.slice(0, n);
        if (n % 3 === 0 && n < c.text.length) this.onBlip?.();
      }
      if (n >= c.text.length) {
        c.hold -= dt;
        if (c.hold <= 0) {
          this.current = null;
          if (!this.queue.length) this.dlg.classList.remove('show');
        }
      }
    }
  }

  // ─── Carte « éclat de mémoire » ───────────────────────────────────
  memory(fragment, rewardHtml, color = '#7ff0ff') {
    this.mem.querySelector('.mem-title').textContent = fragment.title;
    this.mem.querySelector('.mem-text').textContent = fragment.text;
    const r = this.mem.querySelector('.mem-reward');
    r.innerHTML = rewardHtml || '';
    r.style.display = rewardHtml ? '' : 'none';
    this.mem.style.setProperty('--mem', color);
    this.mem.classList.remove('show');
    void this.mem.offsetWidth;
    this.mem.classList.add('show');
    clearTimeout(this.memTimer);
    this.memTimer = setTimeout(() => this.mem.classList.remove('show'), 4500 + fragment.text.length * 40);
  }

  chapterCard(level) {
    const ch = chapterFor(level);
    this.chapter.querySelector('.ch-num').textContent = level <= CHAPTERS.length ? `Chapitre ${chapterNumeral(level)}` : `Monde ${level}`;
    this.chapter.querySelector('.ch-title').textContent = ch.title;
    this.chapter.classList.remove('show');
    void this.chapter.offsetWidth;
    this.chapter.classList.add('show');
    clearTimeout(this.chTimer);
    this.chTimer = setTimeout(() => this.chapter.classList.remove('show'), 3800);
  }

  // ─── Barre de compétences ─────────────────────────────────────────
  buildBar(skills) {
    this.bar.innerHTML = '';
    this.slots = {};
    for (const id of SKILL_ORDER) {
      if (!skills.has(id)) continue;
      const def = SKILLS[id];
      const el = document.createElement('div');
      el.className = 'skill' + (def.passive ? ' passive' : '');
      el.innerHTML = `<div class="sk-ico">${def.icon}</div><div class="sk-cd"></div><div class="sk-key">${esc(def.short)}</div>`;
      el.title = `${def.name} — ${def.desc}`;
      this.bar.appendChild(el);
      this.slots[id] = el;
    }
    for (const id of ['dash', 'bolt', 'nova']) {
      const b = $(`touch-${id}`);
      if (b) b.classList.toggle('locked', !skills.has(id));
    }
  }

  flashSlot(id) {
    const el = this.slots[id];
    if (!el) return;
    el.classList.remove('new');
    void el.offsetWidth;
    el.classList.add('new');
  }

  updateBar(skills) {
    for (const [id, el] of Object.entries(this.slots)) {
      const f = skills.cooldownFrac(id);
      el.querySelector('.sk-cd').style.background = f > 0 ? `conic-gradient(rgba(5,10,16,0.72) ${f * 360}deg, transparent 0)` : 'transparent';
      el.classList.toggle('ready', f === 0);
    }
  }

  // ─── Séquences plein écran (intro, finale) ────────────────────────
  // Renvoie une promesse résolue avec l'id du choix (ou null).
  sequence(lines, { choices = null, kicker = '', deep = false } = {}) {
    return new Promise((resolve) => {
      let i = 0;
      const el = this.storyEl;
      el.classList.remove('hidden');
      el.classList.toggle('deep', deep);
      el.querySelector('.story-kicker').textContent = kicker;
      this.storyChoices.innerHTML = '';
      const hint = el.querySelector('.story-hint');
      const show = () => {
        this.storyLine.classList.remove('in');
        void this.storyLine.offsetWidth;
        this.storyLine.textContent = lines[i];
        this.storyLine.classList.add('in');
        const last = i === lines.length - 1;
        if (last && choices) {
          hint.style.visibility = 'hidden';
          this.storyChoices.innerHTML = '';
          for (const c of choices) {
            const b = document.createElement('button');
            b.className = 'btn ' + (c.primary ? 'primary' : '');
            b.textContent = c.label;
            b.addEventListener('click', (e) => { e.stopPropagation(); done(c.id); });
            this.storyChoices.appendChild(b);
          }
        } else hint.style.visibility = '';
      };
      const next = () => {
        if (choices && i === lines.length - 1) return;
        i++;
        if (i >= lines.length) done(null);
        else show();
      };
      const onKey = (e) => {
        if (['Space', 'Enter', 'NumpadEnter'].includes(e.code)) { e.preventDefault(); next(); }
        if (e.code === 'Escape' && !choices) done(null);
      };
      const onClick = (e) => { if (!e.target.closest('button')) next(); };
      const skip = $('story-skip');
      const onSkip = (e) => {
        e.stopPropagation();
        if (choices) { i = lines.length - 1; show(); } else done(null);
      };
      const done = (val) => {
        window.removeEventListener('keydown', onKey);
        el.removeEventListener('click', onClick);
        skip.removeEventListener('click', onSkip);
        el.classList.add('hidden');
        resolve(val);
      };
      window.addEventListener('keydown', onKey);
      el.addEventListener('click', onClick);
      skip.addEventListener('click', onSkip);
      show();
    });
  }

  // ─── Journal ──────────────────────────────────────────────────────
  renderJournal({ fragments, skills, level, upgrades }) {
    const body = this.journal.querySelector('.journal-body');
    let html = '<div class="j-col"><h3>Souvenirs</h3>';
    const maxCh = Math.max(level, 1);
    for (let lv = 1; lv <= Math.min(maxCh, CHAPTERS.length); lv++) {
      const ch = CHAPTERS[lv - 1];
      html += `<div class="j-ch"><div class="j-ch-title">${chapterNumeral(lv)} · ${esc(ch.title)}</div>`;
      ch.fragments.forEach((f, i) => {
        const got = fragments.some((x) => x.level === lv && x.idx === i);
        html += got
          ? `<div class="j-frag"><b>${esc(f.title)}</b><span>${esc(f.text)}</span></div>`
          : '<div class="j-frag lost"><b>???</b><span>Souvenir encore perdu.</span></div>';
      });
      html += '</div>';
    }
    const free = fragments.filter((x) => x.level > CHAPTERS.length).length;
    if (free) html += `<div class="j-ch"><div class="j-ch-title">∞ · ${esc(FREE_CHAPTER.title)}</div><div class="j-frag"><b>${free} rêve${free > 1 ? 's' : ''} libre${free > 1 ? 's' : ''}</b></div></div>`;
    html += '</div><div class="j-col"><h3>Compétences</h3>';
    for (const id of SKILL_ORDER) {
      const def = SKILLS[id];
      html += skills.has(id)
        ? `<div class="j-skill"><div class="sk-ico">${def.icon}</div><div><b>${esc(def.name)}</b> <kbd>${esc(def.key)}</kbd><span>${esc(def.desc)}</span></div></div>`
        : '<div class="j-skill lost"><div class="sk-ico">?</div><div><b>???</b><span>Un souvenir te la rendra.</span></div></div>';
    }
    const up = Object.entries(upgrades).filter(([, v]) => v > 0);
    if (up.length) {
      const names = { hp: 'Vie max', st: 'Endurance max', cd: 'Recharges', bolt: 'Dégâts de l\'Éclat', nova: 'Rayon de l\'Onde' };
      html += '<h3>Forces</h3><div class="j-ups">' + up.map(([k, v]) => `<span>${names[k]} ×${v}</span>`).join('') + '</div>';
    }
    html += '</div>';
    body.innerHTML = html;
  }
}

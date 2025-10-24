// ────────────────────────────────
// Chat GPT高校 — AI講義・採点・進捗対応版
// Homeボタン・APIキー管理・安定版
// ────────────────────────────────

// === キャッシュ更新チェック（任意だが便利） ===
if (localStorage.getItem('APP_VERSION') !== '2025-10-24') {
  localStorage.clear();
  localStorage.setItem('APP_VERSION', '2025-10-24');
  console.log('キャッシュ更新: v2025-10-24');
  location.reload();
}

// === 設定管理 =========================================
const S = {
  get apiKey() { return localStorage.getItem('OPENAI_KEY') || ''; },
  set apiKey(v) { v ? localStorage.setItem('OPENAI_KEY', v) : localStorage.removeItem('OPENAI_KEY'); },
  get useKatex() { return localStorage.getItem('USE_KATEX') !== '0'; },
  set useKatex(v) { localStorage.setItem('USE_KATEX', v ? '1' : '0'); },
  get useAiGrading(){ return localStorage.getItem('USE_AI_GRADING') !== '0'; },
  set useAiGrading(v){ localStorage.setItem('USE_AI_GRADING', v ? '1' : '0'); },
  get level(){ return Number(localStorage.getItem('LEVEL')||1); },
  set level(v){ localStorage.setItem('LEVEL', Math.min(5,Math.max(1,v))); }
};

// === 進捗管理 =========================================
const P = {
  get() { return JSON.parse(localStorage.getItem('PROGRESS') || '{}'); },
  set(v){ localStorage.setItem('PROGRESS', JSON.stringify(v)); },
  up(unitId, patch){
    const p = P.get(); p[unitId] = {...(p[unitId]||{}), ...patch}; P.set(p);
  },
  getUnit(unitId){ return P.get()[unitId] || null; }
};

// === ユーティリティ ===================================
const el = (sel) => document.querySelector(sel);
const sleep = (ms)=> new Promise(r=>setTimeout(r,ms));

let currentUnit = null;// === DOM参照 ==========================================

const $roadmap = el('#roadmap'),
      $lesson = el('#lesson'),
      $quiz = el('#quiz'),
      $settings = el('#settings'),
      $apiKey = el('#apiKey'),
      $useKatex = el('#useKatex');

// === KaTeX再描画 ======================================
function renderMath(){ 
  if (S.useKatex && window.renderMathInElement)
    window.renderMathInElement(document.body,{
      delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}]
    });
}

// === 設定ダイアログ ===================================
el('#btnSettings').onclick = ()=>{
  $apiKey.value = S.apiKey;
  $useKatex.checked = S.useKatex;
  const tgl = document.querySelector('#useAiGrading');
  if (tgl) tgl.checked = S.useAiGrading;
  $settings.showModal();
};
el('#closeSettings').onclick = ()=> $settings.close();

el('#saveSettings').onclick = ()=>{
  S.apiKey = ($apiKey.value || '').trim();
  S.useKatex = !!$useKatex.checked;
  const tgl = document.querySelector('#useAiGrading');
  if (tgl) S.useAiGrading = !!tgl.checked;
  $settings.close();
  alert('保存しました');
};
// === APIキー管理：保存・削除・確認（置き換え版） ===
function initKeyButtons(){
  const menu = $settings.querySelector('menu');
  if(!menu.querySelector('#btnKeySave')){
    const wrap = document.createElement('div');
    wrap.className = 'actions';
    wrap.innerHTML = `
      <button id="btnKeySave" type="button">💾 APIキー保存</button>
      <button id="btnKeyDelete" type="button">🗑 削除</button>
      <button id="btnKeyCheck" type="button">👁 確認</button>
    `;
    menu.after(wrap);
  }

  // 保存
  el('#btnKeySave').onclick = ()=>{
    const key = ($apiKey.value || '').trim();
    if(!key){ alert('APIキーを入力してください'); return; }
    localStorage.setItem('OPENAI_KEY', key);
    S.apiKey = key;
    alert('✅ APIキーを保存しました（この端末のブラウザに記憶されます）');
  };

  // 削除
  el('#btnKeyDelete').onclick = ()=>{
    if(confirm('APIキーを削除しますか？\n（次回起動時に再入力が必要です）')){
      localStorage.removeItem('OPENAI_KEY');
      S.apiKey = '';
      $apiKey.value = '';
      alert('🗑 削除しました');
    }
  };

  // 確認
  el('#btnKeyCheck').onclick = ()=>{
    const key = localStorage.getItem('OPENAI_KEY');
    if(!key){ alert('APIキーは保存されていません'); return; }
    const shown = key.length > 12 ? key.slice(0,4) + '•••' + key.slice(-4) : '(短縮不可)';
    alert(`🔑 保存中のキー: ${shown}\n（この端末のブラウザにのみ保存されています）`);
  };

  // 自動復元
  const savedKey = localStorage.getItem('OPENAI_KEY');
  if(savedKey){
    S.apiKey = savedKey;
    $apiKey.value = savedKey;
    console.log('🔑 既存のAPIキーを自動適用しました');
  }
}

// === Home / Tabナビゲーション初期化（置き換え版） ===
function initNavigation(){
  const navButtons = document.querySelectorAll('nav.bottom button');

  navButtons.forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const tab = btn.dataset.tab;

      // セクション切替
      ['roadmap','lesson','quiz'].forEach(id=> el('#'+id).hidden = (id !== tab));

      // Homeならロードマップ再生成（進捗を最新に）
      if(tab === 'roadmap'){
        const map = await loadCourse();
        const stage = map.stage1;
        const prog = P.get();
        const cards = stage.units.map(u=>{
          const pu = prog[u.id];
          const passed = pu?.passed;
          const badge = pu ? `（${pu.score}/${pu.total}${passed?'✅':''}）` : '';
          return `
            <article class="card">
              <h3>${u.title} <small>${badge}</small></h3>
              <div class="actions" style="margin-top:8px;">
                <button data-unit="${u.id}" class="start">学習</button>
                <button data-unit="${u.id}" class="quiz">小テスト</button>
              </div>
            </article>`;
        }).join('');
        $roadmap.innerHTML = `
          <h2>${stage.title}</h2>
          <progress value="${Object.values(prog).filter(p=>p?.passed).length}" max="${stage.units.length}"></progress>
          <p>${Object.values(prog).filter(p=>p?.passed).length}/${stage.units.length} 単元完了</p>
          ${cards}
        `;
        $roadmap.querySelectorAll('.start').forEach(b=> b.onclick=()=>openUnit(b.dataset.unit,'lesson'));
        $roadmap.querySelectorAll('.quiz').forEach(b=> b.onclick=()=>openUnit(b.dataset.unit,'quiz'));
      }

      // ページトップへ
      window.scrollTo({top:0,behavior:'instant'});
    });
  });
}




// === 接続テスト =======================================
el('#testKey').onclick = async ()=>{
  const key = ($apiKey.value || S.apiKey || '').trim();
  if(!key){ alert('APIキーを入力してください'); return; }
  const old = S.apiKey; S.apiKey = key;
  try{
    const res = await askOpenAI('1行でOK。こんにちは、と返して。');
    alert('✅ 接続OK: ' + (res.slice(0,80)));
  }catch(e){
    alert('❌ 接続失敗: ' + (e?.message || e));
  }finally{
    S.apiKey = old;
  }
};

// === コース構造 =======================================
let course = null;
async function loadCourse(){
  if (course) return course;
  const r = await fetch('lessons/index.json');
  course = await r.json();
  return course;
}

// === OpenAI呼び出し ==================================
async function askOpenAI(userContent){
  if(!S.apiKey) throw new Error('No API Key');
  const body = {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "教師。ヒント1行＋確認質問1行のみ。" },
      { role: "user", content: userContent }
    ],
    temperature: 0.2,
  };
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${S.apiKey}` },
    body: JSON.stringify(body)
  });
  const text = await r.text();
  if(!r.ok) throw new Error(`HTTP ${r.status}\n${text.slice(0,200)}`);
  const j = JSON.parse(text);
  return j.choices?.[0]?.message?.content?.trim() || "(no content)";
}

// === AI採点関数 =======================================
async function aiGradeCheck(question, userAnswer, correctAnswer){
  const prompt = `
あなたは採点アシスタントです。
次の回答が意味として正しいかを判定し、「正しい」「間違い」のどちらかを1語で返してください。

質問: ${question}
正答: ${correctAnswer}
受験者の回答: ${userAnswer}
`;
  try{
    const result = await askOpenAI(prompt);
    return /正しい/.test(result);
  }catch(e){
    console.log('AI採点失敗', e);
    return false;
  }
}

// === AI講義モード ====================================
async function aiLecture(uId){
  const res = await fetch(`lessons/${uId}.json`);
  const data = await res.json();
  const steps = [
    { key:'theory', label:'理論' },
    { key:'practice', label:'演習' },
    { key:'application', label:'応用' },
    { key:'reflection', label:'考察' }
  ];
  const area = el('#aiArea');
  area.textContent = "📘 AI講義を開始します...\n";

  for (const step of steps){
    area.textContent += `\n--- ${step.label} ---\n`;
    const content = data[step.key];
    const prompt = `
あなたはChat GPT高校のAI教師です。
次の教材をもとに簡潔な講義を行い、最後に1行の確認質問を出してください。
教材内容:
${content}
`;
    const ans = await askOpenAI(prompt);
    area.textContent += ans + "\n";
    renderMath();
    await sleep(1200);
  }

  area.textContent += "\n✅ 講義終了！「小テストへ →」で確認テストを受けましょう。\n";
}

// === 単元表示 ========================================
async function openUnit(uId, view='lesson'){
  currentUnit = uId;
  const map = await loadCourse();
  const units = map.stage1.units.map(x=>x.id);
  const idx = units.indexOf(uId);
  if (idx > 0) {
    const prev = P.getUnit(units[idx-1]);
    if (!prev?.passed) {
      alert('前の単元に合格すると解放されます。');
      return;
    }
  }

  ['roadmap','quiz','lesson'].forEach(id=>el('#'+id).hidden = (id!==view));
  window.scrollTo(0,0);

  if (view==='lesson') await loadLessonFor(uId);
  else await loadQuizFor(uId);
  P.up(uId, {lastView:view});
}

// === レッスン読込 ====================================
async function loadLessonFor(uId){
  const res = await fetch(`lessons/${uId}.json`);
  const data = await res.json();
  $lesson.innerHTML = `
    <h2>${data.title}</h2>
    <article class="card"><h3>理論</h3><div>${data.theory}</div></article>
    <article class="card"><h3>演習</h3><div>${data.practice}</div></article>
    <article class="card"><h3>応用</h3><div>${data.application}</div></article>
    <article class="card"><h3>考察</h3><div>${data.reflection}</div></article>
    <div class="actions">
      <button id="btnHint">ヒント（AI任意）</button>
      <button id="btnAnswer">答えを見る</button>
      <button id="btnLecture">AI講義を開始</button>
      <button id="toQuiz">小テストへ →</button>
    </div>
    <pre id="aiArea" class="ai"></pre>
  `;
  renderMath();

  el('#btnHint').onclick = async ()=>{
    const prompt = '一次関数の傾きと切片の意味を例と質問つきで短く。';
    const out = await askOpenAI(prompt).catch(()=> '（ローカルヒント）y=mx+b …');
    el('#aiArea').textContent = out;
  };
  el('#btnAnswer').onclick = ()=> el('#aiArea').textContent =
    '【模範解答】y=mx+b で m が傾き, b が切片。傾きは x が 1 増えると y がどれだけ増えるか。';
  el('#btnLecture').onclick = ()=> aiLecture(uId);
  el('#toQuiz').onclick = ()=> openUnit(uId,'quiz');
}

// === クイズ読込 ======================================
async function loadQuizFor(uId){
  const res = await fetch(`quizzes/${uId}.json`);
  const {questions} = await res.json();
  $quiz.innerHTML = `<h2>小テスト</h2>` + questions.map((q,i)=>q.type==='mc'
    ? `<article class="card"><div>${i+1}. ${q.prompt}</div>
       ${q.choices.map((c,j)=>`<label><input type="radio" name="q${i}" value="${j}"> ${c}</label>`).join('<br>')}
      </article>`
    : `<article class="card"><div>${i+1}. ${q.prompt}</div>
       <input id="q${i}" placeholder="解答を入力">
      </article>`
  ).join('') + `
    <button id="grade">採点</button>
    <pre id="result"></pre>
    <div class="actions">
      <button id="backLesson">← レッスンに戻る</button>
      <button id="nextUnit" hidden>次の単元へ →</button>
    </div>`;

  el('#grade').onclick = async ()=>{
    const norm = (s)=>(''+s).trim().normalize('NFKC').replace(/\s+/g,'');
    let score = 0, exp = [];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      let ok = false;
      if (q.type === 'mc') {
        const v = [...document.querySelectorAll(`input[name=q${i}]`)]
          .find(x => x.checked)?.value;
        ok = (Number(v) === q.answer);
        if (!ok && S.apiKey && S.useAiGrading) ok = await aiGradeCheck(q.prompt,String(v??''),String(q.answer));
      } else {
        const v = el(`#q${i}`).value;
        const a = q.answer;
        ok = (v === String(a)) || (norm(v) === norm(a));
        if (!ok && S.apiKey && S.useAiGrading) ok = await aiGradeCheck(q.prompt,v,a);
      }
      if (ok) score++;
      exp.push(`${i+1}. ${ok ? '✅':'❌'} ${q.explanation||''}`);
    }

    el('#result').textContent = `得点: ${score}/${questions.length}\n` + exp.join('\n');
    const rate = score / questions.length;
    const newLv = Math.min(5, Math.max(1, Math.round(rate*5)));
    S.level = newLv;

    const map = await loadCourse();
    const threshold = map.stage1.pass_score || 0.7;
    const passed = rate >= threshold;
    P.up(uId,{score,total:questions.length,passed,lastView:'quiz',level:newLv});

    if(passed){
      el('#nextUnit').hidden=false;
      alert(`🎉 合格！ 理解レベルLv.${newLv} に到達！`);
    }else{
      alert(`❌ 合格ライン ${Math.round(threshold*100)}% に届きません。`);
    }
  };

  el('#backLesson').onclick = ()=> openUnit(uId,'lesson');
  el('#nextUnit').onclick = async ()=>{
    const map = await loadCourse();
    const ids = map.stage1.units.map(x=>x.id);
    const idx = ids.indexOf(uId);
    const next = ids[idx+1];
    if(!next){ alert('🎓 ステージ1を修了しました！'); return; }
    await openUnit(next,'lesson');
  };
}

// === DOMロード後の完全初期化 =========================
document.addEventListener('DOMContentLoaded', async ()=>{
  console.log('🚀 Chat GPT高校 起動');

  // 設定まわり
  initKeyButtons();
  initNavigation();

  // 初回ロードマップ描画
  const map = await loadCourse();
  const stage = map.stage1;
  const prog = P.get();

  const cards = stage.units.map(u=>{
    const pu = prog[u.id];
    const passed = pu?.passed;
    const badge = pu ? `（${pu.score}/${pu.total}${passed?'✅':''}）` : '';
    return `
      <article class="card">
        <h3>${u.title} <small>${badge}</small></h3>
        <div class="actions" style="margin-top:8px;">
          <button data-unit="${u.id}" class="start">学習</button>
          <button data-unit="${u.id}" class="quiz">小テスト</button>
        </div>
      </article>`;
  }).join('');

  $roadmap.innerHTML = `
    <h2>${stage.title}</h2>
    <progress value="${Object.values(prog).filter(p=>p?.passed).length}" max="${stage.units.length}"></progress>
    <p>${Object.values(prog).filter(p=>p?.passed).length}/${stage.units.length} 単元完了</p>
    ${cards}
  `;

  $roadmap.querySelectorAll('.start').forEach(b=> b.onclick=()=>openUnit(b.dataset.unit,'lesson'));
  $roadmap.querySelectorAll('.quiz').forEach(b=> b.onclick=()=>openUnit(b.dataset.unit,'quiz'));

  console.log('✅ 初期化完了');
});
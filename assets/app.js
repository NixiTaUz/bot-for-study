// ── 設定管理 ─────────────────────────────
const S = {
  get apiKey() { return localStorage.getItem('OPENAI_KEY') || ''; },
  set apiKey(v) { v ? localStorage.setItem('OPENAI_KEY', v) : localStorage.removeItem('OPENAI_KEY'); },
  get useKatex() { return localStorage.getItem('USE_KATEX') !== '0'; },
  set useKatex(v) { localStorage.setItem('USE_KATEX', v ? '1' : '0'); },
};

const el = (sel) => document.querySelector(sel);
const $roadmap = el('#roadmap'), $lesson = el('#lesson'), $quiz = el('#quiz');
const $settings = el('#settings'), $apiKey = el('#apiKey'), $useKatex = el('#useKatex');

// タブ切替
document.querySelectorAll('nav.bottom [data-tab]').forEach(b=>{
  b.addEventListener('click', ()=>{
    ['roadmap','lesson','quiz'].forEach(id=> el('#'+id).hidden = (id!==b.dataset.tab));
    window.scrollTo({top:0,behavior:'instant'});
  });
});

// 設定ダイアログ
el('#btnSettings').onclick = ()=>{ $apiKey.value = S.apiKey; $useKatex.checked = S.useKatex; $settings.showModal(); };
el('#closeSettings').onclick = ()=> $settings.close();
el('#saveSettings').onclick = ()=>{
  S.apiKey = ($apiKey.value || '').trim();
  S.useKatex = !!$useKatex.checked;
  $settings.close();
  alert('保存しました');
};
// --- 接続テストボタン ---
el('#testKey').onclick = async ()=>{
  const key = ($apiKey.value || S.apiKey || '').trim();
  if(!key){ alert('APIキーを入力してください'); return; }
  // 一時的にキーを使って ping
  const old = S.apiKey; S.apiKey = key;
  try{
    const res = await askOpenAI('1行でOK。こんにちは、と返して。');
    alert('✅ 接続OK: ' + (res.slice(0,80)));
  }catch(e){
    alert('❌ 接続失敗: ' + (e?.message || e));
  }finally{
    S.apiKey = old; // 元に戻す
  }
};
// KaTeX再描画
function renderMath(){ if (S.useKatex && window.renderMathInElement)
  window.renderMathInElement(document.body,{
    delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}]
  });
}

// ── 教材ロード ───────────────────────────
const unitId = 'stage1_unit1';

async function loadLesson(){
  const res = await fetch(`lessons/${unitId}.json`);
  const data = await res.json();
  $lesson.innerHTML = `
    <h2>${data.title}</h2>
    <article class="card"><h3>理論</h3><div class="md">${data.theory}</div></article>
    <article class="card"><h3>演習</h3><div class="md">${data.practice}</div></article>
    <article class="card"><h3>応用</h3><div class="md">${data.application}</div></article>
    <article class="card"><h3>考察</h3><div class="md">${data.reflection}</div></article>
    <div class="actions">
      <button id="btnHint">ヒント（AI 任意）</button>
      <button id="btnAnswer">答えを見る</button>
    </div>
    <pre id="aiArea" class="ai"></pre>
  `;
  bindLessonActions();
  renderMath();
}

function bindLessonActions(){
  el('#btnAnswer').onclick = ()=> el('#aiArea').textContent =
    '【模範解答（最小MVPでは静的）】y=mx+b で m=傾き, b=切片。傾きは x が 1 増えると y がどれだけ増えるか。';
  el('#btnHint').onclick = async ()=>{
    const prompt = '一次関数の傾きと切片の意味を、例と1行の確認質問つきで短く。';
    const out = await askOpenAI(prompt).catch(()=>
      '（ローカルヒント）y=mx+b で m が傾き、b が切片。例：y=3x+2 は「xが1増えるとyは3増える」。質問：y=5x-1 の切片は？');
    el('#aiArea').textContent = out;
  };
}

async function loadQuiz(){
  const res = await fetch(`quizzes/${unitId}.json`);
  const {questions} = await res.json();
  $quiz.innerHTML = `<h2>小テスト</h2>` + questions.map((q,i)=>q.type==='mc'
    ? `<article class="card"><div>${i+1}. ${q.prompt}</div>
       ${q.choices.map((c,j)=>`<label><input type="radio" name="q${i}" value="${j}"> ${c}</label>`).join('<br>')}
      </article>`
    : `<article class="card"><div>${i+1}. ${q.prompt}</div>
       <input id="q${i}" placeholder="解答を入力">
      </article>`
  ).join('') + `<button id="grade">採点</button><pre id="result"></pre>`;

  el('#grade').onclick = ()=>{
    let score=0, exp=[];
    questions.forEach((q,i)=>{
      let ok=false;
      if(q.type==='mc'){
        const v = [...document.querySelectorAll(`input[name=q${i}]`)]
          .find(x=>x.checked)?.value;
        ok = (Number(v)===q.answer);
      }else{
        const v = el(`#q${i}`).value.trim();
        ok = (v===String(q.answer));
      }
      if(ok) score++; exp.push(`${i+1}. ${ok?'✅':'❌'} ${q.explanation||''}`);
    });
    el('#result').textContent = `得点: ${score}/${questions.length}\n`+exp.join('\n');
  };
}

// ── OpenAI呼び出し（任意/自分用） ──────────────
async function askOpenAI(userContent){
  if(!S.apiKey) throw new Error('No API Key');
  const body = {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "あなたは『chat GPT高校』のAI教師。まず短いヒントを1つ、次に確認質問を1つ返す。" },
      { role: "user", content: userContent }
    ],
    temperature: 0.2,
  };
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${S.apiKey}` },
    body: JSON.stringify(body)
  });
  if(!r.ok) throw new Error(await r.text());
  const j = await r.json();
  return j.choices?.[0]?.message?.content?.trim() || "(no content)";
  
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
    return result.includes('正しい');
  }catch(e){
    console.log('AI採点失敗', e);
    return false;
  }
}
}

// ── 起動 ───────────────────────────────────
(async function(){
  // 簡易ロードマップ（固定文言：後でJSON化）
  $roadmap.innerHTML = `
    <h2>ステージ1：高校基礎</h2>
    <article class="card">
      <h3>単元1：一次関数と運動</h3>
      <div>数学の一次関数 × 物理の等速直線運動（傾き＝速度）</div>
      <div class="actions" style="margin-top:8px;">
        <button id="goLesson">学習を始める</button>
        <button id="goQuiz">小テスト</button>
      </div>
    </article>`;
  el('#goLesson').onclick=()=>{ ['roadmap','quiz'].forEach(id=>el('#'+id).hidden=true); $lesson.hidden=false; window.scrollTo(0,0); };
  el('#goQuiz').onclick=()=>{ ['roadmap','lesson'].forEach(id=>el('#'+id).hidden=true); $quiz.hidden=false; window.scrollTo(0,0); };

  await loadLesson();
  await loadQuiz();
})();

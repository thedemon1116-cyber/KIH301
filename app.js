// 할 일 목록 앱
// 데이터는 브라우저의 localStorage에 저장되어 새로고침해도 유지됩니다.

const STORAGE_KEY = 'todos';
const COLLAPSED_KEY = 'collapsed-groups';

const form = document.getElementById('todo-form');
const input = document.getElementById('todo-input');
const dueInput = document.getElementById('due-input');
const deptInput = document.getElementById('dept-input');
const teamInput = document.getElementById('team-input');
const deptOptions = document.getElementById('dept-options');
const teamOptions = document.getElementById('team-options');
const list = document.getElementById('todo-list');
const empty = document.getElementById('empty');
const count = document.getElementById('count');
const clearDone = document.getElementById('clear-done');
const filterButtons = document.querySelectorAll('.filters button');

let todos = load();
let filter = 'all';
let collapsed = loadCollapsed();

// 저장된 할 일 불러오기
// 예전 데이터에는 due/important/dept/team이 없을 수 있어 기본값을 채움
// 처음 열었을 때(저장된 데이터가 전혀 없을 때)는 예시 항목을 보여줌
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved = raw === null ? exampleTodos() : JSON.parse(raw) || [];
    return saved.map(todo => ({ due: '', important: false, dept: '', team: '', ...todo }));
  } catch {
    return exampleTodos();
  }
}

function exampleTodos() {
  const base = Date.now();
  return [
    { id: base, dept: '회원관리', team: '이용율 관리', text: '(예시) 월간 이용율 리포트 작성', done: false, due: '', important: true },
    { id: base + 1, dept: '회원관리', team: '이용율 관리', text: '(예시) 휴면 회원 알림 문구 검토', done: false, due: '', important: false },
    { id: base + 2, dept: '회원관리', team: '가입 관리', text: '(예시) 가입 절차 단계 줄이기', done: false, due: '', important: false },
    { id: base + 3, dept: '회원관리', team: '', text: '(예시) 실 주간 회의 안건 정리', done: true, due: '', important: false },
    { id: base + 4, dept: '', team: '', text: '(예시) 그룹 없는 개인 할 일', done: false, due: '', important: false },
  ];
}

// 접힌 그룹 목록 불러오기/저장하기
function loadCollapsed() {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY)) || []);
  } catch {
    return new Set();
  }
}

function saveCollapsed() {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
  } catch {
    // 무시
  }
}

// 할 일 저장하기
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch {
    // 저장이 막힌 환경(시크릿 모드 등)에서는 무시
  }
}

// 오늘 날짜를 'YYYY-MM-DD' 형식으로 (date 입력칸과 같은 형식)
function today() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 마감일 배지에 보여줄 글자와 상태
function describeDue(due) {
  if (!due) return { label: '+ 마감일', state: 'none' };
  const [, m, d] = due.split('-').map(Number);
  const diff = Math.round((new Date(due) - new Date(today())) / 86400000);
  if (diff < 0) return { label: `${m}/${d} (${-diff}일 지남)`, state: 'overdue' };
  if (diff === 0) return { label: '오늘까지', state: 'today' };
  if (diff === 1) return { label: '내일까지', state: 'soon' };
  return { label: `${m}/${d}까지 (D-${diff})`, state: 'soon' };
}

// 화면 다시 그리기
// 실 › 팀 › 할 일 순서의 트리로 묶어서 보여줌
function render() {
  const visible = todos.filter(todo => {
    if (filter === 'active') return !todo.done;
    if (filter === 'done') return todo.done;
    if (filter === 'important') return todo.important;
    return true;
  });

  list.innerHTML = '';

  // 실 → (팀 → 할 일 목록) 구조로 묶기. 처음 나온 순서를 그대로 유지
  const depts = new Map();
  const ungrouped = [];
  for (const todo of visible) {
    if (!todo.dept) { ungrouped.push(todo); continue; }
    if (!depts.has(todo.dept)) depts.set(todo.dept, { direct: [], teams: new Map() });
    const dept = depts.get(todo.dept);
    if (!todo.team) { dept.direct.push(todo); continue; }
    if (!dept.teams.has(todo.team)) dept.teams.set(todo.team, []);
    dept.teams.get(todo.team).push(todo);
  }

  for (const [deptName, dept] of depts) {
    const all = [...dept.direct, ...[...dept.teams.values()].flat()];
    const body = createGroup(list, 1, deptName, '', all);
    if (dept.direct.length) body.appendChild(createItemList(dept.direct));
    for (const [teamName, items] of dept.teams) {
      const teamBody = createGroup(body, 2, deptName, teamName, items);
      teamBody.appendChild(createItemList(items));
    }
  }

  if (ungrouped.length) {
    // 그룹이 하나도 없으면 제목 없이 그냥 목록으로
    const parent = depts.size ? createGroup(list, 1, '', '', ungrouped) : list;
    parent.appendChild(createItemList(ungrouped));
  }

  const left = todos.filter(todo => !todo.done).length;
  count.textContent = `${left}개 남음`;
  empty.style.display = visible.length ? 'none' : 'block';
  clearDone.style.visibility = todos.some(todo => todo.done) ? 'visible' : 'hidden';
  updateSuggestions();
}

// 실/팀 그룹 상자 만들기. 안쪽(본문) 요소를 돌려줌
// dept가 빈 문자열이면 '그룹 없음' 상자
function createGroup(parent, level, dept, team, items) {
  const key = team ? `${dept}/${team}` : dept || '__none__';
  const name = level === 2 ? team : dept || '그룹 없음';

  const section = document.createElement('section');
  section.className = `group lv${level}`;
  if (collapsed.has(key)) section.classList.add('collapsed');

  const head = document.createElement('div');
  head.className = 'group-head';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'group-toggle';
  toggle.setAttribute('aria-expanded', String(!collapsed.has(key)));
  const left = items.filter(t => !t.done).length;
  toggle.innerHTML = '<span class="caret">▾</span><span class="tag"></span><span class="name"></span><span class="group-count"></span>';
  toggle.querySelector('.tag').textContent = level === 1 ? '실' : '팀';
  toggle.querySelector('.name').textContent = name;
  toggle.querySelector('.group-count').textContent = `${left}/${items.length}`;
  if (!dept) toggle.querySelector('.tag').remove();
  toggle.addEventListener('click', () => {
    if (collapsed.has(key)) collapsed.delete(key); else collapsed.add(key);
    saveCollapsed();
    render();
  });
  head.appendChild(toggle);

  if (dept) {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'group-action';
    add.title = `'${name}'에 할 일 추가`;
    add.textContent = '＋';
    add.addEventListener('click', () => {
      deptInput.value = dept;
      teamInput.value = team;
      syncTeamInput();
      input.focus();
    });

    const rename = document.createElement('button');
    rename.type = 'button';
    rename.className = 'group-action';
    rename.title = '그룹 이름 바꾸기';
    rename.textContent = '✎';
    rename.addEventListener('click', () => startRename(head, toggle, dept, team));

    head.append(add, rename);
  }

  const body = document.createElement('div');
  body.className = 'group-body';

  section.append(head, body);
  parent.appendChild(section);
  return body;
}

// 할 일 여러 개를 담은 목록(ul) 만들기
function createItemList(items) {
  const ul = document.createElement('ul');
  for (const todo of items) ul.appendChild(createItem(todo));
  return ul;
}

// 그룹 이름 바꾸기 (그 그룹에 속한 모든 할 일에 반영)
// 이미 있는 이름으로 바꾸면 두 그룹이 합쳐짐
function startRename(head, toggle, dept, team) {
  const edit = document.createElement('input');
  edit.className = 'rename-input';
  edit.value = team || dept;
  edit.maxLength = 40;
  head.replaceChild(edit, toggle);
  edit.focus();
  edit.select();

  let finished = false;
  const finish = (commit) => {
    if (finished) return;
    finished = true;
    const value = edit.value.trim();
    if (commit && value) {
      for (const todo of todos) {
        if (todo.dept !== dept) continue;
        if (team && todo.team === team) todo.team = value;
        if (!team) todo.dept = value;
      }
      save();
    }
    render();
  };

  edit.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  edit.addEventListener('blur', () => finish(true));
}

// 입력칸 자동완성: 지금까지 쓴 실 이름, 고른 실에 속한 팀 이름
function updateSuggestions() {
  const depts = [...new Set(todos.map(t => t.dept).filter(Boolean))];
  const teams = [...new Set(todos.filter(t => t.dept === deptInput.value.trim()).map(t => t.team).filter(Boolean))];
  fillOptions(deptOptions, depts);
  fillOptions(teamOptions, teams);
}

function fillOptions(datalist, values) {
  datalist.innerHTML = '';
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    datalist.appendChild(option);
  }
}

// 실이 비어 있으면 팀은 입력할 수 없게
function syncTeamInput() {
  const hasDept = deptInput.value.trim() !== '';
  teamInput.disabled = !hasDept;
  if (!hasDept) teamInput.value = '';
  updateSuggestions();
}

// 할 일 한 줄(li) 만들기
function createItem(todo) {
  const li = document.createElement('li');
  li.dataset.id = todo.id;
  if (todo.done) li.classList.add('done');
  if (todo.important) li.classList.add('important');

  const handle = document.createElement('span');
  handle.className = 'handle';
  handle.title = '끌어서 순서 바꾸기';
  handle.textContent = '⠿';
  handle.addEventListener('pointerdown', (e) => startDrag(e, li));

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = todo.done;
  checkbox.addEventListener('change', () => {
    todo.done = checkbox.checked;
    save();
    render();
  });

  const text = document.createElement('span');
  text.className = 'text';
  text.textContent = todo.text;
  text.addEventListener('dblclick', () => startEdit(li, text, todo));

  const { label, state } = describeDue(todo.due);
  const due = document.createElement('button');
  due.type = 'button';
  due.className = 'due';
  if (state === 'none') due.classList.add('empty-due');
  if (state === 'today') due.classList.add('today');
  if (state === 'overdue') due.classList.add('overdue');
  due.title = '마감일 바꾸기';
  due.textContent = label;
  due.addEventListener('click', () => startDueEdit(li, due, todo));

  const star = document.createElement('button');
  star.type = 'button';
  star.className = 'star';
  star.title = todo.important ? '중요 해제' : '중요 표시';
  star.textContent = todo.important ? '★' : '☆';
  star.addEventListener('click', () => {
    todo.important = !todo.important;
    save();
    render();
  });

  const del = document.createElement('button');
  del.className = 'delete';
  del.type = 'button';
  del.title = '삭제';
  del.textContent = '×';
  del.addEventListener('click', () => {
    todos = todos.filter(t => t.id !== todo.id);
    save();
    render();
  });

  li.append(handle, checkbox, text, due, star, del);
  return li;
}

// 더블클릭으로 내용 수정하기 (Enter: 저장, Esc: 취소)
function startEdit(li, text, todo) {
  const edit = document.createElement('input');
  edit.className = 'edit';
  edit.value = todo.text;
  edit.maxLength = 200;
  li.replaceChild(edit, text);
  edit.focus();

  let finished = false;
  const finish = (commit) => {
    if (finished) return;
    finished = true;
    const value = edit.value.trim();
    if (commit && value) {
      todo.text = value;
      save();
    }
    render();
  };

  edit.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  edit.addEventListener('blur', () => finish(true));
}

// 마감일 배지를 눌러 날짜 바꾸기 (날짜를 지우면 마감일 없음)
function startDueEdit(li, badge, todo) {
  const edit = document.createElement('input');
  edit.type = 'date';
  edit.className = 'due-edit';
  edit.value = todo.due;
  li.replaceChild(edit, badge);
  edit.focus();
  try { edit.showPicker(); } catch { /* 지원하지 않는 브라우저 */ }

  let finished = false;
  const finish = (commit) => {
    if (finished) return;
    finished = true;
    if (commit) {
      todo.due = edit.value;
      save();
    }
    render();
  };

  edit.addEventListener('change', () => finish(true));
  edit.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  edit.addEventListener('blur', () => finish(true));
}

// ⠿ 손잡이를 끌어서 순서 바꾸기 (마우스와 터치 모두 지원)
// 같은 그룹 안에서만 움직임
function startDrag(e, li) {
  e.preventDefault();
  li.classList.add('dragging');
  document.body.classList.add('is-dragging');

  const onMove = (ev) => {
    // 포인터 아래에 있는 다른 항목을 찾아 그 앞/뒤로 옮김
    const container = li.parentElement;
    const siblings = [...container.children].filter(el => el !== li);
    const next = siblings.find(el => {
      const box = el.getBoundingClientRect();
      return ev.clientY < box.top + box.height / 2;
    });
    if (next) {
      if (li.nextElementSibling !== next) container.insertBefore(li, next);
    } else if (container.lastElementChild !== li) {
      container.appendChild(li);
    }
  };

  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    document.body.classList.remove('is-dragging');
    applyOrder();
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
}

// 화면에 보이는 순서를 실제 데이터에 반영
// (필터로 숨겨진 항목은 원래 자리를 그대로 유지)
function applyOrder() {
  const visibleIds = [...list.querySelectorAll('li[data-id]')].map(el => Number(el.dataset.id));
  const byId = new Map(todos.map(t => [t.id, t]));
  const visibleSet = new Set(visibleIds);
  let i = 0;
  todos = todos.map(t => (visibleSet.has(t.id) ? byId.get(visibleIds[i++]) : t));
  save();
  render();
}

// 새 할 일 추가
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  const dept = deptInput.value.trim();
  const team = dept ? teamInput.value.trim() : '';
  todos.push({ id: Date.now(), dept, team, text, done: false, due: dueInput.value, important: false });
  // 실/팀은 그대로 두어서 같은 그룹에 연달아 추가하기 쉽게
  input.value = '';
  dueInput.value = '';
  save();
  render();
});

deptInput.addEventListener('input', syncTeamInput);

// 필터 버튼 (전체 / 진행 중 / 완료 / 중요)
filterButtons.forEach(button => {
  button.addEventListener('click', () => {
    filter = button.dataset.filter;
    filterButtons.forEach(b => b.classList.toggle('active', b === button));
    render();
  });
});

// 완료된 항목 한꺼번에 지우기
clearDone.addEventListener('click', () => {
  todos = todos.filter(todo => !todo.done);
  save();
  render();
});

syncTeamInput();
render();

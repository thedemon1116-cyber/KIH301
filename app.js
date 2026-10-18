// 할 일 목록 앱
// 데이터는 브라우저의 localStorage에 저장되어 새로고침해도 유지됩니다.

const STORAGE_KEY = 'todos';

const form = document.getElementById('todo-form');
const input = document.getElementById('todo-input');
const dueInput = document.getElementById('due-input');
const list = document.getElementById('todo-list');
const empty = document.getElementById('empty');
const count = document.getElementById('count');
const clearDone = document.getElementById('clear-done');
const filterButtons = document.querySelectorAll('.filters button');

let todos = load();
let filter = 'all';

// 저장된 할 일 불러오기 (예전 데이터에는 due/important가 없을 수 있음)
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    return saved.map(todo => ({ due: '', important: false, ...todo }));
  } catch {
    return [];
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
function render() {
  const visible = todos.filter(todo => {
    if (filter === 'active') return !todo.done;
    if (filter === 'done') return todo.done;
    if (filter === 'important') return todo.important;
    return true;
  });

  list.innerHTML = '';
  for (const todo of visible) {
    list.appendChild(createItem(todo));
  }

  const left = todos.filter(todo => !todo.done).length;
  count.textContent = `${left}개 남음`;
  empty.style.display = visible.length ? 'none' : 'block';
  clearDone.style.visibility = todos.some(todo => todo.done) ? 'visible' : 'hidden';
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
function startDrag(e, li) {
  e.preventDefault();
  li.classList.add('dragging');
  document.body.classList.add('is-dragging');

  const onMove = (ev) => {
    // 포인터 아래에 있는 다른 항목을 찾아 그 앞/뒤로 옮김
    const siblings = [...list.children].filter(el => el !== li);
    const next = siblings.find(el => {
      const box = el.getBoundingClientRect();
      return ev.clientY < box.top + box.height / 2;
    });
    if (next) {
      if (li.nextElementSibling !== next) list.insertBefore(li, next);
    } else if (list.lastElementChild !== li) {
      list.appendChild(li);
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
  const visibleIds = [...list.children].map(el => Number(el.dataset.id));
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
  todos.push({ id: Date.now(), text, done: false, due: dueInput.value, important: false });
  input.value = '';
  dueInput.value = '';
  save();
  render();
});

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

render();

// 할 일 목록 앱
// 데이터는 브라우저의 localStorage에 저장되어 새로고침해도 유지됩니다.

const STORAGE_KEY = 'todos';

const form = document.getElementById('todo-form');
const input = document.getElementById('todo-input');
const list = document.getElementById('todo-list');
const empty = document.getElementById('empty');
const count = document.getElementById('count');
const clearDone = document.getElementById('clear-done');
const filterButtons = document.querySelectorAll('.filters button');

let todos = load();
let filter = 'all';

// 저장된 할 일 불러오기
function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
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

// 화면 다시 그리기
function render() {
  const visible = todos.filter(todo => {
    if (filter === 'active') return !todo.done;
    if (filter === 'done') return todo.done;
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
  if (todo.done) li.classList.add('done');

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

  li.append(checkbox, text, del);
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

// 새 할 일 추가
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  todos.push({ id: Date.now(), text, done: false });
  input.value = '';
  save();
  render();
});

// 필터 버튼 (전체 / 진행 중 / 완료)
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

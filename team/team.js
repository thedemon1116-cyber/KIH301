// 팀 공유용 할 일 목록
// claude.ai 아티팩트에서만 동작합니다. 할 일과 첨부는 아티팩트의 공유 저장소(db)에,
// 업로드한 파일은 아티팩트 자산(assets)에 저장되어 링크를 가진 팀원 모두가 함께 봅니다.
// 접힌 그룹, 선택한 필터처럼 개인 화면 설정만 브라우저(localStorage)에 남깁니다.

const COLLAPSED_KEY = 'team-collapsed-groups';
const IMPORTED_KEY = 'team-imported-local';
const STATUS_LABELS = { todo: '진행 전', doing: '진행 중', done: '완료' };

// 공유 저장소가 그대로 받아 주는 파일 형식 (확장자 → 형식). 이 파일들은 새 탭에서 바로 열림
const FILE_TYPES = {
  pdf: 'application/pdf',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  mp4: 'video/mp4', webm: 'video/webm',
  txt: 'text/plain', csv: 'text/csv', md: 'text/markdown', json: 'application/json',
};
const MAX_FILE_BYTES = 20 * 1024 * 1024;

// 그 밖의 파일(한글, 워드, 엑셀, PPT, zip 등)은 글자(base64)로 바꿔 텍스트 파일로 보관하고,
// 내려받을 때 원래 파일로 되돌림. 글자로 바꾸면 크기가 약 4/3배가 되어 원본은 15MB까지
const MAX_PACKED_BYTES = 15 * 1024 * 1024;

// 내려받기 창이 바로 저장해 주는 형식. 나머지(hwp, doc, xls, ppt 등)는 zip으로 감싸서 내려받음
const DIRECT_SAVE = new Set([
  'gif', 'png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm', 'txt', 'json', 'md',
  'docx', 'pptx', 'epub', 'csv', 'pdf', 'xlsx', 'zip',
]);

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
const banner = document.getElementById('banner');
const importBox = document.getElementById('import-box');
const importText = document.getElementById('import-text');
const importButton = document.getElementById('import-button');
const importDismiss = document.getElementById('import-dismiss');

const detail = document.getElementById('detail');
const detailPath = document.getElementById('detail-path');
const detailTitle = document.getElementById('detail-title');
const detailStatus = document.getElementById('detail-status');
const detailNotes = document.getElementById('detail-notes');
const detailSaved = document.getElementById('detail-saved');
const detailFileInput = document.getElementById('detail-file-input');
const uploadLabel = document.getElementById('upload-label');
const detailFiles = document.getElementById('detail-files');
const detailFileError = document.getElementById('detail-file-error');
const detailDone = document.getElementById('detail-done');
const detailClose = document.getElementById('detail-close');
const linkForm = document.getElementById('link-form');
const linkUrl = document.getElementById('link-url');
const linkName = document.getElementById('link-name');

let db = null;
let assets = null;
let user = null;
let myId = null;
let canWrite = true;

let todos = [];
let attachments = [];
let loaded = false;
let filter = 'all';
let collapsed = loadCollapsed();
let openId = null;      // 작성하기 창에 열려 있는 할 일 id
let editing = false;    // 목록 안에서 무언가 수정 중이면 다시 그리기를 잠시 미룸
let pendingRender = false;
let notesTimer = null;
let names = {};         // 사람 id → 이름 (화면에 보여줄 때만 사용, 저장하지 않음)

// ───────── 시작 ─────────

render();
init();

async function init() {
  db = window.claude ? await window.claude.use('db') : null;
  if (!db) {
    loaded = true;
    setReadOnly(true);
    showBanner('공유 목록을 불러올 수 없어요. claude.ai에 로그인한 상태로 이 링크를 열어 주세요.');
    render();
    return;
  }

  [user, assets] = await Promise.all([window.claude.use('user'), window.claude.use('assets')]);
  if (user) {
    myId = await user.id();
    if ((await user.can('data.write')) === false) {
      setReadOnly(true);
      showBanner('보기 전용으로 열려 있어요. 함께 편집하려면 공유한 사람에게 편집 권한을 요청하세요.');
    }
  }
  if (!assets) uploadLabel.hidden = true;

  db.collection('todos').onSnapshot((snap) => {
    todos = snap.docs.map(d => normalize(d.id, d.data()));
    todos.sort((a, b) => a.order - b.order);
    loaded = true;
    render();
    updateDetail();
    offerImport();
  }, onDbError);

  db.collection('attachments').onSnapshot((snap) => {
    attachments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    attachments.sort((a, b) => a.addedAt - b.addedAt);
    render();
    updateDetail();
  }, onDbError);
}

function normalize(id, data) {
  return {
    id, dept: '', team: '', text: '', done: false, due: '', important: false, notes: '',
    order: 0, createdAt: 0, updatedAt: 0, updatedBy: null, ...data,
  };
}

function onDbError(e) {
  if (e && e.code === 'revoked') {
    setReadOnly(true);
    showBanner('이 페이지에 대한 접근 권한이 바뀌었어요. 새로고침해 주세요.');
  } else {
    showBanner('공유 목록 연결이 끊겼어요. 새로고침해 주세요.');
  }
}

function showBanner(message) {
  banner.textContent = message;
  banner.hidden = false;
}

function setReadOnly(on) {
  canWrite = !on;
  document.body.classList.toggle('readonly', on);
  detailNotes.readOnly = on;
  detailDone.disabled = on;
}

// ───────── 저장 (공유 저장소에 쓰기) ─────────

const queues = new Map(); // 같은 할 일에는 한 번에 하나씩만 쓰도록 줄 세움

function todoRef(id) {
  return db.collection('todos').doc(id);
}

function patch(id, fields) {
  if (!db || !canWrite) return Promise.resolve();
  const body = { ...fields, updatedAt: Date.now(), updatedBy: myId };
  const next = (queues.get(id) || Promise.resolve())
    .then(() => todoRef(id).update(body))
    .catch(onWriteError);
  queues.set(id, next);
  return next;
}

function onWriteError(e) {
  const code = e && e.code;
  if (code === 'invalid_argument') {
    setReadOnly(true);
    showBanner('이 목록을 수정할 권한이 없어요. 공유한 사람에게 편집 권한을 요청하세요.');
  } else if (code === 'quota_exceeded') {
    showBanner('공유 저장 공간이 가득 찼어요. 완료된 할 일을 정리한 뒤 다시 시도해 주세요.');
  } else {
    showBanner('저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
}

// ───────── 상태와 표시용 도우미 ─────────

function attachmentsOf(todoId) {
  return attachments.filter(a => a.todoId === todoId);
}

// 완료 체크 → 완료, 작성한 내용이나 첨부가 있으면 → 진행 중, 아무것도 없으면 → 진행 전
function statusOf(todo) {
  if (todo.done) return 'done';
  const notes = todo.id === openId ? detailNotes.value : todo.notes;
  if (notes.trim() || attachmentsOf(todo.id).length) return 'doing';
  return 'todo';
}

function today() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function describeDue(due) {
  if (!due) return { label: '+ 마감일', state: 'none' };
  const [, m, d] = due.split('-').map(Number);
  const diff = Math.round((new Date(due) - new Date(today())) / 86400000);
  if (diff < 0) return { label: `${m}/${d} (${-diff}일 지남)`, state: 'overdue' };
  if (diff === 0) return { label: '오늘까지', state: 'today' };
  if (diff === 1) return { label: '내일까지', state: 'soon' };
  return { label: `${m}/${d}까지 (D-${diff})`, state: 'soon' };
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(ms) {
  const d = new Date(ms);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 사람 이름 가져오기. 처음 보는 사람이면 불러온 뒤 창을 다시 그림
function nameOf(id) {
  if (!id) return '';
  if (id === myId) return '나';
  return names[id] || '팀원';
}

async function loadNames(ids) {
  if (!user) return;
  const missing = [...new Set(ids.filter(id => id && id !== myId && !(id in names)))];
  if (!missing.length) return;
  const found = await user.profiles(missing);
  for (const id of missing) names[id] = (found[id] && found[id].name) || '팀원';
  updateDetail();
}

// ───────── 목록 그리기 ─────────

function render() {
  if (editing) { pendingRender = true; return; }
  pendingRender = false;

  const visible = todos.filter(todo => {
    if (filter === 'todo' || filter === 'doing' || filter === 'done') return statusOf(todo) === filter;
    if (filter === 'important') return todo.important;
    return true;
  });

  list.innerHTML = '';

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
      createGroup(body, 2, deptName, teamName, items).appendChild(createItemList(items));
    }
  }

  if (ungrouped.length) {
    const parent = depts.size ? createGroup(list, 1, '', '', ungrouped) : list;
    parent.appendChild(createItemList(ungrouped));
  }

  const tally = { todo: 0, doing: 0, done: 0 };
  for (const todo of todos) tally[statusOf(todo)]++;
  count.textContent = `진행 전 ${tally.todo} · 진행 중 ${tally.doing} · 완료 ${tally.done}`;

  if (!loaded) {
    empty.textContent = '공유 목록을 불러오는 중…';
  } else if (!todos.length) {
    empty.textContent = canWrite
      ? '아직 할 일이 없어요. 위에서 실(예: 회원관리)과 팀(예: 이용율 관리)을 적고 첫 할 일을 추가해 보세요.'
      : '아직 할 일이 없어요.';
  } else {
    empty.textContent = '이 조건에 맞는 할 일이 없어요.';
  }
  empty.hidden = visible.length > 0;
  clearDone.style.visibility = canWrite && todos.some(t => t.done) ? 'visible' : 'hidden';
  updateSuggestions();
}

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

  if (dept && canWrite) {
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

function createItemList(items) {
  const ul = document.createElement('ul');
  for (const todo of items) ul.appendChild(createItem(todo));
  return ul;
}

function createItem(todo) {
  const li = document.createElement('li');
  li.dataset.id = todo.id;
  if (todo.done) li.classList.add('done');
  if (todo.important) li.classList.add('important');

  const handle = document.createElement('span');
  handle.className = 'handle write-only';
  handle.title = '끌어서 순서 바꾸기';
  handle.textContent = '⠿';
  handle.addEventListener('pointerdown', (e) => startDrag(e, li));

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = todo.done;
  checkbox.disabled = !canWrite;
  checkbox.addEventListener('change', () => patch(todo.id, { done: checkbox.checked }));

  const body = document.createElement('div');
  body.className = 'item-body';

  const text = document.createElement('span');
  text.className = 'text';
  text.textContent = todo.text;
  text.addEventListener('dblclick', () => { if (canWrite) startEdit(text, todo); });

  const meta = document.createElement('div');
  meta.className = 'meta';

  const status = statusOf(todo);
  const pill = document.createElement('span');
  pill.className = `status ${status}`;
  pill.textContent = STATUS_LABELS[status];
  meta.appendChild(pill);

  const { label, state } = describeDue(todo.due);
  if (state !== 'none' || canWrite) {
    const due = document.createElement('button');
    due.type = 'button';
    due.className = 'due';
    if (state === 'none') due.classList.add('empty-due');
    if (state === 'today') due.classList.add('today');
    if (state === 'overdue') due.classList.add('overdue');
    due.title = '마감일 바꾸기';
    due.textContent = label;
    due.disabled = !canWrite;
    due.addEventListener('click', () => startDueEdit(due, todo));
    meta.appendChild(due);
  }

  const attachCount = attachmentsOf(todo.id).length;
  if (attachCount) {
    const clip = document.createElement('span');
    clip.className = 'clip';
    clip.title = '첨부';
    clip.textContent = `📎 ${attachCount}`;
    meta.appendChild(clip);
  }

  body.append(text, meta);

  const write = document.createElement('button');
  write.type = 'button';
  write.className = 'write';
  write.textContent = canWrite ? '작성하기' : '보기';
  write.addEventListener('click', () => openDetail(todo.id));

  const star = document.createElement('button');
  star.type = 'button';
  star.className = 'star';
  star.title = todo.important ? '중요 해제' : '중요 표시';
  star.textContent = todo.important ? '★' : '☆';
  star.disabled = !canWrite;
  star.addEventListener('click', () => patch(todo.id, { important: !todo.important }));

  const del = document.createElement('button');
  del.className = 'delete write-only';
  del.type = 'button';
  del.title = '삭제';
  del.textContent = '×';
  del.addEventListener('click', () => askDelete(li, [todo]));

  li.append(handle, checkbox, body, write, star, del);
  return li;
}

// 여럿이 함께 쓰는 목록이라 지우기 전에 한 번 더 물어봄
function askDelete(li, targets) {
  const bar = document.createElement('div');
  bar.className = 'confirm-bar';
  const msg = document.createElement('span');
  msg.textContent = '이 할 일과 첨부를 모두 지울까요? 팀원 화면에서도 사라져요.';
  const yes = document.createElement('button');
  yes.type = 'button';
  yes.className = 'confirm-yes';
  yes.textContent = '지우기';
  const no = document.createElement('button');
  no.type = 'button';
  no.textContent = '취소';
  bar.append(msg, yes, no);
  li.after(bar);
  editing = true;
  const done = () => { bar.remove(); editing = false; render(); };
  yes.addEventListener('click', () => { removeTodos(targets); done(); });
  no.addEventListener('click', done);
  no.focus();
}

async function removeTodos(targets) {
  if (!canWrite) return;
  for (const todo of targets) {
    for (const att of attachmentsOf(todo.id)) await removeAttachment(att);
    await todoRef(todo.id).delete().catch(onWriteError);
  }
}

// ───────── 목록 안에서 바로 고치기 ─────────

function startEdit(text, todo) {
  const edit = document.createElement('input');
  edit.className = 'edit';
  edit.value = todo.text;
  edit.maxLength = 200;
  text.replaceWith(edit);
  editing = true;
  edit.focus();

  let finished = false;
  const finish = (commit) => {
    if (finished) return;
    finished = true;
    editing = false;
    const value = edit.value.trim();
    if (commit && value && value !== todo.text) patch(todo.id, { text: value });
    render();
  };
  edit.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  edit.addEventListener('blur', () => finish(true));
}

function startDueEdit(badge, todo) {
  const edit = document.createElement('input');
  edit.type = 'date';
  edit.className = 'due-edit';
  edit.value = todo.due;
  badge.replaceWith(edit);
  editing = true;
  edit.focus();
  try { edit.showPicker(); } catch { /* 지원하지 않는 브라우저 */ }

  let finished = false;
  const finish = (commit) => {
    if (finished) return;
    finished = true;
    editing = false;
    if (commit && edit.value !== todo.due) patch(todo.id, { due: edit.value });
    render();
  };
  edit.addEventListener('change', () => finish(true));
  edit.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  edit.addEventListener('blur', () => finish(true));
}

function startRename(head, toggle, dept, team) {
  const edit = document.createElement('input');
  edit.className = 'rename-input';
  edit.value = team || dept;
  edit.maxLength = 40;
  head.replaceChild(edit, toggle);
  editing = true;
  edit.focus();
  edit.select();

  let finished = false;
  const finish = (commit) => {
    if (finished) return;
    finished = true;
    editing = false;
    const value = edit.value.trim();
    if (commit && value && value !== (team || dept)) {
      for (const todo of todos) {
        if (todo.dept !== dept) continue;
        if (team && todo.team === team) patch(todo.id, { team: value });
        if (!team) patch(todo.id, { dept: value });
      }
    }
    render();
  };
  edit.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  edit.addEventListener('blur', () => finish(true));
}

// ⠿ 손잡이를 끌어서 같은 그룹 안에서 순서 바꾸기
function startDrag(e, li) {
  if (!canWrite) return;
  e.preventDefault();
  editing = true;
  li.classList.add('dragging');
  document.body.classList.add('is-dragging');

  const onMove = (ev) => {
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
    li.classList.remove('dragging');
    editing = false;
    moveBetweenNeighbours(li);
    render();
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
}

// 옮긴 항목 하나만 앞뒤 항목 사이의 순서 값으로 바꿈 (다른 팀원의 순서는 건드리지 않음)
function moveBetweenNeighbours(li) {
  const byId = id => todos.find(t => t.id === id);
  const todo = byId(li.dataset.id);
  const prev = li.previousElementSibling && byId(li.previousElementSibling.dataset.id);
  const next = li.nextElementSibling && byId(li.nextElementSibling.dataset.id);
  if (!todo || (!prev && !next)) return;
  let order;
  if (prev && next) order = (prev.order + next.order) / 2;
  else if (prev) order = prev.order + 1000;
  else order = next.order - 1000;
  if (order === todo.order) return;
  todo.order = order;
  todos.sort((a, b) => a.order - b.order);
  patch(todo.id, { order });
}

// ───────── 입력칸 ─────────

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

function syncTeamInput() {
  const hasDept = deptInput.value.trim() !== '';
  teamInput.disabled = !hasDept;
  if (!hasDept) teamInput.value = '';
  updateSuggestions();
}

function nextOrder() {
  return todos.length ? Math.max(...todos.map(t => t.order)) + 1000 : 1000;
}

function addTodo(fields) {
  const now = Date.now();
  return db.collection('todos').doc().set({
    dept: '', team: '', text: '', done: false, due: '', important: false, notes: '',
    order: nextOrder(), createdAt: now, createdBy: myId, updatedAt: now, updatedBy: myId,
    ...fields,
  });
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!db || !canWrite) return;
  const text = input.value.trim();
  if (!text) return;
  const dept = deptInput.value.trim();
  const team = dept ? teamInput.value.trim() : '';
  addTodo({ dept, team, text, due: dueInput.value }).catch(onWriteError);
  input.value = '';
  dueInput.value = '';
});

deptInput.addEventListener('input', syncTeamInput);

filterButtons.forEach(button => {
  button.addEventListener('click', () => {
    filter = button.dataset.filter;
    filterButtons.forEach(b => b.classList.toggle('active', b === button));
    render();
  });
});

clearDone.addEventListener('click', () => {
  const done = todos.filter(t => t.done);
  if (!done.length) return;
  const bar = document.createElement('div');
  bar.className = 'confirm-bar';
  bar.innerHTML = '<span></span><button type="button" class="confirm-yes">지우기</button><button type="button">취소</button>';
  bar.querySelector('span').textContent = `완료된 할 일 ${done.length}개와 첨부를 모두 지울까요? 팀원 화면에서도 사라져요.`;
  list.after(bar);
  const [yes, no] = bar.querySelectorAll('button');
  yes.addEventListener('click', () => { removeTodos(done); bar.remove(); });
  no.addEventListener('click', () => bar.remove());
  no.focus();
});

// ───────── 작성하기 창 ─────────

function openTodo() {
  return todos.find(t => t.id === openId) || null;
}

function openDetail(id) {
  const todo = todos.find(t => t.id === id);
  if (!todo) return;
  openId = id;
  detailNotes.value = todo.notes;
  detailFileError.textContent = '';
  linkUrl.value = '';
  linkName.value = '';
  updateDetail();
  detail.showModal();
  if (canWrite && !todo.notes) detailNotes.focus();
}

function updateDetail() {
  const todo = openTodo();
  if (!todo) {
    if (openId && detail.open && loaded) detail.close(); // 다른 팀원이 지운 경우
    return;
  }
  detailPath.textContent = [todo.dept, todo.team].filter(Boolean).join(' › ') || '그룹 없음';
  detailTitle.textContent = todo.text;
  detailDone.checked = todo.done;

  // 내가 입력 중일 때는 덮어쓰지 않음. 그 외에는 팀원이 고친 내용을 바로 반영
  if (document.activeElement !== detailNotes && !notesTimer) detailNotes.value = todo.notes;

  const status = statusOf(todo);
  detailStatus.className = `status ${status}`;
  detailStatus.textContent = STATUS_LABELS[status];

  if (notesTimer) {
    detailSaved.textContent = '저장 중…';
  } else if (todo.updatedAt) {
    detailSaved.textContent = `마지막 수정: ${nameOf(todo.updatedBy) || '팀원'} · ${formatTime(todo.updatedAt)}`;
  } else {
    detailSaved.textContent = '';
  }

  const items = attachmentsOf(todo.id);
  loadNames([todo.updatedBy, ...items.map(a => a.by)]);

  detailFiles.innerHTML = '';
  for (const att of items) {
    const li = document.createElement('li');

    const icon = document.createElement('span');
    icon.className = 'file-icon';
    icon.textContent = att.kind === 'link' ? '🔗' : '📄';

    let a;
    if (att.packed) {
      // 글자로 바꿔 보관한 파일: 눌러서 원래 파일로 내려받음
      a = document.createElement('button');
      a.type = 'button';
      a.title = '내려받기';
      a.addEventListener('click', () => downloadPacked(att, a));
    } else {
      a = document.createElement('a');
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.href = att.kind === 'link' ? safeUrl(att.url) : `/_blob/${att.asset}`;
      a.title = att.kind === 'link' ? att.url : '새 탭에서 열기';
    }
    a.className = 'file-name';
    a.textContent = att.name;

    const info = document.createElement('span');
    info.className = 'file-info';
    const size = att.kind === 'file' ? `${formatSize(att.size)} · ` : '';
    info.textContent = `${size}${nameOf(att.by) || '팀원'} · ${formatTime(att.addedAt)}`;

    li.append(icon, a, info);
    if (canWrite) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'file-delete';
      del.title = '첨부 삭제';
      del.textContent = '×';
      del.addEventListener('click', () => removeAttachment(att));
      li.appendChild(del);
    }
    detailFiles.appendChild(li);
  }
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'no-files';
    li.textContent = '아직 올린 자료가 없어요.';
    detailFiles.appendChild(li);
  }
}

// http/https 주소만 링크로 연결
function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '#';
  } catch {
    return '#';
  }
}

// 상세 내용: 입력을 잠깐 멈추면 저장
detailNotes.addEventListener('input', () => {
  if (!openId || !canWrite) return;
  clearTimeout(notesTimer);
  notesTimer = setTimeout(flushNotes, 700);
  updateDetail();
  render();
});

function flushNotes() {
  clearTimeout(notesTimer);
  notesTimer = null;
  const todo = openTodo();
  if (!todo || !canWrite) return;
  if (detailNotes.value !== todo.notes) patch(todo.id, { notes: detailNotes.value });
  updateDetail();
}

detailDone.addEventListener('change', () => {
  if (openId) patch(openId, { done: detailDone.checked });
});

// 파일 올리기
detailFileInput.addEventListener('change', async () => {
  const todoId = openId;
  const picked = [...detailFileInput.files];
  detailFileInput.value = '';
  if (!todoId || !picked.length || !assets) return;
  detailFileError.textContent = '';
  uploadLabel.classList.add('busy');

  for (const file of picked) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const type = FILE_TYPES[ext];
    const packed = !type;
    const limit = packed ? MAX_PACKED_BYTES : MAX_FILE_BYTES;
    if (file.size > limit) {
      detailFileError.textContent = `'${file.name}'이(가) ${limit / 1024 / 1024}MB보다 커요. 크기를 줄이거나 공유 드라이브 주소를 링크로 추가해 주세요.`;
      continue;
    }
    if (!file.size) {
      detailFileError.textContent = `'${file.name}'은(는) 빈 파일이라 올릴 수 없어요.`;
      continue;
    }
    try {
      const res = packed
        ? await assets.upload(new Blob([await toBase64(file)], { type: 'text/plain' }), { type: 'text/plain' })
        : await assets.upload(file, { type });
      await db.collection('attachments').doc().set({
        todoId, kind: 'file', asset: res.id, name: file.name, size: file.size, packed,
        addedAt: Date.now(), by: myId,
      });
      patch(todoId, {});
    } catch (err) {
      detailFileError.textContent = uploadErrorMessage(file.name, err && err.code);
    }
  }
  uploadLabel.classList.remove('busy');
});

// 파일 → base64 글자
function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// base64 글자 → 원래 파일 내용
function fromBase64(text) {
  const bin = atob(text.trim());
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function downloadPacked(att, button) {
  detailFileError.textContent = '';
  const downloads = window.claude ? await window.claude.use('downloads') : null;
  if (!downloads) {
    detailFileError.textContent = '이 화면에서는 내려받을 수 없어요. claude.ai에서 링크를 열어 주세요.';
    return;
  }
  button.disabled = true;
  try {
    const res = await fetch(`/_blob/${att.asset}`);
    if (!res.ok) throw new Error('missing');
    const bytes = fromBase64(await res.text());
    const ext = (att.name.split('.').pop() || '').toLowerCase();
    const direct = DIRECT_SAVE.has(ext);
    await downloads.save(direct
      ? { filename: att.name, data: new Blob([bytes]) }
      : { filename: `${att.name}.zip`, data: makeZip(att.name, bytes) });
    if (!direct) detailFileError.textContent = `'${att.name}'은(는) zip 파일로 저장돼요. 압축을 풀면 원래 파일이 나와요.`;
  } catch (err) {
    const code = err && err.code;
    if (code === 'declined') {
      // 내려받기 창에서 취소함
    } else if (code === 'rate_limited') {
      detailFileError.textContent = '잠시 후 다시 눌러 주세요.';
    } else {
      detailFileError.textContent = `'${att.name}'을(를) 내려받지 못했어요. 잠시 후 다시 시도해 주세요.`;
    }
  } finally {
    button.disabled = false;
  }
}

// 파일 하나를 압축 없이 담은 zip 만들기 (한글 파일 이름 지원)
function makeZip(name, bytes) {
  const nameBytes = new TextEncoder().encode(name);
  const crc = crc32(bytes);
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  const local = new DataView(new ArrayBuffer(30));
  local.setUint32(0, 0x04034b50, true);
  local.setUint16(4, 20, true);
  local.setUint16(6, 0x0800, true); // 파일 이름이 UTF-8
  local.setUint16(10, time, true);
  local.setUint16(12, date, true);
  local.setUint32(14, crc, true);
  local.setUint32(18, bytes.length, true);
  local.setUint32(22, bytes.length, true);
  local.setUint16(26, nameBytes.length, true);

  const central = new DataView(new ArrayBuffer(46));
  central.setUint32(0, 0x02014b50, true);
  central.setUint16(4, 20, true);
  central.setUint16(6, 20, true);
  central.setUint16(8, 0x0800, true);
  central.setUint16(12, time, true);
  central.setUint16(14, date, true);
  central.setUint32(16, crc, true);
  central.setUint32(20, bytes.length, true);
  central.setUint32(24, bytes.length, true);
  central.setUint16(28, nameBytes.length, true);

  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, 1, true);
  end.setUint16(10, 1, true);
  end.setUint32(12, 46 + nameBytes.length, true);
  end.setUint32(16, 30 + nameBytes.length + bytes.length, true);

  return new Blob([local, nameBytes, bytes, central, nameBytes, end], { type: 'application/zip' });
}

let crcTable = null;
function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[i] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function uploadErrorMessage(name, code) {
  if (code === 'invalid_request') return `'${name}'을(를) 올리지 못했어요. txt·csv 파일은 UTF-8로 저장된 파일만 올릴 수 있어요.`;
  if (code === 'too_large') return `'${name}'이(가) 너무 커요. 크기를 줄이거나 링크로 추가해 주세요.`;
  if (code === 'unsupported_type') return `'${name}'은(는) 올릴 수 없는 형식이에요.`;
  if (code === 'quota_or_state') return '공유 저장 공간이 가득 찼어요. 필요 없는 첨부를 지운 뒤 다시 시도해 주세요.';
  if (code === 'rate_limited') return '잠시 후 다시 올려 주세요.';
  return `'${name}'을(를) 올리지 못했어요. 잠시 후 다시 시도해 주세요.`;
}

// 링크 추가 (구글 드라이브, 원드라이브, 노션 등)
linkForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const todoId = openId;
  if (!todoId || !canWrite) return;
  const url = linkUrl.value.trim();
  if (safeUrl(url) === '#') {
    detailFileError.textContent = 'http:// 또는 https://로 시작하는 주소를 넣어 주세요.';
    return;
  }
  detailFileError.textContent = '';
  const name = linkName.value.trim() || new URL(url).hostname;
  db.collection('attachments').doc().set({ todoId, kind: 'link', url, name, addedAt: Date.now(), by: myId })
    .then(() => patch(todoId, {}))
    .catch(onWriteError);
  linkUrl.value = '';
  linkName.value = '';
});

async function removeAttachment(att) {
  if (!canWrite) return;
  if (att.kind === 'file' && assets) {
    // 다른 팀원이 올린 파일은 지울 권한이 없을 수 있음. 그래도 목록에서는 뺌
    await assets.delete(att.asset).catch(() => {});
  }
  await db.collection('attachments').doc(att.id).delete().catch(onWriteError);
  if (att.todoId === openId) patch(att.todoId, {});
}

detailClose.addEventListener('click', () => detail.close());
detail.addEventListener('click', (e) => { if (e.target === detail) detail.close(); });
detail.addEventListener('close', () => {
  if (notesTimer) flushNotes();
  openId = null;
  render();
});

// ───────── 개인 화면 설정 ─────────

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

// ───────── 예전 개인용 목록 옮기기 ─────────
// 이 페이지가 개인용이던 때 이 브라우저에 적어 둔 할 일이 있으면 공유 목록으로 옮길 수 있게 함

function localTodos() {
  try {
    if (localStorage.getItem(IMPORTED_KEY)) return [];
    const saved = JSON.parse(localStorage.getItem('todos')) || [];
    return saved.filter(t => t && t.text && !String(t.text).startsWith('(예시)'));
  } catch {
    return [];
  }
}

function offerImport() {
  if (!canWrite || !importBox.hidden) return;
  const items = localTodos();
  if (!items.length) return;
  importText.textContent = `이 브라우저에 개인용으로 적어 둔 할 일 ${items.length}개가 있어요. 공유 목록으로 옮길까요? (상세 내용은 옮겨지고, 올렸던 파일은 다시 올려야 해요)`;
  importBox.hidden = false;
}

function markImported() {
  try { localStorage.setItem(IMPORTED_KEY, '1'); } catch { /* 무시 */ }
  importBox.hidden = true;
}

importButton.addEventListener('click', async () => {
  const items = localTodos();
  markImported();
  let order = nextOrder();
  for (const t of items) {
    await addTodo({
      dept: t.dept || '', team: t.team || '', text: String(t.text).slice(0, 200), done: !!t.done,
      due: t.due || '', important: !!t.important, notes: t.notes || '', order,
    }).catch(onWriteError);
    order += 1000;
  }
});

importDismiss.addEventListener('click', markImported);

syncTeamInput();

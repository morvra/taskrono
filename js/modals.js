// js/modals.js
import { state } from './state.js';
import { escapeHtml, calculateActualTime, getFormattedDate } from './utils.js';
import { addTask } from './tasks.js';

export const modalCallbacks = {
    getTasksForViewDate: null,
    saveAndRender: null,
    saveState: null,
    updateProjectDropdowns: null,
    updateSectionDropdowns: null,
    updateTaskStatus: null,
    isMobile: null,
};

// --- Modal open/close ---

export function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
    if (modalCallbacks.isMobile()) {
        const container = document.getElementById('bottom-ui-container');
        if (container) container.style.display = 'none';
    }
}

export function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    if (modalId === 'task-edit-modal') {
        state.editingTaskDateKey = null;
        state.editingTaskId = null;
    }
    if (modalCallbacks.isMobile()) {
        const container = document.getElementById('bottom-ui-container');
        if (container) container.style.display = 'flex';
    }
}

// --- Add task modal ---

export function openAddTaskModal() {
    document.getElementById('new-task-name').value = '';
    document.getElementById('new-task-time').value = '20';
    document.getElementById('new-task-project').value = '';

    const currentSection = getCurrentSectionForModal();
    document.getElementById('new-task-section').value = currentSection ? currentSection.id : '';

    const modalContent = document.querySelector('#add-task-modal .modal-content');
    const existingContainer = document.getElementById('template-chips-container');
    if (existingContainer) existingContainer.remove();

    const templates = state.repeatTasks.filter(rt => rt.type === 'template');

    if (templates.length > 0) {
        const container = document.createElement('div');
        container.id = 'template-chips-container';
        container.className = 'mb-4';

        const chipsWrapper = document.createElement('div');
        chipsWrapper.className = 'flex flex-wrap gap-2';

        templates.forEach(tpl => {
            const project = state.projects.find(p => p.id === tpl.projectId);
            const btn = document.createElement('button');
            const borderColor = project ? project.color : '#d1d5db';

            btn.className = 'text-xs px-3 py-1.5 bg-white border rounded-full hover:bg-blue-50 transition-colors text-gray-700 shadow-sm truncate max-w-full';
            btn.style.borderColor = borderColor;
            btn.style.borderLeftWidth = '4px';
            btn.textContent = tpl.name;
            btn.title = `見積: ${tpl.estimatedTime}分`;

            btn.addEventListener('click', () => {
                const subtasksCopy = tpl.subtasks ? JSON.parse(JSON.stringify(tpl.subtasks)) : [];
                subtasksCopy.forEach(st => st.completed = false);

                addTask(
                    tpl.name,
                    tpl.estimatedTime,
                    tpl.projectId,
                    currentSection ? currentSection.id : null,
                    false,
                    {
                        memo: tpl.memo || '',
                        subtasks: subtasksCopy,
                        originRepeatId: tpl.id,
                        isManuallyAddedRepeat: true
                    }
                );

                closeModal('add-task-modal');
                // showToast はコールバック経由
            });
            chipsWrapper.appendChild(btn);
        });

        container.appendChild(chipsWrapper);
        const modalTitle = modalContent.querySelector('h3');
        modalTitle.parentNode.insertBefore(container, modalTitle.nextSibling);
    }

    openModal('add-task-modal');
    document.getElementById('new-task-name').focus();
}

// 現在のセクションを取得（sections.js に依存しないよう state から計算）
function getCurrentSectionForModal() {
    const now = new Date();
    const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    const sortedSections = [...state.sections].sort((a, b) => a.startTime.localeCompare(b.startTime));
    let currentSection = null;
    for (const section of sortedSections) {
        if (section.startTime <= currentTime) {
            currentSection = section;
        } else {
            break;
        }
    }
    return currentSection || (sortedSections.length > 0 ? sortedSections[sortedSections.length - 1] : null);
}

// --- Task edit modal ---

export function openTaskEditModal(id) {
    const task = modalCallbacks.getTasksForViewDate().find(t => t.id === id);
    if (!task) return;

    state.editingTaskId = id;
    state.editingTaskDateKey = null;
    document.getElementById('edit-task-name').value = task.name || '';
    document.getElementById('edit-task-time').value = task.estimatedTime || 0;
    modalCallbacks.updateProjectDropdowns();
    modalCallbacks.updateSectionDropdowns();
    document.getElementById('edit-task-project').value = task.projectId || '';
    document.getElementById('edit-task-section').value = task.sectionId || '';
    document.getElementById('edit-task-memo').value = task.memo || '';

    setTimeout(() => {
        const memoTextarea = document.getElementById('edit-task-memo');
        memoTextarea.style.height = 'auto';
        memoTextarea.style.height = (memoTextarea.scrollHeight) + 'px';
    }, 0);

    const subtaskToggle = document.getElementById('task-subtask-toggle');
    const subtaskContent = document.getElementById('task-subtask-content');
    const hasSubtasks = task.subtasks && task.subtasks.length > 0;
    subtaskToggle.checked = hasSubtasks;
    subtaskContent.classList.toggle('hidden', !hasSubtasks);

    const newToggle = subtaskToggle.cloneNode(true);
    subtaskToggle.parentNode.replaceChild(newToggle, subtaskToggle);
    newToggle.addEventListener('change', () => {
        subtaskContent.classList.toggle('hidden', !newToggle.checked);
    });

    renderSubtasksInModal('task', task.id);
    const newSubtaskInput = document.getElementById('new-subtask-name');
    const addSubtaskBtn = document.getElementById('add-subtask-btn');
    newSubtaskInput.value = '';
    const addSubtaskHandler = () => {
        const subtaskName = newSubtaskInput.value.trim();
        if (subtaskName) {
            addSubtaskToModal('task', subtaskName);
            newSubtaskInput.value = '';
            newSubtaskInput.focus();
        }
    };
    addSubtaskBtn.replaceWith(addSubtaskBtn.cloneNode(true));
    document.getElementById('add-subtask-btn').addEventListener('click', addSubtaskHandler);
    newSubtaskInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); addSubtaskHandler(); }
    });

    const startTimeInput = document.getElementById('edit-task-startTime');
    const endTimeInput = document.getElementById('edit-task-endTime');
    startTimeInput.value = task.startTime ? new Date(task.startTime).toTimeString().slice(0, 5) : '';
    endTimeInput.value = task.endTime ? new Date(task.endTime).toTimeString().slice(0, 5) : '';

    document.getElementById('create-repeat-from-task').style.display = 'block';
    openModal('task-edit-modal');
    document.getElementById('edit-task-name').focus();
}

export function saveTaskEdit() {
    const tasks = modalCallbacks.getTasksForViewDate();
    if (!tasks) { closeModal('task-edit-modal'); return; }

    const task = tasks.find(t => t.id === state.editingTaskId);
    if (!task) { closeModal('task-edit-modal'); return; }

    const name = document.getElementById('edit-task-name').value.trim();
    const time = parseInt(document.getElementById('edit-task-time').value, 10);
    const projectId = document.getElementById('edit-task-project').value || null;
    const sectionId = document.getElementById('edit-task-section').value || null;
    const memo = document.getElementById('edit-task-memo').value.trim();

    if (!name || isNaN(time) || time < 0) {
        alert('タスク名と見積時間を正しく入力してください。');
        return;
    }

    const sectionChanged = task.sectionId !== sectionId;

    task.name = name;
    task.estimatedTime = time;
    task.projectId = projectId;
    task.sectionId = sectionId;
    task.memo = memo;
    task.subtasks = getSubtasksFromModal('task');

    if (sectionChanged) {
        const taskIndex = tasks.findIndex(t => t.id === state.editingTaskId);
        if (taskIndex > -1) {
            const [movedTask] = tasks.splice(taskIndex, 1);
            let lastIndexInSection = -1;
            for (let i = tasks.length - 1; i >= 0; i--) {
                if (tasks[i].sectionId === sectionId) { lastIndexInSection = i; break; }
            }
            const insertIndex = lastIndexInSection !== -1 ? lastIndexInSection + 1 : tasks.length;
            tasks.splice(insertIndex, 0, movedTask);
        }
    }

    const startTimeValue = document.getElementById('edit-task-startTime').value;
    const endTimeValue = document.getElementById('edit-task-endTime').value;

    let startDateObj = null;
    let endDateObj = null;

    if (startTimeValue) {
        const baseDate = task.startTime ? new Date(task.startTime) : (task.createdDate ? new Date(task.createdDate) : new Date());
        const [hours, minutes] = startTimeValue.split(':');
        baseDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
        startDateObj = baseDate;
    }

    if (endTimeValue) {
        let baseDate;
        if (startDateObj) {
            baseDate = new Date(startDateObj);
        } else if (task.startTime) {
            baseDate = new Date(task.startTime);
        } else {
            baseDate = task.createdDate ? new Date(task.createdDate) : new Date();
        }
        const [hours, minutes] = endTimeValue.split(':');
        baseDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
        endDateObj = baseDate;

        if (startDateObj && endDateObj < startDateObj) {
            endDateObj.setDate(endDateObj.getDate() + 1);
        }
    }

    task.startTime = startDateObj ? startDateObj.toISOString() : null;
    task.endTime = endDateObj ? endDateObj.toISOString() : null;
    task.actualTime = calculateActualTime(task);
    modalCallbacks.updateTaskStatus(task);
    closeModal('task-edit-modal');
    task.updatedAt = new Date().toISOString();
    modalCallbacks.saveAndRender();
}

export function createRepeatFromTask() {
    const task = modalCallbacks.getTasksForViewDate().find(t => t.id === state.editingTaskId);
    if (!task) return;

    const name = document.getElementById('edit-task-name').value.trim();
    const time = parseInt(document.getElementById('edit-task-time').value, 10);
    const projectId = document.getElementById('edit-task-project').value || null;
    const sectionId = document.getElementById('edit-task-section').value || null;
    if (!name || isNaN(time) || time < 0) {
        alert('タスク名と見積時間を正しく入力してください。');
        return;
    }

    state.repeatTasks.push({
        id: 'rt' + Date.now(),
        name,
        estimatedTime: time,
        projectId,
        sectionId,
        memo: task.memo || '',
        subtasks: JSON.parse(JSON.stringify(task.subtasks || [])),
        type: 'daily',
        value: null,
        startDate: null
    });

    closeModal('task-edit-modal');
    alert('リピートタスクを作成しました（毎日設定）。リピートタスクタブで詳細を編集できます。');
    modalCallbacks.saveAndRender();
}

// --- Memo edit modal ---

export function openMemoEditModal(id) {
    const task = modalCallbacks.getTasksForViewDate().find(t => t.id === id);
    if (!task) return;

    state.editingMemoTaskId = id;
    const memoTextEl = document.getElementById('edit-memo-text');
    memoTextEl.value = task.memo || '';
    openModal('memo-edit-modal');
    memoTextEl.focus();
}

export function saveMemoEdit() {
    const task = modalCallbacks.getTasksForViewDate().find(t => t.id === state.editingMemoTaskId);
    if (!task) return;

    task.memo = document.getElementById('edit-memo-text').value.trim();
    closeModal('memo-edit-modal');
    task.updatedAt = new Date().toISOString();
    modalCallbacks.saveAndRender();
}

// --- Repeat edit modal ---

export function openRepeatEditModal(id) {
    const repeatTask = state.repeatTasks.find(rt => rt.id === id);
    if (!repeatTask) return;

    state.editingRepeatId = id;
    document.getElementById('edit-repeat-name').value = repeatTask.name || '';
    document.getElementById('edit-repeat-time').value = repeatTask.estimatedTime || 0;
    modalCallbacks.updateProjectDropdowns();
    modalCallbacks.updateSectionDropdowns();
    document.getElementById('edit-repeat-project').value = repeatTask.projectId || '';
    document.getElementById('edit-repeat-section').value = repeatTask.sectionId || '';
    document.getElementById('edit-repeat-memo').value = repeatTask.memo || '';
    document.getElementById('edit-repeat-type').value = repeatTask.type || 'daily';

    setTimeout(() => {
        const memoTextarea = document.getElementById('edit-repeat-memo');
        memoTextarea.style.height = 'auto';
        memoTextarea.style.height = (memoTextarea.scrollHeight) + 'px';
    }, 0);

    const subtaskToggle = document.getElementById('repeat-subtask-toggle');
    const subtaskContent = document.getElementById('repeat-subtask-content');
    const hasSubtasks = repeatTask.subtasks && repeatTask.subtasks.length > 0;
    subtaskToggle.checked = hasSubtasks;
    subtaskContent.classList.toggle('hidden', !hasSubtasks);

    const newToggle = subtaskToggle.cloneNode(true);
    subtaskToggle.parentNode.replaceChild(newToggle, subtaskToggle);
    newToggle.addEventListener('change', () => {
        subtaskContent.classList.toggle('hidden', !newToggle.checked);
    });

    renderSubtasksInModal('repeat', repeatTask.id);
    const newSubtaskInput = document.getElementById('new-repeat-subtask-name');
    const addSubtaskBtn = document.getElementById('add-repeat-subtask-btn');
    newSubtaskInput.value = '';
    const addSubtaskHandler = () => {
        const subtaskName = newSubtaskInput.value.trim();
        if (subtaskName) {
            addSubtaskToModal('repeat', subtaskName);
            newSubtaskInput.value = '';
            newSubtaskInput.focus();
        }
    };
    addSubtaskBtn.replaceWith(addSubtaskBtn.cloneNode(true));
    document.getElementById('add-repeat-subtask-btn').addEventListener('click', addSubtaskHandler);
    newSubtaskInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); addSubtaskHandler(); }
    });

    const weeklyContainer = document.getElementById('edit-repeat-weekly-days');
    if (weeklyContainer.childElementCount === 0) {
        ['日', '月', '火', '水', '木', '金', '土'].forEach((d, i) => {
            weeklyContainer.innerHTML += `<label class="inline-flex items-center"><input type="checkbox" value="${i}" class="form-checkbox"><span class="ml-2 text-sm">${d}</span></label>`;
        });
    }

    // 値のクリア
    document.querySelectorAll('#edit-repeat-weekly-days input').forEach(cb => cb.checked = false);
    document.getElementById('edit-repeat-weekly-interval').value = '1';
    document.getElementById('edit-repeat-weekly-start-date').value = '';
    document.getElementById('edit-repeat-monthly-days-list').innerHTML = '';
    document.getElementById('edit-repeat-yearly-dates-list').innerHTML = '';
    document.querySelector('input[name="edit-monthly-type"][value="day"]').checked = true;
    document.getElementById('edit-repeat-monthly-day-options').classList.remove('hidden');
    document.getElementById('edit-repeat-monthly-weekday-options').classList.add('hidden');
    document.getElementById('edit-repeat-interval-days').value = '';
    document.getElementById('edit-repeat-interval-start-date').value = '';

    // 保存された値の反映
    if (repeatTask.type === 'weekly') {
        if (Array.isArray(repeatTask.value)) {
            document.querySelectorAll('#edit-repeat-weekly-days input').forEach(cb => {
                cb.checked = repeatTask.value.includes(parseInt(cb.value, 10));
            });
        }
        document.getElementById('edit-repeat-weekly-interval').value = repeatTask.weekInterval || '1';
        document.getElementById('edit-repeat-weekly-start-date').value = repeatTask.startDate || '';
    } else if (repeatTask.type === 'monthly' && repeatTask.value) {
        if (repeatTask.value.type === 'day') {
            document.querySelector('input[name="edit-monthly-type"][value="day"]').checked = true;
            if (Array.isArray(repeatTask.value.days)) {
                repeatTask.value.days.forEach(day => addMonthlyDayChip(day, 'edit-repeat-monthly-days-list'));
            } else if (repeatTask.value.day) {
                addMonthlyDayChip(repeatTask.value.day, 'edit-repeat-monthly-days-list');
            }
        } else if (repeatTask.value.type === 'weekday') {
            document.querySelector('input[name="edit-monthly-type"][value="weekday"]').checked = true;
            document.getElementById('edit-monthly-week').value = repeatTask.value.week || '1';
            document.getElementById('edit-monthly-weekday').value = repeatTask.value.weekday || '0';
            document.getElementById('edit-repeat-monthly-day-options').classList.add('hidden');
            document.getElementById('edit-repeat-monthly-weekday-options').classList.remove('hidden');
        }
    } else if (repeatTask.type === 'yearly' && repeatTask.value) {
        if (Array.isArray(repeatTask.value)) {
            repeatTask.value.forEach(date => addYearlyDateChip(date.month, date.day, 'edit-repeat-yearly-dates-list'));
        } else if (repeatTask.value.month && repeatTask.value.day) {
            addYearlyDateChip(repeatTask.value.month, repeatTask.value.day, 'edit-repeat-yearly-dates-list');
        }
    } else if (repeatTask.type === 'interval') {
        document.getElementById('edit-repeat-interval-days').value = repeatTask.value || '';
        document.getElementById('edit-repeat-interval-start-date').value = repeatTask.startDate || '';
    }

    document.getElementById('edit-repeat-weekly-options').classList.toggle('hidden', repeatTask.type !== 'weekly');
    document.getElementById('edit-repeat-monthly-options').classList.toggle('hidden', repeatTask.type !== 'monthly');
    document.getElementById('edit-repeat-yearly-options').classList.toggle('hidden', repeatTask.type !== 'yearly');
    document.getElementById('edit-repeat-interval-options').classList.toggle('hidden', repeatTask.type !== 'interval');

    document.querySelectorAll('input[name="edit-monthly-type"]').forEach(radio => {
        const listener = (e) => {
            const isDayType = e.target.value === 'day';
            document.getElementById('edit-repeat-monthly-day-options').classList.toggle('hidden', !isDayType);
            document.getElementById('edit-repeat-monthly-weekday-options').classList.toggle('hidden', isDayType);
        };
        radio.replaceWith(radio.cloneNode(true));
        document.querySelector(`input[name="edit-monthly-type"][value="${radio.value}"]`).addEventListener('change', listener);
    });
    if (repeatTask.type === 'monthly' && repeatTask.value) {
        document.querySelector(`input[name="edit-monthly-type"][value="${repeatTask.value.type}"]`).checked = true;
    }

    openModal('repeat-edit-modal');
    document.getElementById('edit-repeat-name').focus();
}

export function saveRepeatEdit() {
    const repeatTask = state.repeatTasks.find(rt => rt.id === state.editingRepeatId);
    if (!repeatTask) return;

    const name = document.getElementById('edit-repeat-name').value.trim();
    const time = parseInt(document.getElementById('edit-repeat-time').value, 10);
    const projectId = document.getElementById('edit-repeat-project').value || null;
    const sectionId = document.getElementById('edit-repeat-section').value || null;
    const memo = document.getElementById('edit-repeat-memo').value.trim();
    const type = document.getElementById('edit-repeat-type').value;

    if (!name || isNaN(time) || time < 0) {
        alert('タスク名と見積時間を正しく入力してください。');
        return;
    }

    let value = null;
    let startDate = repeatTask.startDate || null;
    let weekInterval = 1;

    if (type === 'weekly') {
        value = Array.from(document.querySelectorAll('#edit-repeat-weekly-days input:checked')).map(cb => parseInt(cb.value, 10));
        if (value.length === 0) { alert('曜日を選択してください。'); return; }
        weekInterval = parseInt(document.getElementById('edit-repeat-weekly-interval').value, 10) || 1;
        startDate = document.getElementById('edit-repeat-weekly-start-date').value || new Date().toISOString().slice(0, 10);
    } else if (type === 'monthly') {
        const monthlyType = document.querySelector('input[name="edit-monthly-type"]:checked').value;
        if (monthlyType === 'day') {
            const days = getMonthlyDaysFromChips('edit-repeat-monthly-days-list');
            if (days.length === 0) { alert('少なくとも1つの日付を追加してください。'); return; }
            value = { type: 'day', days };
        } else {
            const week = parseInt(document.getElementById('edit-monthly-week').value, 10);
            const weekday = parseInt(document.getElementById('edit-monthly-weekday').value, 10);
            value = { type: 'weekday', week, weekday };
        }
    } else if (type === 'yearly') {
        const dates = getYearlyDatesFromChips('edit-repeat-yearly-dates-list');
        if (dates.length === 0) { alert('少なくとも1つの月日を追加してください。'); return; }
        value = dates;
    } else if (type === 'interval') {
        value = parseInt(document.getElementById('edit-repeat-interval-days').value, 10);
        if (isNaN(value) || value < 1) { alert('有効な間隔（日数）を入力してください。'); return; }
        const startDateInput = document.getElementById('edit-repeat-interval-start-date').value;
        startDate = startDateInput || startDate || new Date().toISOString().slice(0, 10);
    }

    repeatTask.name = name;
    repeatTask.estimatedTime = time;
    repeatTask.projectId = projectId;
    repeatTask.sectionId = sectionId;
    repeatTask.memo = memo;
    repeatTask.type = type;
    repeatTask.value = value;
    repeatTask.startDate = startDate;
    repeatTask.weekInterval = weekInterval;
    repeatTask.subtasks = getSubtasksFromModal('repeat');

    closeModal('repeat-edit-modal');
    modalCallbacks.saveAndRender();
}

// --- Subtask helpers ---

export function renderSubtasksInModal(type, taskId) {
    const isRepeat = type === 'repeat';
    const container = document.getElementById(isRepeat ? 'edit-repeat-subtasks' : 'edit-task-subtasks');
    const task = isRepeat
        ? state.repeatTasks.find(t => t.id === taskId)
        : modalCallbacks.getTasksForViewDate().find(t => t.id === taskId);

    container.innerHTML = '';
    if (!task || !task.subtasks) return;

    task.subtasks.forEach((st) => {
        const item = document.createElement('div');
        item.className = 'subtask-edit-item';
        item.dataset.subtaskId = st.id;
        item.innerHTML = `
            <input type="checkbox" class="form-checkbox h-4 w-4 text-blue-600" ${st.completed ? 'checked' : ''} ${isRepeat ? 'disabled' : ''}>
            <input type="text" class="flex-1 p-1 border rounded-md" value="${escapeHtml(st.name)}">
            <div class="flex items-center">
                <button class="subtask-move-up-btn text-gray-400 hover:text-blue-500 p-1" title="上へ移動">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" /></svg>
                </button>
                <button class="subtask-move-down-btn text-gray-400 hover:text-blue-500 p-1" title="下へ移動">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </button>
                <button class="subtask-delete-btn text-gray-400 hover:text-red-500 p-1" title="削除">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
        `;
        container.appendChild(item);
    });

    if (!container.dataset.listenersAdded) {
        container.addEventListener('click', (e) => {
            const item = e.target.closest('.subtask-edit-item');
            if (!item) return;
            if (e.target.closest('.subtask-delete-btn')) {
                item.remove();
            } else if (e.target.closest('.subtask-move-up-btn')) {
                if (item.previousElementSibling) item.parentElement.insertBefore(item, item.previousElementSibling);
            } else if (e.target.closest('.subtask-move-down-btn')) {
                if (item.nextElementSibling) item.parentElement.insertBefore(item.nextElementSibling, item);
            }
        });

        container.addEventListener('keydown', (e) => {
            if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                const currentItem = e.target.closest('.subtask-edit-item');
                if (!currentItem) return;
                if (e.key === 'ArrowUp' && currentItem.previousElementSibling) {
                    currentItem.parentElement.insertBefore(currentItem, currentItem.previousElementSibling);
                    e.target.focus();
                } else if (e.key === 'ArrowDown' && currentItem.nextElementSibling) {
                    currentItem.parentElement.insertBefore(currentItem.nextElementSibling, currentItem);
                    e.target.focus();
                }
            }
        });
        container.dataset.listenersAdded = 'true';
    }
}

export function addSubtaskToModal(type, name) {
    const isRepeat = type === 'repeat';
    const container = document.getElementById(isRepeat ? 'edit-repeat-subtasks' : 'edit-task-subtasks');

    const item = document.createElement('div');
    item.className = 'subtask-edit-item';
    item.dataset.subtaskId = 'new-st-' + Date.now();
    item.innerHTML = `
        <input type="checkbox" class="form-checkbox h-4 w-4 text-blue-600" ${isRepeat ? 'disabled' : ''}>
        <input type="text" class="flex-1 p-1 border rounded-md" value="${escapeHtml(name)}">
        <div class="flex items-center">
            <button class="subtask-move-up-btn text-gray-400 hover:text-blue-500 p-1" title="上へ移動">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" /></svg>
            </button>
            <button class="subtask-move-down-btn text-gray-400 hover:text-blue-500 p-1" title="下へ移動">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            <button class="subtask-delete-btn text-gray-400 hover:text-red-500 p-1" title="削除">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>
    `;
    container.appendChild(item);
    item.querySelector('input[type="text"]').focus();
}

export function getSubtasksFromModal(type) {
    const isRepeat = type === 'repeat';
    const container = document.getElementById(isRepeat ? 'edit-repeat-subtasks' : 'edit-task-subtasks');
    const subtasks = [];
    container.querySelectorAll('.subtask-edit-item').forEach(item => {
        const name = item.querySelector('input[type="text"]').value.trim();
        if (name) {
            subtasks.push({
                id: item.dataset.subtaskId.startsWith('new-st-') ? 'st' + Date.now() + Math.random() : item.dataset.subtaskId,
                name,
                completed: isRepeat ? false : item.querySelector('input[type="checkbox"]').checked
            });
        }
    });
    return subtasks;
}

// --- Chip helpers (monthly/yearly) ---

export function addMonthlyDayChip(day, containerId) {
    const container = document.getElementById(containerId);
    const existing = Array.from(container.querySelectorAll('.day-chip')).find(chip => parseInt(chip.dataset.day) === day);
    if (existing) { alert('この日付は既に追加されています。'); return; }

    const chip = document.createElement('div');
    chip.className = 'day-chip flex items-center gap-1 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm';
    chip.dataset.day = day;
    chip.innerHTML = `
        <span>${day}日</span>
        <button type="button" class="remove-chip hover:text-red-600">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
    `;
    chip.querySelector('.remove-chip').addEventListener('click', () => chip.remove());
    container.appendChild(chip);
}

export function addYearlyDateChip(month, day, containerId) {
    const container = document.getElementById(containerId);
    const existing = Array.from(container.querySelectorAll('.date-chip')).find(
        chip => parseInt(chip.dataset.month) === month && parseInt(chip.dataset.day) === day
    );
    if (existing) { alert('この日付は既に追加されています。'); return; }

    const chip = document.createElement('div');
    chip.className = 'date-chip flex items-center gap-1 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm';
    chip.dataset.month = month;
    chip.dataset.day = day;
    chip.innerHTML = `
        <span>${month}月${day}日</span>
        <button type="button" class="remove-chip hover:text-red-600">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
    `;
    chip.querySelector('.remove-chip').addEventListener('click', () => chip.remove());
    container.appendChild(chip);
}

export function getMonthlyDaysFromChips(containerId) {
    const container = document.getElementById(containerId);
    return Array.from(container.querySelectorAll('.day-chip'))
        .map(chip => parseInt(chip.dataset.day))
        .sort((a, b) => a - b);
}

export function getYearlyDatesFromChips(containerId) {
    const container = document.getElementById(containerId);
    return Array.from(container.querySelectorAll('.date-chip'))
        .map(chip => ({ month: parseInt(chip.dataset.month), day: parseInt(chip.dataset.day) }))
        .sort((a, b) => a.month !== b.month ? a.month - b.month : a.day - b.day);
}
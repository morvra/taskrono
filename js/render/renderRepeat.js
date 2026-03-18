// js/render/renderRepeat.js
import { getSectionDisplayInfo } from '../sections.js';
import { state } from '../state.js';
import { escapeHtml, formatTaskName } from '../utils.js';

export const renderRepeatCallbacks = {
    isMobile: null,
    setupDragAndDrop: null,
    generateSingleRepeatTask: null,
    saveAndRender: null,
    openRepeatEditModal: null,
    deleteRepeatTask: null,
};

function getRepeatText(rt) {
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    switch (rt.type) {
        case 'daily':
            return '毎日';
        case 'weekly': {
            const intervalText = (rt.weekInterval && rt.weekInterval > 1) ? `${rt.weekInterval}週ごと ` : '';
            const days = Array.isArray(rt.value) ? rt.value.map(i => weekdays[i]).join(',') : '';
            return `毎週 ${intervalText}(${days})`;
        }
        case 'monthly':
            if (rt.value) {
                if (rt.value.type === 'day') {
                    if (Array.isArray(rt.value.days)) return `毎月 ${rt.value.days.join('日, ')}日`;
                    if (rt.value.day) return `毎月 ${rt.value.day}日`;
                } else if (rt.value.type === 'weekday') {
                    const weekStr = ['第1', '第2', '第3', '第4', '最終'][rt.value.week - 1];
                    return `毎月 ${weekStr}${weekdays[rt.value.weekday]}曜日`;
                }
            }
            return '';
        case 'yearly':
            if (Array.isArray(rt.value)) return `毎年 ${rt.value.map(d => `${d.month}月${d.day}日`).join(', ')}`;
            if (rt.value) return `毎年 ${rt.value.month}月${rt.value.day}日`;
            return '';
        case 'interval':
            return `${rt.value}日ごと (基準日: ${rt.startDate || '未設定'})`;
        case 'template':
            return '随時 (テンプレート)';
        default:
            return '不明';
    }
}

function getRepeatTextShort(rt) {
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    switch (rt.type) {
        case 'daily': return '毎日';
        case 'weekly': {
            const intervalText = (rt.weekInterval && rt.weekInterval > 1) ? `${rt.weekInterval}週ごと ` : '';
            const days = Array.isArray(rt.value) ? rt.value.map(i => weekdays[i]).join(',') : '';
            return `毎週 ${intervalText}(${days})`;
        }
        case 'monthly':
            if (rt.value) {
                if (rt.value.type === 'day') {
                    if (Array.isArray(rt.value.days)) return `毎月 ${rt.value.days.join('日, ')}日`;
                    if (rt.value.day) return `毎月 ${rt.value.day}日`;
                } else if (rt.value.type === 'weekday') {
                    const weekStr = ['第1', '第2', '第3', '第4', '最終'][rt.value.week - 1];
                    return `毎月 ${weekStr}${weekdays[rt.value.weekday]}曜日`;
                }
            }
            return '';
        case 'yearly':
            if (Array.isArray(rt.value)) return `毎年 ${rt.value.map(d => `${d.month}月${d.day}日`).join(', ')}`;
            if (rt.value) return `毎年 ${rt.value.month}月${rt.value.day}日`;
            return '';
        case 'interval': return `${rt.value}日ごと`;
        case 'template': return '随時';
        default: return '不明';
    }
}

export function renderRepeatTasks() {
    const container = document.getElementById('repeat-tasks-container');

    const addWeeklyDaysContainer = document.getElementById('repeat-weekly-days');
    if (addWeeklyDaysContainer && addWeeklyDaysContainer.childElementCount === 0) {
        ['日', '月', '火', '水', '木', '金', '土'].forEach((d, i) => {
            addWeeklyDaysContainer.innerHTML += `<label class="inline-flex items-center"><input type="checkbox" value="${i}" class="form-checkbox"><span class="ml-2 text-sm">${d}</span></label>`;
        });
    }

    const sortedSections = [...state.sections].sort((a, b) => a.startTime.localeCompare(b.startTime));
    const tasksBySection = { 'null': [] };
    sortedSections.forEach(s => tasksBySection[s.id] = []);
    state.repeatTasks.forEach(task => {
        const sectionId = task.sectionId || 'null';
        if (tasksBySection.hasOwnProperty(sectionId)) {
            tasksBySection[sectionId].push(task);
        } else {
            tasksBySection['null'].push(task);
        }
    });
    const sectionOrder = ['null', ...sortedSections.map(s => s.id)];

    if (renderRepeatCallbacks.isMobile()) {
        container.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'space-y-3';
        sectionOrder.forEach(sectionId => {
            const sectionTasks = tasksBySection[sectionId];
            if (sectionId === 'null' && sectionTasks.length === 0) return;

            const { name, range } = getSectionDisplayInfo(sectionId);
            const sectionHeader = document.createElement('div');
            sectionHeader.className = 'text-sm font-bold text-gray-500 pt-4 pb-1 px-2';
            sectionHeader.textContent = name + ' ' + range;
            wrapper.appendChild(sectionHeader);

            renderRepeatTaskCards(wrapper, sectionTasks);

            if (sectionTasks.length === 0) {
                const dropTarget = document.createElement('div');
                dropTarget.className = 'empty-section-drop-target text-center text-gray-400 text-xs border-dashed border-gray-300 rounded-lg';
                dropTarget.textContent = 'ここにタスクをドロップ';
                dropTarget.dataset.sectionId = sectionId;
                wrapper.appendChild(dropTarget);
            }
        });
        container.appendChild(wrapper);

    } else {
        container.innerHTML = `<div class="overflow-x-auto shadow-md">
            <table class="min-w-full bg-white">
                <thead class="bg-gray-500 text-white text-xs">
                    <tr>
                        <th class="py-1 px-4 w-8"></th>
                        <th class="py-1 px-4 text-left">タスク名</th>
                        <th class="py-1 px-4 text-left">プロジェクト</th>
                        <th class="py-1 px-4 text-left">見積時間</th>
                        <th class="py-1 px-4 text-left">繰り返し</th>
                        <th class="py-1 px-4">操作</th>
                    </tr>
                </thead>
                <tbody id="repeat-tasks-list"></tbody>
            </table>
        </div>`;
        const list = container.querySelector('#repeat-tasks-list');
        list.innerHTML = '';

        sectionOrder.forEach(sectionId => {
            const sectionTasks = tasksBySection[sectionId];
            if (sectionId === 'null' && sectionTasks.length === 0) return;

            const { name, range } = getSectionDisplayInfo(sectionId);
            const headerRow = document.createElement('tr');
            headerRow.dataset.sectionId = sectionId;
            headerRow.innerHTML = `<td colspan="6" class="py-1 px-3 text-xs font-bold bg-gray-400 text-white">${name} ${range}</td>`;
            list.appendChild(headerRow);

            renderRepeatTaskTable(list, sectionTasks);
        });
    }

    renderRepeatCallbacks.setupDragAndDrop('.repeat-task-row', state.repeatTasks, 'repeat');

    container.querySelectorAll('.generate-single-repeat-btn').forEach(btn => btn.addEventListener('click', (e) => {
        const rt = renderRepeatCallbacks.generateSingleRepeatTask(e.currentTarget.dataset.id);
        if (rt) renderRepeatCallbacks.saveAndRender();
    }));
    container.querySelectorAll('.edit-repeat-task-btn').forEach(btn =>
        btn.addEventListener('click', (e) => renderRepeatCallbacks.openRepeatEditModal(e.currentTarget.dataset.id))
    );
    container.querySelectorAll('.delete-repeat-task-btn').forEach(btn =>
        btn.addEventListener('click', (e) => renderRepeatCallbacks.deleteRepeatTask(e.currentTarget.dataset.id))
    );

    container.querySelectorAll('.repeat-task-row').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('button, a, .drag-handle, .tooltip-container')) return;
            const taskId = e.currentTarget.dataset.id;
            if (state.focusedRepeatTaskId !== taskId) {
                state.focusedRepeatTaskId = taskId;
                renderRepeatTasks();
            }
        });

        el.addEventListener('dblclick', (e) => {
            if (e.target.closest('button, a, .drag-handle, .tooltip-container')) return;
            e.preventDefault();
            const taskId = e.currentTarget.dataset.id;
            if (taskId) {
                const rt = renderRepeatCallbacks.generateSingleRepeatTask(taskId);
                if (rt) renderRepeatCallbacks.saveAndRender();
            }
        });
    });
}

export function renderRepeatTaskTable(list, tasksToRender) {
    if (tasksToRender.length === 0) {
        const parentHeader = list.lastElementChild;
        if (parentHeader && parentHeader.dataset.sectionId) {
            const tr = document.createElement('tr');
            tr.className = 'empty-section-drop-target';
            tr.dataset.sectionId = parentHeader.dataset.sectionId;
            tr.innerHTML = `<td colspan="6" class="px-4 text-center text-gray-400 text-xs">ここにタスクをドロップできます</td>`;
            list.appendChild(tr);
        }
        return;
    }

    tasksToRender.forEach(rt => {
        const idx = state.repeatTasks.findIndex(t => t.id === rt.id);
        const project = state.projects.find(p => p.id === rt.projectId) || { name: 'N/A' };
        const repeatText = getRepeatText(rt);

        const subtaskIcon = (rt.subtasks && rt.subtasks.length > 0) ? `
            <span class="tooltip-container">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline-block ml-1 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                    <path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd" />
                </svg>
                <span class="custom-tooltip">サブタスク: ${rt.subtasks.length}件</span>
            </span>` : '';

        const memoIcon = rt.memo ? `
            <span class="tooltip-container">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline-block ml-1 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                <span class="custom-tooltip">${escapeHtml(rt.memo)}</span>
            </span>` : '';

        const tr = document.createElement('tr');
        tr.className = `border-b repeat-task-row ${rt.id === state.focusedRepeatTaskId ? 'focused' : ''}`;
        tr.dataset.id = rt.id;
        tr.dataset.index = idx;
        tr.dataset.sectionId = rt.sectionId || 'null';
        tr.draggable = true;
        tr.innerHTML = `
            <td class="py-1 px-4 text-center text-sm"><span class="drag-handle">⋮⋮</span></td>
            <td class="py-1 px-4 text-sm"><div class="flex items-center">${formatTaskName(rt.name)}${subtaskIcon}${memoIcon}</div></td>
            <td class="py-1 px-4 text-sm">${escapeHtml(project.name)}</td>
            <td class="py-1 px-4 text-sm">${rt.estimatedTime} 分</td>
            <td class="py-1 px-4 text-sm">${escapeHtml(repeatText)}</td>
            <td class="py-1 px-4 text-center space-x-1 whitespace-nowrap">
                <button class="generate-single-repeat-btn text-gray-400 hover:text-green-500 p-1" data-id="${rt.id}" title="今日のタスクとして生成">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
                </button>
                <button class="edit-repeat-task-btn text-gray-400 hover:text-blue-500 p-1" data-id="${rt.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
                <button class="delete-repeat-task-btn text-gray-400 hover:text-red-500 p-1" data-id="${rt.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1H9a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
            </td>
        `;
        list.appendChild(tr);
    });
}

export function renderRepeatTaskCards(wrapper, tasksToRender) {
    tasksToRender.forEach(rt => {
        const idx = state.repeatTasks.findIndex(t => t.id === rt.id);
        const project = state.projects.find(p => p.id === rt.projectId) || { name: 'N/A', color: '#cccccc' };
        const repeatText = getRepeatTextShort(rt);

        const subtaskIcon = (rt.subtasks && rt.subtasks.length > 0) ? `
            <span class="tooltip-container">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline-block ml-1 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                    <path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd" />
                </svg>
                <span class="custom-tooltip">サブタスク: ${rt.subtasks.length}件</span>
            </span>` : '';

        const memoIcon = rt.memo ? `
            <span class="tooltip-container">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline-block ml-1 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                <span class="custom-tooltip">${escapeHtml(rt.memo)}</span>
            </span>` : '';

        const card = document.createElement('div');
        card.className = `bg-white px-3 py-2 shadow border-l-4 repeat-task-row ${rt.id === state.focusedRepeatTaskId ? 'focused' : ''}`;
        card.style.borderLeftColor = project.color;
        card.dataset.id = rt.id;
        card.dataset.index = idx;
        card.dataset.sectionId = rt.sectionId || 'null';
        card.draggable = true;
        card.innerHTML = `
            <div class="flex items-start gap-3">
                <span class="drag-handle text-gray-400 hover:text-gray-600 cursor-move pt-1">⋮⋮</span>
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-start">
                        <h3 class="font-semibold text-base flex items-center pr-2" title="${escapeHtml(rt.name || '')}">
                            ${formatTaskName(rt.name)} ${subtaskIcon} ${memoIcon}
                        </h3>
                        <div class="flex space-x-1 flex-shrink-0">
                            <button class="generate-single-repeat-btn text-gray-400 hover:text-green-500 p-1" data-id="${rt.id}" title="今日のタスクとして生成">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
                            </button>
                            <button class="edit-repeat-task-btn text-gray-400 hover:text-blue-500 p-1" data-id="${rt.id}">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button class="delete-repeat-task-btn text-gray-400 hover:text-red-500 p-1" data-id="${rt.id}">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1H9a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                        </div>
                    </div>
                    <div class="flex items-center justify-between text-xs text-gray-600 mt-1">
                        <span>見積: ${rt.estimatedTime || 0}分</span>
                        <span>${escapeHtml(repeatText)}</span>
                    </div>
                </div>
            </div>
        `;
        wrapper.appendChild(card);
    });
}
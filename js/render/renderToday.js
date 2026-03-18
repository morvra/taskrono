// js/render/renderToday.js
import { state } from '../state.js';
import { getFormattedDate, escapeHtml, formatTime, formatClockTime, calculateActualTime, formatTaskName } from '../utils.js';

export const renderTodayCallbacks = {
    getTasksForViewDate: null,
    isMobile: null,
    getSectionDisplayInfo: null,
    getTaskStatus: null,
    setupDragAndDrop: null,
    updateFocus: null,
    toggleSubtaskCompletion: null,
    openMemoEditModal: null,
    openTaskEditModal: null,
    toggleSubtaskView: null,
    handleSwipeStart: null,
    toggleTimer: null,
    deleteTask: null,
    postponeTask: null,
    moveTaskToToday: null,
};

export function renderTodayTasks(options = {}) {
    const container = document.getElementById('sections-container');
    container.innerHTML = '';

    const viewDateObj = new Date(state.viewDate);

    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() + 2);
    const limitDateStr = getFormattedDate(limitDate);

    const yesterdayObj = new Date();
    yesterdayObj.setDate(yesterdayObj.getDate() - 1);
    const yesterdayStr = getFormattedDate(yesterdayObj);

    const dateLabel = viewDateObj.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
    document.getElementById('view-date-display').textContent = dateLabel;

    const prevBtn = document.getElementById('prev-day-btn');
    prevBtn.style.visibility = (state.viewDate <= yesterdayStr) ? 'hidden' : 'visible';

    const nextBtn = document.getElementById('next-day-btn');
    nextBtn.style.visibility = (state.viewDate >= limitDateStr) ? 'hidden' : 'visible';

    const tasks = renderTodayCallbacks.getTasksForViewDate();
    if (tasks.length === 0 && state.sections.every(s => s.id !== 'null')) {
        container.innerHTML = `<p class="text-center text-gray-500 py-8">タスクはありません。[N]キーで追加できます。</p>`;
    }

    const sortedSections = [...state.sections].sort((a, b) => a.startTime.localeCompare(b.startTime));
    const tasksBySection = { 'null': [] };
    sortedSections.forEach(s => tasksBySection[s.id] = []);

    tasks.forEach(task => {
        const sectionId = task.sectionId || 'null';
        if (tasksBySection.hasOwnProperty(sectionId)) {
            tasksBySection[sectionId].push(task);
        } else {
            tasksBySection['null'].push(task);
        }
    });

    const sectionOrder = ['null', ...sortedSections.map(s => s.id)];

    if (renderTodayCallbacks.isMobile()) {
        const wrapper = document.createElement('div');
        wrapper.className = 'task-card-wrapper';
        sectionOrder.forEach(sectionId => {
            const sectionTasks = tasksBySection[sectionId];
            if (sectionId === 'null' && sectionTasks.length === 0) return;

            const { name, range } = renderTodayCallbacks.getSectionDisplayInfo(sectionId);

            const remainingTimeInSection = sectionTasks
                .filter(task => renderTodayCallbacks.getTaskStatus(task) !== 'completed')
                .reduce((sum, task) => sum + (task.estimatedTime || 0), 0);
            const remainingTimeHtml = remainingTimeInSection > 0 ? `<span>見積: ${remainingTimeInSection}分</span>` : '';

            const sectionHeader = document.createElement('div');
            sectionHeader.className = 'text-xs font-bold text-white mt-2 px-2 py-1 bg-gray-500 flex justify-between items-center';
            sectionHeader.innerHTML = `<span>${name} ${range}</span> ${remainingTimeHtml}`;
            wrapper.appendChild(sectionHeader);

            renderTaskCards(wrapper, sectionTasks);

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
        const wrapper = document.createElement('div');
        wrapper.className = 'bg-white shadow-md';
        const tableContainer = document.createElement('div');
        tableContainer.className = 'overflow-x-auto';
        const table = document.createElement('table');
        table.className = 'min-w-full task-table';
        table.innerHTML = `
            <thead class="bg-gray-500 text-white">
                <tr>
                    <th class="text-center text-xs uppercase tracking-wider w-8"></th>
                    <th class="text-center text-xs uppercase tracking-wider w-8"></th>
                    <th class="text-left text-xs uppercase tracking-wider">タスク</th>
                    <th class="text-center text-xs uppercase tracking-wider w-20">見積</th>
                    <th class="text-center text-xs uppercase tracking-wider w-20">実績</th>
                    <th class="text-center text-xs uppercase tracking-wider w-20">開始</th>
                    <th class="text-center text-xs uppercase tracking-wider w-20">終了</th>
                    <th class="text-center text-xs uppercase tracking-wider w-28">操作</th>
                </tr>
            </thead>
            <tbody id="task-table-body"></tbody>
        `;
        const tbody = table.querySelector('tbody');

        const visibleSections = sectionOrder.filter(id => !(id === 'null' && tasksBySection[id].length === 0));
        const lastVisibleSectionId = visibleSections.length > 0 ? visibleSections[visibleSections.length - 1] : null;

        visibleSections.forEach(sectionId => {
            const sectionTasks = tasksBySection[sectionId];
            const { name, range } = renderTodayCallbacks.getSectionDisplayInfo(sectionId);

            const remainingTimeInSection = sectionTasks
                .filter(task => renderTodayCallbacks.getTaskStatus(task) !== 'completed')
                .reduce((sum, task) => sum + (task.estimatedTime || 0), 0);
            const remainingTimeHtml = remainingTimeInSection > 0 ? `<span>見積: ${remainingTimeInSection}分</span>` : '';

            const headerRow = document.createElement('tr');
            headerRow.className = 'bg-gray-100';
            headerRow.dataset.sectionId = sectionId;
            headerRow.innerHTML = `
                <td colspan="8" class="py-1 px-4 text-xs font-bold text-white bg-gray-400">
                    <div class="justify-between items-center">
                        <span>${name} ${range}</span>
                        ${remainingTimeHtml}
                    </div>
                </td>`;
            tbody.appendChild(headerRow);

            renderTaskTable(tbody, sectionTasks, { isLast: sectionId === lastVisibleSectionId });
        });

        tableContainer.appendChild(table);
        wrapper.appendChild(tableContainer);
        container.appendChild(wrapper);
    }

    attachTaskEventListeners();
    renderTodayCallbacks.setupDragAndDrop('.task-row, .task-card', tasks);

    const focusedEl = document.querySelector('.task-row.focused, .task-card.focused');
    if (focusedEl && options.scroll) {
        focusedEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
}

export function renderTaskTable(tbody, tasksToRender, options = {}) {
    if (tasksToRender.length === 0) {
        const parentHeader = tbody.lastElementChild;
        if (parentHeader && parentHeader.dataset.sectionId) {
            const tr = document.createElement('tr');
            tr.className = 'empty-section-drop-target';
            tr.dataset.sectionId = parentHeader.dataset.sectionId;
            tr.innerHTML = `<td colspan="8" class="px-4 text-center text-gray-400 text-xs">ここにタスクをドロップできます</td>`;
            tbody.appendChild(tr);
        }
        return;
    }

    tasksToRender.forEach(task => {
        const allTasks = renderTodayCallbacks.getTasksForViewDate();
        const index = allTasks.findIndex(t => t.id === task.id);
        const project = state.projects.find(p => p.id === task.projectId) || { name: '', color: '#cccccc' };
        const tr = document.createElement('tr');
        tr.className = `border-b task-row ${task.status === 'completed' ? 'bg-gray-100 text-gray-500' : ''} ${task.status === 'running' ? 'bg-blue-100' : ''} ${task.id === state.focusedTaskId ? 'focused' : ''}`;
        tr.dataset.taskId = task.id;
        tr.dataset.index = index;
        tr.dataset.sectionId = task.sectionId || 'null';
        tr.draggable = true;

        const isRunning = task.status === 'running';
        const isCompleted = task.status === 'completed';

        let timerButtonHtml = '';
        if (isCompleted) {
            timerButtonHtml = `
                <button class="timer-btn checkmark-btn cursor-pointer items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pt-1 text-green-600" viewBox="0 0 19 19" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>
                </button>`;
        } else {
            timerButtonHtml = `<button class="timer-btn transition-colors duration-200 ${isRunning ? 'text-red-500 hover:text-red-600' : 'text-green-500 hover:text-green-600'}">
                ${isRunning ? '■' : '▶'}
            </button>`;
        }

        const subtasks = task.subtasks || [];
        let subtaskIconHtml = '';
        if (subtasks.length > 0) {
            subtaskIconHtml = `
                <span class="subtask-toggle-icon" data-task-id="${task.id}" title="サブタスク (S)">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mb-0.5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                        <path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd" />
                    </svg>
                </span>`;
        }

        const memoIcon = task.memo ? `
            <span class="tooltip-container memo-icon-clickable" data-task-id="${task.id}">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline-block mb-1 ml-1 text-gray-400 cursor-pointer hover:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                <span class="custom-tooltip">${escapeHtml(task.memo)}</span>
            </span>` : '';

        const actualTimeDisplay = `<span class="font-mono time-actual">${formatTime(calculateActualTime(task))}</span>`;

        const todayStr = getFormattedDate(new Date());
        const isFutureDate = state.viewDate > todayStr;
        let moveButtonHtml = '';
        if (isFutureDate) {
            moveButtonHtml = `
                <button class="move-to-today-btn text-gray-400 hover:text-green-500 p-1" title="当日に移動">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 15l-3-3m0 0l3-3m-3 3h8M3 12a9 9 0 1118 0 9 9 0 01-18 0z" /></svg>
                </button>`;
        } else {
            moveButtonHtml = `
                <button class="postpone-task-btn text-gray-400 hover:text-yellow-500 p-1" title="翌日に先送り (P)">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </button>`;
        }

        tr.innerHTML = `
            <td class="text-center"><span class="drag-handle">⋮⋮</span></td>
            <td class="text-center">${timerButtonHtml}</td>
            <td>
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-1 min-w-0">
                        <span class="inline-block w-2 h-2 rounded-full flex-shrink-0" style="background-color: ${project.color};"></span>
                        <span class="pl-1 font-semibold text-sm truncate" title="${escapeHtml(task.name || '')}">${formatTaskName(task.name)}</span>
                        ${subtaskIconHtml} ${memoIcon}
                    </div>
                    <span class="flex items-center text-xs text-gray-400 ml-2 whitespace-nowrap flex-shrink-0 project-label">
                        ${task.originRepeatId ? `
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1 text-gray-400 hidden md:inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" title="リピートタスク">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                            </svg>
                        ` : ''}
                        ${escapeHtml(project.name)}
                    </span>
                </div>
            </td>
            <td class="text-center text-sm whitespace-nowrap">${task.estimatedTime || 0} 分</td>
            <td class="text-center text-sm whitespace-nowrap">${actualTimeDisplay}</td>
            <td class="text-center text-sm whitespace-nowrap"><span class="font-mono">${task.startTime ? formatClockTime(new Date(task.startTime)) : '--:--'}</span></td>
            <td class="text-center text-sm whitespace-nowrap"><span class="font-mono">${task.endTime ? formatClockTime(new Date(task.endTime)) : '--:--'}</span></td>
            <td class="text-center space-x-1">
                <button class="edit-task-btn text-gray-400 hover:text-blue-500 p-1" title="編集 (E)">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
                ${moveButtonHtml}
                <button class="delete-task-btn text-gray-400 hover:text-red-500 p-1" title="削除 (D)">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1H9a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </td>
        `;
        tbody.appendChild(tr);

        if (subtasks.length > 0) {
            const subtaskTr = document.createElement('tr');
            subtaskTr.className = 'subtask-container-row';
            subtaskTr.dataset.parentTaskId = task.id;

            const subtaskTd = document.createElement('td');
            subtaskTd.colSpan = 8;

            const subtaskContainer = document.createElement('div');
            subtaskContainer.id = `subtasks-${task.id}`;
            subtaskContainer.className = `subtask-container ${state.openTaskIds.has(task.id) ? 'open' : ''}`;

            subtasks.forEach(st => {
                const item = document.createElement('div');
                item.className = `subtask-item ${st.completed ? 'completed' : ''} ${st.id === state.focusedSubtaskId ? 'focused' : ''}`;
                item.dataset.subtaskId = st.id;
                item.innerHTML = `
                    <input type="checkbox" class="subtask-checkbox form-checkbox h-4 w-4 text-blue-600" data-subtask-id="${st.id}" ${st.completed ? 'checked' : ''}>
                    <span class="ml-3 text-sm flex-1">${formatTaskName(st.name)}</span>
                `;
                item.addEventListener('click', (e) => {
                    if (e.target.matches('.subtask-checkbox')) return;
                    e.stopPropagation();
                    renderTodayCallbacks.updateFocus({ taskId: task.id, subtaskId: st.id });
                });
                item.addEventListener('dblclick', (e) => {
                    e.preventDefault();
                    renderTodayCallbacks.toggleSubtaskCompletion(task.id, st.id, !st.completed);
                });
                subtaskContainer.appendChild(item);
            });

            subtaskTd.appendChild(subtaskContainer);
            subtaskTr.appendChild(subtaskTd);
            tbody.appendChild(subtaskTr);
        }
    });
}

export function renderTaskCards(wrapper, tasksToRender) {
    tasksToRender.forEach(task => {
        const allTasks = renderTodayCallbacks.getTasksForViewDate();
        const index = allTasks.findIndex(t => t.id === task.id);
        const project = state.projects.find(p => p.id === task.projectId) || { name: '', color: '#cccccc' };

        const isCompleted = task.status === 'completed';
        const isRunning = task.status === 'running';

        let cardClasses = `task-card bg-white px-3 py-2 border-l-4 relative overflow-hidden transition-all duration-200`;
        if (isCompleted) cardClasses += ' completed bg-gray-100';
        if (isRunning) cardClasses += ' running-enhanced';
        if (task.id === state.focusedTaskId) cardClasses += ' focused';

        const card = document.createElement('div');
        card.className = cardClasses;
        card.style.borderLeftColor = project.color;
        card.dataset.taskId = task.id;
        card.dataset.index = index;
        card.dataset.sectionId = task.sectionId || 'null';
        card.draggable = true;

        let progressWidth = 0;
        if (isRunning && task.estimatedTime > 0) {
            const currentSeconds = calculateActualTime(task);
            progressWidth = Math.min(100, (currentSeconds / (task.estimatedTime * 60)) * 100);
        }

        let timerButtonHtml = '';
        if (isCompleted) {
            timerButtonHtml = `
                <button class="timer-btn checkmark-btn rounded-full cursor-pointer items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-green-600" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>
                </button>`;
        } else {
            timerButtonHtml = `<button class="timer-btn transition-colors duration-200 flex-shrink-0 ${isRunning ? 'text-red-500 hover:text-red-600 scale-110' : 'text-green-500 hover:text-green-600'}">
                ${isRunning ? '■' : '▶'}
            </button>`;
        }

        const subtasks = task.subtasks || [];
        let subtaskIconHtml = '';
        if (subtasks.length > 0) {
            subtaskIconHtml = `
                <span class="subtask-toggle-icon ml-1" data-task-id="${task.id}" title="サブタスク (S)">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" /><path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd" /></svg>
                </span>`;
        }

        const memoIcon = task.memo ? `
            <span class="tooltip-container memo-icon-clickable" data-task-id="${task.id}">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline-block ml-1 mb-0.5 text-gray-400 cursor-pointer hover:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                <span class="custom-tooltip">${escapeHtml(task.memo)}</span>
            </span>` : '';

        let actualTimeContent = '';
        if (isRunning) {
            actualTimeContent = `<span class="running-timer time-actual">${formatTime(calculateActualTime(task))}</span>`;
        } else if (isCompleted) {
            actualTimeContent = `<span class="text-gray-600 ml-2">実績: ${formatTime(calculateActualTime(task))}</span>`;
        }

        const projectLabelHtml = `
            <span class="flex items-center text-xs text-gray-500 ml-2 whitespace-nowrap flex-shrink-0 project-label">
                ${task.originRepeatId ? `
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" title="リピートタスク">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                ` : ''}
                ${escapeHtml(project.name)}
            </span>
        `;

        card.innerHTML = `
            <div class="flex items-center gap-3 relative z-10">
                <div class="flex flex-col items-center">
                    ${timerButtonHtml}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-start">
                        <h3 class="font-semibold text-base truncate flex items-center pr-2" title="${escapeHtml(task.name || '')}">
                            ${formatTaskName(task.name)}
                            ${subtaskIconHtml} ${memoIcon}
                        </h3>
                        <div class="flex-shrink-0 pt-1">
                            ${projectLabelHtml}
                        </div>
                    </div>
                    <div class="flex items-center justify-between text-xs text-gray-600 mt-1">
                        <div class="flex items-center">
                            <span class="whitespace-nowrap">見積: ${task.estimatedTime || 0}分</span>
                            ${actualTimeContent}
                        </div>
                        <div class="font-mono text-gray-400 self-end">
                            ${task.startTime ? formatClockTime(new Date(task.startTime)) : ''}
                            ${task.endTime ? ' - ' + formatClockTime(new Date(task.endTime)) : ''}
                        </div>
                    </div>
                </div>
            </div>
            ${isRunning ? `<div class="running-progress-bg" style="width: ${progressWidth}%"></div>` : ''}
        `;

        const swipeBackground = document.createElement('div');
        swipeBackground.className = 'task-card-swipe-background';

        const rightShortIconHtml = isRunning
            ? `<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" /></svg>`
            : `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" /></svg>`;

        swipeBackground.innerHTML = `
            <div class="swipe-bg swipe-bg-right">
                <div id="swipe-right-short" class="swipe-action-icon">${rightShortIconHtml}</div>
                <div id="swipe-right-long" class="swipe-action-icon"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></div>
                <div id="swipe-right-extra-long" class="swipe-action-icon"><svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></div>
            </div>
            <div class="swipe-bg swipe-bg-left">
                <div id="swipe-left-short" class="swipe-action-icon"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12.75 15l3-3m0 0l-3-3m3 3h-7.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
                <div id="swipe-left-long" class="swipe-action-icon"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12.578 0c-.275-.046-.55-.09-.826-.13m15.026 0v.117c0 .621-.504 1.125-1.125 1.125H9.824a1.125 1.125 0 01-1.125-1.125V5.841m12.728 0c-.616 0-1.19.014-1.766.042m-1.766-.042L15 4.135A1.875 1.875 0 0013.125 3H10.875A1.875 1.875 0 009 4.135L6.96 5.841m0 0a48.108 48.108 0 013.478-.397m7.5 0v-.117c0-.621.504-1.125 1.125-1.125h.625c.621 0 1.125.504 1.125 1.125v.117m-7.5 0h7.5" /></svg></div>
            </div>
        `;

        const swipeWrapper = document.createElement('div');
        swipeWrapper.className = 'task-card-swipe-wrapper shadow';
        swipeWrapper.appendChild(swipeBackground);
        swipeWrapper.appendChild(card);
        wrapper.appendChild(swipeWrapper);

        if (subtasks.length > 0) {
            const subtaskContainer = document.createElement('div');
            subtaskContainer.id = `subtasks-${task.id}`;
            subtaskContainer.className = `subtask-container ${state.openTaskIds.has(task.id) ? 'open' : ''}`;
            subtasks.forEach(st => {
                const item = document.createElement('div');
                item.className = `subtask-item ${st.completed ? 'completed' : ''} ${st.id === state.focusedSubtaskId ? 'focused' : ''}`;
                item.dataset.subtaskId = st.id;
                item.innerHTML = `
                    <input type="checkbox" class="subtask-checkbox form-checkbox h-4 w-4 text-blue-600" data-subtask-id="${st.id}" ${st.completed ? 'checked' : ''}>
                    <span class="ml-3 flex-1">${formatTaskName(st.name)}</span>
                `;
                item.addEventListener('click', (e) => {
                    if (e.target.matches('.subtask-checkbox')) return;
                    e.stopPropagation();
                    renderTodayCallbacks.updateFocus({ taskId: task.id, subtaskId: st.id });
                });
                item.addEventListener('dblclick', (e) => {
                    e.preventDefault();
                    renderTodayCallbacks.toggleSubtaskCompletion(task.id, st.id, !st.completed);
                });
                subtaskContainer.appendChild(item);
            });
            wrapper.appendChild(subtaskContainer);
        }
    });
}

export function attachTaskEventListeners() {
    document.querySelectorAll('.task-row, .task-card').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('button, a, .memo-icon-clickable, .subtask-toggle-icon, .subtask-checkbox')) return;
            const taskId = e.currentTarget.dataset.taskId;
            if (state.focusedTaskId !== taskId || state.focusedSubtaskId !== null) {
                state.focusedTaskId = taskId;
                state.focusedSubtaskId = null;
                renderTodayTasks();
            }
        });

        el.addEventListener('dblclick', (e) => {
            if (e.target.closest('button, a, input, .drag-handle')) return;
            e.preventDefault();
            const taskId = e.currentTarget.dataset.taskId;
            if (taskId) {
                renderTodayCallbacks.openMemoEditModal(taskId);
            }
        });

        if (el.classList.contains('task-card')) {
            el.addEventListener('touchstart', renderTodayCallbacks.handleSwipeStart);
        }
    });

    document.querySelectorAll('.timer-btn, .checkmark-btn').forEach(btn =>
        btn.addEventListener('click', (e) => renderTodayCallbacks.toggleTimer(e.currentTarget.closest('[data-task-id]').dataset.taskId))
    );
    document.querySelectorAll('.delete-task-btn').forEach(btn =>
        btn.addEventListener('click', (e) => renderTodayCallbacks.deleteTask(e.currentTarget.closest('[data-task-id]').dataset.taskId))
    );
    document.querySelectorAll('.postpone-task-btn').forEach(btn =>
        btn.addEventListener('click', (e) => renderTodayCallbacks.postponeTask(e.currentTarget.closest('[data-task-id]').dataset.taskId))
    );
    document.querySelectorAll('.move-to-today-btn').forEach(btn =>
        btn.addEventListener('click', (e) => renderTodayCallbacks.moveTaskToToday(e.currentTarget.closest('[data-task-id]').dataset.taskId))
    );
    document.querySelectorAll('.edit-task-btn').forEach(btn =>
        btn.addEventListener('click', (e) => renderTodayCallbacks.openTaskEditModal(e.currentTarget.closest('[data-task-id]').dataset.taskId))
    );

    document.querySelectorAll('.memo-icon-clickable').forEach(icon =>
        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            renderTodayCallbacks.openMemoEditModal(e.currentTarget.dataset.taskId);
        })
    );

    document.querySelectorAll('.subtask-toggle-icon').forEach(icon => {
        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            renderTodayCallbacks.toggleSubtaskView(e.currentTarget.dataset.taskId);
        });
    });

    document.querySelectorAll('.subtask-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const subtaskId = e.target.dataset.subtaskId;
            const subtaskRow = e.target.closest('[data-parent-task-id]');
            const cardWrapper = e.target.closest('.task-card-wrapper > div');
            let taskId = null;
            if (subtaskRow) {
                taskId = subtaskRow.dataset.parentTaskId;
            } else if (cardWrapper) {
                const card = cardWrapper.querySelector('[data-task-id]');
                if (card) taskId = card.dataset.taskId;
            }
            if (taskId) {
                renderTodayCallbacks.toggleSubtaskCompletion(taskId, subtaskId, e.target.checked);
            } else {
                console.error("Could not find parent task ID for subtask.");
            }
        });
    });
}
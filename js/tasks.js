// js/tasks.js
import { getCurrentSection } from './sections.js';
import { state } from './state.js';
import { getFormattedDate, getPlainTaskName, calculateActualTime, formatTime } from './utils.js';

export const taskCallbacks = {
    getTasksForViewDate: null,
    setTasksForViewDate: null,
    saveAndRender: null,
    showToast: null,
    updateTaskStatus: null,
};

export function addTask(name = null, time = null, projectId = null, sectionId = null, isInterrupt = false, options = {}) {
    const taskName = name.trim();
    const estimatedTime = parseInt(time, 10);

    if (!taskName || isNaN(estimatedTime) || estimatedTime < 0) {
        alert('タスク名と見積時間を正しく入力してください。');
        return null;
    }

    const tasks = taskCallbacks.getTasksForViewDate();
    const newTask = {
        id: 't' + Date.now() + Math.random(),
        name: taskName,
        projectId: projectId || null,
        sectionId: sectionId || null,
        estimatedTime,
        actualTime: 0,
        status: 'pending',
        isInterrupt: !!isInterrupt,
        memo: '',
        subtasks: [],
        startTime: null,
        endTime: null,
        createdDate: state.viewDate,
        updatedAt: new Date().toISOString(),
        ...options
    };

    let insertIndex;
    if (isInterrupt) {
        const firstPendingIndex = tasks.findIndex(t => t.status !== 'completed');
        insertIndex = firstPendingIndex === -1 ? 0 : firstPendingIndex;
    } else {
        const sortedSections = [...state.sections].sort((a, b) => a.startTime.localeCompare(b.startTime));
        const sectionOrder = ['null', ...sortedSections.map(s => s.id)];
        const targetSectionId = sectionId || 'null';
        const targetSectionOrderIndex = sectionOrder.indexOf(targetSectionId);

        insertIndex = tasks.length;

        let lastTaskInTargetSectionIndex = -1;
        for (let i = tasks.length - 1; i >= 0; i--) {
            if ((tasks[i].sectionId || 'null') === targetSectionId) {
                lastTaskInTargetSectionIndex = i;
                break;
            }
        }

        if (lastTaskInTargetSectionIndex !== -1) {
            insertIndex = lastTaskInTargetSectionIndex + 1;
        } else {
            let firstTaskInNextSectionIndex = -1;
            for (let i = 0; i < tasks.length; i++) {
                const taskSectionOrderIndex = sectionOrder.indexOf(tasks[i].sectionId || 'null');
                if (taskSectionOrderIndex > targetSectionOrderIndex) {
                    firstTaskInNextSectionIndex = i;
                    break;
                }
            }
            if (firstTaskInNextSectionIndex !== -1) {
                insertIndex = firstTaskInNextSectionIndex;
            }
        }
    }

    tasks.splice(insertIndex, 0, newTask);
    taskCallbacks.setTasksForViewDate(tasks);

    state.focusedTaskId = newTask.id;
    taskCallbacks.saveAndRender({ scroll: true });
    return newTask;
}

export function deleteTask(id) {
    const tasks = taskCallbacks.getTasksForViewDate();
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const plainName = getPlainTaskName(task.name);
    if (!confirm(`タスク「${plainName}」を削除しますか?`)) return;

    const allTasksForDate = state.dailyTasks[state.viewDate] || [];
    const index = allTasksForDate.findIndex(t => t.id === id);
    if (index === -1) return;

    const taskToDelete = allTasksForDate[index];
    taskToDelete.isDeleted = true;
    taskToDelete.updatedAt = new Date().toISOString();

    let nextFocusedTask = null;
    for (let i = index + 1; i < allTasksForDate.length; i++) {
        if (!allTasksForDate[i].isDeleted) {
            nextFocusedTask = allTasksForDate[i];
            break;
        }
    }
    if (!nextFocusedTask) {
        for (let i = index - 1; i >= 0; i--) {
            if (!allTasksForDate[i].isDeleted) {
                nextFocusedTask = allTasksForDate[i];
                break;
            }
        }
    }

    state.focusedTaskId = nextFocusedTask ? nextFocusedTask.id : null;
    taskCallbacks.saveAndRender();
}

export function postponeTask(id) {
    const allTasksForDate = state.dailyTasks[state.viewDate] || [];
    const taskIndex = allTasksForDate.findIndex(t => t.id === id);
    if (taskIndex === -1) return;

    const task = allTasksForDate[taskIndex];
    const plainName = getPlainTaskName(task.name);
    const taskName = plainName.length > 30 ? plainName.substring(0, 30) + '...' : plainName;
    if (!window.confirm(`タスク「${taskName}」を翌日に先送りしますか?`)) return;

    const taskToMove = { ...allTasksForDate[taskIndex] };

    const nextDay = new Date(state.viewDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDateStr = getFormattedDate(nextDay);

    if (!state.dailyTasks[nextDateStr]) {
        state.dailyTasks[nextDateStr] = [];
    }

    taskToMove.status = 'pending';
    taskToMove.startTime = null;
    taskToMove.endTime = null;
    taskToMove.actualTime = 0;
    delete taskToMove.isDeleted;
    taskToMove.updatedAt = new Date().toISOString();

    state.dailyTasks[nextDateStr].unshift(taskToMove);

    const originalTask = allTasksForDate[taskIndex];
    originalTask.isDeleted = true;
    originalTask.updatedAt = new Date().toISOString();

    if (state.activeTaskId === id) stopActiveTimer();

    if (state.focusedTaskId === id) {
        let nextFocusedTask = null;
        for (let i = taskIndex + 1; i < allTasksForDate.length; i++) {
            if (!allTasksForDate[i].isDeleted) {
                nextFocusedTask = allTasksForDate[i];
                break;
            }
        }
        if (!nextFocusedTask) {
            for (let i = taskIndex - 1; i >= 0; i--) {
                if (!allTasksForDate[i].isDeleted) {
                    nextFocusedTask = allTasksForDate[i];
                    break;
                }
            }
        }
        state.focusedTaskId = nextFocusedTask ? nextFocusedTask.id : null;
    }

    taskCallbacks.saveAndRender();
    taskCallbacks.showToast('タスクを翌日に先送りしました。');
}

export function moveTaskToToday(id) {
    const allTasksForDate = state.dailyTasks[state.viewDate] || [];
    const taskIndex = allTasksForDate.findIndex(t => t.id === id);
    if (taskIndex === -1) return;

    const [taskToMove] = allTasksForDate.splice(taskIndex, 1);

    taskToMove.status = 'pending';
    taskToMove.startTime = null;
    taskToMove.endTime = null;
    taskToMove.actualTime = 0;
    delete taskToMove.isDeleted;
    taskToMove.updatedAt = new Date().toISOString();
    taskToMove.createdDate = getFormattedDate(new Date());

    const todayStr = getFormattedDate(new Date());
    if (!state.dailyTasks[todayStr]) {
        state.dailyTasks[todayStr] = [];
    }
    const todayTasks = state.dailyTasks[todayStr];

    const sortedSections = [...state.sections].sort((a, b) => a.startTime.localeCompare(b.startTime));
    const sectionOrder = ['null', ...sortedSections.map(s => s.id)];
    const targetSectionId = taskToMove.sectionId || 'null';
    const targetSectionOrderIndex = sectionOrder.indexOf(targetSectionId);

    let insertIndex = todayTasks.length;

    let lastTaskInTargetSectionIndex = -1;
    for (let i = todayTasks.length - 1; i >= 0; i--) {
        if ((todayTasks[i].sectionId || 'null') === targetSectionId) {
            lastTaskInTargetSectionIndex = i;
            break;
        }
    }

    if (lastTaskInTargetSectionIndex !== -1) {
        insertIndex = lastTaskInTargetSectionIndex + 1;
    } else {
        let firstTaskInNextSectionIndex = -1;
        for (let i = 0; i < todayTasks.length; i++) {
            const taskSectionOrderIndex = sectionOrder.indexOf(todayTasks[i].sectionId || 'null');
            if (taskSectionOrderIndex > targetSectionOrderIndex) {
                firstTaskInNextSectionIndex = i;
                break;
            }
        }
        if (firstTaskInNextSectionIndex !== -1) {
            insertIndex = firstTaskInNextSectionIndex;
        }
    }
    todayTasks.splice(insertIndex, 0, taskToMove);

    if (state.focusedTaskId === id) {
        let nextFocusedTask = null;
        if (taskIndex < allTasksForDate.length) {
            nextFocusedTask = allTasksForDate[taskIndex];
        } else if (allTasksForDate.length > 0) {
            nextFocusedTask = allTasksForDate[allTasksForDate.length - 1];
        }
        state.focusedTaskId = nextFocusedTask ? nextFocusedTask.id : null;
    }

    taskCallbacks.saveAndRender();
    taskCallbacks.showToast('タスクを当日に移動しました。');
}

export function stopActiveTimer() {
    clearInterval(state.activeTimerId);
    state.activeTimerId = null;
    state.activeTaskId = null;
}

export function toggleTimer(id, forceStop = false) {
    const tasks = taskCallbacks.getTasksForViewDate();
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    // [Case 1] 実行中のタスクを停止する
    if (state.activeTaskId === id && !forceStop) {
        task.endTime = new Date().toISOString();
        task.actualTime = calculateActualTime(task);
        taskCallbacks.updateTaskStatus(task);
        stopActiveTimer();
        const nextTask = tasks.find(t => t.status !== 'completed');
        state.focusedTaskId = nextTask ? nextTask.id : null;
        task.updatedAt = new Date().toISOString();
        if (state.openTaskIds.has(id)) {
            state.openTaskIds.delete(id);
        }
        taskCallbacks.saveAndRender({ scroll: true });
        return;
    }

    // [Case 2] forceStop (外部からの停止要求)
    if (forceStop) {
        if (state.activeTaskId) {
            const runningTask = tasks.find(t => t.id === state.activeTaskId);
            if (runningTask) {
                runningTask.endTime = new Date().toISOString();
                runningTask.actualTime = calculateActualTime(runningTask);
                taskCallbacks.updateTaskStatus(runningTask);
                runningTask.updatedAt = new Date().toISOString();
                if (state.openTaskIds.has(runningTask.id)) {
                    state.openTaskIds.delete(runningTask.id);
                }
            }
            stopActiveTimer();
        }
        taskCallbacks.saveAndRender({ scroll: true });
        return;
    }

    // [Case 3] 完了済み/実行済みタスクの再開処理
    if (task.startTime && task.status !== 'running') {
        if (confirm('このタスクは既に一度開始されています。新しいタスクとして再開しますか？')) {
            const originalEstimateMinutes = task.estimatedTime || 0;
            const originalActualSeconds = calculateActualTime(task);
            const originalActualMinutes = Math.round(originalActualSeconds / 60);
            const newEstimatedTime = Math.max(0, originalEstimateMinutes - originalActualMinutes);

            const newTask = addTask(task.name, newEstimatedTime, task.projectId, task.isInterrupt, {
                memo: task.memo,
                originRepeatId: task.originRepeatId
            });

            task.endTime = task.endTime || new Date().toISOString();
            task.actualTime = calculateActualTime(task);
            taskCallbacks.updateTaskStatus(task);
            task.updatedAt = new Date().toISOString();

            if (state.openTaskIds.has(task.id)) {
                state.openTaskIds.delete(task.id);
            }

            toggleTimer(newTask.id);
            return;
        } else {
            return;
        }
    }

    // [Case 4] 他のタスクが実行中なら停止する
    if (state.activeTaskId) {
        const runningTask = tasks.find(t => t.id === state.activeTaskId);
        if (runningTask) {
            runningTask.endTime = new Date().toISOString();
            runningTask.actualTime = calculateActualTime(runningTask);
            taskCallbacks.updateTaskStatus(runningTask);
            runningTask.updatedAt = new Date().toISOString();
            if (state.openTaskIds.has(runningTask.id)) {
                state.openTaskIds.delete(runningTask.id);
            }
        }
        stopActiveTimer();
    }

    // [Case 5] (id)のタスクを開始する
    task.startTime = task.startTime || new Date().toISOString();
    task.endTime = null;
    const currentSection = getCurrentSection();
    const targetSectionId = currentSection ? currentSection.id : null;
    task.sectionId = targetSectionId;

    taskCallbacks.updateTaskStatus(task);
    state.activeTaskId = id;
    state.focusedTaskId = id;
    task.updatedAt = new Date().toISOString();

    state.activeTimerId = setInterval(() => {
        const currentActualSeconds = calculateActualTime(task);
        const timeString = formatTime(currentActualSeconds);

        const timeEls = document.querySelectorAll(`[data-task-id="${task.id}"] .time-actual`);
        timeEls.forEach(el => el.textContent = timeString);

        const floatingTimeEl = document.getElementById('floating-elapsed-time');
        if (floatingTimeEl) {
            floatingTimeEl.textContent = timeString;
        }

        const progressBar = document.querySelector(`[data-task-id="${task.id}"] .running-progress-bg`);
        if (progressBar && task.estimatedTime > 0) {
            const percentage = Math.min(100, (currentActualSeconds / (task.estimatedTime * 60)) * 100);
            progressBar.style.width = `${percentage}%`;
        }
    }, 1000);

    taskCallbacks.saveAndRender({ scroll: true });
}
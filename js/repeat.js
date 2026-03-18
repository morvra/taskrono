// js/repeat.js
import { state } from './state.js';
import { getFormattedDate, escapeHtml } from './utils.js';

export const repeatCallbacks = {
    saveAndRender: null,
    showToast: null,
    getNthWeekdayOfMonth: null,
    getMonthlyDaysFromChips: null,
    getYearlyDatesFromChips: null,
};

export function addRepeatTask() {
    const name = document.getElementById('repeat-task-name').value.trim();
    const time = parseInt(document.getElementById('repeat-task-time').value, 10);
    const projectId = document.getElementById('repeat-task-project').value || null;
    const sectionId = document.getElementById('repeat-task-section').value || null;
    const memo = '';
    const type = document.getElementById('repeat-task-type').value;

    if (!name || isNaN(time) || time < 0) return alert('タスク名と見積時間を正しく入力してください。');

    let value = null;
    let startDate = null;
    let weekInterval = 1;

    if (type === 'weekly') {
        value = Array.from(document.querySelectorAll('#repeat-weekly-days input:checked')).map(cb => parseInt(cb.value, 10));
        if (value.length === 0) return alert('曜日を選択してください。');
        weekInterval = parseInt(document.getElementById('repeat-weekly-interval').value, 10) || 1;
        startDate = document.getElementById('repeat-weekly-start-date').value || new Date().toISOString().slice(0, 10);
    } else if (type === 'monthly') {
        const monthlyType = document.querySelector('input[name="repeat-monthly-type"]:checked').value;
        if (monthlyType === 'day') {
            const days = repeatCallbacks.getMonthlyDaysFromChips('repeat-monthly-days-list');
            if (days.length === 0) return alert('少なくとも1つの日付を追加してください。');
            value = { type: 'day', days };
        } else {
            const week = parseInt(document.getElementById('repeat-monthly-week').value, 10);
            const weekday = parseInt(document.getElementById('repeat-monthly-weekday').value, 10);
            value = { type: 'weekday', week, weekday };
        }
    } else if (type === 'yearly') {
        const dates = repeatCallbacks.getYearlyDatesFromChips('repeat-yearly-dates-list');
        if (dates.length === 0) return alert('少なくとも1つの月日を追加してください。');
        value = dates;
    } else if (type === 'interval') {
        value = parseInt(document.getElementById('repeat-interval-days').value, 10);
        if (isNaN(value) || value < 1) return alert('有効な間隔（日数）を入力してください。');
        startDate = document.getElementById('repeat-interval-start-date').value || new Date().toISOString().slice(0, 10);
    }

    state.repeatTasks.push({ id: 'rt' + Date.now(), name, estimatedTime: time, projectId, sectionId, memo, type, value, startDate, weekInterval, subtasks: [] });

    // 入力フォームのリセット
    document.getElementById('repeat-task-name').value = '';
    document.getElementById('repeat-task-time').value = '';
    document.querySelectorAll('#repeat-weekly-days input').forEach(cb => cb.checked = false);
    document.getElementById('repeat-weekly-interval').value = '1';
    document.getElementById('repeat-monthly-days-list').innerHTML = '';
    document.getElementById('repeat-yearly-dates-list').innerHTML = '';
    document.getElementById('repeat-interval-days').value = '';
    document.getElementById('repeat-interval-start-date').value = '';
    document.getElementById('repeat-weekly-start-date').value = '';
    repeatCallbacks.saveAndRender();
}

export function deleteRepeatTask(id) {
    const repeatTask = state.repeatTasks.find(rt => rt.id === id);
    if (!repeatTask) return;
    if (!confirm(`リピートタスク「${repeatTask.name}」を削除しますか？`)) return;
    state.repeatTasks = state.repeatTasks.filter(rt => rt.id !== id);
    repeatCallbacks.saveAndRender();
}

export function generateSingleRepeatTask(repeatTaskId) {
    const rt = state.repeatTasks.find(t => t.id === repeatTaskId);
    if (!rt) return null;

    const today = getFormattedDate(new Date());
    if (!state.dailyTasks[today]) state.dailyTasks[today] = [];
    const tasksForToday = state.dailyTasks[today].filter(t => !t.isDeleted);

    const newSubtasks = (rt.subtasks || []).map(st => ({ ...st, completed: false }));

    const newTask = {
        id: 't' + Date.now() + Math.random(),
        name: rt.name,
        projectId: rt.projectId || null,
        sectionId: rt.sectionId || null,
        estimatedTime: rt.estimatedTime || 0,
        actualTime: 0,
        status: 'pending',
        isInterrupt: false,
        memo: rt.memo || '',
        subtasks: newSubtasks,
        originRepeatId: rt.id,
        createdDate: today,
        startTime: null,
        endTime: null,
        isManuallyAddedRepeat: true,
        updatedAt: new Date().toISOString()
    };

    const allTasks = state.dailyTasks[today];
    const sortedSections = [...state.sections].sort((a, b) => a.startTime.localeCompare(b.startTime));
    const sectionOrder = ['null', ...sortedSections.map(s => s.id)];
    const targetSectionId = newTask.sectionId || 'null';
    const targetSectionOrderIndex = sectionOrder.indexOf(targetSectionId);

    let insertIndex = allTasks.length;
    let lastTaskInTargetSectionIndex = -1;
    for (let i = tasksForToday.length - 1; i >= 0; i--) {
        if ((tasksForToday[i].sectionId || 'null') === targetSectionId) {
            const taskId = tasksForToday[i].id;
            lastTaskInTargetSectionIndex = allTasks.findIndex(t => t.id === taskId);
            break;
        }
    }

    if (lastTaskInTargetSectionIndex !== -1) {
        insertIndex = lastTaskInTargetSectionIndex + 1;
    } else {
        let firstTaskInNextSectionIndex = -1;
        for (let i = 0; i < tasksForToday.length; i++) {
            const taskSectionOrderIndex = sectionOrder.indexOf(tasksForToday[i].sectionId || 'null');
            if (taskSectionOrderIndex > targetSectionOrderIndex) {
                const taskId = tasksForToday[i].id;
                firstTaskInNextSectionIndex = allTasks.findIndex(t => t.id === taskId);
                break;
            }
        }
        if (firstTaskInNextSectionIndex !== -1) {
            insertIndex = firstTaskInNextSectionIndex;
        }
    }

    allTasks.splice(insertIndex, 0, newTask);
    state.focusedTaskId = newTask.id;
    repeatCallbacks.showToast(`「${escapeHtml(rt.name)}」を今日のタスクに追加しました。`);
    return rt;
}

export function generateTasksFromRepeatAuto(dateStr, isManualForce = false) {
    const today = new Date(dateStr);
    today.setMinutes(today.getMinutes() + today.getTimezoneOffset());

    const year = today.getFullYear();
    const month = today.getMonth();
    const dayOfMonth = today.getDate();
    const dayOfWeek = today.getDay();

    if (!state.dailyTasks[dateStr]) {
        state.dailyTasks[dateStr] = [];
    }

    state.repeatTasks.forEach(rt => {
        let shouldAdd = false;

        switch (rt.type) {
            case 'daily':
                shouldAdd = true;
                break;
            case 'weekly':
                if (Array.isArray(rt.value) && rt.value.includes(dayOfWeek)) {
                    const weekInterval = rt.weekInterval || 1;
                    if (weekInterval === 1) {
                        shouldAdd = true;
                    } else if (rt.startDate) {
                        const start = new Date(rt.startDate);
                        start.setHours(0, 0, 0, 0);
                        const todayCopy = new Date(today);
                        todayCopy.setHours(0, 0, 0, 0);
                        const diffTime = todayCopy.getTime() - start.getTime();
                        if (diffTime >= 0) {
                            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                            const diffWeeks = Math.floor(diffDays / 7);
                            if (diffWeeks % weekInterval === 0) shouldAdd = true;
                        }
                    }
                }
                break;
            case 'monthly':
                if (rt.value) {
                    if (rt.value.type === 'day') {
                        if (Array.isArray(rt.value.days)) {
                            shouldAdd = rt.value.days.includes(dayOfMonth);
                        } else if (rt.value.day == dayOfMonth) {
                            shouldAdd = true;
                        }
                    } else if (rt.value.type === 'weekday') {
                        const targetDay = repeatCallbacks.getNthWeekdayOfMonth(year, month, rt.value.week, rt.value.weekday);
                        if (targetDay && targetDay === dayOfMonth) shouldAdd = true;
                    }
                }
                break;
            case 'yearly':
                if (Array.isArray(rt.value)) {
                    shouldAdd = rt.value.some(date => date.month == (month + 1) && date.day == dayOfMonth);
                } else if (rt.value && rt.value.month == (month + 1) && rt.value.day == dayOfMonth) {
                    shouldAdd = true;
                }
                break;
            case 'interval':
                if (rt.startDate && rt.value > 0) {
                    const start = new Date(rt.startDate);
                    start.setMinutes(start.getMinutes() + start.getTimezoneOffset());
                    const diffTime = today.getTime() - start.getTime();
                    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
                    if (diffDays >= 0 && diffDays % rt.value === 0) shouldAdd = true;
                }
                break;
            case 'template':
                shouldAdd = false;
                break;
        }

        if (shouldAdd) {
            const isAlreadyAdded = state.dailyTasks[dateStr].some(
                task => task.originRepeatId === rt.id && task.createdDate === dateStr
            );

            if (!isAlreadyAdded || isManualForce) {
                const newSubtasks = (rt.subtasks || []).map(st => ({ ...st, completed: false }));
                state.dailyTasks[dateStr].push({
                    id: 't' + Date.now() + Math.random(),
                    name: rt.name,
                    projectId: rt.projectId || null,
                    sectionId: rt.sectionId || null,
                    estimatedTime: rt.estimatedTime || 0,
                    actualTime: 0,
                    status: 'pending',
                    isInterrupt: false,
                    memo: rt.memo || '',
                    subtasks: newSubtasks,
                    originRepeatId: rt.id,
                    createdDate: dateStr,
                    startTime: null,
                    endTime: null,
                    isManuallyAddedRepeat: isManualForce
                });
            }
        }
    });
}

export function generateTasksFromRepeatManual() {
    const todayStr = getFormattedDate(new Date());

    if (!state.dailyTasks[todayStr]) {
        state.dailyTasks[todayStr] = [];
    }
    const tasksForToday = state.dailyTasks[todayStr];
    const tasksBefore = tasksForToday.length;

    generateTasksFromRepeatAuto(todayStr, true);

    const tasksAfter = state.dailyTasks[todayStr].length;
    const addedCount = tasksAfter - tasksBefore;

    if (addedCount > 0) {
        state.focusedTaskId = tasksForToday.length > 0 ? tasksForToday[tasksForToday.length - 1].id : null;
        repeatCallbacks.saveAndRender();
        alert(addedCount + ' 件のタスクを生成しました。');
    } else {
        alert('今日生成できるリピートタスク設定がありません。');
    }
}

export function generateTomorrowRepeats() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = getFormattedDate(tomorrow);
    generateTasksFromRepeatAuto(tomorrowStr);
}
// js/keyboard.js
import { state } from './state.js';

export const keyboardCallbacks = {
    getTasksForViewDate: null,
    setTasksForViewDate: null,
    saveAndRender: null,
    updateFocus: null,
    toggleSubtaskCompletion: null,
    openAddTaskModal: null,
    openTaskEditModal: null,
    openMemoEditModal: null,
    deleteTask: null,
    postponeTask: null,
    toggleSubtaskView: null,
    toggleTimer: null,
    moveViewDate: null,
    openRepeatEditModal: null,
    deleteRepeatTask: null,
    generateSingleRepeatTask: null,
    openInboxModal: null,
    getDailyTaskListApp: null,
};

export function handleKeyboardShortcuts(e) {
    if (document.querySelector('input:focus, select:focus, textarea:focus, .modal.active')) return;

    if (e.ctrlKey) {
        switch (e.key) {
            case '[':
                e.preventDefault();
                document.querySelector('.tab-link[data-tab="today"]')?.click();
                return;
            case ']':
                e.preventDefault();
                document.querySelector('.tab-link[data-tab="repeat"]')?.click();
                return;
        }
    }

    if (e.key.toLowerCase() === 'i') {
        e.preventDefault();
        const app = keyboardCallbacks.getDailyTaskListApp();
        if (app.dbx) {
            keyboardCallbacks.openInboxModal();
        }
        return;
    }

    const activeTab = document.querySelector('.tab-link.active').dataset.tab;

    if (activeTab === 'today') {
        handleTodayShortcuts(e);
    } else if (activeTab === 'repeat') {
        handleRepeatShortcuts(e);
    }
}

function handleTodayShortcuts(e) {
    const tasks = keyboardCallbacks.getTasksForViewDate();
    if (tasks.length === 0 && !['n', 'r', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) return;

    const currentTaskIndex = tasks.findIndex(t => t.id === state.focusedTaskId);
    const currentTask = (currentTaskIndex !== -1) ? tasks[currentTaskIndex] : null;

    // 1. サブタスクがフォーカスされている場合の処理を最優先
    if (currentTask && state.focusedSubtaskId) {
        const subtasks = currentTask.subtasks || [];
        const currentSubtaskIndex = subtasks.findIndex(st => st.id === state.focusedSubtaskId);

        if (currentSubtaskIndex !== -1) {
            switch (e.key.toLowerCase()) {
                case 'arrowup':
                    e.preventDefault();
                    if (e.ctrlKey || e.metaKey) break;
                    if (currentSubtaskIndex > 0) {
                        keyboardCallbacks.updateFocus({ taskId: currentTask.id, subtaskId: subtasks[currentSubtaskIndex - 1].id });
                    } else {
                        keyboardCallbacks.updateFocus({ taskId: currentTask.id });
                    }
                    return;
                case 'arrowdown':
                    e.preventDefault();
                    if (e.ctrlKey || e.metaKey) break;
                    if (currentSubtaskIndex < subtasks.length - 1) {
                        keyboardCallbacks.updateFocus({ taskId: currentTask.id, subtaskId: subtasks[currentSubtaskIndex + 1].id });
                    } else {
                        if (currentTaskIndex < tasks.length - 1) {
                            keyboardCallbacks.updateFocus({ taskId: tasks[currentTaskIndex + 1].id });
                        } else {
                            keyboardCallbacks.updateFocus({ taskId: currentTask.id });
                        }
                    }
                    return;
                case ' ':
                    e.preventDefault();
                    const subtask = subtasks[currentSubtaskIndex];
                    keyboardCallbacks.toggleSubtaskCompletion(currentTask.id, subtask.id, !subtask.completed);
                    return;
            }
        }
    }

    // 2. 親タスクがフォーカスされている場合の処理
    switch (e.key.toLowerCase()) {
        case 'n': e.preventDefault(); keyboardCallbacks.openAddTaskModal(); break;
        case 'e': e.preventDefault(); if (state.focusedTaskId) keyboardCallbacks.openTaskEditModal(state.focusedTaskId); break;
        case 'm': e.preventDefault(); if (state.focusedTaskId) keyboardCallbacks.openMemoEditModal(state.focusedTaskId); break;
        case 'd': e.preventDefault(); if (state.focusedTaskId) keyboardCallbacks.deleteTask(state.focusedTaskId); break;
        case 'p': e.preventDefault(); if (state.focusedTaskId) keyboardCallbacks.postponeTask(state.focusedTaskId); break;
        case 's': e.preventDefault(); if (state.focusedTaskId) keyboardCallbacks.toggleSubtaskView(state.focusedTaskId); break;
        case 'r':
            e.preventDefault();
            const appR = keyboardCallbacks.getDailyTaskListApp();
            if (appR.dbx) appR.loadStateFromDropbox();
            break;
        case 'arrowdown':
        case 'arrowup':
            e.preventDefault();
            if (!currentTask) {
                if (tasks.length > 0) keyboardCallbacks.updateFocus({ taskId: tasks[0].id });
                break;
            }

            if (e.ctrlKey || e.metaKey) {
                const direction = e.key.toLowerCase() === 'arrowdown' ? 1 : -1;
                const movedTask = tasks.splice(currentTaskIndex, 1)[0];
                let newIndex = currentTaskIndex;

                const sortedSections = [...state.sections].sort((a, b) => a.startTime.localeCompare(b.startTime));
                const sectionOrder = ['null', ...sortedSections.map(s => s.id)];
                const currentSectionId = movedTask.sectionId || 'null';

                const isAtBoundary =
                    (direction === 1 && (currentTaskIndex === tasks.length || (tasks[currentTaskIndex]?.sectionId || 'null') !== currentSectionId)) ||
                    (direction === -1 && (currentTaskIndex === 0 || (tasks[currentTaskIndex - 1]?.sectionId || 'null') !== currentSectionId));

                if (!isAtBoundary) {
                    newIndex = currentTaskIndex + direction;
                } else {
                    const currentSectionOrderIndex = sectionOrder.indexOf(currentSectionId);
                    const nextSectionOrderIndex = currentSectionOrderIndex + direction;
                    if (nextSectionOrderIndex >= 0 && nextSectionOrderIndex < sectionOrder.length) {
                        const nextSectionId = sectionOrder[nextSectionOrderIndex];
                        movedTask.sectionId = nextSectionId === 'null' ? null : nextSectionId;

                        if (direction === 1) {
                            const firstTaskOfNextSectionIndex = tasks.findIndex(t => (t.sectionId || 'null') === nextSectionId);
                            if (firstTaskOfNextSectionIndex !== -1) {
                                newIndex = firstTaskOfNextSectionIndex;
                            } else {
                                let found = false;
                                for (let i = nextSectionOrderIndex + 1; i < sectionOrder.length; i++) {
                                    const idx = tasks.findIndex(t => (t.sectionId || 'null') === sectionOrder[i]);
                                    if (idx !== -1) { newIndex = idx; found = true; break; }
                                }
                                if (!found) newIndex = tasks.length;
                            }
                        } else {
                            let lastIdx = -1;
                            for (let i = tasks.length - 1; i >= 0; i--) {
                                if ((tasks[i].sectionId || 'null') === nextSectionId) { lastIdx = i; break; }
                            }
                            if (lastIdx !== -1) {
                                newIndex = lastIdx + 1;
                            } else {
                                let found = false;
                                for (let i = nextSectionOrderIndex - 1; i >= 0; i--) {
                                    let lastTaskIndex = -1;
                                    for (let j = tasks.length - 1; j >= 0; j--) {
                                        if ((tasks[j].sectionId || 'null') === sectionOrder[i]) { lastTaskIndex = j; break; }
                                    }
                                    if (lastTaskIndex !== -1) { newIndex = lastTaskIndex + 1; found = true; break; }
                                }
                                if (!found) newIndex = 0;
                            }
                        }
                    } else {
                        newIndex = direction === 1 ? tasks.length : 0;
                    }
                }

                tasks.splice(newIndex, 0, movedTask);
                keyboardCallbacks.setTasksForViewDate(tasks);
                keyboardCallbacks.saveAndRender();

            } else {
                const direction = e.key.toLowerCase() === 'arrowdown' ? 1 : -1;
                if (direction === 1) {
                    const hasOpenSubtasks = state.openTaskIds.has(currentTask.id) && currentTask.subtasks?.length > 0;
                    if (hasOpenSubtasks) {
                        keyboardCallbacks.updateFocus({ taskId: currentTask.id, subtaskId: currentTask.subtasks[0].id });
                    } else if (currentTaskIndex < tasks.length - 1) {
                        keyboardCallbacks.updateFocus({ taskId: tasks[currentTaskIndex + 1].id });
                    }
                } else {
                    if (currentTaskIndex > 0) {
                        const prevTask = tasks[currentTaskIndex - 1];
                        const prevHasOpenSubtasks = state.openTaskIds.has(prevTask.id) && prevTask.subtasks?.length > 0;
                        if (prevHasOpenSubtasks) {
                            keyboardCallbacks.updateFocus({ taskId: prevTask.id, subtaskId: prevTask.subtasks[prevTask.subtasks.length - 1].id });
                        } else {
                            keyboardCallbacks.updateFocus({ taskId: prevTask.id });
                        }
                    }
                }
            }
            break;
        case 'arrowleft': e.preventDefault(); keyboardCallbacks.moveViewDate(-1); break;
        case 'arrowright': e.preventDefault(); keyboardCallbacks.moveViewDate(1); break;
        case ' ':
            e.preventDefault();
            if (state.focusedTaskId && !state.focusedSubtaskId) keyboardCallbacks.toggleTimer(state.focusedTaskId);
            break;
    }
}

function handleRepeatShortcuts(e) {
    const sortedSections = [...state.sections].sort((a, b) => a.startTime.localeCompare(b.startTime));
    const sectionOrder = ['null', ...sortedSections.map(s => s.id)];
    const sectionIndexMap = new Map(sectionOrder.map((id, index) => [id, index]));

    const tasksWithIndex = state.repeatTasks.map((task, index) => ({ task, index }));
    tasksWithIndex.sort((a, b) => {
        const sectionIndexA = sectionIndexMap.get(a.task.sectionId || 'null');
        const sectionIndexB = sectionIndexMap.get(b.task.sectionId || 'null');
        if (sectionIndexA !== sectionIndexB) return sectionIndexA - sectionIndexB;
        return a.index - b.index;
    });
    state.repeatTasks = tasksWithIndex.map(item => item.task);

    const tasks = state.repeatTasks;
    if (tasks.length === 0 && !['n', 'r'].includes(e.key.toLowerCase())) return;

    const currentTaskIndex = tasks.findIndex(t => t.id === state.focusedRepeatTaskId);
    const currentTask = (currentTaskIndex !== -1) ? tasks[currentTaskIndex] : null;

    switch (e.key.toLowerCase()) {
        case 'n':
            e.preventDefault();
            const repeatNameInput = document.getElementById('repeat-task-name');
            if (repeatNameInput) {
                document.getElementById('repeat-form-toggle')?.click();
                repeatNameInput.focus();
            }
            break;
        case 'e':
            e.preventDefault();
            if (state.focusedRepeatTaskId) keyboardCallbacks.openRepeatEditModal(state.focusedRepeatTaskId);
            break;
        case 'm':
            e.preventDefault();
            if (state.focusedRepeatTaskId) keyboardCallbacks.openRepeatEditModal(state.focusedRepeatTaskId);
            break;
        case 'd':
            e.preventDefault();
            if (state.focusedRepeatTaskId) keyboardCallbacks.deleteRepeatTask(state.focusedRepeatTaskId);
            break;
        case 'r':
            e.preventDefault();
            const appR = keyboardCallbacks.getDailyTaskListApp();
            if (appR.dbx) appR.loadStateFromDropbox();
            break;
        case 'arrowdown':
        case 'arrowup':
            e.preventDefault();
            if (!currentTask) {
                if (tasks.length > 0) keyboardCallbacks.updateFocus({ repeatTaskId: tasks[0].id });
                break;
            }

            if (e.ctrlKey || e.metaKey) {
                const direction = e.key.toLowerCase() === 'arrowdown' ? 1 : -1;
                const movedTask = tasks.splice(currentTaskIndex, 1)[0];
                let newIndex = currentTaskIndex;
                const currentSectionId = movedTask.sectionId || 'null';

                const isAtBoundary =
                    (direction === 1 && (currentTaskIndex === tasks.length || (tasks[currentTaskIndex]?.sectionId || 'null') !== currentSectionId)) ||
                    (direction === -1 && (currentTaskIndex === 0 || (tasks[currentTaskIndex - 1]?.sectionId || 'null') !== currentSectionId));

                if (!isAtBoundary) {
                    newIndex = currentTaskIndex + direction;
                } else {
                    const currentSectionOrderIndex = sectionOrder.indexOf(currentSectionId);
                    const nextSectionOrderIndex = currentSectionOrderIndex + direction;
                    if (nextSectionOrderIndex >= 0 && nextSectionOrderIndex < sectionOrder.length) {
                        const nextSectionId = sectionOrder[nextSectionOrderIndex];
                        movedTask.sectionId = nextSectionId === 'null' ? null : nextSectionId;

                        if (direction === 1) {
                            const firstIdx = tasks.findIndex(t => (t.sectionId || 'null') === nextSectionId);
                            if (firstIdx !== -1) {
                                newIndex = firstIdx;
                            } else {
                                let found = false;
                                for (let i = nextSectionOrderIndex + 1; i < sectionOrder.length; i++) {
                                    const idx = tasks.findIndex(t => (t.sectionId || 'null') === sectionOrder[i]);
                                    if (idx !== -1) { newIndex = idx; found = true; break; }
                                }
                                if (!found) newIndex = tasks.length;
                            }
                        } else {
                            let lastIdx = -1;
                            for (let i = tasks.length - 1; i >= 0; i--) {
                                if ((tasks[i].sectionId || 'null') === nextSectionId) { lastIdx = i; break; }
                            }
                            if (lastIdx !== -1) {
                                newIndex = lastIdx + 1;
                            } else {
                                let found = false;
                                for (let i = nextSectionOrderIndex - 1; i >= 0; i--) {
                                    let lastTaskIndex = -1;
                                    for (let j = tasks.length - 1; j >= 0; j--) {
                                        if ((tasks[j].sectionId || 'null') === sectionOrder[i]) { lastTaskIndex = j; break; }
                                    }
                                    if (lastTaskIndex !== -1) { newIndex = lastTaskIndex + 1; found = true; break; }
                                }
                                if (!found) newIndex = 0;
                            }
                        }
                    } else {
                        newIndex = direction === 1 ? tasks.length : 0;
                    }
                }

                tasks.splice(newIndex, 0, movedTask);
                state.repeatTasks = tasks;
                keyboardCallbacks.saveAndRender();

            } else {
                const direction = e.key.toLowerCase() === 'arrowdown' ? 1 : -1;
                const nextIndex = currentTaskIndex + direction;
                if (nextIndex >= 0 && nextIndex < tasks.length) {
                    keyboardCallbacks.updateFocus({ repeatTaskId: tasks[nextIndex].id });
                }
            }
            break;
        case ' ':
            e.preventDefault();
            if (state.focusedRepeatTaskId) {
                const rt = keyboardCallbacks.generateSingleRepeatTask(state.focusedRepeatTaskId);
                if (rt) keyboardCallbacks.saveAndRender();
            }
            break;
    }
}
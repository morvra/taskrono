// js/state.js
import { getFormattedDate } from './utils.js';

export const state = {
    dailyTasks: {},
    projects: [],
    repeatTasks: [],
    sections: [],
    archivedTasks: {},
    loggedDates: [],
    viewDate: null,
    lastDate: null,
    settings: { dayChangeHour: 4 },
    activeTimerId: null,
    activeTaskId: null,
    focusedTaskId: null,
    focusedRepeatTaskId: null,
    focusedSubtaskId: null,
    openTaskIds: new Set(),
    editingTaskId: null,
    editingTaskDateKey: null,
    editingRepeatId: null,
    editingMemoTaskId: null,
    editingMemoTaskDateKey: null,
    pendingOriginRepeatId: null
};

export function loadStateFromStorage() {
    const defaults = {
        dailyTasks: {},
        projects: [
            { id: 'p' + Date.now(), name: '仕事', color: '#4a90e2' },
            { id: 'p' + (Date.now()+1), name: '学習', color: '#50e3c2' },
            { id: 'p' + (Date.now()+2), name: 'プライベート', color: '#f5a623' },
        ],
        repeatTasks: [],
        sections: [
            { id: 's' + (Date.now()+0), name: 'セクションA', startTime: '04:00' },
            { id: 's' + (Date.now()+1), name: 'セクションB', startTime: '09:00' },
            { id: 's' + (Date.now()+2), name: 'セクションC', startTime: '12:00' },
            { id: 's' + (Date.now()+3), name: 'セクションD', startTime: '16:00' },
            { id: 's' + (Date.now()+4), name: 'セクションE', startTime: '19:00' },
            { id: 's' + (Date.now()+5), name: 'セクションF', startTime: '23:00' }
        ],
        archivedTasks: {},
        lastDate: getFormattedDate(new Date()),
    };

    const oldTasks = localStorage.getItem('dtl_tasks');
    const newTasks = localStorage.getItem('dtl_dailyTasks');
    if (oldTasks && !newTasks) {
        const parsedOldTasks = JSON.parse(oldTasks);
        if (Array.isArray(parsedOldTasks) && parsedOldTasks.length > 0) {
            const today = getFormattedDate(new Date());
            state.dailyTasks[today] = parsedOldTasks;
            localStorage.removeItem('dtl_tasks');
        }
    }

    Object.keys(defaults).forEach(k => {
        const saved = localStorage.getItem(`dtl_${k}`);
        if ((k === 'archivedTasks' || k === 'dailyTasks') && !saved) {
            state[k] = defaults[k];
        } else {
            state[k] = saved ? JSON.parse(saved) : defaults[k];
        }
    });

    if (state.projects) {
        state.projects.forEach(p => {
            if (p.isArchived === undefined) p.isArchived = false;
        });
    }

    state.sections.sort((a, b) => a.startTime.localeCompare(b.startTime));
    // ※ updateTaskStatus の呼び出しは main.js の loadState() に残す
}

export function saveStateToStorage() {
    // 1つのキーの保存に失敗しても、他のキーの保存と呼び出し側の処理
    // （描画など）を止めないよう、キーごとに例外を捕まえて集める。
    // 失敗した場合は戻り値で返すので、呼び出し側が画面に表示できる。
    const errors = [];
    Object.keys(state).forEach(k => {
        if (k !== 'settings' && k !== 'archiveView' && k !== 'selectedArchiveProject') {
            try {
                if (k === 'openTaskIds') {
                    localStorage.setItem(`dtl_${k}`, JSON.stringify(Array.from(state[k])));
                } else {
                    localStorage.setItem(`dtl_${k}`, JSON.stringify(state[k]));
                }
            } catch (error) {
                console.error(`Taskrono: ローカル保存に失敗しました (dtl_${k})`, error);
                errors.push({ key: k, error });
            }
        }
    });
    try {
        const savedOpenTaskIds = localStorage.getItem('dtl_openTaskIds');
        if (savedOpenTaskIds) {
            state.openTaskIds = new Set(JSON.parse(savedOpenTaskIds));
        }
    } catch (error) {
        console.error('Taskrono: openTaskIds の読み戻しに失敗しました', error);
    }
    // ※ Dropbox保存は main.js の saveState() に残す
    return errors;
}
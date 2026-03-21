// js/dropbox.js
import { state } from './state.js';
import { getFormattedDate } from './utils.js';

// 日本語曜日
const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

// 秒数を "Xm" 形式に変換
function secondsToMinStr(seconds) {
    const m = Math.round(seconds / 60);
    return `${m}m`;
}

// ISO文字列を "HH:MM" に変換
function isoToHHMM(isoStr) {
    if (!isoStr) return '--:--';
    const d = new Date(isoStr);
    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

// タスクの実績時間（秒）を計算
function calcActualSeconds(task) {
    if (task.startTime && task.endTime) {
        return Math.round(Math.max(0, new Date(task.endTime) - new Date(task.startTime)) / 1000);
    }
    return task.actualTime || 0;
}

// マークダウンのリンク記法を除去してプレーンテキストに
function stripMarkdownLinks(text) {
    if (!text) return '';
    return text.replace(/\[(.*?)\]\(.*?\)/g, '$1');
}

// 1日分のアーカイブタスクをマークダウン文字列に変換
function buildDayMarkdown(dateStr, tasks) {
    const dateObj = new Date(dateStr + 'T12:00:00');
    const weekday = WEEKDAYS_JA[dateObj.getDay()];
    const lines = [`## ${dateStr} (${weekday})`, ''];

    const projectMap = new Map(state.projects.map(p => [p.id, p.name]));

    tasks.forEach(task => {
        const projectName = task.projectId ? (projectMap.get(task.projectId) || '') : '';
        const projectTag = projectName ? ` @${projectName}` : '';
        const estimated = task.estimatedTime ? ` :${task.estimatedTime}m` : '';
        const start = isoToHHMM(task.startTime);
        const end = isoToHHMM(task.endTime);
        const actualSec = calcActualSeconds(task);
        const actual = actualSec > 0 ? ` (${secondsToMinStr(actualSec)})` : '';
        const taskName = stripMarkdownLinks(task.name || '');

        lines.push(`- ${taskName}${projectTag}${estimated} ${start}-${end}${actual}`);

        // メモ
        if (task.memo && task.memo.trim()) {
            task.memo.trim().split('\n').forEach(memoLine => {
                if (memoLine.trim()) lines.push(`  - ${memoLine.trim()}`);
            });
        }

        // サブタスク
        if (task.subtasks && task.subtasks.length > 0) {
            task.subtasks.forEach(st => {
                const check = st.completed ? '[x]' : '[ ]';
                lines.push(`  - ${check} ${stripMarkdownLinks(st.name || '')}`);
            });
        }
    });

    lines.push('');
    return lines.join('\n');
}

export const dailyTaskListApp = {
    dropboxFilePath: '/DailyTaskListData.json',
    inboxFilePath: '/inbox.txt',
    archiveFilePath: '/ArchiveData.json',
    logsDirPath: '/logs',
    dbx: null,
    saveTimeout: null,
    lastSyncTime: 0,
    defaultFavicon: './taskrono.ico',
    runningFavicon: './taskrono_running.ico',
    callbacks: {
        getTaskStatus: null,
        showToast: null,
        stopActiveTimer: null,
        getTasksForViewDate: null,
        updateTaskStatus: null,
        saveState: null,
        render: null,
        restoreRunningTaskState: null,
    },
    // DOM Elements
    authorizeButton: null,
    signoutButton: null,
    authContainer: null,
    signoutContainer: null,
    authStatusEl: null,
    driveStatusEl: null,
    syncDataFab: null,
    reauthNotification: null,
    reauthButton: null,

    initDomElements: function() {
        this.authorizeButton = document.getElementById('authorize_button');
        this.signoutButton = document.getElementById('signout_button');
        this.authContainer = document.getElementById('auth-container');
        this.signoutContainer = document.getElementById('signout_container');
        this.authStatusEl = document.getElementById('auth-status');
        this.driveStatusEl = document.getElementById('drive-status');
        this.syncDataFab = document.getElementById('sync-button-floating-container');
        this.reauthNotification = document.getElementById('reauth-notification');
        this.reauthButton = document.getElementById('reauth-button');
    },

    updateReauthUi: function(show) {
        if (show) {
            this.reauthNotification.classList.remove('hidden');
        } else {
            this.reauthNotification.classList.add('hidden');
        }
    },

    updateAuthUi: function(isAuthenticated) {
        const dataTabLinks = document.querySelectorAll('.tab-link[data-tab="data"]');
        const syncFab = document.getElementById('sync-button-floating-container');
        const inboxBtn = document.getElementById('inbox-btn');
        const bottomNavInbox = document.getElementById('bottom-nav-inbox');
        const bottomNavDropboxImport = document.getElementById('bottom-nav-dropbox-import');

        if (isAuthenticated) {
            this.authContainer?.classList.add('hidden');
            this.signoutContainer?.classList.remove('hidden');
            this.authStatusEl.textContent = 'Dropboxにログイン済みです。';
            syncFab?.classList.remove('hidden');
            inboxBtn?.classList.remove('hidden');
            bottomNavDropboxImport?.classList.remove('hidden');
            bottomNavInbox?.classList.remove('hidden');
        } else {
            this.authContainer?.classList.remove('hidden');
            this.signoutContainer?.classList.add('hidden');
            this.authStatusEl.textContent = 'Dropboxにログインしていません。';
            dataTabLinks.forEach(el => {
                el.textContent = 'データ管理';
            });
            syncFab?.classList.add('hidden');
            inboxBtn?.classList.add('hidden');
            bottomNavDropboxImport?.classList.add('hidden');
            bottomNavInbox?.classList.add('hidden');
        }
    },

    updateSyncUi: function(status) {
        const iconContainerMobile = document.getElementById('mobile-sync-icon');
        const iconContainerPc = document.getElementById('pc-sync-icon');
        const containers = [iconContainerMobile, iconContainerPc];

        const syncIconSvgMobile = `<svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>`;
        const syncIconSvgPc = `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>`;
        const checkIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>`;

        containers.forEach(container => {
            if (!container) return;
            const defaultSvg = (container.id === 'mobile-sync-icon') ? syncIconSvgMobile : syncIconSvgPc;

            if (status === 'loading') {
                container.innerHTML = defaultSvg;
                container.classList.add('animate-spin');
                container.style.animation = "spin 1s linear infinite";
            } else if (status === 'success') {
                container.classList.remove('animate-spin');
                container.style.animation = "";
                container.innerHTML = checkIconSvg;
                setTimeout(() => {
                    container.innerHTML = defaultSvg;
                }, 2000);
            } else {
                container.classList.remove('animate-spin');
                container.style.animation = "";
                container.innerHTML = defaultSvg;
            }
        });
    },

    fetchInboxContent: async function() {
        if (!this.dbx) return '';
        try {
            const response = await this.dbx.filesDownload({ path: this.inboxFilePath });
            return await response.result.fileBlob.text();
        } catch (error) {
            if (error.status === 409) return '';
            console.error('Error fetching inbox content:', error);
            alert('Inboxの読み込みに失敗しました。');
            return null;
        }
    },

    saveInboxContent: async function(content) {
        if (!this.dbx) return false;
        try {
            await this.dbx.filesUpload({
                path: this.inboxFilePath,
                contents: content,
                mode: 'overwrite'
            });
            return true;
        } catch (error) {
            console.error('Error saving inbox content:', error);
            alert('Inboxの保存に失敗しました。');
            return false;
        }
    },

    // 月次マークダウンログを保存する
    // dateStr: ログに追記する日付 (例: '2026-03-21')
    saveMonthlyLog: async function(dateStr) {
        if (!this.dbx) return;

        // アーカイブから対象日の完了タスクを取得
        const tasks = (state.archivedTasks[dateStr] || []).filter(t => t.startTime && t.endTime);
        if (tasks.length === 0) return;

        // 開始時刻でソート
        tasks.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

        const yearMonth = dateStr.slice(0, 7); // 'YYYY-MM'
        const logPath = `${this.logsDirPath}/${yearMonth}.md`;
        const newSection = buildDayMarkdown(dateStr, tasks);

        try {
            // 既存ファイルを取得して追記、なければ新規作成
            let existingContent = '';
            try {
                const response = await this.dbx.filesDownload({ path: logPath });
                existingContent = await response.result.fileBlob.text();
            } catch (e) {
                if (e.status !== 409) {
                    console.warn('Monthly log fetch error (will create new):', e);
                }
                // 409 = not found → 新規作成するのでそのまま続行
            }

            // 同じ日付のセクションが既にあれば上書き、なければ追記
            if (existingContent.includes(`## ${dateStr}`)) {
                // 既存セクションを新しい内容で置換
                // セクションは "## YYYY-MM-DD (曜)" から始まり次の "## " か末尾まで
                const escapedDate = dateStr.replace(/-/g, '\\-');
                const sectionRegex = new RegExp(
                    `## ${escapedDate} \\([^)]+\\)\\n[\\s\\S]*?(?=\\n## |\\s*$)`,
                    'g'
                );
                existingContent = existingContent.replace(sectionRegex, newSection.trimEnd());
            } else {
                // 末尾に追記
                const trimmed = existingContent.trimEnd();
                existingContent = trimmed ? trimmed + '\n\n' + newSection : newSection;
            }

            await this.dbx.filesUpload({
                path: logPath,
                contents: existingContent.trimEnd() + '\n',
                mode: 'overwrite'
            });

            console.log(`Monthly log saved: ${logPath}`);
        } catch (error) {
            // ログ保存の失敗はメイン処理を止めない
            console.error('Error saving monthly log:', error);
        }
    },

    importTasksFromInbox: async function() {
        if (!this.dbx) return;

        try {
            const response = await this.dbx.filesDownload({ path: this.inboxFilePath });
            const fileContent = await response.result.fileBlob.text();
            const lines = fileContent.split('\n');
            const newTasks = [];
            const remainingLines = [];
            let processed = false;
            const dateRegex = /(\d{4}-\d{1,2}-\d{1,2})/;
            const timeRegex = /:(\d+)/;
            const todayStr = getFormattedDate(new Date());

            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = getFormattedDate(tomorrow);
            const tasksToAddByDate = {};

            lines.forEach(line => {
                let content = line.trim();

                if (content.length > 0) {
                    content = content.replace(/^\s*\[\s*\]\s*/, '');

                    let taskName = content;
                    let estimatedTime = 5;
                    let targetDate = todayStr;
                    let hasDate = false;

                    const dateMatch = taskName.match(dateRegex);
                    if (dateMatch) {
                        const parsedDate = new Date(dateMatch[1]);
                        if (!isNaN(parsedDate.getTime())) {
                            targetDate = getFormattedDate(parsedDate);
                            taskName = taskName.replace(dateRegex, '').trim();
                            hasDate = true;
                        }
                    }

                    if (hasDate && targetDate > tomorrowStr) {
                        remainingLines.push(line);
                        return;
                    }

                    const timeMatch = taskName.match(timeRegex);
                    if (timeMatch) {
                        estimatedTime = parseInt(timeMatch[1], 10);
                        taskName = taskName.replace(timeRegex, '').trim();
                    }

                    if (!taskName) {
                        remainingLines.push(line);
                        return;
                    }

                    const newTask = {
                        id: 't' + Date.now() + Math.random(),
                        name: taskName,
                        estimatedTime: estimatedTime,
                        projectId: null,
                        sectionId: null,
                        status: 'pending',
                        createdDate: targetDate,
                        startTime: null,
                        endTime: null,
                        memo: '',
                        subtasks: [],
                        updatedAt: new Date().toISOString()
                    };

                    if (!tasksToAddByDate[targetDate]) {
                        tasksToAddByDate[targetDate] = [];
                    }
                    tasksToAddByDate[targetDate].push(newTask);
                    newTasks.push(newTask);
                    processed = true;
                }
            });

            Object.keys(tasksToAddByDate).forEach(date => {
                if (!state.dailyTasks[date]) {
                    state.dailyTasks[date] = [];
                }
                state.dailyTasks[date] = [...tasksToAddByDate[date], ...state.dailyTasks[date]];
            });

            if (processed) {
                const newContent = remainingLines.join('\n').trim();
                await this.dbx.filesUpload({
                    path: this.inboxFilePath,
                    contents: newContent,
                    mode: 'overwrite'
                });
                if (newTasks.length > 0) {
                    this.callbacks.showToast(`${newTasks.length}件のタスクをInboxからインポートしました。`);
                }
            }
        } catch (error) {
            if (error.status === 409) {
                console.log('inbox.txt not found, skipping import.');
            } else {
                console.error('Error importing from inbox.txt:', error);
                this.driveStatusEl.textContent += ' (Inboxの読込エラー)';
            }
        }
    },

    loadStateFromDropbox: async function(showNotification = true) {
        if (!this.dbx) {
            alert('Dropboxにログインしてください。');
            return;
        }

        const preSyncRunningTaskId = state.activeTaskId;

        this.updateSyncUi('loading');
        this.driveStatusEl.textContent = 'Dropboxからデータを読み込み中...';
        try {
            const response = await this.dbx.filesDownload({ path: this.dropboxFilePath });
            const fileContent = await response.result.fileBlob.text();
            const importedData = JSON.parse(fileContent);

            if (importedData.sections && Array.isArray(importedData.sections)) {
                state.sections = importedData.sections;
                state.sections.sort((a, b) => a.startTime.localeCompare(b.startTime));
            }

            const driveDailyTasks = importedData.dailyTasks || {};
            const localDailyTasks = state.dailyTasks;
            const allDailyDates = new Set([...Object.keys(localDailyTasks), ...Object.keys(driveDailyTasks)]);

            allDailyDates.forEach(date => {
                const localTasksForDate = localDailyTasks[date] || [];
                const driveTasksForDate = driveDailyTasks[date] || [];
                const combinedTasks = [...localTasksForDate, ...driveTasksForDate];
                const taskMap = new Map();

                for (const task of combinedTasks) {
                    const key = (task.originRepeatId && !task.isManuallyAddedRepeat)
                        ? `repeat-${task.originRepeatId}-${task.createdDate || date}`
                        : `task-${task.id}`;

                    if (!taskMap.has(key)) {
                        taskMap.set(key, task);
                    } else {
                        const existingTask = taskMap.get(key);
                        const newTask = task;
                        const existingStatus = this.callbacks.getTaskStatus(existingTask);
                        const newStatus = this.callbacks.getTaskStatus(newTask);

                        let taskToKeep = existingTask;

                        if (newStatus === 'completed' && existingStatus !== 'completed') {
                            taskToKeep = newTask;
                        } else if (existingStatus === 'completed' && newStatus !== 'completed') {
                            taskToKeep = existingTask;
                        } else if (existingStatus === 'running' && newStatus === 'pending') {
                            taskToKeep = existingTask;
                        } else if (newStatus === 'running' && existingStatus === 'pending') {
                            taskToKeep = newTask;
                        } else {
                            const existingTimestamp = existingTask.updatedAt || '1970-01-01T00:00:00.000Z';
                            const newTimestamp = newTask.updatedAt || '1970-01-01T00:00:00.000Z';
                            if (newTimestamp >= existingTimestamp) {
                                taskToKeep = newTask;
                            }
                        }
                        taskMap.set(key, taskToKeep);
                    }
                }

                let mergedTasks = Array.from(taskMap.values());

                const sortedSections = [...state.sections].sort((a, b) => a.startTime.localeCompare(b.startTime));
                const sectionOrder = ['null', ...sortedSections.map(s => s.id)];

                mergedTasks.sort((a, b) => {
                    const sectionIndexA = sectionOrder.indexOf(a.sectionId || 'null');
                    const sectionIndexB = sectionOrder.indexOf(b.sectionId || 'null');
                    if (sectionIndexA !== sectionIndexB) return sectionIndexA - sectionIndexB;
                    return (a.sortOrder || 0) - (b.sortOrder || 0);
                });

                state.dailyTasks[date] = mergedTasks;
            });

            let restoredActiveDate = null;
            if (preSyncRunningTaskId) {
                for (const dateKey in state.dailyTasks) {
                    const foundTask = state.dailyTasks[dateKey].find(t => t.id === preSyncRunningTaskId);
                    if (foundTask) {
                        foundTask.status = 'running';
                        state.activeTaskId = preSyncRunningTaskId;
                        restoredActiveDate = dateKey;
                        break;
                    }
                }
            }

            const sortedDates = Array.from(new Set([
                ...Object.keys(state.dailyTasks),
                ...Object.keys(state.archivedTasks)
            ])).sort();
            const repeatTaskCompletionMap = new Map();

            sortedDates.forEach(date => {
                const allTasksForDate = [
                    ...(state.dailyTasks[date] || []),
                    ...(state.archivedTasks[date] || [])
                ];
                allTasksForDate.forEach(task => {
                    if (task.originRepeatId && this.callbacks.getTaskStatus(task) === 'completed') {
                        const existing = repeatTaskCompletionMap.get(task.originRepeatId);
                        if (!existing || date > existing) {
                            repeatTaskCompletionMap.set(task.originRepeatId, date);
                        }
                    }
                });
            });

            sortedDates.forEach(date => {
                const tasks = state.dailyTasks[date] || [];
                state.dailyTasks[date] = tasks.filter(task => {
                    if (!task.originRepeatId) return true;
                    if (task.status === 'running') return true;

                    const completedDate = repeatTaskCompletionMap.get(task.originRepeatId);
                    if (!completedDate) return true;

                    const taskCreatedDate = task.createdDate || date;
                    if (taskCreatedDate >= completedDate) return true;
                    if (this.callbacks.getTaskStatus(task) === 'completed') return true;
                    return false;
                });
            });

            if (importedData.projects) state.projects = importedData.projects;
            if (importedData.repeatTasks) state.repeatTasks = importedData.repeatTasks;
            state.lastDate = importedData.lastDate || state.lastDate;

            await this.importTasksFromInbox();

            this.callbacks.stopActiveTimer();

            if (restoredActiveDate) {
                state.viewDate = restoredActiveDate;
            } else {
                state.viewDate = getFormattedDate(new Date());
            }

            const tasksToday = this.callbacks.getTasksForViewDate();
            const firstUncompletedTask = tasksToday.find(t => this.callbacks.getTaskStatus(t) !== 'completed');
            if (firstUncompletedTask) {
                state.focusedTaskId = firstUncompletedTask.id;
            } else if (tasksToday.length > 0) {
                state.focusedTaskId = tasksToday[tasksToday.length - 1].id;
            } else {
                state.focusedTaskId = null;
            }

            Object.values(state.dailyTasks).flat().forEach(task => this.callbacks.updateTaskStatus(task));

            this.callbacks.saveState();
            this.callbacks.render();
            this.callbacks.restoreRunningTaskState();

            this.driveStatusEl.textContent = `Dropboxからデータを読み込みました (${new Date().toLocaleTimeString()})。`;
            this.updateSyncUi('success');
            this.lastSyncTime = Date.now();
            if (showNotification) {
                this.callbacks.showToast('Dropboxからデータを読み込みました。');
            }

        } catch (error) {
            this.updateSyncUi('idle');
            if (error.status === 409) {
                this.driveStatusEl.textContent = 'データファイルが見つかりません。初回同期を開始します...';
                await this.saveStateToDropbox();
            } else {
                console.error('Error loading state from Dropbox:', error);
                this.driveStatusEl.textContent = `読み込みエラー: ${error.error?.error_summary || 'Unknown error'}`;
                const errorSummary = error.error?.error_summary || '';
                if (error.status === 401 || errorSummary.includes('expired_access_token')) {
                    this.updateReauthUi(true);
                    this.driveStatusEl.textContent = '認証が切れました。再ログインしてください。';
                }
            }
        }
    },

    saveStateToDropbox: async function() {
        const accessToken = localStorage.getItem('dropbox_access_token');
        if (!this.dbx || !accessToken) {
            console.log('Dropbox not authenticated, skipping cloud save');
            return;
        }

        this.driveStatusEl.textContent = 'Dropboxへ保存準備中...';
        const cleanedDailyTasks = {};
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        for (const dateKey in state.dailyTasks) {
            const filteredTasks = state.dailyTasks[dateKey].filter(task => {
                return !task.isDeleted || (task.updatedAt && task.updatedAt > thirtyDaysAgo);
            });
            if (filteredTasks.length > 0) {
                cleanedDailyTasks[dateKey] = filteredTasks;
            }
        }

        const mainDataToSave = {
            dailyTasks: cleanedDailyTasks,
            projects: state.projects,
            repeatTasks: state.repeatTasks,
            sections: state.sections,
            lastDate: state.lastDate,
            updatedAt: new Date().toISOString()
        };

        const archiveDataToSave = {
            archivedTasks: state.archivedTasks,
            updatedAt: new Date().toISOString()
        };

        this.driveStatusEl.textContent = 'Dropboxへ保存中...';
        try {
            const saveMainData = this.dbx.filesUpload({
                path: this.dropboxFilePath,
                contents: JSON.stringify(mainDataToSave, null, 2),
                mode: 'overwrite'
            });

            const saveArchiveData = this.dbx.filesUpload({
                path: this.archiveFilePath,
                contents: JSON.stringify(archiveDataToSave, null, 2),
                mode: 'overwrite'
            });

            await Promise.all([saveMainData, saveArchiveData]);

            this.driveStatusEl.textContent = `Dropboxに保存しました (${new Date().toLocaleTimeString()})。`;
            this.lastSyncTime = Date.now();

        } catch (error) {
            console.error('Error saving state to Dropbox:', error);
            this.driveStatusEl.textContent = `保存エラー: ${error.error?.error_summary || 'Unknown error'}`;
            if (error.status === 401) {
                this.updateAuthUi(false);
                this.driveStatusEl.textContent = '認証が切れました。再ログインしてください。';
                this.updateReauthUi(true);
            }
        }
    }
};
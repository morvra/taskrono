// js/render/renderTaskPlayer.js
// モバイル下部のタスクプレイヤーを描画するUI専用モジュール。
// タスクの選択やボタンのイベント接続は main.js 側で行う。

import {
    calculateActualTime,
    escapeHtml,
    formatClockTime,
    formatTime,
    getPlainTaskName
} from '../utils.js';

const ICONS = {
    play: `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M8 5.5v13l10-6.5-10-6.5Z" fill="currentColor" stroke="none" />
        </svg>`,
    complete: `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="m5 12.5 4.2 4.2L19 7" fill="none" stroke="currentColor"
                  stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>`,
    interrupt: `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M7 5h4v14H7zM15 5h4v14h-4z" fill="currentColor" stroke="none" />
        </svg>`,
    memo: `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"
                  fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
            <path d="M14 3v6h6M8 13h8M8 17h5" fill="none" stroke="currentColor"
                  stroke-width="1.8" stroke-linecap="round" />
        </svg>`,
    done: `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor"
                  stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.6" />
        </svg>`,
    list: `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
                  fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>`
};

function getTaskTitle(task) {
    const plainName = getPlainTaskName(task?.name || '').trim();
    return escapeHtml(plainName || '名称未設定のタスク');
}

function getStartTimeLabel(task, isRunning) {
    if (!isRunning || !task?.startTime) return '未開始';

    const startDate = new Date(task.startTime);
    if (Number.isNaN(startDate.getTime())) return '開始時刻不明';

    return `開始 ${formatClockTime(startDate)}`;
}

function getEstimateLabel(task) {
    const estimateMinutes = Math.max(0, Number(task?.estimatedTime) || 0);
    return `見積 ${formatTime(estimateMinutes * 60)}`;
}

function renderEmptyState(root, mode) {
    const isComplete = mode === 'all-complete';
    root.innerHTML = `
        <div class="task-player-empty ${isComplete ? 'is-complete' : 'is-empty'}">
            <span class="task-player-empty-icon">
                ${isComplete ? ICONS.done : ICONS.list}
            </span>
            <span class="task-player-empty-text">
                ${isComplete ? '今日のタスクはすべて完了' : '今日のタスクはありません'}
            </span>
        </div>`;
}

/**
 * タスクプレイヤーを描画する。
 *
 * @param {{state: 'running'|'pending'|'all-complete'|'empty', task?: object|null, dateKey?: string|null}|null} target
 */
export function renderTaskPlayer(target = null) {
    const root = document.getElementById('task-player');
    if (!root) return;

    const mode = target?.state || 'empty';
    const task = target?.task || null;

    if (mode === 'all-complete' || mode === 'empty' || !task) {
        renderEmptyState(root, mode === 'all-complete' ? 'all-complete' : 'empty');
        root.dataset.taskId = '';
        root.dataset.dateKey = '';
        root.dataset.state = mode === 'all-complete' ? 'all-complete' : 'empty';
        root.hidden = false;
        return;
    }

    const isRunning = mode === 'running';
    const estimateMinutes = Math.max(0, Number(task.estimatedTime) || 0);
    const actualSeconds = isRunning ? Math.max(0, calculateActualTime(task)) : 0;
    const initialProgress = estimateMinutes > 0
        ? Math.min(100, (actualSeconds / (estimateMinutes * 60)) * 100)
        : 0;
    const title = getTaskTitle(task);
    const startLabel = getStartTimeLabel(task, isRunning);
    const estimateLabel = getEstimateLabel(task);

    const mainButtonAction = isRunning ? 'complete' : 'start';
    const mainButtonLabel = isRunning ? 'タスクを完了' : 'タスクを開始';
    const mainButtonIcon = isRunning ? ICONS.complete : ICONS.play;

    root.innerHTML = `
        <div class="task-player-progress"
             data-task-player-progress
             role="progressbar"
             aria-label="見積時間に対する進行度"
             aria-valuemin="0"
             aria-valuemax="100"
             aria-valuenow="${Math.round(initialProgress)}"
             style="--task-progress: ${initialProgress}%">
            <button type="button"
                    class="task-player-main-button"
                    data-player-action="${mainButtonAction}"
                    aria-label="${mainButtonLabel}"
                    title="${mainButtonLabel}">
                ${mainButtonIcon}
            </button>
        </div>

        <div class="task-player-info">
            <div class="task-player-title" title="${title}">${title}</div>
            <div class="task-player-meta">
                <span>${escapeHtml(startLabel)}</span>
                <span aria-hidden="true">·</span>
                <span>${escapeHtml(estimateLabel)}</span>
            </div>
        </div>

        <div class="task-player-actions">
            ${isRunning ? `
                <button type="button"
                        class="task-player-action"
                        data-player-action="interrupt"
                        aria-label="タスクを中断"
                        title="中断">
                    ${ICONS.interrupt}
                </button>` : ''}
            <button type="button"
                    class="task-player-action"
                    data-player-action="memo"
                    aria-label="タスクのメモを編集"
                    title="メモ">
                ${ICONS.memo}
            </button>
        </div>`;

    root.dataset.taskId = task.id || '';
    root.dataset.dateKey = target?.dateKey || '';
    root.dataset.state = mode;
    root.hidden = false;
}

/**
 * 実行中タスクの進行度リングだけを更新する。1秒ごとの更新用。
 * タスクプレイヤー全体の再描画は行わない。
 *
 * @param {number} actualSeconds 実績時間（秒）
 * @param {number} estimatedMinutes 見積時間（分）
 */
export function updateTaskPlayerProgress(actualSeconds, estimatedMinutes) {
    const ring = document.querySelector('#task-player [data-task-player-progress]');
    if (!ring) return;

    const estimate = Math.max(0, Number(estimatedMinutes) || 0);
    const actual = Math.max(0, Number(actualSeconds) || 0);
    const progress = estimate > 0
        ? Math.min(100, (actual / (estimate * 60)) * 100)
        : 0;

    ring.style.setProperty('--task-progress', `${progress}%`);
    ring.setAttribute('aria-valuenow', String(Math.round(progress)));
}

// js/main.js

import { escapeHtml, formatTime, formatClockTime, calculateActualTime, getPlainTaskName, formatTaskName, getFormattedDate } from './utils.js';
import { state, loadStateFromStorage, saveStateToStorage } from './state.js';
import { dailyTaskListApp } from './dropbox.js';
import { taskCallbacks, addTask, deleteTask, postponeTask, moveTaskToToday, toggleTimer, stopActiveTimer } from './tasks.js';
import { projectCallbacks, addProject, editProject, deleteProject, archiveProject, unarchiveProject } from './projects.js';
import { sectionCallbacks, addSection, editSection, deleteSection, getSectionById, getSectionDisplayInfo, getCurrentSection, updateSectionDropdowns, renderSections } from './sections.js';
import { renderProjectsCallbacks, renderProjects } from './render/renderProjects.js';
import { renderTodayCallbacks, renderTodayTasks, renderTaskTable, renderTaskCards, attachTaskEventListeners } from './render/renderToday.js';
import { repeatCallbacks, addRepeatTask, deleteRepeatTask, generateSingleRepeatTask, generateTasksFromRepeatAuto, generateTasksFromRepeatManual, generateTomorrowRepeats } from './repeat.js';
import { renderRepeatCallbacks, renderRepeatTasks, renderRepeatTaskTable, renderRepeatTaskCards } from './render/renderRepeat.js';
import { modalCallbacks, openModal, closeModal, openAddTaskModal, openTaskEditModal, saveTaskEdit, createRepeatFromTask, openMemoEditModal, saveMemoEdit, openRepeatEditModal, saveRepeatEdit, renderSubtasksInModal, addSubtaskToModal, getSubtasksFromModal, addMonthlyDayChip, addYearlyDateChip, getMonthlyDaysFromChips, getYearlyDatesFromChips } from './modals.js';
import { keyboardCallbacks, handleKeyboardShortcuts } from './keyboard.js';

document.addEventListener('DOMContentLoaded', () => {
	// フローティング要素のキーボード追従と滑らかスクロール対策
	function setupFloatingElementsStick() {
		const container = document.getElementById('bottom-ui-container');

		if (!container) return;

		let ticking = false;

		function updateElementsPosition() {
			const container = document.getElementById('bottom-ui-container');
			if (!container) return;

			// PC表示時 (min-width: 769px)
			if (!isMobile()) {
				// CSSで display: none にしているので、JSでの操作は不要
				container.style.position = '';
				container.style.top = '';
				return;
			}

			// モバイル表示時 (absolute + 無限スクロール制限)
			const scrollY = window.scrollY || 0;
			const viewportHeight = window.innerHeight;
			const actualBarHeight = container.offsetHeight;
			const barHeight = actualBarHeight > 0 ? actualBarHeight : 72; // デフォルト高さを72pxに

			const documentHeight = Math.max(
				document.body.scrollHeight, 
				document.documentElement.scrollHeight,
				document.body.offsetHeight, 
				document.documentElement.offsetHeight
			);

			const maxScroll = documentHeight - viewportHeight;
			const absoluteBottomTop = documentHeight - barHeight;

			let newContainerTop;

			if (scrollY >= maxScroll) {
				newContainerTop = absoluteBottomTop;
			} 
			else {
				const scrollBottom = scrollY + viewportHeight;
				newContainerTop = scrollBottom - barHeight;
			}

			// 親コンテナの位置設定
			container.style.position = 'absolute';
			container.style.top = newContainerTop + 'px';
		}

		function requestTick() {
			if (!ticking) {
				requestAnimationFrame(() => {
					updateElementsPosition();
					ticking = false;
				});
				ticking = true;
			}
		}

		// 初期実行
		updateElementsPosition();
		if (isMobile()) {
			// スクロール位置を0にしてから、requestAnimationFrameで強制的に再計算させる
			window.scrollTo(0, 0); 
			requestTick();
		}

		// イベントリスナー
		window.addEventListener('scroll', requestTick, { passive: true });
		window.addEventListener('resize', requestTick);

		// visualViewportのイベントも追加（キーボード表示時の対応）
		if (window.visualViewport) {
			window.visualViewport.addEventListener('resize', requestTick);
			window.visualViewport.addEventListener('scroll', requestTick);
		}
	}

	// Dropbox 同期機能の初期化
	async function initializeDropboxSync() {
		// ここにDropboxアプリのクライアントIDを設定してください
		const DROPBOX_CLIENT_ID = '0fno7q10xgfdyki';
		const REDIRECT_URI = window.location.origin + window.location.pathname; 
		// 例: https://morvra.github.io/taskrono または https://morvra.github.io/taskrono/

		if (DROPBOX_CLIENT_ID === 'YOUR_CLIENT_ID') {
			console.warn("DropboxのクライアントIDが設定されていません。");
			dailyTaskListApp.authorizeButton.textContent = '設定が必要です';
			dailyTaskListApp.authorizeButton.disabled = true;
			return;
		}

		// localStorageからトークンを読み込み、インスタンス作成時に渡す
		const accessToken = localStorage.getItem('dropbox_access_token');
		const refreshToken = localStorage.getItem('dropbox_refresh_token');

		const dbx = new Dropbox.Dropbox({ 
			clientId: DROPBOX_CLIENT_ID,
			accessToken,
			refreshToken
		});

		dailyTaskListApp.dbx = dbx; // アプリケーションオブジェクトにインスタンスをセット

		dailyTaskListApp.reauthButton.addEventListener('click', () => {
			dailyTaskListApp.authorizeButton.click();
		});

		// URLに認証コードがあるか確認 (OAuthリダイレクト後)
		const urlParams = new URLSearchParams(window.location.search);
		const authCode = urlParams.get('code');

		if (authCode) {
			try {
				// PKCE: 認証開始時に保存した code_verifier を復元
				const savedVerifier = sessionStorage.getItem('dropbox_pkce_code_verifier');
				if (savedVerifier && dbx && dbx.auth) {
					try { dbx.auth.codeVerifier = savedVerifier; } catch (e) { /* ignore */ }
				}

				// 認証コードをアクセストークンとリフレッシュトークンに交換
				const response = await dbx.auth.getAccessTokenFromCode(REDIRECT_URI, authCode);

				const { result } = response;
				const newAccessToken = result.access_token;
				const newRefreshToken = result.refresh_token;

				// 交換が成功したら、保存しておいた verifier は削除
				sessionStorage.removeItem('dropbox_pkce_code_verifier');

				// URLから認証コードを削除してクリーンにする
				window.history.replaceState({}, document.title, window.location.pathname);

				localStorage.setItem('dropbox_access_token', newAccessToken);
				if (newRefreshToken) {
					localStorage.setItem('dropbox_refresh_token', newRefreshToken);
				}
				dbx.auth.setAccessToken(newAccessToken);
				if (newRefreshToken) {
					dbx.auth.setRefreshToken(newRefreshToken);
				}

				dailyTaskListApp.updateAuthUi(true);
				dailyTaskListApp.updateReauthUi(false);
				dailyTaskListApp.loadStateFromDropbox();

			} catch (error) {
				console.error('Error getting access token from code:', error);
				const detail =
					(error && (error.error_summary || error.error || error.error_description)) ||
					JSON.stringify(error);
				dailyTaskListApp.driveStatusEl.textContent = `認証交換エラー: ${detail}`;
				alert('Dropboxの認証に失敗しました。詳細はコンソールを確認してください。');
			}
		} else {
			// ローカルストレージにトークンがあるか確認
			if (accessToken) {
				// トークンの有効性を確認（このAPI呼び出しにより、期限切れならSDKが自動でリフレッシュを試みる）
				try {
					await dbx.usersGetCurrentAccount();
					dailyTaskListApp.updateAuthUi(true);
					dailyTaskListApp.updateReauthUi(false);
					dailyTaskListApp.loadStateFromDropbox();
				} catch (error) {
					// トークンが無効だった場合（リフレッシュも失敗した場合）
					console.error('Stored token invalid:', error);
					localStorage.removeItem('dropbox_access_token');
					localStorage.removeItem('dropbox_refresh_token');
					dailyTaskListApp.dbx = null;
					dailyTaskListApp.updateAuthUi(false);
					dailyTaskListApp.updateReauthUi(true);
				}
			} else {
				dailyTaskListApp.updateAuthUi(false);
			}
		}

		// 認証開始処理
		dailyTaskListApp.authorizeButton.addEventListener('click', async () => {
			try {
				const authUrl = await dbx.auth.getAuthenticationUrl(
					REDIRECT_URI,         // Redirect URI
					undefined,            // state
					'code',               // authType
					'offline',            // 'offline'を指定してリフレッシュトークンを要求
					undefined,            // scope
					undefined,            // includeGrantedScopes
					true                  // usePKCE
				);
				// SDKが生成した code_verifier を sessionStorage に保存
				try {
					const codeVerifier = dbx.auth && dbx.auth.codeVerifier;
					if (codeVerifier) {
						sessionStorage.setItem('dropbox_pkce_code_verifier', codeVerifier);
					}
				} catch (e) {
					console.warn('Failed to store Dropbox PKCE code_verifier:', e);
				}
				// ユーザーをDropboxの認証ページへリダイレクト
				window.location.href = authUrl;
			} catch (e) {
				console.error('Error creating Dropbox auth URL:', e);
				alert('Dropbox認証用URLの生成に失敗しました。');
			}
		});

		// ログアウト処理
		dailyTaskListApp.signoutButton.addEventListener('click', async () => {
			if (!dailyTaskListApp.dbx) return;
			try {
				await dailyTaskListApp.dbx.authTokenRevoke();
			} catch (error) {
				console.error('Failed to revoke token', error);
			} finally {
				localStorage.removeItem('dropbox_access_token');
				localStorage.removeItem('dropbox_refresh_token');
				dailyTaskListApp.dbx = null;
				dailyTaskListApp.updateAuthUi(false);
				dailyTaskListApp.updateReauthUi(false);
			}
		});
	}
	// DROPBOX SYNC END


	function showToast(message, duration = 3000) {
		const toast = document.getElementById('toast-notification');
		if (!toast) return;

		toast.textContent = message;
		toast.classList.remove('-translate-y-20', 'opacity-0');

		// 一定時間後に非表示
		setTimeout(() => {
			toast.classList.add('-translate-y-20', 'opacity-0');
		}, duration);
	}

	// DOM refs
	const tabs = document.querySelectorAll('.tab-link');
	const currentDateEls = document.querySelectorAll('#current-date');
	const totalEstimatedEndTimeEls = document.querySelectorAll('#total-estimated-end-time, #total-estimated-end-time-desktop');

	function updateSortOrderAndTimestamps(dateKey) {
		const tasks = state.dailyTasks[dateKey] || [];
		const now = new Date().toISOString();
		tasks.forEach((task, index) => {
			task.sortOrder = index;
			// Only update the timestamp if the order actually changed
			// to avoid unnecessary saves during simple reads.
			if (!task.updatedAt || task.sortOrder !== index) {
				task.updatedAt = now;
			}
		});
	}

	// サブタスク関連
	function toggleSubtaskView(taskId) {
		// stateの更新（どのタスクが開いているかの情報を更新）
		if (state.openTaskIds.has(taskId)) {
			state.openTaskIds.delete(taskId);
		} else {
			state.openTaskIds.add(taskId);
		}

		if (taskId === state.focusedTaskId) {
			saveAndRender();
		} else {
			const subtaskContainer = document.getElementById(`subtasks-${taskId}`);
			if (subtaskContainer) {
				subtaskContainer.classList.toggle('open', state.openTaskIds.has(taskId));
			}
			saveState();
		}
	}


	function toggleSubtaskCompletion(taskId, subtaskId, isCompleted) {
		const task = getTasksForViewDate().find(t => t.id === taskId);
		if (task && task.subtasks) {
			const subtask = task.subtasks.find(st => st.id === subtaskId);
			if (subtask) {
				subtask.completed = isCompleted;
				task.updatedAt = new Date().toISOString();

				let nextFocusedTaskId = taskId;
				let nextFocusedSubtaskId = state.focusedSubtaskId;
				if (isCompleted) {
					const subtaskIndex = task.subtasks.findIndex(st => st.id === subtaskId);
					if (subtaskIndex !== -1 && subtaskIndex < task.subtasks.length - 1) {
						nextFocusedSubtaskId = task.subtasks[subtaskIndex + 1].id;
					} else {
						nextFocusedSubtaskId = null;
					}
				}
				saveState();

				const subtaskItem = document.querySelector(`.subtask-item[data-subtask-id="${subtaskId}"]`);
				if (subtaskItem) {
					subtaskItem.classList.toggle('completed', isCompleted);
					const checkbox = subtaskItem.querySelector('.subtask-checkbox');
					if (checkbox) checkbox.checked = isCompleted;
				}
				updateFocus({ taskId: nextFocusedTaskId, subtaskId: nextFocusedSubtaskId });
			}
		}
	}

	/**
         * 指定された年月の「第N・何曜日」が何日にあたるかを計算する
         * @param {number} year - 年
         * @param {number} month - 月 (0-11)
         * @param {number} week - 週 (1-4: 第N, 5: 最終)
         * @param {number} weekday - 曜日 (0:日, 1:月, ... 6:土)
         * @returns {number|null} 日付、または該当なしの場合はnull
         */
	function getNthWeekdayOfMonth(year, month, week, weekday) {
		const date = new Date(year, month, 1);
		let count = 0;
		// 最終週の場合
		if (week === 5) {
			const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
			for (let day = lastDayOfMonth; day >= 1; day--) {
				date.setDate(day);
				if (date.getDay() === weekday) {
					return day; // 後ろから探して最初に見つかった曜日が最終
				}
			}
		} else { // 第1-4週の場合
			const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
			for (let day = 1; day <= lastDayOfMonth; day++) {
				date.setDate(day);
				if (date.getDay() === weekday) {
					count++;
					if (count === week) {
						return day;
					}
				}
			}
		}
		return null; // 該当なし
	}

	// Init
	function init() {
	    state.viewDate = getFormattedDate(new Date());
	    loadState();
	    handleUrlScheme();
	    restoreRunningTaskState();
	    // コールバックを渡す
	    dailyTaskListApp.callbacks = {
	        getTaskStatus,
	        showToast,
	        stopActiveTimer,
	        getTasksForViewDate,
	        updateTaskStatus,
	        saveState,
	        render,
	        restoreRunningTaskState,
	    };
      taskCallbacks.getTasksForViewDate = getTasksForViewDate;
      taskCallbacks.setTasksForViewDate = setTasksForViewDate;
      taskCallbacks.saveAndRender = saveAndRender;
      taskCallbacks.showToast = showToast;
      taskCallbacks.updateTaskStatus = updateTaskStatus;
      sectionCallbacks.saveAndRender = saveAndRender;
      projectCallbacks.saveAndRender = saveAndRender;
      renderProjectsCallbacks.isMobile = isMobile;
      renderProjectsCallbacks.setupDragAndDrop = setupDragAndDrop;
      renderTodayCallbacks.getTasksForViewDate = getTasksForViewDate;
      renderTodayCallbacks.isMobile = isMobile;
      renderTodayCallbacks.getTaskStatus = getTaskStatus;
      renderTodayCallbacks.setupDragAndDrop = setupDragAndDrop;
      renderTodayCallbacks.updateFocus = updateFocus;
      renderTodayCallbacks.toggleSubtaskCompletion = toggleSubtaskCompletion;
      renderTodayCallbacks.openMemoEditModal = openMemoEditModal;
      renderTodayCallbacks.openTaskEditModal = openTaskEditModal;
      renderTodayCallbacks.toggleSubtaskView = toggleSubtaskView;
      renderTodayCallbacks.handleSwipeStart = handleSwipeStart;
      renderTodayCallbacks.toggleTimer = toggleTimer;
      renderTodayCallbacks.deleteTask = deleteTask;
      renderTodayCallbacks.postponeTask = postponeTask;
      renderTodayCallbacks.moveTaskToToday = moveTaskToToday;
      repeatCallbacks.saveAndRender = saveAndRender;
      repeatCallbacks.showToast = showToast;
      repeatCallbacks.getNthWeekdayOfMonth = getNthWeekdayOfMonth;
      repeatCallbacks.getMonthlyDaysFromChips = getMonthlyDaysFromChips;
      repeatCallbacks.getYearlyDatesFromChips = getYearlyDatesFromChips;
      renderRepeatCallbacks.isMobile = isMobile;
      renderRepeatCallbacks.setupDragAndDrop = setupDragAndDrop;
      renderRepeatCallbacks.generateSingleRepeatTask = generateSingleRepeatTask;
      renderRepeatCallbacks.saveAndRender = saveAndRender;
      renderRepeatCallbacks.openRepeatEditModal = openRepeatEditModal;
      renderRepeatCallbacks.deleteRepeatTask = deleteRepeatTask;
      modalCallbacks.getTasksForViewDate = getTasksForViewDate;
      modalCallbacks.saveAndRender = saveAndRender;
      modalCallbacks.saveState = saveState;
      modalCallbacks.updateProjectDropdowns = updateProjectDropdowns;
      modalCallbacks.updateSectionDropdowns = updateSectionDropdowns;
      modalCallbacks.updateTaskStatus = updateTaskStatus;
      modalCallbacks.isMobile = isMobile;
      keyboardCallbacks.getTasksForViewDate = getTasksForViewDate;
      keyboardCallbacks.setTasksForViewDate = setTasksForViewDate;
      keyboardCallbacks.saveAndRender = saveAndRender;
      keyboardCallbacks.updateFocus = updateFocus;
      keyboardCallbacks.toggleSubtaskCompletion = toggleSubtaskCompletion;
      keyboardCallbacks.openAddTaskModal = openAddTaskModal;
      keyboardCallbacks.openTaskEditModal = openTaskEditModal;
      keyboardCallbacks.openMemoEditModal = openMemoEditModal;
      keyboardCallbacks.deleteTask = deleteTask;
      keyboardCallbacks.postponeTask = postponeTask;
      keyboardCallbacks.toggleSubtaskView = toggleSubtaskView;
      keyboardCallbacks.toggleTimer = toggleTimer;
      keyboardCallbacks.moveViewDate = moveViewDate;
      keyboardCallbacks.openRepeatEditModal = openRepeatEditModal;
      keyboardCallbacks.deleteRepeatTask = deleteRepeatTask;
      keyboardCallbacks.generateSingleRepeatTask = generateSingleRepeatTask;
      keyboardCallbacks.openInboxModal = openInboxModal;
      keyboardCallbacks.getDailyTaskListApp = () => window.dailyTaskListApp;
	    window.dailyTaskListApp = dailyTaskListApp;
	    // DOM要素の初期化を先に行う
	    dailyTaskListApp.initDomElements();
	    setupEventListeners();
	    // DOM要素とイベントリスナーが設定された後にDropboxの初期化を行う
	    initializeDropboxSync();
	    renderPcAddTaskButton();
	    checkDayChange();
	    generateTomorrowRepeats();
	    setInterval(checkDayChange, 1000 * 60); 
	    updateTitle();
	    render();
	    updateTimeDisplays();
	    setInterval(updateTimeDisplays, 1000*30);
	    window.addEventListener('pageshow', function(event) {
	        if (event.persisted) {
	            const todayTab = document.querySelector('.tab-link[data-tab="today"]');
	            if (todayTab && !todayTab.classList.contains('active')) {
	                todayTab.click();
	            }
	        }
	    });
	    window.addEventListener('resize', () => {
	        const activeTab = document.querySelector('.tab-link.active').dataset.tab;
	        if (['today', 'repeat', 'projects', 'archive'].includes(activeTab)) {
	            render();
	        }
	    });
	    setupFloatingElementsStick(); 
	}

	function handleUrlScheme() {
		const urlParams = new URLSearchParams(window.location.search);
		const taskNameParam = urlParams.get('addtask');

		if (!taskNameParam) return;

		const taskName = taskNameParam;
		const estimatedRaw = urlParams.get('estimated');
		const estimatedParsed = parseInt(estimatedRaw, 10);
		const estimatedTime = (!isNaN(estimatedParsed) && estimatedParsed >= 0) ? estimatedParsed : 5;
		const projectName = urlParams.get('project') || null;

		let projectId = null;
		if (projectName) {
			const project = state.projects.find(p => p.name.toLowerCase() === projectName.toLowerCase());
			if (project) projectId = project.id;
		}

		try {
			const cleanUrl = window.location.protocol + '//' + window.location.host + window.location.pathname + (window.location.hash || '');
			window.history.replaceState(null, '', cleanUrl);
		} catch (e) {
			console.warn('URL クリーンアップに失敗しました（続行します）:', e);
		}

		// タスク追加処理を「1フレーム遅らせて」実行する
		setTimeout(() => {
			try {
				// 「当日のタスク」タブを強制的に開く
				document.querySelector('.tab-link[data-tab="today"]')?.click();

				// 表示日を今日にする
				state.viewDate = getFormattedDate(new Date());

				if (typeof addTask !== 'function') {
					console.warn('addTask 関数が見つかりません。URL追加をスキップします。');
					return;
				}

				const newTask = addTask(taskName, estimatedTime, projectId, null);

				if (newTask) {
					showToast(`「${taskName}」を追加しました。`);
				}
			} catch (err) {
				console.error('URL からのタスク追加で一部処理が失敗しました:', err);
				showToast('URLからのタスク追加中に一部処理が失敗しました（詳細はコンソール）。', 5000);
			}
		}, 0);
	}

	function getTasksForViewDate() {
		const tasks = state.dailyTasks[state.viewDate] || [];
		return tasks.filter(task => !task.isDeleted);
	}

	function setTasksForViewDate(tasks) {
		const deletedTasks = (state.dailyTasks[state.viewDate] || []).filter(task => task.isDeleted);
		state.dailyTasks[state.viewDate] = [...tasks, ...deletedTasks];
	}

	function setFavicon(url) {
		let link = document.querySelector("link[rel='icon']");
		if (!link) {
			link = document.createElement('link');
			link.rel = 'icon';
			document.head.appendChild(link);
		}
		link.href = url;
	}

	function updateTitle() {
		const todayStr = getFormattedDate(new Date());
		const tasksToday = (state.dailyTasks[todayStr] || []).filter(task => !task.isDeleted);
		const activeTask = tasksToday.find(t => t.id === state.activeTaskId);

		if (activeTask) {
			const markdownRegex = /\[(.*?)\]\((.*?)\)/g;
			const plainTaskName = (activeTask.name || '').replace(markdownRegex, '$1');

			document.title = `⏱ ${plainTaskName} - Taskrono`;
			setFavicon(dailyTaskListApp.runningFavicon);
		} else {
			// 今日のリストの未完了数をカウント
			const remainingTasksCount = tasksToday.filter(t => t.status !== 'completed').length;

			if (remainingTasksCount > 0) {
				document.title = `(${remainingTasksCount}) Taskrono`;
			} else {
				document.title = 'Taskrono';
			}
			setFavicon(dailyTaskListApp.defaultFavicon);
		}
	}

	function isMobile() {
		return window.innerWidth <= 768;
	}

	function getTaskStatus(task) {
		if (task.startTime && task.endTime) {
			return 'completed';
		} else if (task.startTime && !task.endTime) {
			return 'running';
		} else {
			return 'pending';
		}
	}

	function updateTaskStatus(task) {
		const tasks = getTasksForViewDate();
		const oldStatus = task.status;
		task.status = getTaskStatus(task);

		if (oldStatus !== 'completed' && task.status === 'completed') {
			moveTaskToCompletedSection(task.id);
		}
		else if (oldStatus !== 'running' && task.status === 'running') {
			moveTaskToTop(task.id);
		}
	}

	function moveTaskToCompletedSection(taskId) {
		const tasks = getTasksForViewDate();
		const taskIndex = tasks.findIndex(t => t.id === taskId);
		if (taskIndex === -1) return;

		const task = tasks[taskIndex];
		const sectionId = task.sectionId || 'null';
		const firstUncompletedIndexInSection = tasks.findIndex(
			t => (t.sectionId || 'null') === sectionId && getTaskStatus(t) !== 'completed' && t.id !== taskId
		);
		let insertIndex;
		if (firstUncompletedIndexInSection !== -1) {
			insertIndex = firstUncompletedIndexInSection;
		} else {
			let lastTaskIndexInSection = -1;
			for (let i = tasks.length - 1; i >= 0; i--) {
				if ((tasks[i].sectionId || 'null') === sectionId && tasks[i].id !== taskId) {
					lastTaskIndexInSection = i;
					break;
				}
			}
			insertIndex = lastTaskIndexInSection + 1;
		}
		if (taskIndex === insertIndex || taskIndex === insertIndex - 1) {
			return;
		}
		const [movedTask] = tasks.splice(taskIndex, 1);
		if (insertIndex > taskIndex) {
			insertIndex--;
		}
		tasks.splice(insertIndex, 0, movedTask);        
		setTasksForViewDate(tasks);
	}

	function moveTaskToTop(taskId) {
		const tasks = getTasksForViewDate();
		const taskIndex = tasks.findIndex(t => t.id === taskId);
		if (taskIndex === -1) return;

		const task = tasks[taskIndex];
		const sectionId = task.sectionId || 'null';
		let lastCompletedIndexInSection = -1;
		for (let i = tasks.length - 1; i >= 0; i--) {
			const currentTask = tasks[i];
			if ((currentTask.sectionId || 'null') === sectionId && getTaskStatus(currentTask) === 'completed') {
				lastCompletedIndexInSection = i;
				break;
			}
		}
		let insertIndex;
		if (lastCompletedIndexInSection !== -1) {
			insertIndex = lastCompletedIndexInSection + 1;
		} else {
			insertIndex = tasks.findIndex(t => (t.sectionId || 'null') === sectionId && t.id !== taskId);

			if (insertIndex === -1) { 
				insertIndex = taskIndex; 
			}
		}

		if (taskIndex === insertIndex || taskIndex === insertIndex - 1) {
			return;
		}
		const [movedTask] = tasks.splice(taskIndex, 1);
		if (insertIndex > taskIndex) {
			insertIndex--;
		}

		tasks.splice(insertIndex, 0, movedTask);

		setTasksForViewDate(tasks);
	}

	function positionTooltip(tooltipContainer) {
		const tooltip = tooltipContainer.querySelector('.custom-tooltip');
		const rect = tooltipContainer.getBoundingClientRect();
		const tooltipRect = tooltip.getBoundingClientRect();

		if (rect.top - tooltipRect.height < 10) {
			tooltip.classList.add('tooltip-bottom');
			tooltip.classList.remove('tooltip-top');
		} else {
			tooltip.classList.add('tooltip-top');
			tooltip.classList.remove('tooltip-bottom');
		}
	}

	function loadState() {
	    loadStateFromStorage();
	    // updateTaskStatus はまだ main.js にあるのでここで呼ぶ
	    Object.values(state.dailyTasks).flat().forEach(task => updateTaskStatus(task));
	}
	
	function saveState() {
	    saveStateToStorage();
	    // Dropbox保存はここに残す
	    const app = window.dailyTaskListApp;
	    const accessToken = localStorage.getItem('dropbox_access_token');
	    if (app.dbx && accessToken) {
	        if (app.saveTimeout) clearTimeout(app.saveTimeout);
	        app.saveTimeout = setTimeout(() => app.saveStateToDropbox(), 2000);
	    }
	}

	function restoreRunningTaskState() {
		// 既に動いているタイマーがあれば止める
		stopActiveTimer();

		const tasksView = (state.dailyTasks[state.viewDate] || []).filter(task => !task.isDeleted);
		let runningTask = tasksView.find(t => t.status === 'running');

		if (!runningTask && state.activeTaskId) {
			for (const dateKey in state.dailyTasks) {
				const found = state.dailyTasks[dateKey].find(t => t.id === state.activeTaskId);
				if (found && found.status === 'running') {
					runningTask = found;
					break;
				}
			}
		}

		if (runningTask) {
			state.activeTaskId = runningTask.id;
			state.activeTimerId = setInterval(() => {
				// 時間テキストの更新
				const currentActualSeconds = calculateActualTime(runningTask);
				const timeString = formatTime(currentActualSeconds);
				const timeEls = document.querySelectorAll(`[data-task-id="${runningTask.id}"] .time-actual`);
				timeEls.forEach(el => el.textContent = timeString);

				const floatingTimeEl = document.getElementById('floating-elapsed-time');
				if (floatingTimeEl) {
					floatingTimeEl.textContent = timeString;
				}

				// プログレスバーの更新処理
				const progressBar = document.querySelector(`[data-task-id="${runningTask.id}"] .running-progress-bg`);
				if (progressBar && runningTask.estimatedTime > 0) {
					const percentage = Math.min(100, (currentActualSeconds / (runningTask.estimatedTime * 60)) * 100);
					progressBar.style.width = `${percentage}%`;
				}
			}, 1000);
		}
	}

	async function checkDayChange() {
		const today = getFormattedDate(new Date());

		// 昨日の日付文字列を計算
		const yesterdayObj = new Date();
		yesterdayObj.setDate(yesterdayObj.getDate() - 1);
		const yesterdayStr = getFormattedDate(yesterdayObj);

		if (state.lastDate !== today) {
			console.log(`Date changed: ${state.lastDate} -> ${today}`);

			// 1. 未完了タスクの持ち越し処理 (前回起動日から今日へ)
			const yesterdaysTasks = state.dailyTasks[state.lastDate];
			if (yesterdaysTasks && yesterdaysTasks.length > 0) {
				// isDeletedでない未完了タスクのみを抽出
				const leftoverTasks = yesterdaysTasks.filter(t => t.status !== 'completed' && !t.isDeleted);
				if (leftoverTasks.length > 0) {
					if (!state.dailyTasks[today]) {
						state.dailyTasks[today] = [];
					}
					state.dailyTasks[today].unshift(...leftoverTasks);
					// 元の日付のリストからは、持ち越したタスク（未完了）を取り除く（完了と削除済みだけ残す）
					state.dailyTasks[state.lastDate] = yesterdaysTasks.filter(t => t.status === 'completed' || t.isDeleted);
				}
			}

			// 2. アーカイブ処理の変更：一昨日以前（昨日より前）の古いデータをアーカイブへ移動
			// state.dailyTasks のキー（日付）を全走査して判定します
			Object.keys(state.dailyTasks).forEach(dateKey => {
				if (dateKey < yesterdayStr) { // 昨日より前の日付ならアーカイブ
					archiveCompletedTasks(dateKey);
          dailyTaskListApp.saveMonthlyLog(dateKey);
				}
			});

			// 翌日分のリピートタスクを生成
			generateTomorrowRepeats();

			state.lastDate = today;
			state.viewDate = today; 

			// 先送りタスクとリピートタスクを追加後、セクション順でソートする
			if (state.dailyTasks[today] && state.dailyTasks[today].length > 0) {
				const sortedSections = [...state.sections].sort((a, b) => a.startTime.localeCompare(b.startTime));
				const sectionOrder = ['null', ...sortedSections.map(s => s.id)];

				state.dailyTasks[today].sort((a, b) => {
					const sectionIndexA = sectionOrder.indexOf(a.sectionId || 'null');
					const sectionIndexB = sectionOrder.indexOf(b.sectionId || 'null');
					return sectionIndexA - sectionIndexB;
				});
			}

			// 生成したタスクを画面に反映させる
			const tasksToday = state.dailyTasks[today] || [];
			const firstUncompletedTask = tasksToday.find(t => getTaskStatus(t) !== 'completed');
			if (firstUncompletedTask) {
				state.focusedTaskId = firstUncompletedTask.id;
			} else if (tasksToday.length > 0) {
				state.focusedTaskId = tasksToday[tasksToday.length - 1].id;
			} else {
				state.focusedTaskId = null;
			}
			saveAndRender();
		}
	}

	function archiveCompletedTasks(dateKey) {
		if (!state.dailyTasks[dateKey]) return;
		// isDeletedでない完了タスクのみをアーカイブ対象とする
		const completedTasks = state.dailyTasks[dateKey].filter(t => t.status === 'completed' && !t.isDeleted);
		if (completedTasks.length > 0) {
			if (!state.archivedTasks[dateKey]) {
				state.archivedTasks[dateKey] = [];
			}
			// 既にアーカイブにあるタスクは追加しないようにチェック
			const existingIds = new Set(state.archivedTasks[dateKey].map(t => t.id));
			const newTasksToArchive = completedTasks.filter(t => !existingIds.has(t.id));
			state.archivedTasks[dateKey].push(...newTasksToArchive);
			// isDeletedフラグが立っているタスクか、未完了のタスクのみを残す
			state.dailyTasks[dateKey] = state.dailyTasks[dateKey].filter(t => t.isDeleted || t.status !== 'completed');
		}
	}

	async function openInboxModal() {
		openModal('inbox-modal');
		const textarea = document.getElementById('inbox-textarea');
		textarea.value = '読み込み中...';
		textarea.disabled = true;

		const content = await dailyTaskListApp.fetchInboxContent();

		if (content !== null) {
			textarea.value = content;
		} else {
			textarea.value = 'エラー: Inboxの読み込みに失敗しました。';
		}
		textarea.disabled = false;
		textarea.focus();
	}

	// スワイプ機能 START
	let swipeTargetCard = null;
	let swipeBackground = null;
	let swipeStartX = 0;
	let swipeStartY = 0;
	let swipeDeltaX = 0;
	let isSwiping = false;
	let isSwipeScrollLock = false; // trueなら縦スクロール中とみなし横スワイプをロック

	const SWIPE_THRESHOLD_SHORT = 60; // 短いスワイプのしきい値 (px)
	const SWIPE_THRESHOLD_LONG = 120; // 長いスワイプのしきい値 (px)
	const SWIPE_THRESHOLD_EXTRA_LONG = 180; // さらに長いスワイプのしきい値 (px)
	const SWIPE_ICON_VISIBLE_THRESHOLD = 60; // アイコン表示を開始するしきい値 (px)

	// タッチ開始イベント
	function handleSwipeStart(e) {
		// ドラッグ中の場合はスワイプを開始しない
		if (document.body.classList.contains('dragging-active')) return;
		// 既にスワイプ中の場合は多重実行を防ぐ
		if (isSwiping) return;

		const card = e.target.closest('.task-card');
		// タスクカード以外、またはタッチ情報がなければ無視
		if (!card || !e.touches[0]) return;

		swipeTargetCard = card;
		// .task-card の直前の兄弟要素が .task-card-swipe-background
		swipeBackground = card.previousElementSibling; 
		swipeStartX = e.touches[0].clientX;
		swipeStartY = e.touches[0].clientY;
		swipeDeltaX = 0;
		isSwiping = false; // moveが始まるまではスワイプ確定ではない
		isSwipeScrollLock = false;

		// イベントリスナーを対象カードに直接追加
		swipeTargetCard.addEventListener('touchmove', handleSwipeMove, { passive: false });
		swipeTargetCard.addEventListener('touchend', handleSwipeEnd);
		swipeTargetCard.addEventListener('touchcancel', handleSwipeEnd);
	}

	// タッチ移動イベント
	function handleSwipeMove(e) {
		if (!swipeTargetCard || !e.touches[0] || isSwipeScrollLock) {
			return;
		}

		const currentX = e.touches[0].clientX;
		const currentY = e.touches[0].clientY;
		swipeDeltaX = currentX - swipeStartX;
		const deltaY = currentY - swipeStartY;

		if (!isSwiping) {
			// スワイプ開始の判定
			// 縦の動きが横の動きより大きい場合は、スワイプ（横）ではなくスクロール（縦）とみなす
			if (Math.abs(deltaY) > Math.abs(swipeDeltaX) && Math.abs(deltaY) > 10) {
				isSwipeScrollLock = true; // 縦スクロールをロック
				resetSwipeState(); // スワイプ処理を中断
				return;
			}
			// 横の動きが一定以上になったらスワイプ開始とみなす
			if (Math.abs(swipeDeltaX) > 10) {
				isSwiping = true;
				// スワイプ中はドラッグ不可にする
				swipeTargetCard.draggable = false;
				swipeTargetCard.classList.add('swiping');
				// 親要素（ページ全体）のスクロールを止める
				e.preventDefault();
			} else {
				return; // まだスワイプ開始とみなさない
			}
		}

		// スワイプ中（isSwiping = true）の処理
		e.preventDefault();

		// カードを指に追従させる
		swipeTargetCard.style.transform = `translateX(${swipeDeltaX}px)`;

		// 背景のアクション表示を更新
		const taskId = swipeTargetCard.dataset.taskId;
		updateSwipeBackground(swipeDeltaX, taskId);
	}

	/**
	* スワイプ量に応じて背景のアイコン表示を切り替える
	* @param {number} deltaX - スワイプ量
	* @param {string} taskId - タスクID
	*/
	function updateSwipeBackground(deltaX, taskId) {
		if (!swipeBackground) return;

		// 背景パネルを取得
		const bgRight = swipeBackground.querySelector('.swipe-bg-right');
		const bgLeft = swipeBackground.querySelector('.swipe-bg-left');

		// アイコンを取得
		const actions = {
			rightShort: swipeBackground.querySelector('#swipe-right-short'),
			rightLong: swipeBackground.querySelector('#swipe-right-long'),
			rightExtraLong: swipeBackground.querySelector('#swipe-right-extra-long'),
			leftShort: swipeBackground.querySelector('#swipe-left-short'),
			leftLong: swipeBackground.querySelector('#swipe-left-long'),
		};

		// タスクの状態を確認
		const tasks = getTasksForViewDate();
		const task = tasks.find(t => t.id === taskId);
		const isRunning = task && task.status === 'running';

		// 1. 全てのアイコンを非表示にし、背景色をデフォルト(短スワイプ用)に戻す
		Object.values(actions).forEach(el => el.classList.remove('visible'));
		// 右短スワイプの色をタスク状態に応じて変更
		bgRight.style.backgroundColor = isRunning ? '#ef4444' : '#22c55e'; // 実行中なら赤、そうでなければ緑
		bgLeft.style.backgroundColor = '#f59e0b'; // yellow-500

		// 2. スワイプ方向に応じて、操作対象の背景パネルのみ表示
		bgRight.style.display = (deltaX > 1) ? 'flex' : 'none'; // わずかでも動いたら表示
		bgLeft.style.display = (deltaX < -1) ? 'flex' : 'none';

		// 3. スワイプ量に応じて表示するアイコンと背景色を決定
		if (deltaX > 0) {
			// 右スワイプ
			if (deltaX > SWIPE_THRESHOLD_EXTRA_LONG) {
				actions.rightExtraLong.classList.add('visible');
				bgRight.style.backgroundColor = '#a855f7'; // ExtraLong(紫) - タスク編集
			} else if (deltaX > SWIPE_THRESHOLD_LONG) {
				actions.rightLong.classList.add('visible');
				bgRight.style.backgroundColor = '#3b82f6'; // 長(青) - メモ編集
			} else if (deltaX > SWIPE_ICON_VISIBLE_THRESHOLD) {
				// 短 - タイマー操作 (60px超えたらアイコン表示)
				actions.rightShort.classList.add('visible');
				// 背景色は上で設定済み（実行中なら赤、そうでなければ緑）
			}
		} else if (deltaX < 0) {
			// 左スワイプ
			const absDeltaX = Math.abs(deltaX);
			if (absDeltaX > SWIPE_THRESHOLD_LONG) {
				actions.leftLong.classList.add('visible');
				bgLeft.style.backgroundColor = '#ef4444'; // 長(赤) - 削除
			} else if (absDeltaX > SWIPE_ICON_VISIBLE_THRESHOLD) {
				// 短(黄) - 先送り (60px超えたらアイコン表示)
				actions.leftShort.classList.add('visible');
			}
		}
	}
	// タッチ終了イベント
	function handleSwipeEnd(e) {
		if (!swipeTargetCard) return;

		if (isSwiping) {
			const taskId = swipeTargetCard.dataset.taskId;
			let actionTriggered = false;

			// ロジック
			if (swipeDeltaX > SWIPE_THRESHOLD_EXTRA_LONG) {
				// 右スワイプ（特長）: タスク編集
				openTaskEditModal(taskId);
				actionTriggered = true;
			} else if (swipeDeltaX > SWIPE_THRESHOLD_LONG) {
				// 右スワイプ（長）: メモ編集
				openMemoEditModal(taskId);
				actionTriggered = true;
			} else if (swipeDeltaX > SWIPE_THRESHOLD_SHORT) {
				// 右スワイプ（短）: タイマー
				toggleTimer(taskId);
				actionTriggered = true;
			} else if (swipeDeltaX < -SWIPE_THRESHOLD_LONG) {
				// 左スワイプ（長）: 削除 (-150px以下)
				deleteTask(taskId); 
				actionTriggered = true; 
			} else if (swipeDeltaX < -SWIPE_THRESHOLD_SHORT) {
				// 左スワイプ（短）: 先送り (-60px 〜 -150px)
				postponeTask(taskId);
				actionTriggered = true;
			}

			// アクションが実行されたかどうかにかかわらず、カードを元の位置に戻す
			swipeTargetCard.style.transform = 'translateX(0)';

		}
		resetSwipeState();
	}

	// スワイプ状態をリセットし、カードを元の状態に戻す
	function resetSwipeState() {
		if (swipeTargetCard) {
			swipeTargetCard.classList.remove('swiping');
			swipeTargetCard.draggable = true;
			swipeTargetCard.style.transform = '';
			swipeTargetCard.removeEventListener('touchmove', handleSwipeMove);
			swipeTargetCard.removeEventListener('touchend', handleSwipeEnd);
			swipeTargetCard.removeEventListener('touchcancel', handleSwipeEnd);
		}
		if (swipeBackground) {
			// 背景のアイコンとスタイルをリセット
			const bgRight = swipeBackground.querySelector('.swipe-bg-right');
			const bgLeft = swipeBackground.querySelector('.swipe-bg-left');
			if (bgRight) {
				bgRight.style.display = 'none';
				bgRight.style.backgroundColor = '#22c55e';
			}
			if (bgLeft) {
				bgLeft.style.display = 'none';
				bgLeft.style.backgroundColor = '#f59e0b';
			}
			swipeBackground.querySelectorAll('.swipe-action-icon').forEach(el => el.classList.remove('visible'));
		}

		// グローバル変数を確実にリセット
		swipeTargetCard = null;
		swipeBackground = null;
		swipeStartX = 0;
		swipeStartY = 0;
		swipeDeltaX = 0;
		isSwiping = false;
		isSwipeScrollLock = false;
	}
	// スワイプ機能 END

	function setupEventListeners() {
		document.getElementById('bottom-nav-today-btn').addEventListener('click', () => {
			document.querySelector('.tab-link[data-tab="today"]').click();
		});
		document.getElementById('bottom-nav-repeat-btn').addEventListener('click', () => {
			document.querySelector('.tab-link[data-tab="repeat"]').click();
		});
		const fabMobile = document.getElementById('add-task-btn-floating-mobile');
		const quickOverlay = document.getElementById('quick-action-overlay');
		const quickMenu = document.getElementById('quick-action-menu');
		let longPressTimer = null;
		let isLongPressActive = false;
		fabMobile.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
			return false;
		}, true);

		// タッチ開始
		fabMobile.addEventListener('touchstart', (e) => {
			// 右クリック等の防止
			if (e.touches.length > 1) return;

			isLongPressActive = false;
			longPressTimer = setTimeout(() => {
				// --- 長押し発動 ---
				isLongPressActive = true;

				// 1. テンプレートを取得
				const templates = state.repeatTasks.filter(rt => rt.type === 'template');
				if (templates.length === 0) {
					showToast('テンプレートがありません');
					return;
				}

				// 2. バイブレーション（対応端末のみ）
				if (navigator.vibrate) navigator.vibrate(50);

				// 3. メニュー生成
				quickMenu.innerHTML = '';
				templates.forEach(tpl => {
					const item = document.createElement('div');
					item.className = 'quick-action-item';
					item.textContent = tpl.name;
					item.dataset.templateId = tpl.id;

					// プロジェクトカラーを適用
					const project = state.projects.find(p => p.id === tpl.projectId);
					if (project) item.style.borderLeftColor = project.color;

					quickMenu.appendChild(item);
				});

				// 4. 表示
				quickOverlay.style.display = 'block';
				// アニメーション用に少し遅延させる
				requestAnimationFrame(() => {
					quickOverlay.classList.add('active');
				});

			}, 500); // 0.5秒長押しで発動
		}, { passive: false });

		// 指を動かしている間 (スライド選択)
		fabMobile.addEventListener('touchmove', (e) => {
			if (!isLongPressActive) {
				// 長押し未発動で指が動いたら、長押しキャンセル（スクロール等を優先）
				clearTimeout(longPressTimer);
				return;
			}

			e.preventDefault(); // スクロール防止
			const touch = e.touches[0];

			// 指の下にある要素を取得
			const target = document.elementFromPoint(touch.clientX, touch.clientY);

			// ハイライト処理
			document.querySelectorAll('.quick-action-item').forEach(el => el.classList.remove('hovered'));
			if (target && target.classList.contains('quick-action-item')) {
				target.classList.add('hovered');
				// 軽いフィードバック（任意）
				// if (navigator.vibrate) navigator.vibrate(5); 
			}
		}, { passive: false });

		// 指を離した時 (決定 or キャンセル)
		fabMobile.addEventListener('touchend', (e) => {
			clearTimeout(longPressTimer);

			if (isLongPressActive) {
				// --- 長押しモード終了処理 ---
				e.preventDefault();

				// 最後に指が乗っていた要素を探す
				const touch = e.changedTouches[0];
				const target = document.elementFromPoint(touch.clientX, touch.clientY);

				if (target && target.classList.contains('quick-action-item')) {
					// テンプレート登録実行
					const tplId = target.dataset.templateId;
					const tpl = state.repeatTasks.find(t => t.id === tplId);
					if (tpl) {
						const currentSection = getCurrentSection();
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
						showToast(`「${tpl.name}」を追加しました`);
						if (navigator.vibrate) navigator.vibrate(100); // 成功バイブ
					}
				}

				// 閉じる
				quickOverlay.classList.remove('active');
				setTimeout(() => {
					quickOverlay.style.display = 'none';
					quickMenu.innerHTML = ''; // クリーンアップ
				}, 200);

			} else {
				// --- 普通のタップ ---
				// 長押しタイマーが発火する前に指を離した -> 通常のモーダルオープン
				openAddTaskModal();
			}
			isLongPressActive = false;
		});

		// タッチキャンセル時（画面外に出たなど）
		fabMobile.addEventListener('touchcancel', () => {
			clearTimeout(longPressTimer);
			isLongPressActive = false;
			quickOverlay.classList.remove('active');
			quickOverlay.style.display = 'none';
		});

		tabs.forEach(tab => {
			tab.addEventListener('click', () => {
				const tabName = tab.dataset.tab;
				if (!tabName) return;
				if (['repeat', 'sections', 'projects', 'archive', 'data'].includes(tabName)) {
					window.scrollTo(0, 0);
				}

				tabs.forEach(t => t.classList.remove('active'));
				document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
				document.querySelectorAll(`.tab-link[data-tab="${tabName}"]`).forEach(matchingTab => {
					matchingTab.classList.add('active');
				});
				document.getElementById(tabName).classList.add('active');

				// 一括削除ボタンの表示/非表示をタブに連動させる
				const deleteAllBtn = document.getElementById('delete-all-tasks-btn');
				if (deleteAllBtn) {
					deleteAllBtn.classList.toggle('hidden', tabName !== 'today');
				}

				// ボトムバーのアクティブ状態を更新
				const todayBtn = document.getElementById('bottom-nav-today-btn');
				const repeatBtn = document.getElementById('bottom-nav-repeat-btn');
				if (todayBtn) todayBtn.classList.toggle('active', tabName === 'today');
				if (repeatBtn) repeatBtn.classList.toggle('active', tabName === 'repeat');
				if (tabName === 'today') {
					const tasks = getTasksForViewDate();
					const firstUncompletedTask = tasks.find(t => getTaskStatus(t) !== 'completed');
					if (firstUncompletedTask) {
						state.focusedTaskId = firstUncompletedTask.id;
					} else if (tasks.length > 0) {
						state.focusedTaskId = tasks[tasks.length - 1].id;
					} else {
						state.focusedTaskId = null;
					}
				} else if (tabName === 'repeat') {
					const firstUnsectionedTask = state.repeatTasks.find(rt => !rt.sectionId || rt.sectionId === 'null');

					if (firstUnsectionedTask) {
						state.focusedRepeatTaskId = firstUnsectionedTask.id;
					} else if (!state.focusedRepeatTaskId && state.repeatTasks.length > 0) {
						state.focusedRepeatTaskId = state.repeatTasks[0].id;
					} else if (state.repeatTasks.length === 0) {
						state.focusedRepeatTaskId = null;
					}
				} else if (tabName === 'archive') {
					if (!state.archiveViewDate) {
						const yesterday = new Date();
						yesterday.setDate(yesterday.getDate() - 1);
						state.archiveViewDate = getFormattedDate(yesterday);
					}
				}
				render({ scroll: true });
				tab.blur();
			});
		});
		document.querySelector('.tab-link[data-tab="today"]').click();
		if (document.getElementById('bottom-nav-today-btn')) document.getElementById('bottom-nav-today-btn').classList.add('active');

		const toggleBtn = document.getElementById('repeat-form-toggle');
		const content = document.getElementById('repeat-form-content');
		const chevron = document.getElementById('repeat-form-chevron');
		if (toggleBtn && content && chevron) {
			toggleBtn.addEventListener('click', () => {
				const isHidden = content.classList.toggle('hidden');
				// アイコンの回転
				chevron.classList.toggle('rotate-180', !isHidden);
			});
		}

		document.getElementById('add-project-btn').addEventListener('click', addProject);
		document.getElementById('add-section-btn').addEventListener('click', addSection);
		document.getElementById('inbox-btn').addEventListener('click', openInboxModal);
		document.getElementById('delete-all-tasks-btn').addEventListener('click', deleteAllTasksForViewDate);
		document.getElementById('save-inbox-btn').addEventListener('click', async () => {
			const textarea = document.getElementById('inbox-textarea');
			textarea.disabled = true; // 保存中は無効化
			const success = await dailyTaskListApp.saveInboxContent(textarea.value);
			if (success) {
				showToast('Inboxを保存しました。');
				closeModal('inbox-modal');
			}
			textarea.disabled = false;
		});
		document.getElementById('cancel-inbox-btn').addEventListener('click', () => closeModal('inbox-modal'));
		document.getElementById('add-repeat-task-btn').addEventListener('click', addRepeatTask);
		document.getElementById('generate-from-repeat-btn').addEventListener('click', generateTasksFromRepeatManual);

		// リピートタスク追加フォームのUI制御
		document.getElementById('repeat-task-type').addEventListener('change', (e) => {
			const value = e.target.value;
			document.getElementById('repeat-weekly-options').classList.toggle('hidden', value !== 'weekly');
			document.getElementById('repeat-monthly-options').classList.toggle('hidden', value !== 'monthly');
			document.getElementById('repeat-yearly-options').classList.toggle('hidden', value !== 'yearly');
			document.getElementById('repeat-interval-options').classList.toggle('hidden', value !== 'interval');

			if (value === 'interval' || value === 'weekly') {
				const startDateInput = document.getElementById(value === 'interval' ? 'repeat-interval-start-date' : 'repeat-weekly-start-date');
				if (!startDateInput.value) {
					startDateInput.value = new Date().toISOString().slice(0, 10);
				}
			}
		});

		document.querySelectorAll('input[name="repeat-monthly-type"]').forEach(radio => {
			radio.addEventListener('change', (e) => {
				const isDayType = e.target.value === 'day';
				document.getElementById('repeat-monthly-day-options').classList.toggle('hidden', !isDayType);
				document.getElementById('repeat-monthly-weekday-options').classList.toggle('hidden', isDayType);
			});
		});


		document.getElementById('prev-day-btn').addEventListener('click', () => moveViewDate(-1));
		document.getElementById('next-day-btn').addEventListener('click', () => moveViewDate(1));

		document.getElementById('export-data-btn').addEventListener('click', exportData);
		document.getElementById('import-data-btn').addEventListener('click', importData);
		document.getElementById('clear-data-btn').addEventListener('click', clearAllData);
		document.getElementById('bottom-nav-inbox')?.addEventListener('click', openInboxModal);

		// PC用ボタン (ID: sync-data-fab)
		const pcSyncBtn = document.getElementById('sync-data-fab');
		if (pcSyncBtn) {
			pcSyncBtn.addEventListener('click', () => {
				dailyTaskListApp.loadStateFromDropbox(true);
			});
		}

		// モバイル用ボタン (ID: bottom-nav-dropbox-import)
		const mobileSyncBtn = document.getElementById('bottom-nav-dropbox-import');
		if (mobileSyncBtn) {
			mobileSyncBtn.addEventListener('click', () => {
				dailyTaskListApp.loadStateFromDropbox(true);
			});
		}

		setupModalEvents();

		function autoHeightListener(event) {
			// 高さを一度リセットしてからスクロール量に合わせて再設定
			event.target.style.height = 'auto';
			event.target.style.height = (event.target.scrollHeight) + 'px';
		}
		document.getElementById('edit-task-memo').addEventListener('input', autoHeightListener);
		document.getElementById('edit-repeat-memo').addEventListener('input', autoHeightListener);
		document.addEventListener('keydown', handleKeyboardShortcuts);
		document.addEventListener('mouseover', (e) => {
			const tooltipContainer = e.target.closest('.tooltip-container');
			if (tooltipContainer) {
				setTimeout(() => positionTooltip(tooltipContainer), 10);
			}
		});
	}

	function setupModalEvents() {
		document.getElementById('save-new-task-btn').addEventListener('click', () => {
			addTask(
				document.getElementById('new-task-name').value,
				document.getElementById('new-task-time').value,
				document.getElementById('new-task-project').value,
				document.getElementById('new-task-section').value
			);
			closeModal('add-task-modal');
		});
		document.getElementById('cancel-add-task-btn').addEventListener('click', () => closeModal('add-task-modal'));

		document.getElementById('save-task-edit').addEventListener('click', saveTaskEdit);
		document.getElementById('cancel-task-edit').addEventListener('click', () => closeModal('task-edit-modal'));
		document.getElementById('create-repeat-from-task').addEventListener('click', createRepeatFromTask);

		document.getElementById('edit-memo-text').addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				saveMemoEdit();
			}
		});
		document.getElementById('save-memo-edit').addEventListener('click', saveMemoEdit);
		document.getElementById('cancel-memo-edit').addEventListener('click', () => closeModal('memo-edit-modal'));

		document.getElementById('save-repeat-edit').addEventListener('click', saveRepeatEdit);
		document.getElementById('cancel-repeat-edit').addEventListener('click', () => closeModal('repeat-edit-modal'));
		document.getElementById('edit-repeat-type').addEventListener('change', (e) => {
			const value = e.target.value;
			document.getElementById('edit-repeat-weekly-options').classList.toggle('hidden', value !== 'weekly');
			document.getElementById('edit-repeat-monthly-options').classList.toggle('hidden', value !== 'monthly');
			document.getElementById('edit-repeat-yearly-options').classList.toggle('hidden', value !== 'yearly');
			document.getElementById('edit-repeat-interval-options').classList.toggle('hidden', value !== 'interval');
			if (value === 'interval') {
				const startDateInput = document.getElementById('edit-repeat-interval-start-date');
				if (!startDateInput.value) {
					startDateInput.value = new Date().toISOString().slice(0, 10);
				}
			}
		});

		document.getElementById('new-task-name').addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				if (document.getElementById('new-task-name').value.trim() === '') {
					closeModal('add-task-modal');
				} else {
					document.getElementById('save-new-task-btn').click();
				}
			}
		});
		document.getElementById('new-task-time').addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				if (document.getElementById('new-task-name').value.trim() === '') {
					closeModal('add-task-modal');
				} else {
					document.getElementById('save-new-task-btn').click();
				}
			}
		});

		document.getElementById('edit-task-name').addEventListener('keydown', (e) => {
			if (e.key === 'Enter') { e.preventDefault(); saveTaskEdit(); }
		});
		document.getElementById('edit-task-time').addEventListener('keydown', (e) => {
			if (e.key === 'Enter') { e.preventDefault(); saveTaskEdit(); }
		});
		document.getElementById('edit-task-startTime').addEventListener('keydown', (e) => {
			if (e.key === 'Enter') { e.preventDefault(); saveTaskEdit(); }
		});
		document.getElementById('edit-task-endTime').addEventListener('keydown', (e) => {
			if (e.key === 'Enter') { e.preventDefault(); saveTaskEdit(); }
		});
		document.getElementById('edit-repeat-name').addEventListener('keydown', (e) => {
			if (e.key === 'Enter') { e.preventDefault(); saveRepeatEdit(); }
		});

		document.getElementById('edit-repeat-time').addEventListener('keydown', (e) => {
			if (e.key === 'Enter') { e.preventDefault(); saveRepeatEdit(); }
		});

		document.getElementById('inbox-textarea').addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				document.getElementById('save-inbox-btn').click();
			}
		});

    // リピートタスク追加フォーム - 毎月の日付追加
    document.getElementById('add-monthly-day-btn').addEventListener('click', () => {
      const input = document.getElementById('repeat-monthly-day-input');
      const day = parseInt(input.value, 10);
      if (isNaN(day) || day < 1 || day > 31) {
        alert('1～31の日付を入力してください。');
        return;
      }
      addMonthlyDayChip(day, 'repeat-monthly-days-list');
      input.value = '';
    });

    // リピートタスク追加フォーム - 毎年の日付追加
    document.getElementById('add-yearly-date-btn').addEventListener('click', () => {
      const monthInput = document.getElementById('repeat-yearly-month-input');
      const dayInput = document.getElementById('repeat-yearly-day-input');
      const month = parseInt(monthInput.value, 10);
      const day = parseInt(dayInput.value, 10);
      if (isNaN(month) || month < 1 || month > 12 || isNaN(day) || day < 1 || day > 31) {
        alert('有効な月日を入力してください。');
        return;
      }
      addYearlyDateChip(month, day, 'repeat-yearly-dates-list');
      monthInput.value = '';
      dayInput.value = '';
    });

    // リピートタスク編集モーダル - 毎月の日付追加
    document.getElementById('edit-add-monthly-day-btn').addEventListener('click', () => {
      const input = document.getElementById('edit-repeat-monthly-day-input');
      const day = parseInt(input.value, 10);
      if (isNaN(day) || day < 1 || day > 31) {
        alert('1～31の日付を入力してください。');
        return;
      }
      addMonthlyDayChip(day, 'edit-repeat-monthly-days-list');
      input.value = '';
    });

    // リピートタスク編集モーダル - 毎年の日付追加
    document.getElementById('edit-add-yearly-date-btn').addEventListener('click', () => {
      const monthInput = document.getElementById('edit-repeat-yearly-month-input');
      const dayInput = document.getElementById('edit-repeat-yearly-day-input');
      const month = parseInt(monthInput.value, 10);
      const day = parseInt(dayInput.value, 10);
      if (isNaN(month) || month < 1 || month > 12 || isNaN(day) || day < 1 || day > 31) {
        alert('有効な月日を入力してください。');
        return;
      }
      addYearlyDateChip(month, day, 'edit-repeat-yearly-dates-list');
      monthInput.value = '';
      dayInput.value = '';
    });

		document.querySelectorAll('.modal').forEach(modal => {
			modal.addEventListener('click', (e) => {
				if (e.target === modal) closeModal(modal.id);
			});
		});
	}

	function render(options = {}) {
		const activeTab = document.querySelector('.tab-link.active').dataset.tab;
		if (activeTab === 'today') renderTodayTasks(options);
		else if (activeTab === 'repeat') renderRepeatTasks();
		else if (activeTab === 'sections') renderSections();
		else if (activeTab === 'projects') renderProjects();
		updateProjectDropdowns();
		updateSectionDropdowns();
		calculateAllEstimates();
		updateTitle();
	}

	function setupDragAndDrop(selector, list, type = 'daily') {
		let draggedIndex = null;
		let isDragging = false;

		// ドラッグ開始時にクラスを追加
		function addDraggingClass() {
			if (!isDragging) {
				isDragging = true;
				document.body.classList.add('dragging-active');
				// 少し遅延させてから要素を再取得してイベントリスナーを追加
				setTimeout(() => {
					attachDropTargetListeners();
				}, 50);
			}
		}

		// ドラッグ終了時にクラスを削除
		function removeDraggingClass() {
			if (isDragging) {
				isDragging = false;
				document.body.classList.remove('dragging-active');
			}
		}

		// 空のドロップターゲットにイベントリスナーを追加
		function attachDropTargetListeners() {
			const emptyTargets = document.querySelectorAll('.empty-section-drop-target');
			emptyTargets.forEach(el => {
				if (el.dataset.listenersAttached) return;
				el.dataset.listenersAttached = 'true';

				el.addEventListener('dragover', handleDragOver);
				el.addEventListener('dragleave', handleDragLeave);
				el.addEventListener('drop', handleDrop);
			});
		}

		function handleDragOver(e) {
			e.preventDefault();
			const target = e.target.closest(selector + ', .empty-section-drop-target');
			if (target) {
				const targetIndex = target.dataset.index ? parseInt(target.dataset.index, 10) : -1;
				if (targetIndex !== draggedIndex) {
					document.querySelectorAll('.drag-over').forEach(item => item.classList.remove('drag-over'));
					target.classList.add('drag-over');
				}
			}
		}

		function handleDragLeave(e) {
			e.target.closest(selector + ', .empty-section-drop-target')?.classList.remove('drag-over');
		}

		function handleDrop(e) {
			e.preventDefault();
			const target = e.target.closest(selector + ', .empty-section-drop-target');
			if (!target) return;
			target.classList.remove('drag-over');

			const fromIndex = draggedIndex;
			if (fromIndex === null) return;

			const movedItem = list.splice(fromIndex, 1)[0];

			if (target.classList.contains('empty-section-drop-target')) {
				const targetSectionId = target.dataset.sectionId;
				movedItem.sectionId = (targetSectionId === 'null') ? null : targetSectionId;

				const sortedSections = [...state.sections].sort((a, b) => a.startTime.localeCompare(b.startTime));
				const sectionOrder = ['null', ...sortedSections.map(s => s.id)];
				const targetSectionOrderIndex = sectionOrder.indexOf(targetSectionId);

				let insertIndex = list.length;
				let firstTaskInNextSectionIndex = -1;

				for (let i = 0; i < list.length; i++) {
					const taskSectionOrderIndex = sectionOrder.indexOf(list[i].sectionId || 'null');
					if (taskSectionOrderIndex > targetSectionOrderIndex) {
						firstTaskInNextSectionIndex = i;
						break;
					}
				}
				if (firstTaskInNextSectionIndex !== -1) {
					insertIndex = firstTaskInNextSectionIndex;
				}
				list.splice(insertIndex, 0, movedItem);

			} else {
				const toIndex = parseInt(target.dataset.index, 10);
				const targetSectionId = target.dataset.sectionId;
				if (targetSectionId && movedItem.sectionId !== targetSectionId) {
					movedItem.sectionId = (targetSectionId === 'null') ? null : targetSectionId;
				}
				list.splice(toIndex, 0, movedItem);
			}

			if (type === 'daily') {
				setTasksForViewDate(list);
			} else if (type === 'repeat') {
				state.repeatTasks = list;
			} else if (type === 'project') {
				state.projects = list;
			}

			removeDraggingClass();
			saveAndRender({ noScroll: true });
		}

		// 通常のタスク要素にイベントリスナーを追加
		const elements = document.querySelectorAll(selector);
		elements.forEach(el => {
			el.addEventListener('dragstart', (e) => {
				draggedIndex = parseInt(el.dataset.index, 10);
				e.dataTransfer.setData('text/plain', draggedIndex);

				const rect = el.getBoundingClientRect();

				const pointerX = (typeof e.clientX === 'number') ? e.clientX : (rect.left + rect.width / 2);
				const pointerY = (typeof e.clientY === 'number') ? e.clientY : (rect.top + rect.height / 2);
				let offsetX = Math.round(pointerX - rect.left);
				let offsetY = Math.round(pointerY - rect.top);

				const dragImage = el.cloneNode(true);
				dragImage.style.position = 'absolute';
				dragImage.style.top = '-9999px';
				dragImage.style.left = '-9999px';
				dragImage.style.width = el.offsetWidth + 'px';
				dragImage.style.boxSizing = 'border-box';
				dragImage.style.background = '#ffffff';

				const originalCells = el.querySelectorAll('td, th');
				const clonedCells = dragImage.querySelectorAll('td, th');
				originalCells.forEach((cell, index) => {
					if (clonedCells[index]) {
						clonedCells[index].style.width = cell.offsetWidth + 'px';
						clonedCells[index].style.minWidth = cell.offsetWidth + 'px';
						clonedCells[index].style.maxWidth = cell.offsetWidth + 'px';
						clonedCells[index].style.boxSizing = 'border-box';
					}
				});

				dragImage.querySelectorAll('.custom-tooltip').forEach(tip => tip.remove());
				document.body.appendChild(dragImage);

				const imgWidth = dragImage.offsetWidth || rect.width;
				const imgHeight = dragImage.offsetHeight || rect.height;

				if (offsetX < 0) offsetX = 0;
				if (offsetY < 0) offsetY = 0;
				if (offsetX > imgWidth) offsetX = imgWidth;
				if (offsetY > imgHeight) offsetY = imgHeight;

				try {
					e.dataTransfer.setDragImage(dragImage, offsetX, offsetY);
				} catch (err) {
					e.dataTransfer.setDragImage(dragImage, 0, 0);
				}

				setTimeout(() => {
					el.classList.add('dragging');
					addDraggingClass();
					if (dragImage.parentElement) document.body.removeChild(dragImage);
				}, 0);
			});

			el.addEventListener('dragend', () => {
				el.classList.remove('dragging');
				draggedIndex = null;
				removeDraggingClass();
				document.querySelectorAll('.drag-over').forEach(item => item.classList.remove('drag-over'));

				// リスナーのフラグをリセット
				document.querySelectorAll('.empty-section-drop-target').forEach(target => {
					delete target.dataset.listenersAttached;
				});
			});

			el.addEventListener('dragover', handleDragOver);
			el.addEventListener('dragleave', handleDragLeave);
			el.addEventListener('drop', handleDrop);
		});
	}

	function updateProjectDropdowns() {
		const selects = document.querySelectorAll('#new-task-project, #repeat-task-project, #edit-task-project, #edit-repeat-project');
		selects.forEach(select => {
			const cur = select.value;
			select.innerHTML = '<option value="">プロジェクトなし</option>' + state.projects.filter(p => !p.isArchived).map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
			if (cur) select.value = cur;
		});
	}

	function deleteAllTasksForViewDate() {
		const tasks = getTasksForViewDate(); // これは !isDeleted なタスクのみを返す
		if (tasks.length === 0) {
			alert('削除するタスクがありません。');
			return;
		}

		if (!confirm(`表示中の日（${state.viewDate}）のタスク ${tasks.length} 件をすべて削除しますか？\nこの操作は元に戻せません。`)) {
			return;
		}

		// 実行中のタスクがあれば停止
		if (state.activeTaskId && tasks.some(t => t.id === state.activeTaskId)) {
			stopActiveTimer();
		}

		const allTasksForDate = state.dailyTasks[state.viewDate] || [];
		const now = new Date().toISOString();
		let deletedCount = 0;

		allTasksForDate.forEach(task => {
			if (!task.isDeleted) {
				task.isDeleted = true;
				task.updatedAt = now;
				deletedCount++;
			}
		});

		if (deletedCount > 0) {
			state.focusedTaskId = null;
			saveAndRender();
			showToast(`${deletedCount} 件のタスクを削除しました。`);
		} else {
			alert('削除するタスクがありませんでした。');
		}
	}

	function exportData() {
		const exportData = {
			dailyTasks: state.dailyTasks,
			projects: state.projects,
			repeatTasks: state.repeatTasks,
			sections: state.sections,
			archivedTasks: state.archivedTasks,
			lastDate: state.lastDate,
			exportDate: new Date().toISOString()
		};

		const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `dtl_export_${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(url);

		alert('データをエクスポートしました。');
	}

	function importData() {
		const fileInput = document.getElementById('import-file');
		const file = fileInput.files[0];
		if (!file) return alert('インポートするファイルを選択してください。');

		if (!confirm('データをインポートします。IDが重複するデータは上書きされます。よろしいですか?')) return;

		const reader = new FileReader();
		reader.onload = (e) => {
			try {
				const importedData = JSON.parse(e.target.result);

				// セクション情報の復元
				if (importedData.sections && Array.isArray(importedData.sections)) {
					const sectionMap = new Map(state.sections.map(s => [s.id, s]));
					importedData.sections.forEach(s => sectionMap.set(s.id, s));
					state.sections = Array.from(sectionMap.values());
					// セクションを開始時刻でソート
					state.sections.sort((a, b) => a.startTime.localeCompare(b.startTime));
				}

				Object.assign(state.dailyTasks, importedData.dailyTasks || {});
				Object.assign(state.archivedTasks, importedData.archivedTasks || {});

				if (importedData.projects && Array.isArray(importedData.projects)) {
					const projectMap = new Map(state.projects.map(p => [p.id, p]));
					importedData.projects.forEach(p => projectMap.set(p.id, p));
					state.projects = Array.from(projectMap.values());
				}

				if (importedData.repeatTasks && Array.isArray(importedData.repeatTasks)) {
					const repeatTaskMap = new Map(state.repeatTasks.map(rt => [rt.id, rt]));
					importedData.repeatTasks.forEach(rt => repeatTaskMap.set(rt.id, rt));
					state.repeatTasks = Array.from(repeatTaskMap.values());
				}

				state.lastDate = importedData.lastDate || state.lastDate;

				stopActiveTimer();
				state.viewDate = getFormattedDate(new Date());
				const tasksToday = getTasksForViewDate();

				const firstUncompletedTask = tasksToday.find(t => getTaskStatus(t) !== 'completed');
				if (firstUncompletedTask) {
					// 未完了タスクがあれば、その最初のタスクを選択
					state.focusedTaskId = firstUncompletedTask.id;
				} else if (tasksToday.length > 0) {
					// 未完了タスクがなく、タスクが1件以上あれば、リストの最後のタスクを選択
					state.focusedTaskId = tasksToday[tasksToday.length - 1].id;
				} else {
					// タスクがなければ選択しない
					state.focusedTaskId = null;
				}

				Object.values(state.dailyTasks).flat().forEach(task => updateTaskStatus(task));

				saveAndRender();
				alert('データをインポートしました。');
				fileInput.value = '';
			} catch (error) {
				alert('無効なファイル形式です。正しいJSONファイルを選択してください。');
				console.error('Import error:', error);
			}
		};
		reader.readAsText(file);
	}

	function clearAllData() {
		if (!confirm('本当に全てのデータを削除しますか？この操作は元に戻せません。')) return;
		if (!confirm('最終確認！全てのタスク、プロジェクト、履歴データが削除されます。')) return;

		Object.keys(localStorage).forEach(key => {
			if (key.startsWith('dtl_')) localStorage.removeItem(key);
		});

		location.reload();
	}

	function calculateAllEstimates() {
		const now = new Date();
		const allTasks = getTasksForViewDate();
		const unfinishedTasks = allTasks.filter(t => t.status !== 'completed');

		const completedTasksCount = allTasks.length - unfinishedTasks.length;
		const totalTasksCount = allTasks.length;
		const completedStatsEls = document.querySelectorAll('#completed-tasks-stats, #completed-tasks-stats-desktop');

		completedStatsEls.forEach(el => {
			if (el) {
				if (totalTasksCount > 0) {
					el.textContent = `${completedTasksCount}/${totalTasksCount}`;
				} else {
					el.textContent = '0/0';
				}
			}
		});
		const totalRemainingMinutes = unfinishedTasks.reduce((sum, task) => sum + (task.estimatedTime || 0), 0);

		const endTimeText = totalRemainingMinutes > 0 ? formatClockTime(new Date(now.getTime() + totalRemainingMinutes * 60 * 1000)) : '完了';
		totalEstimatedEndTimeEls.forEach(el => {
			if(el) el.textContent = endTimeText;
		});
	}

	function updateFocus(newFocusedInfo = {}) {
		const { taskId, subtaskId, repeatTaskId } = newFocusedInfo;

		const activeTab = document.querySelector('.tab-link.active').dataset.tab;

		// 1. 古いフォーカスをDOMから削除
		document.querySelectorAll('.focused').forEach(el => el.classList.remove('focused'));

		let focusedElement = null;

		if (activeTab === 'today') {
			// 2. stateを更新
			state.focusedTaskId = taskId || null;
			state.focusedSubtaskId = subtaskId || null;
			state.focusedRepeatTaskId = null; // 他のタブのフォーカスはクリア

			// 3. 新しいフォーカスをDOMに適用
			if (taskId && subtaskId) {
				// サブタスクを探す
				focusedElement = document.querySelector(`.subtask-item[data-subtask-id="${subtaskId}"]`);
			} else if (taskId) {
				// 親タスクを探す (PCテーブル or スマホカード)
				focusedElement = document.querySelector(`.task-row[data-task-id="${taskId}"], .task-card[data-task-id="${taskId}"]`);
			}
		} else if (activeTab === 'repeat') {
			// 2. stateを更新
			state.focusedRepeatTaskId = repeatTaskId || null;
			state.focusedTaskId = null; // 他のタブのフォーカスはクリア
			state.focusedSubtaskId = null;

			// 3. 新しいフォーカスをDOMに適用
			if (repeatTaskId) {
				focusedElement = document.querySelector(`.repeat-task-row[data-id="${repeatTaskId}"]`);
			}
		}

		if (focusedElement) {
			focusedElement.classList.add('focused');

			// 4. スクロール判定
			const rect = focusedElement.getBoundingClientRect();
			const viewportHeight = window.innerHeight;

			// 要素が画面上部より上にある
			if (rect.top < 0) {
				focusedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
			}
				// 要素が画面下部より下にある
			else if (rect.bottom > viewportHeight) {
				focusedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
			}
		}
	}

	function moveViewDate(direction) {
		// 制限用の日付計算
		const limitDate = new Date();
		limitDate.setDate(limitDate.getDate() + 2);
		const limitDateStr = getFormattedDate(limitDate);

		const yesterdayObj = new Date();
		yesterdayObj.setDate(yesterdayObj.getDate() - 1);
		const yesterdayStr = getFormattedDate(yesterdayObj);

		// 未来方向の制限 (明後日以降へは行けない)
		if (direction === 1 && state.viewDate >= limitDateStr) {
			return; 
		}
		// 過去方向の制限 (昨日より前へは行けない)
		if (direction === -1 && state.viewDate <= yesterdayStr) {
			return;
		}

		const currentDate = new Date(state.viewDate);
		currentDate.setDate(currentDate.getDate() + direction);
		state.viewDate = getFormattedDate(currentDate);

		const tasks = getTasksForViewDate();
		const firstUncompletedTask = tasks.find(t => getTaskStatus(t) !== 'completed');
		if (firstUncompletedTask) {
			state.focusedTaskId = firstUncompletedTask.id;
		} else if (tasks.length > 0) {
			state.focusedTaskId = tasks[tasks.length - 1].id;
		} else {
			state.focusedTaskId = null;
		}
		renderTodayTasks({ scroll: true });
	}

	function saveAndRender(options = {}) { updateSortOrderAndTimestamps(state.viewDate); saveState(); render(options); updateTitle(); }
	function updateTimeDisplays() {
		const dateText = new Date().toLocaleString('ja-JP', { year:'numeric', month:'long', day:'numeric', weekday:'long' });
		currentDateEls.forEach(el => {
			if(el) el.textContent = dateText;
		});
		calculateAllEstimates();
	}

	function renderPcAddTaskButton() {
		const container = document.getElementById('add-task-floating-container');
		if (!container) return;

		container.innerHTML = `
            <button id="add-task-btn-floating" class="fab bg-blue-600 hover:bg-blue-700 text-white text-3xl font-bold">
                ＋
            </button>`;

		container.querySelector('#add-task-btn-floating').addEventListener('click', openAddTaskModal);
	}

	init();
});

// ウィンドウ（タブ）にフォーカスが戻った際に、Dropboxから最新状態を読み込む
window.addEventListener('focus', () => {
	// Dropboxトークンがあり、かつアプリが初期化されている場合
	if (window.dailyTaskListApp && localStorage.getItem('dropbox_access_token')) {

		// 前回同期から5分（300,000ミリ秒）経過しているかチェック
		const now = Date.now();
		const fiveMinutes = 5 * 60 * 1000;

		// 前回の同期から5分経っていなければ、読み込みをスキップしてログを出す
		if (window.dailyTaskListApp.lastSyncTime && (now - window.dailyTaskListApp.lastSyncTime < fiveMinutes)) {
			console.log('Taskrono: Auto-sync skipped (synced within last 5 minutes).');
			return;
		}

		console.log('Taskrono: Starting auto-sync on focus.');
		dailyTaskListApp.loadStateFromDropbox(false).then(() => {
			if (typeof render === 'function') {
				render();
			}
		}).catch(err => {
			console.error('Taskrono: Auto-sync failed on focus', err);
		});
	}
});
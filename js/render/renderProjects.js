// js/render/renderProjects.js
import { state } from '../state.js';
import { escapeHtml } from '../utils.js';
import { editProject, deleteProject, archiveProject, unarchiveProject } from '../projects.js';

export const renderProjectsCallbacks = {
    isMobile: null,
    setupDragAndDrop: null,
};

export function renderProjects() {
    const container = document.getElementById('projects-container');
    const activeProjects = state.projects.filter(p => !p.isArchived);
    const archivedProjects = state.projects.filter(p => p.isArchived);

    const createTable = (projects, isArchived) => {
        if (projects.length === 0) return '<p class="text-gray-500 text-sm py-4">該当するプロジェクトはありません。</p>';

        const headers = `
            <thead class="bg-gray-500 text-white">
                <tr>
                    <th class="py-1 px-2 text-sm w-8"></th>
                    <th class="py-1 px-2 text-sm w-10">色</th>
                    <th class="py-1 px-4 text-sm text-left">プロジェクト名</th>
                    <th class="py-1 px-4 text-sm">操作</th>
                </tr>
            </thead>`;

        const rows = projects.map((p) => {
            const buttons = isArchived
                ? `
                    <button class="unarchive-project-btn text-gray-400 hover:text-green-500 p-1" data-id="${p.id}" title="アクティブに戻す">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2.153m15.357 2.153H15" /></svg>
                    </button>
                    <button class="delete-project-btn text-gray-400 hover:text-red-500 p-1" data-id="${p.id}" title="完全に削除">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1H9a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                `
                : `
                    <button class="edit-project-btn text-gray-400 hover:text-blue-500 p-1" data-id="${p.id}" title="編集">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button class="archive-project-btn text-gray-400 hover:text-yellow-600 p-1" data-id="${p.id}" title="アーカイブ">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z" /><path fill-rule="evenodd" d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clip-rule="evenodd" /></svg>
                    </button>
                    <button class="delete-project-btn text-gray-400 hover:text-red-500 p-1" data-id="${p.id}" title="削除">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1H9a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                `;
            const originalIndex = state.projects.findIndex(proj => proj.id === p.id);
            return `
                <tr class="border-b project-row" data-id="${p.id}" data-index="${originalIndex}" draggable="true">
                    <td class="p-2 text-center"><span class="drag-handle">⋮⋮</span></td>
                    <td class="p-2 text-center"><span class="inline-block w-4 h-4 rounded-full" style="background-color: ${p.color};"></span></td>
                    <td class="py-2 px-4">${escapeHtml(p.name)}</td>
                    <td class="p-2 text-center space-x-1">${buttons}</td>
                </tr>
            `;
        }).join('');

        return `<div class="overflow-x-auto shadow-md">
            <table class="min-w-full bg-white">
                ${headers}
                <tbody>${rows}</tbody>
            </table>
        </div>`;
    };

    container.innerHTML = `
        <div>
            <h3 class="text-lg font-semibold text-gray-700 mb-2">アクティブなプロジェクト</h3>
            ${createTable(activeProjects, false)}
        </div>
        <div class="mt-8">
            <h3 class="text-lg font-semibold text-gray-700 mb-2">アーカイブ済みのプロジェクト</h3>
            ${createTable(archivedProjects, true)}
        </div>
    `;

    renderProjectsCallbacks.setupDragAndDrop('.project-row', state.projects, 'project');

    container.querySelectorAll('.edit-project-btn').forEach(btn =>
        btn.addEventListener('click', (e) => editProject(e.currentTarget.dataset.id))
    );
    container.querySelectorAll('.delete-project-btn').forEach(btn =>
        btn.addEventListener('click', (e) => deleteProject(e.currentTarget.dataset.id))
    );
    container.querySelectorAll('.archive-project-btn').forEach(btn =>
        btn.addEventListener('click', (e) => archiveProject(e.currentTarget.dataset.id))
    );
    container.querySelectorAll('.unarchive-project-btn').forEach(btn =>
        btn.addEventListener('click', (e) => unarchiveProject(e.currentTarget.dataset.id))
    );
}
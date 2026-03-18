// js/projects.js
import { state } from './state.js';

export const projectCallbacks = {
    saveAndRender: null,
};

export function addProject() {
    const name = document.getElementById('project-name').value.trim();
    const color = document.getElementById('project-color').value;
    if (!name) { alert('プロジェクト名を入力してください。'); return; }
    state.projects.push({ id: 'p' + Date.now(), name, color, isArchived: false });
    document.getElementById('project-name').value = '';
    projectCallbacks.saveAndRender();
}

export function archiveProject(id) {
    const project = state.projects.find(p => p.id === id);
    if (project && confirm(`プロジェクト「${project.name}」をアーカイブしますか？`)) {
        project.isArchived = true;
        projectCallbacks.saveAndRender();
    }
}

export function unarchiveProject(id) {
    const project = state.projects.find(p => p.id === id);
    if (project) {
        project.isArchived = false;
        projectCallbacks.saveAndRender();
    }
}

export function deleteProject(id) {
    const project = state.projects.find(p => p.id === id);
    if (!project) return;
    const confirmMessage = project.isArchived
        ? `アーカイブ済みのプロジェクト「${project.name}」を完全に削除しますか？この操作は元に戻せません。`
        : `プロジェクト「${project.name}」を削除しますか？関連するタスクからプロジェクト設定が解除されます。`;
    if (!confirm(confirmMessage)) return;

    state.projects = state.projects.filter(p => p.id !== id);
    Object.values(state.dailyTasks).flat().forEach(t => { if (t.projectId === id) t.projectId = null; });
    state.repeatTasks.forEach(rt => { if (rt.projectId === id) rt.projectId = null; });
    projectCallbacks.saveAndRender();
}

export function editProject(id) {
    const project = state.projects.find(p => p.id === id);
    if (!project) return;
    const newName = prompt('新しいプロジェクト名を入力してください:', project.name);
    if (newName && newName.trim()) {
        project.name = newName.trim();
    }
    const newColor = prompt('新しいカラーコード（例: #ff0000）を入力してください:', project.color);
    if (newColor && /^#[0-9A-Fa-f]{6}$/.test(newColor)) {
        project.color = newColor;
    }
    projectCallbacks.saveAndRender();
}
// js/sections.js
import { state } from './state.js';
import { escapeHtml } from './utils.js';

export const sectionCallbacks = {
    saveAndRender: null,
};

export function addSection() {
    const nameInput = document.getElementById('section-name');
    const timeInput = document.getElementById('section-time');
    const name = nameInput.value.trim();
    const startTime = timeInput.value;

    if (!name || !startTime) {
        alert('セクション名と開始時刻を入力してください。');
        return;
    }

    state.sections.push({ id: 's' + Date.now(), name, startTime });
    nameInput.value = '';
    sectionCallbacks.saveAndRender();
}

export function editSection(id) {
    const section = state.sections.find(s => s.id === id);
    if (!section) return;

    const newName = prompt('新しいセクション名を入力してください:', section.name);
    if (newName === null) return;

    const newTime = prompt('新しい開始時刻を入力してください (HH:MM):', section.startTime);
    if (newTime === null) return;

    if (newName.trim()) section.name = newName.trim();
    if (/^\d{2}:\d{2}$/.test(newTime)) section.startTime = newTime;

    sectionCallbacks.saveAndRender();
}

export function deleteSection(id) {
    const section = state.sections.find(s => s.id === id);
    if (!section) return;
    if (!confirm(`セクション「${section.name}」を削除しますか？\nこのセクションに属するタスクは「セクション無し」に移動します。`)) return;

    Object.values(state.dailyTasks).flat().forEach(task => {
        if (task.sectionId === id) task.sectionId = null;
    });
    state.repeatTasks.forEach(task => {
        if (task.sectionId === id) task.sectionId = null;
    });

    state.sections = state.sections.filter(s => s.id !== id);
    sectionCallbacks.saveAndRender();
}

export function getSectionById(id) {
    return state.sections.find(s => s.id === id);
}

export function getSectionDisplayInfo(sectionId) {
    if (!sectionId || sectionId === 'null') {
        return { name: 'セクション無し', range: '' };
    }
    const sortedSections = [...state.sections].sort((a, b) => a.startTime.localeCompare(b.startTime));
    const sectionIndex = sortedSections.findIndex(s => s.id === sectionId);

    if (sectionIndex === -1) {
        return { name: '不明なセクション', range: '' };
    }

    const section = sortedSections[sectionIndex];
    const nextSection = sortedSections[(sectionIndex + 1) % sortedSections.length];
    const endTime = nextSection.startTime;

    return {
        name: section.name,
        range: `(${section.startTime}~${endTime})`
    };
}

export function getCurrentSection() {
    const now = new Date();
    const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

    const sortedSections = [...state.sections].sort((a, b) => a.startTime.localeCompare(b.startTime));

    let currentSection = null;
    for (const section of sortedSections) {
        if (section.startTime <= currentTime) {
            currentSection = section;
        } else {
            break;
        }
    }
    return currentSection || (sortedSections.length > 0 ? sortedSections[sortedSections.length - 1] : null);
}

export function updateSectionDropdowns() {
    const selects = document.querySelectorAll('#new-task-section, #edit-task-section, #repeat-task-section, #edit-repeat-section');
    const sortedSections = [...state.sections].sort((a, b) => a.startTime.localeCompare(b.startTime));

    const optionsHtml = '<option value="">セクション無し</option>' +
        sortedSections.map(s => {
            const { name, range } = getSectionDisplayInfo(s.id);
            return `<option value="${s.id}">${escapeHtml(name)} ${range}</option>`;
        }).join('');

    selects.forEach(select => {
        const currentValue = select.value;
        select.innerHTML = optionsHtml;
        if (Array.from(select.options).some(opt => opt.value === currentValue)) {
            select.value = currentValue;
        }
    });
}

export function renderSections() {
    const container = document.getElementById('sections-container-list');
    state.sections.sort((a, b) => a.startTime.localeCompare(b.startTime));

    container.innerHTML = `<div class="overflow-x-auto shadow-md">
        <table class="min-w-full bg-white">
            <thead class="bg-gray-500 text-white">
                <tr>
                    <th class="py-1 px-4 text-left text-sm">セクション名</th>
                    <th class="py-1 px-4 text-sm">操作</th>
                </tr>
            </thead>
            <tbody id="sections-list-body"></tbody>
        </table>
    </div>`;

    const listBody = document.getElementById('sections-list-body');
    state.sections.forEach(section => {
        const { name, range } = getSectionDisplayInfo(section.id);
        const tr = document.createElement('tr');
        tr.className = 'border-b';
        tr.innerHTML = `
            <td class="py-1 px-4 text-sm">${escapeHtml(name)} <span class="text-gray-500">${range}</span></td>
            <td class="py-1 px-4 text-center space-x-1">
                <button class="edit-section-btn text-gray-400 hover:text-blue-500 p-1" data-id="${section.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
                <button class="delete-section-btn text-gray-400 hover:text-red-500 p-1" data-id="${section.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1H9a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
            </td>
        `;
        listBody.appendChild(tr);
    });

    document.querySelectorAll('.edit-section-btn').forEach(btn =>
        btn.addEventListener('click', (e) => editSection(e.currentTarget.dataset.id))
    );
    document.querySelectorAll('.delete-section-btn').forEach(btn =>
        btn.addEventListener('click', (e) => deleteSection(e.currentTarget.dataset.id))
    );
}
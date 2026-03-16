// js/utils.js

export function escapeHtml(s) {
    if (!s) return '';
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

export function formatTime(seconds) {
    const s = parseInt(seconds, 10) || 0;
    const m = Math.floor(s / 60);
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m.toString().padStart(2, '0')}:${sec}`;
}

export function formatClockTime(date) {
    if (!date) return '--:--';
    return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

export function calculateActualTime(task) {
    if (task.status === 'running' && task.startTime) {
        return Math.round((new Date().getTime() - new Date(task.startTime).getTime()) / 1000);
    }
    if (task.startTime && task.endTime) {
        const duration = new Date(task.endTime).getTime() - new Date(task.startTime).getTime();
        return Math.round(Math.max(0, duration) / 1000);
    }
    return task.actualTime || 0;
}

export function getPlainTaskName(text) {
    if (!text) return '';
    return text.replace(/\[(.*?)\]\((.*?)\)/g, '$1');
}

export function formatTaskName(text) {
    if (!text) return '';
    let escapedText = escapeHtml(text);
    escapedText = escapedText.replace(/\[(.*?)\]\((.*?)\)/g, (match, linkText, url) => {
        const safeUrl = url.replace(/&amp;/g, '&');
        return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">${linkText}</a>`;
    });
    const urlRegex = /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/\S+)/g;
    const parts = escapedText.split(/(<[^>]+>)/);
    return parts.map(part => {
        if (part.startsWith('<')) return part;
        return part.replace(urlRegex, url => {
            const safeUrl = url.replace(/&amp;/g, '&');
            return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">${url}</a>`;
        });
    }).join('');
}

export function getFormattedDate(date, dayChangeHour = 4) {
    return new Date(date.getTime() - (dayChangeHour * 60 * 60 * 1000))
        .toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
        .replace(/\//g, '-');
}

// Core Logic for Sozha Maintenance App

let projects = [];
let meetings = []; // New global for meetings
let activeType = 'Design';
const scriptUrlKey = 'sozha_script_url';
const defaultScriptUrl = 'https://script.google.com/macros/s/AKfycbzNwtfBlDb85woU3jqQL_iVq2NPHgTaUK8LRo-oTQXQ2D5kWzn3nJyGL90sL7XDM_U4/exec';
let statusChart = null;
let calendar = null; // New global for FullCalendar instance

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadProjects();
    fetchProjects(); // Sync projects from cloud
    loadMeetings(); // Load meetings on startup

    // Check for Script URL - Always update if the default in code changed
    const currentStoredUrl = localStorage.getItem(scriptUrlKey);
    if (!currentStoredUrl || currentStoredUrl !== defaultScriptUrl) {
        localStorage.setItem(scriptUrlKey, defaultScriptUrl);
    }

    const form = document.getElementById('projectForm');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }

    const meetingForm = document.getElementById('meetingForm');
    if (meetingForm) {
        meetingForm.addEventListener('submit', handleMeetingSubmit);
    }

    const addBtn = document.getElementById('addProjectBtn');
    if (addBtn) {
        addBtn.onclick = toggleForm;
    }

    const deleteMeetingBtn = document.getElementById('deleteMeetingBtn');
    if (deleteMeetingBtn) {
        deleteMeetingBtn.onclick = handleDeleteMeeting;
    }

    // Splash Screen Logic
    const splash = document.getElementById('splash-screen');
    if (splash) {
        setTimeout(() => {
            splash.classList.add('fade-out');
            setTimeout(() => {
                splash.remove();
            }, 800); // Match transition duration
        }, 2500); // Show for 2.5s
    }

    // PWA Logic: Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(() => console.log('Service Worker Registered'))
            .catch(err => console.warn('Service Worker Failed', err));
    }

    // PWA Logic: Installation Prompt
    let deferredPrompt;
    const installBtn = document.getElementById('installApp');
    const guideInstallBtn = document.getElementById('guideInstallBtn');

    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent Chrome 67 and earlier from automatically showing the prompt
        e.preventDefault();
        // Stash the event so it can be triggered later.
        deferredPrompt = e;
        // Update UI notify the user they can add to home screen
        if (installBtn) installBtn.style.display = 'inline-flex';
        if (guideInstallBtn) guideInstallBtn.style.display = 'inline-flex';
    });

    const triggerInstall = async () => {
        if (deferredPrompt) {
            // Show the prompt
            deferredPrompt.prompt();
            // Wait for the user to respond to the prompt
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User response to the install prompt: ${outcome}`);
            // We've used the prompt, and can't use it again, throw it away
            deferredPrompt = null;
            // Hide the install buttons
            if (installBtn) installBtn.style.display = 'none';
            if (guideInstallBtn) guideInstallBtn.style.display = 'none';
        }
    };

    if (installBtn) {
        installBtn.addEventListener('click', triggerInstall);
    }
    if (guideInstallBtn) {
        guideInstallBtn.addEventListener('click', triggerInstall);
    }
});

function openInstallGuide() {
    const modal = document.getElementById('installGuideModal');
    modal.style.display = 'flex';

    // Auto-detect platform
    const ua = navigator.userAgent.toLowerCase();
    if (ua.indexOf('iphone') > -1 || ua.indexOf('ipad') > -1) {
        switchInstallTab('ios');
    } else if (ua.indexOf('android') > -1) {
        switchInstallTab('android');
    } else {
        switchInstallTab('desktop');
    }
}

function closeInstallGuide() {
    document.getElementById('installGuideModal').style.display = 'none';
}

function switchInstallTab(platform) {
    // Update tabs
    document.querySelectorAll('.install-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.platform === platform);
    });

    // Update content
    document.querySelectorAll('.guide-content').forEach(c => {
        c.classList.remove('active');
    });
    document.getElementById(`${platform}-guide`).classList.add('active');
}

function toggleForm() {
    if (activeType === 'Scheduling') {
        openMeetingModal();
        return;
    }
    const section = document.getElementById('projectFormSection');
    section.style.display = section.style.display === 'none' ? 'block' : 'none';
}

async function handleFormSubmit(e) {
    e.preventDefault();

    const editingId = document.getElementById('editingId').value;

    const project = {
        id: editingId || Date.now().toString(),
        name: document.getElementById('projName').value,
        client: document.getElementById('clientName').value,
        clientEmail: document.getElementById('clientEmail').value,
        type: document.getElementById('projType').value,
        totalCost: parseFloat(document.getElementById('totalCost').value) || 0,
        paidAmount: parseFloat(document.getElementById('paidAmount').value) || 0,
        currentStage: document.getElementById('projStage').value,
        status: document.getElementById('status').value,
        notes: document.getElementById('notes').value,
        designUrl: document.getElementById('designUrl').value,
        lastUpdate: new Date().toLocaleDateString()
    };

    const baseUrl = window.location.href.split('?')[0];

    if (editingId) {
        updateProjectLocally(project);
        await syncWithGoogleSheets(project, 'updateProject');
    } else {
        saveProjectLocally(project);
        await syncWithGoogleSheets({ project, baseUrl }, 'addProject');
    }

    e.target.reset();
    document.getElementById('editingId').value = '';
    document.getElementById('formTitle').textContent = 'Project Details';
    toggleForm();
    renderProjects();
    populateProjectDropdown(); // Update dropdowns if needed
}

function updateProjectLocally(project) {
    const index = projects.findIndex(p => p.id === project.id);
    if (index !== -1) {
        projects[index] = project;
        localStorage.setItem('sozha_projects', JSON.stringify(projects));
    }
}

function saveProjectLocally(project) {
    projects.push(project);
    localStorage.setItem('sozha_projects', JSON.stringify(projects));
}

function loadProjects() {
    const stored = localStorage.getItem('sozha_projects');
    if (stored) {
        projects = JSON.parse(stored);
        renderProjects();
        populateProjectDropdown();
    }
}

async function fetchProjects() {
    const url = localStorage.getItem(scriptUrlKey);
    if (!url) return;
    try {
        const response = await fetch(`${url}?action=getProjects`);
        const result = await response.json();
        if (result.status === 'success') {
            projects = result.data;
            localStorage.setItem('sozha_projects', JSON.stringify(projects));
            renderProjects();
            populateProjectDropdown();
            showNotification('Projects synced from cloud');
        }
    } catch (e) {
        console.warn('Could not fetch projects from backend', e);
    }
}

function renderProjects() {
    const container = document.getElementById('projectList');
    const calendarView = document.getElementById('calendarView');
    if (!container) return;

    if (activeType === 'Scheduling') {
        container.style.display = 'none';
        calendarView.style.display = 'block';
        initCalendar();
        return;
    } else {
        container.style.display = 'grid';
        calendarView.style.display = 'none';
    }

    const filtered = projects.filter(p => p.type === activeType);

    container.innerHTML = filtered.map(p => `
        <div class="card">
            <h3>${p.name}</h3>
            <p style="color: var(--text-secondary); margin-bottom: 0.5rem;">Client: ${p.client}</p>
            <div class="stat-row">
                <span class="stat-label">Stage</span>
                <span class="stat-value">${p.currentStage || 'Not set'}</span>
            </div>
            <div class="progress-container">
                <div class="progress-bar" style="width: ${(p.paidAmount / p.totalCost * 100) || 0}%"></div>
            </div>
            <div class="stat-row">
                <span class="stat-label">Payment</span>
                <span class="stat-value">₹${p.paidAmount.toLocaleString()} / ₹${p.totalCost.toLocaleString()}</span>
            </div>
            <div class="stat-row" style="margin-top: -0.2rem; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 0.3rem;">
                <span class="stat-label" style="font-size: 0.75rem;">Balance Due</span>
                <span class="stat-value" style="color: ${(p.totalCost - p.paidAmount) > 0 ? '#ff4444' : '#4CAF50'}; font-size: 0.75rem;">
                    ₹${(p.totalCost - p.paidAmount).toLocaleString()}
                </span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem;">
                <span class="status-badge status-${p.status.toLowerCase()}">${p.status}</span>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="secondary" onclick="editProject('${p.id}')">
                        <span class="iconify" data-icon="material-symbols:edit-outline"></span>
                    </button>
                    <button class="secondary" onclick="showQR('${p.id}', '${p.name}')">
                        <span class="iconify" data-icon="material-symbols:qr-code"></span>
                    </button>
                    <button class="secondary" onclick="deleteProject('${p.id}')">
                        <span class="iconify" data-icon="material-symbols:delete-outline"></span>
                    </button>
                </div>
            </div>
        </div>
    `).join('');

    if (filtered.length === 0) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-secondary);">No ${activeType} projects found.</div>`;
    }

    updateAnalytics();
}

function switchTab(type) {
    activeType = type;

    // Reset form if editing
    document.getElementById('projectForm').reset();
    document.getElementById('editingId').value = '';
    document.getElementById('formTitle').textContent = 'Project Details';
    document.getElementById('projectFormSection').style.display = 'none';

    // Update UI
    document.querySelectorAll('.tab').forEach(t => {
        t.classList.toggle('active', t.dataset.type === type);
    });

    renderProjects();
}

function editProject(id) {
    const project = projects.find(p => p.id === id);
    if (!project) return;

    // Populate form
    document.getElementById('editingId').value = project.id;
    document.getElementById('projName').value = project.name;
    document.getElementById('clientName').value = project.client;
    document.getElementById('clientEmail').value = project.clientEmail || '';
    document.getElementById('projType').value = project.type;
    document.getElementById('totalCost').value = project.totalCost;
    document.getElementById('paidAmount').value = project.paidAmount;
    document.getElementById('projStage').value = project.currentStage;
    document.getElementById('status').value = project.status;
    document.getElementById('notes').value = project.notes;
    document.getElementById('designUrl').value = project.designUrl || '';

    document.getElementById('formTitle').textContent = 'Edit Project: ' + project.name;

    // Show form
    document.getElementById('projectFormSection').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateAnalytics() {
    const stats = {
        Active: projects.filter(p => p.status === 'Active').length,
        Pending: projects.filter(p => p.status === 'Pending').length,
        'Under Review': projects.filter(p => p.status === 'Under Review').length,
        Completed: projects.filter(p => p.status === 'Completed').length
    };

    const ctx = document.getElementById('statusChart');
    if (!ctx) return;

    if (statusChart) {
        statusChart.destroy();
    }

    statusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(stats),
            datasets: [{
                data: Object.values(stats),
                backgroundColor: ['#4CAF50', '#FFC107', '#2196F3', '#9E9E9E'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#a0a0a0', font: { family: 'Inter' } }
                }
            },
            cutout: '70%'
        }
    });

    const summary = document.getElementById('statsSummary');
    if (summary) {
        summary.innerHTML = `
            <div>
                <div style="font-size: 1.5rem; font-weight: 700; color: var(--accent-color);">${projects.length}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">Total Projects</div>
            </div>
            <div>
                <div style="font-size: 1.5rem; font-weight: 700; color: #4CAF50;">${stats.Active}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">Active</div>
            </div>
            <div>
                <div style="font-size: 1.5rem; font-weight: 700; color: #FFC107;">${stats.Pending}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">Pending</div>
            </div>
        `;
    }
}

function showQR(id, name) {
    const modal = document.getElementById('qrModal');
    const qrContainer = document.getElementById('qrcode');
    const modalTitle = document.getElementById('modalTitle');

    qrContainer.innerHTML = '';
    modalTitle.textContent = name;

    // Use current location but pointing to client.html
    const baseUrl = window.location.href.replace('index.html', '').replace('dashboard.html', '') + 'client.html';
    const qrUrl = `${baseUrl}?id=${id}`;

    new QRCode(qrContainer, {
        text: qrUrl,
        width: 256,
        height: 256,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });

    modal.style.display = 'flex';
}

function closeModal() {
    document.getElementById('qrModal').style.display = 'none';
}

async function deleteProject(id) {
    if (confirm('Delete this project?')) {
        await syncWithGoogleSheets(id, 'deleteProject');
        projects = projects.filter(p => {
            if (p.id === id) return false;
            return true;
        });
        localStorage.setItem('sozha_projects', JSON.stringify(projects));
        renderProjects();
    }
}

// CALENDAR & MEETING LOGIC
function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl || calendar) return;

    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        themeSystem: 'standard',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
        },
        events: meetings,
        dateClick: function (info) {
            openMeetingModal(null, info.dateStr);
        },
        eventClick: function (info) {
            openMeetingModal(info.event);
        },
        height: 'auto'
    });
    calendar.render();
}

function openMeetingModal(event = null, dateStr = null) {
    const modal = document.getElementById('meetingModal');
    const form = document.getElementById('meetingForm');
    const title = document.getElementById('meetingFormTitle');
    const deleteBtn = document.getElementById('deleteMeetingBtn');

    form.reset();
    deleteBtn.style.display = event ? 'block' : 'none';
    title.textContent = event ? 'Edit Meeting' : 'Schedule Meeting';

    if (event) {
        document.getElementById('meetingId').value = event.id;
        document.getElementById('meetingTitle').value = event.title;
        document.getElementById('meetingStart').value = formatDateTime(event.start);
        document.getElementById('meetingEnd').value = formatDateTime(event.end);
        document.getElementById('meetingProject').value = event.extendedProps.projectId || '';
        document.getElementById('meetingDescription').value = event.extendedProps.description || '';
    } else if (dateStr) {
        // Default to 1 hour meeting at 10 AM on selected date
        document.getElementById('meetingStart').value = `${dateStr}T10:00`;
        document.getElementById('meetingEnd').value = `${dateStr}T11:00`;
    }

    modal.style.display = 'flex';
}

function closeMeetingModal() {
    document.getElementById('meetingModal').style.display = 'none';
}

function formatDateTime(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toISOString().slice(0, 16);
}

async function handleMeetingSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('meetingId').value;
    const meeting = {
        id: id || Date.now().toString(),
        title: document.getElementById('meetingTitle').value,
        start: document.getElementById('meetingStart').value,
        end: document.getElementById('meetingEnd').value,
        projectId: document.getElementById('meetingProject').value,
        description: document.getElementById('meetingDescription').value
    };

    if (id) {
        const idx = meetings.findIndex(m => m.id === id);
        meetings[idx] = meeting;
        await syncWithGoogleSheets(meeting, 'updateMeeting');
    } else {
        meetings.push(meeting);
        await syncWithGoogleSheets(meeting, 'addMeeting');
    }

    localStorage.setItem('sozha_meetings', JSON.stringify(meetings));
    closeMeetingModal();
    if (calendar) {
        calendar.getEvents().forEach(e => e.remove());
        meetings.forEach(m => calendar.addEvent(m));
    }
}

async function handleDeleteMeeting() {
    const id = document.getElementById('meetingId').value;
    if (confirm('Delete this meeting?')) {
        await syncWithGoogleSheets(id, 'deleteMeeting');
        meetings = meetings.filter(m => m.id !== id);
        localStorage.setItem('sozha_meetings', JSON.stringify(meetings));
        closeMeetingModal();
        if (calendar) {
            const event = calendar.getEventById(id);
            if (event) event.remove();
        }
    }
}

function loadMeetings() {
    const stored = localStorage.getItem('sozha_meetings');
    if (stored) {
        meetings = JSON.parse(stored);
    }
    // Attempt to fetch fresh from GS
    fetchMeetings();
}

async function fetchMeetings() {
    const url = localStorage.getItem(scriptUrlKey);
    if (!url) return;
    try {
        const response = await fetch(`${url}?action=getMeetings`);
        const result = await response.json();
        if (result.status === 'success') {
            meetings = result.data;
            localStorage.setItem('sozha_meetings', JSON.stringify(meetings));
            if (calendar) {
                calendar.removeAllEvents();
                calendar.addEventSource(meetings);
            }
        }
    } catch (e) {
        console.warn('Could not fetch meetings from backend', e);
    }
}

function populateProjectDropdown() {
    const dropdown = document.getElementById('meetingProject');
    if (!dropdown) return;
    const currentVal = dropdown.value;
    dropdown.innerHTML = '<option value="">No related project</option>' +
        projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    dropdown.value = currentVal;
}

async function syncWithGoogleSheets(data, action) {
    const url = localStorage.getItem(scriptUrlKey);
    if (!url) {
        alert('Google Script URL not found. Please check settings.');
        return;
    }

    try {
        console.log(`Syncing ${action} to: ${url}`);
        await fetch(url, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: action, data: data })
        });
        showNotification(`Synced ${action} successfully!`);
    } catch (e) {
        console.error('Sync failed', e);
        showNotification('Sync failed. Please check script deployment.', true);
    }
}

function showNotification(msg, isError = false) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        padding: 1rem 2rem;
        background: ${isError ? '#ff4444' : 'var(--accent-color)'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        z-index: 9999;
        transition: opacity 0.3s ease;
    `;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}


function updateScriptUrl() {
    const newUrl = prompt('Enter your Google Script Web App URL:', localStorage.getItem(scriptUrlKey));
    if (newUrl && newUrl.includes('script.google.com')) {
        localStorage.setItem(scriptUrlKey, newUrl);
        location.reload();
    }
}

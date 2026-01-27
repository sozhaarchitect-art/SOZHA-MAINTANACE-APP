// Core Logic for Sozha Maintenance App
const VERSION = '1.0.7'; // Matches sw.js v7

let projects = [];
let meetings = []; // New global for meetings
let activeType = 'Design';
let searchQuery = '';
const scriptUrlKey = 'sozha_script_url';
const defaultScriptUrl = 'https://script.google.com/macros/s/AKfycbzXdH1ujPPOQ0ZWa8lPRSxcTm7BGQs8HW3wE67T2X_fYL5oQTuhstNrfA6xhOkoaGk/exec';
let statusChart = null;
let calendar = null; // New global for FullCalendar instance

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadProjects();
    fetchProjects(true); // Sync projects from cloud on startup with feedback
    loadMeetings(); // Load meetings on startup

    // Check for Script URL - Always update to the latest provided deployment if it changed
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

    // Network Status Indicators
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
    updateNetworkStatus();
});

function updateNetworkStatus() {
    const indicator = document.getElementById('networkStatus');
    if (!indicator) return;
    if (navigator.onLine) {
        indicator.textContent = '● Online';
        indicator.style.color = '#4CAF50';
    } else {
        indicator.textContent = '● Offline';
        indicator.style.color = '#ff4444';
    }
}

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

async function fetchProjects(showFeedback = false) {
    const url = localStorage.getItem(scriptUrlKey);
    if (!url) return;

    const syncBtn = document.getElementById('syncBtn');
    const syncIcon = syncBtn ? syncBtn.querySelector('.iconify') : null;

    if (showFeedback && syncIcon) {
        syncIcon.classList.add('spin');
    }

    try {
        console.log(`Fetching projects from: ${url}`);
        const response = await fetch(`${url}?action=getProjects`);
        const result = await response.json();
        if (result.status === 'success') {
            // Sanitize data: trim spaces and ensure types match
            projects = result.data.map(p => ({
                ...p,
                id: String(p.id),
                type: String(p.type || '').trim(),
                status: String(p.status || '').trim(),
                currentStage: String(p.currentStage || '').trim()
            }));

            localStorage.setItem('sozha_projects', JSON.stringify(projects));
            renderProjects();
            populateProjectDropdown();
            if (showFeedback) showNotification('Projects synced from cloud');
        } else {
            throw new Error(result.message || 'Unknown backend error');
        }
    } catch (e) {
        console.error('Fetch failed', e);
        if (showFeedback) {
            let errorMsg = `Sync Failed!\n\nTarget URL: ${url}\n\nError: ${e.message}\n\n`;
            if (url.includes('AKfycbzNwtfBlDb85')) {
                errorMsg += "⚠️ YOU ARE STILL USING THE SAMPLE URL! This link won't show your data.\n\nPlease paste YOUR Web App URL in settings (⚙️).";
            } else {
                errorMsg += "Please verify your Google Script URL and check if the sheet name is 'Projects'.";
            }
            alert(errorMsg);
            showNotification('Sync failed', true);
        }
    } finally {
        if (syncIcon) syncIcon.classList.remove('spin');
    }
}

function renderProjects() {
    const container = document.getElementById('projectList');
    const calendarView = document.getElementById('calendarView');
    if (!container) return;

    if (activeType === 'Scheduling') {
        container.style.display = 'none';
        calendarView.style.display = 'block';
        if (document.getElementById('searchContainer')) {
            document.getElementById('searchContainer').style.display = 'none';
        }
        initCalendar();
        return;
    } else {
        container.style.display = 'grid';
        calendarView.style.display = 'none';
        if (document.getElementById('searchContainer')) {
            document.getElementById('searchContainer').style.display = 'flex';
        }
    }

    let filtered = projects.filter(p =>
        String(p.type || '').trim().toLowerCase() === activeType.toLowerCase()
    );

    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(p =>
            p.name.toLowerCase().includes(query) ||
            p.client.toLowerCase().includes(query)
        );
    }

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
            <div class="card-actions">
                <span class="status-badge status-${p.status ? p.status.toLowerCase().replace(/\s+/g, '-') : 'unknown'}">${p.status || 'Unknown'}</span>
                <div class="action-buttons">
                    <button class="secondary icon-btn" title="Edit Project" onclick="console.log('Edit clicked', '${p.id}'); editProject('${p.id}')">
                        <span class="iconify" data-icon="material-symbols:edit-outline"></span>
                    </button>
                    <button class="secondary icon-btn" title="Client Access QR" onclick="showQR('${p.id}', '${p.name.replace(/'/g, "\\'")}')">
                        <span class="iconify" data-icon="material-symbols:qr-code"></span>
                    </button>
                    <button class="secondary icon-btn" title="Send Status Update" onclick="console.log('Mail clicked', '${p.id}'); sendProjectEmail('${p.id}')">
                        <span class="iconify" data-icon="material-symbols:mail-outline"></span>
                    </button>
                    <button class="secondary icon-btn" title="Delete Project" onclick="deleteProject('${p.id}')">
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

    // Reset search
    searchQuery = '';
    const searchInput = document.getElementById('projectSearch');
    if (searchInput) searchInput.value = '';

    renderProjects();
}

function handleSearch(query) {
    searchQuery = query;
    renderProjects();
}

function editProject(id) {
    const project = projects.find(p => String(p.id) === String(id));
    if (!project) {
        console.error('Project not found for editing:', id);
        alert('Could not find project to edit. Please try Syncing data.');
        return;
    }

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
        const designCount = projects.filter(p => String(p.type || '').trim().toLowerCase() === 'design').length;
        const constructionCount = projects.filter(p => String(p.type || '').trim().toLowerCase() === 'construction').length;
        const schedulingCount = meetings.length;

        summary.innerHTML = `
            <div>
                <div style="font-size: 1.5rem; font-weight: 700; color: var(--accent-color);">${projects.length}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">Total Projects</div>
            </div>
            <div>
                <div style="font-size: 1.5rem; font-weight: 700; color: #4CAF50;">${designCount}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">Design</div>
            </div>
            <div>
                <div style="font-size: 1.5rem; font-weight: 700; color: #FFC107;">${constructionCount}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">Construction</div>
            </div>
            <div>
                <div style="font-size: 1.5rem; font-weight: 700; color: #2196F3;">${schedulingCount}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">Scheduling</div>
            </div>
        `;
    }
}

function showQR(id, name) {
    const modal = document.getElementById('qrModal');
    const qrContainer = document.getElementById('qrcode');
    const modalTitle = document.getElementById('modalTitle');

    qrContainer.innerHTML = '';

    // Use current location but pointing to client.html
    const baseUrl = window.location.href.replace('index.html', '').replace('dashboard.html', '') + 'client.html';
    const qrUrl = `${baseUrl}?id=${id}`;

    // Update Copy Button Logic
    const copyBtn = document.getElementById('copyLinkBtn');
    if (copyBtn) {
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(qrUrl).then(() => {
                const originalText = copyBtn.innerHTML;
                copyBtn.innerHTML = '<span class="iconify" data-icon="material-symbols:check"></span> Link Copied!';
                setTimeout(() => { copyBtn.innerHTML = originalText; }, 2000);
            }).catch(err => {
                console.error('Failed to copy: ', err);
                alert('URL: ' + qrUrl); // Fallback for some browsers
            });
        };
    }

    new QRCode(qrContainer, {
        text: qrUrl,
        width: 200, // Slightly smaller for better fit
        height: 200,
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
            if (String(p.id) === String(id)) return false;
            return true;
        });
        localStorage.setItem('sozha_projects', JSON.stringify(projects));
        renderProjects();
    }
}

async function sendProjectEmail(id) {
    const project = projects.find(p => String(p.id) === String(id));
    if (!project) {
        console.error('Project not found for email:', id);
        alert('Could not find project details. Please try Syncing data.');
        return;
    }

    if (!project.clientEmail) {
        alert('No email address found for this client!');
        return;
    }

    const message = prompt(`Send project update to client?\n\nClient: ${project.client}\nEmail: ${project.clientEmail}\nProject: ${project.name}\n\nEnter a custom message (optional):`, `Current Status: ${project.status} | Stage: ${project.currentStage}`);

    if (message === null) return; // User cancelled

    const baseUrl = window.location.href.split('?')[0];

    try {
        showNotification(`Sending status update to ${project.clientEmail}...`);
        const url = localStorage.getItem(scriptUrlKey);

        console.log('Attempting to send email via:', url);

        // Reverting to the most compatible GAS fetch method: no-cors + text/plain
        await fetch(url, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                action: 'sendProjectLink',
                data: { project, baseUrl, message: message }
            })
        });

        showNotification('Update request sent! Check your Sent folder soon.');
    } catch (e) {
        console.error('Email request failed:', e);
        showNotification('Request failed. Check your internet or script URL.', true);
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
        checkMeetingsToday();
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
            checkMeetingsToday();
            if (calendar) {
                calendar.removeAllEvents();
                calendar.addEventSource(meetings);
            }
        }
    } catch (e) {
        console.warn('Could not fetch meetings from backend', e);
    }
}

function checkMeetingsToday() {
    if (sessionStorage.getItem('sozha_meeting_alert_dismissed')) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayMeetings = meetings.filter(m => {
        const meetingDate = new Date(m.start);
        meetingDate.setHours(0, 0, 0, 0);
        return meetingDate.getTime() === today.getTime();
    });

    const alertEl = document.getElementById('meetingAlert');
    const infoEl = document.getElementById('meetingAlertInfo');

    if (todayMeetings.length > 0 && alertEl && infoEl) {
        const nextMeeting = todayMeetings[0];
        const time = new Date(nextMeeting.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        infoEl.textContent = `${nextMeeting.title} at ${time}${todayMeetings.length > 1 ? ` (+${todayMeetings.length - 1} more)` : ''}`;
        alertEl.style.display = 'flex';
    } else if (alertEl) {
        alertEl.style.display = 'none';
    }
}

function dismissMeetingAlert() {
    const alertEl = document.getElementById('meetingAlert');
    if (alertEl) {
        alertEl.style.display = 'none';
        sessionStorage.setItem('sozha_meeting_alert_dismissed', 'true');
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
    const currentUrl = localStorage.getItem(scriptUrlKey) || 'None';
    let newUrl = prompt(`Current URL: ${currentUrl.substring(0, 40)}...\n\nEnter your Google Script Web App URL:`, currentUrl);

    if (newUrl) {
        newUrl = newUrl.trim();
        if (newUrl.includes('script.google.com')) {
            localStorage.setItem(scriptUrlKey, newUrl);
            location.reload();
        } else {
            alert('Invalid URL! Please paste the "Web App URL" from Apps Script (Deployment).');
        }
    }
}

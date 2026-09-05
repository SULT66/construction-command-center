const main = document.querySelector('#main');
const userMenu = document.querySelector('#userMenu');

const API_BASE = window.__SAFESTART_API_BASE__ || '';
const state = {
  session: null,
  organization: null,
  project: null
};

function esc(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

function tenantApi(path, options = {}) {
  const organizationId = state.organization?.organizationId;
  if (!organizationId) throw new Error('No organization selected');
  return api(path, {
    ...options,
    headers: {
      'x-safestart-organization-id': organizationId,
      ...(options.headers || {})
    }
  });
}

function setUserMenu(user) {
  if (!user) {
    userMenu.classList.add('hidden');
    userMenu.innerHTML = '';
    return;
  }

  userMenu.classList.remove('hidden');
  userMenu.innerHTML = `
    <strong>${esc(user.fullName || 'SafeStart User')}</strong>
    <span>${esc(user.email || '')}</span>
  `;
}

function renderLogin() {
  setUserMenu(null);
  main.innerHTML = `
    <section class="hero">
      <span class="badge">InfraScan SafeStart™</span>
      <h1>Dynamic Pre-Task Planning & Workforce Safety</h1>
      <p>Sign in with your organization account. SafeStart automatically applies your company, projects, roles and permissions after authentication.</p>
      <button id="signIn" class="btn btn-primary">Sign in with Microsoft</button>
    </section>
  `;

  document.querySelector('#signIn').addEventListener('click', () => {
    const back = encodeURIComponent(window.location.pathname || '/');
    window.location.href = `/.auth/login/aad?post_login_redirect_uri=${back}`;
  });
}

function renderOrganizations(session) {
  setUserMenu(session.user);
  const organizations = session.organizations || [];

  if (organizations.length === 0) {
    main.innerHTML = `
      <div class="page-head"><div><h1>No organization access</h1><p>Your identity is valid, but no active SafeStart organization is assigned.</p></div></div>
      <div class="notice">Ask your company SafeStart administrator to invite this email address.</div>
    `;
    return;
  }

  if (organizations.length === 1) {
    return chooseOrganization(organizations[0].id);
  }

  main.innerHTML = `
    <div class="page-head">
      <div><h1>Select company</h1><p>Choose the organization you want to work in.</p></div>
    </div>
    <section class="panel card-list">
      ${organizations.map(org => `
        <button class="choice" data-org="${esc(org.id)}">
          <strong>${esc(org.name)}</strong>
          <small>${esc((org.roles || []).join(' · '))}</small>
        </button>
      `).join('')}
    </section>
  `;

  document.querySelectorAll('[data-org]').forEach(button => {
    button.addEventListener('click', () => chooseOrganization(button.dataset.org));
  });
}

async function chooseOrganization(organizationId) {
  main.innerHTML = '<div class="loading">Loading organization…</div>';
  try {
    const context = await api('/api/v1/session/select-organization', {
      method: 'POST',
      body: JSON.stringify({ organizationId })
    });
    state.organization = context;
    renderProjects(context);
  } catch (error) {
    renderError(error);
  }
}

function organizationName() {
  const org = (state.session?.organizations || []).find(o => o.id === state.organization?.organizationId);
  return org?.name || 'Organization';
}

function renderProjects(context) {
  const projects = context.projects || [];
  const orgName = organizationName();

  if (projects.length === 0) {
    main.innerHTML = `
      <div class="page-head"><div><h1>${esc(orgName)}</h1><p>No active projects are assigned to your account.</p></div></div>
      <div class="notice">A Company Admin or Project Admin can add you to a project.</div>
    `;
    return;
  }

  main.innerHTML = `
    <div class="page-head">
      <div><h1>${esc(orgName)}</h1><p>Select a project to enter SafeStart.</p></div>
      <button id="switchCompany" class="btn btn-secondary">Switch company</button>
    </div>
    <section class="panel card-list">
      ${projects.map(project => `
        <button class="choice project-card" data-project="${esc(project.project_id)}">
          <div>
            <strong>${esc(project.project_name)}</strong>
            <small>${esc(project.project_code || '')}${project.site_zip ? ` · ZIP ${esc(project.site_zip)}` : ''}</small>
          </div>
          <div>
            <span class="badge">${esc(project.worker_card_mode || 'PRODUCTION')}</span>
            <span class="badge">${esc(project.safestart_profile || 'NFC')}</span>
          </div>
        </button>
      `).join('')}
    </section>
  `;

  document.querySelector('#switchCompany').addEventListener('click', () => renderOrganizations(state.session));
  document.querySelectorAll('[data-project]').forEach(button => {
    button.addEventListener('click', () => {
      const project = projects.find(p => p.project_id === button.dataset.project);
      state.project = project;
      renderDashboard(project);
    });
  });
}

function renderDashboard(project) {
  const orgName = organizationName();
  main.innerHTML = `
    <div class="page-head">
      <div>
        <div class="badge">${esc(orgName)}</div>
        <h1>${esc(project.project_name)}</h1>
        <p>SafeStart production workspace</p>
      </div>
      <button id="backProjects" class="btn btn-secondary">Switch project</button>
    </div>

    <section class="grid">
      <article class="panel"><div class="kpi">—</div><div class="kpi-label">Active SafeStarts</div></article>
      <article class="panel"><div class="kpi">—</div><div class="kpi-label">Workers on site</div></article>
      <article class="panel"><div class="kpi">—</div><div class="kpi-label">Open safety actions</div></article>
    </section>

    <section class="panel" style="margin-top:16px">
      <h2>Production modules</h2>
      <div class="card-list">
        <button class="choice" disabled><strong>SafeStart Plans</strong><small>Production workflow integration next</small></button>
        <button id="openWorkforce" class="choice"><strong>Workforce</strong><small>Worker database, project assignments and Production Worker Cards</small></button>
        <button class="choice" disabled><strong>Reports & Compliance</strong><small>Immutable reports and exports</small></button>
        <button class="choice" disabled><strong>Project Settings</strong><small>Team & Access, catalogs, profiles and branding</small></button>
      </div>
    </section>
  `;

  document.querySelector('#backProjects').addEventListener('click', () => renderProjects(state.organization));
  document.querySelector('#openWorkforce').addEventListener('click', renderWorkforce);
}

async function renderWorkforce(search = '') {
  const project = state.project;
  if (!project) return renderProjects(state.organization);
  main.innerHTML = '<div class="loading">Loading workforce…</div>';
  try {
    const params = new URLSearchParams({ projectId: project.project_id });
    if (search) params.set('search', search);
    const result = await tenantApi(`/api/v1/workers?${params}`);
    const workers = result.workers || [];

    main.innerHTML = `
      <div class="page-head">
        <div>
          <div class="badge">${esc(organizationName())}</div>
          <h1>Workforce</h1>
          <p>${esc(project.project_name)} · ${workers.length} active worker${workers.length === 1 ? '' : 's'}</p>
        </div>
        <div class="page-actions">
          <button id="backDashboard" class="btn btn-secondary">Dashboard</button>
          <button id="addWorker" class="btn btn-primary">+ Add Worker</button>
        </div>
      </div>

      <section class="panel">
        <div class="toolbar">
          <input id="workerSearch" value="${esc(search)}" placeholder="Search name, Worker ID, employer or trade" />
          <button id="searchWorkers" class="btn btn-secondary">Search</button>
        </div>
        ${workers.length === 0 ? `
          <div class="notice">No workers are assigned to this project yet.</div>
        ` : `
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Worker</th><th>Employer</th><th>Trade / Role</th><th>Eligibility</th><th>Device</th><th></th></tr></thead>
              <tbody>
                ${workers.map(worker => `
                  <tr>
                    <td><div class="worker-name">${esc(worker.full_name)}</div><div class="worker-meta">${esc(worker.worker_number)}</div></td>
                    <td>${esc(worker.employer_name || '—')}</td>
                    <td>${esc([worker.trade, worker.role_title].filter(Boolean).join(' · ') || '—')}</td>
                    <td><span class="badge ${worker.eligibility_status === 'ELIGIBLE' ? 'badge-ok' : 'badge-warn'}">${esc(worker.eligibility_status || 'PENDING')}</span></td>
                    <td>${esc((worker.devices || []).map(d => `${d.type}: ${d.identifier}`).join(', ') || '—')}</td>
                    <td><button class="btn btn-secondary" data-worker-card="${esc(worker.id)}">View</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </section>
    `;

    document.querySelector('#backDashboard').addEventListener('click', () => renderDashboard(project));
    document.querySelector('#addWorker').addEventListener('click', openAddWorkerModal);
    document.querySelector('#searchWorkers').addEventListener('click', () => renderWorkforce(document.querySelector('#workerSearch').value.trim()));
    document.querySelector('#workerSearch').addEventListener('keydown', event => {
      if (event.key === 'Enter') renderWorkforce(event.currentTarget.value.trim());
    });
    document.querySelectorAll('[data-worker-card]').forEach(button => {
      button.addEventListener('click', () => openWorkerCard(button.dataset.workerCard));
    });
  } catch (error) {
    renderError(error);
  }
}

function openAddWorkerModal() {
  const project = state.project;
  const wrapper = document.createElement('div');
  wrapper.className = 'modal-backdrop';
  wrapper.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="addWorkerTitle">
      <h2 id="addWorkerTitle">Add Worker</h2>
      <form id="addWorkerForm">
        <div class="form-grid">
          <div class="field"><label>Full Name</label><input name="fullName" required /></div>
          <div class="field"><label>Worker ID</label><input name="workerNumber" required /></div>
          <div class="field"><label>Type</label><select name="workerType"><option>CONTRACTOR</option><option>EMPLOYEE</option><option>VISITOR</option></select></div>
          <div class="field"><label>Employer / Subcontractor</label><input name="employerName" /></div>
          <div class="field"><label>Trade</label><input name="trade" /></div>
          <div class="field"><label>Role</label><input name="roleTitle" /></div>
          <div class="field"><label>Zone</label><input name="zone" /></div>
          <div class="field"><label>Shift</label><input name="shiftName" /></div>
          <div class="field"><label>Training</label><select name="trainingStatus"><option>UNKNOWN</option><option>CURRENT</option><option>EXPIRING</option><option>EXPIRED</option></select></div>
          <div class="field"><label>Certifications</label><select name="certificationStatus"><option>UNKNOWN</option><option>CURRENT</option><option>EXPIRING</option><option>EXPIRED</option></select></div>
          <div class="field full"><label>Eligibility</label><select name="eligibilityStatus"><option>PENDING</option><option>ELIGIBLE</option><option>INELIGIBLE</option></select></div>
        </div>
        <div id="workerFormError"></div>
        <div class="modal-actions">
          <button type="button" id="cancelWorker" class="btn btn-secondary">Cancel</button>
          <button type="submit" class="btn btn-primary">Create Worker</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(wrapper);

  const close = () => wrapper.remove();
  document.querySelector('#cancelWorker').addEventListener('click', close);
  wrapper.addEventListener('click', event => { if (event.target === wrapper) close(); });
  document.querySelector('#addWorkerForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    body.projectId = project.project_id;
    body.assignmentRole = body.roleTitle;
    const errorBox = document.querySelector('#workerFormError');
    errorBox.innerHTML = '';
    try {
      await tenantApi('/api/v1/workers', { method: 'POST', body: JSON.stringify(body) });
      close();
      await renderWorkforce();
    } catch (error) {
      errorBox.innerHTML = `<div class="error" style="margin-top:14px">${esc(error.message)}</div>`;
    }
  });
}

async function openWorkerCard(workerId) {
  const project = state.project;
  try {
    const data = await tenantApi(`/api/v1/workers/${workerId}?projectId=${encodeURIComponent(project.project_id)}`);
    const worker = data.worker;
    const assignment = (data.assignments || [])[0] || {};
    const wrapper = document.createElement('div');
    wrapper.className = 'modal-backdrop';
    wrapper.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="page-head">
          <div><span class="badge">PRODUCTION WORKER CARD</span><h2 style="margin-top:10px">${esc(worker.full_name)}</h2><p>${esc(worker.worker_number)}</p></div>
          <button id="closeWorkerCard" class="btn btn-secondary">Close</button>
        </div>
        <div class="profile-grid">
          <div class="profile-item"><span>Employer</span><strong>${esc(worker.employer_name || '—')}</strong></div>
          <div class="profile-item"><span>Trade / Role</span><strong>${esc([worker.trade, worker.role_title].filter(Boolean).join(' · ') || '—')}</strong></div>
          <div class="profile-item"><span>Project</span><strong>${esc(assignment.project_name || project.project_name)}</strong></div>
          <div class="profile-item"><span>Zone / Shift</span><strong>${esc([assignment.zone, assignment.shift_name].filter(Boolean).join(' · ') || '—')}</strong></div>
          <div class="profile-item"><span>Supervisor</span><strong>${esc(assignment.supervisor_name || 'Not assigned')}</strong></div>
          <div class="profile-item"><span>Eligibility</span><strong>${esc(worker.eligibility_status || 'PENDING')}</strong></div>
          <div class="profile-item"><span>Training</span><strong>${esc(worker.training_status || 'UNKNOWN')}</strong></div>
          <div class="profile-item"><span>Certifications</span><strong>${esc(worker.certification_status || 'UNKNOWN')}</strong></div>
          <div class="profile-item"><span>Required PPE</span><strong>${esc(Array.isArray(worker.required_ppe) ? worker.required_ppe.join(', ') || '—' : '—')}</strong></div>
          <div class="profile-item"><span>Assigned Devices</span><strong>${esc((data.devices || []).filter(d => d.status === 'ASSIGNED').map(d => `${d.device_type}: ${d.device_identifier}`).join(', ') || '—')}</strong></div>
        </div>
        <section style="margin-top:20px">
          <h2>Credentials</h2>
          ${(data.credentials || []).length ? `<div class="card-list">${data.credentials.map(c => `<div class="profile-item"><span>${esc(c.credential_type)}</span><strong>${esc(c.credential_name)}</strong><div class="worker-meta">${esc(c.status)}${c.expires_at ? ` · Expires ${esc(c.expires_at)}` : ''}</div></div>`).join('')}</div>` : '<div class="notice">No credentials linked yet.</div>'}
        </section>
      </div>
    `;
    document.body.appendChild(wrapper);
    const close = () => wrapper.remove();
    document.querySelector('#closeWorkerCard').addEventListener('click', close);
    wrapper.addEventListener('click', event => { if (event.target === wrapper) close(); });
  } catch (error) {
    renderError(error);
  }
}

function renderError(error) {
  main.innerHTML = `
    <div class="page-head"><div><h1>SafeStart</h1><p>Unable to continue.</p></div></div>
    <div class="error">${esc(error.message || 'Unexpected error')}</div>
  `;
}

async function start() {
  main.innerHTML = '<div class="loading">Loading SafeStart…</div>';
  try {
    const session = await api('/api/v1/session');
    state.session = session;
    renderOrganizations(session);
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      return renderLogin();
    }
    renderError(error);
  }
}

start();

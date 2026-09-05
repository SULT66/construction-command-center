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

function renderProjects(context) {
  const projects = context.projects || [];
  const org = (state.session?.organizations || []).find(o => o.id === context.organizationId);
  const orgName = org?.name || 'Organization';

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
      renderDashboard(project, orgName);
    });
  });
}

function renderDashboard(project, orgName) {
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
        <button class="choice" disabled><strong>Workforce</strong><small>Worker database and Production Worker Card next</small></button>
        <button class="choice" disabled><strong>Reports & Compliance</strong><small>Immutable reports and exports</small></button>
        <button class="choice" disabled><strong>Project Settings</strong><small>Team & Access, catalogs, profiles and branding</small></button>
      </div>
    </section>
  `;

  document.querySelector('#backProjects').addEventListener('click', () => renderProjects(state.organization));
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

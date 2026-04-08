'use strict'

const Users = {
  users: [],

  async render() {
    const content = document.getElementById('content')
    const res = await window.api.users.getAll()

    if (!res.success) {
      content.innerHTML = `<div class="alert alert-danger">${res.error}</div>`
      return
    }

    Users.users = res.users

    const rows = Users.users.map(u => {
      const isSelf = App.currentUser && App.currentUser.id === u.id

      return `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:34px;height:34px;border-radius:50%;background:${u.role === 'owner' ? 'var(--primary)' : 'var(--accent)'};
                color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0">
                ${u.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style="font-weight:600">${u.name}</div>
                ${isSelf ? '<div style="font-size:11px;color:var(--accent)">(You)</div>' : ''}
              </div>
            </div>
          </td>
          <td><code>${u.username}</code></td>
          <td>
            <span class="badge ${u.role === 'owner' ? 'badge-primary' : 'badge-info'}">
              ${u.role === 'owner' ? '👑 Owner' : '🏷️ Cashier'}
            </span>
          </td>
          <td>
            <span class="badge ${u.active ? 'badge-success' : 'badge-danger'}">
              ${u.active ? 'Active' : 'Inactive'}
            </span>
          </td>
          <td>${App.formatDate(u.created_at)}</td>
          <td class="text-center">
            <div style="display:flex;gap:6px;justify-content:center">
              <button class="btn btn-sm btn-secondary" onclick="Users.showEditModal(${u.id})">Edit</button>
              ${!isSelf ? `
                <button class="btn btn-sm ${u.active ? 'btn-warning' : 'btn-success'}"
                  onclick="Users.toggleActive(${u.id}, ${u.active})">
                  ${u.active ? 'Deactivate' : 'Activate'}
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `
    }).join('') || `
      <tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">No users found</td></tr>
    `

    content.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">User Management</div>
          <div class="page-subtitle">${Users.users.length} user${Users.users.length !== 1 ? 's' : ''} registered</div>
        </div>
        <button class="btn btn-primary" id="btn-add-user">+ Add User</button>
      </div>

      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Role</th>
              <th>Status</th>
              <th>Created</th>
              <th class="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `

    document.getElementById('btn-add-user').addEventListener('click', () => Users.showAddModal())
  },

  async showAddModal() {
    const body = `
      <form id="user-form">
        <div class="form-group">
          <label>Full Name *</label>
          <input type="text" name="name" required placeholder="e.g. Jane Smith">
        </div>
        <div class="form-group">
          <label>Username *</label>
          <input type="text" name="username" required placeholder="e.g. jsmith" autocomplete="off">
        </div>
        <div class="form-group">
          <label>Password *</label>
          <input type="password" name="password" required placeholder="Minimum 6 characters" autocomplete="new-password">
        </div>
        <div class="form-group">
          <label>Role *</label>
          <select name="role">
            <option value="cashier">🏷️ Cashier</option>
            <option value="owner">👑 Owner</option>
          </select>
        </div>
      </form>
    `

    const footer = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" id="btn-save-user">Create User</button>
    `

    App.showModal('Add New User', body, footer, { size: 'sm' })

    document.getElementById('btn-save-user').addEventListener('click', async () => {
      const form = document.getElementById('user-form')
      const formData = new FormData(form)

      const name = formData.get('name').trim()
      const username = formData.get('username').trim()
      const password = formData.get('password')
      const role = formData.get('role')

      if (!name || !username || !password) {
        App.showToast('All fields are required', 'error')
        return
      }

      if (password.length < 6) {
        App.showToast('Password must be at least 6 characters', 'error')
        return
      }

      const btn = document.getElementById('btn-save-user')
      btn.disabled = true
      btn.textContent = 'Creating...'

      const res = await window.api.users.create({ name, username, password, role })
      if (res.success) {
        App.closeModal()
        App.showToast('User created successfully', 'success')
        await Users.render()
      } else {
        App.showToast(res.error || 'Failed to create user', 'error')
        btn.disabled = false
        btn.textContent = 'Create User'
      }
    })
  },

  async showEditModal(id) {
    const user = Users.users.find(u => u.id === id)
    if (!user) return

    const isSelf = App.currentUser && App.currentUser.id === id

    const body = `
      <form id="user-edit-form">
        <div class="form-group">
          <label>Full Name *</label>
          <input type="text" name="name" value="${user.name}" required>
        </div>
        <div class="form-group">
          <label>Username</label>
          <input type="text" value="${user.username}" disabled style="background:var(--bg);color:var(--text-muted)">
          <small style="color:var(--text-muted);font-size:11px">Username cannot be changed</small>
        </div>
        <div class="form-group">
          <label>New Password <span style="color:var(--text-muted);font-weight:400">(leave blank to keep current)</span></label>
          <input type="password" name="password" placeholder="Enter new password" autocomplete="new-password">
        </div>
        <div class="form-group">
          <label>Role *</label>
          <select name="role" ${isSelf ? 'disabled' : ''}>
            <option value="cashier" ${user.role === 'cashier' ? 'selected' : ''}>🏷️ Cashier</option>
            <option value="owner" ${user.role === 'owner' ? 'selected' : ''}>👑 Owner</option>
          </select>
          ${isSelf ? '<small style="color:var(--text-muted);font-size:11px">Cannot change your own role</small>' : ''}
        </div>
        <div class="form-group">
          <label>Status</label>
          <select name="active" ${isSelf ? 'disabled' : ''}>
            <option value="1" ${user.active ? 'selected' : ''}>Active</option>
            <option value="0" ${!user.active ? 'selected' : ''}>Inactive</option>
          </select>
          ${isSelf ? '<small style="color:var(--text-muted);font-size:11px">Cannot deactivate your own account</small>' : ''}
        </div>
      </form>
    `

    const footer = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" id="btn-update-user">Save Changes</button>
    `

    App.showModal(`Edit User: ${user.name}`, body, footer, { size: 'sm' })

    document.getElementById('btn-update-user').addEventListener('click', async () => {
      const form = document.getElementById('user-edit-form')
      const formData = new FormData(form)

      const name = formData.get('name')?.trim()
      const password = formData.get('password')
      const role = isSelf ? user.role : formData.get('role')
      const active = isSelf ? user.active : Number(formData.get('active'))

      if (!name) {
        App.showToast('Name is required', 'error')
        return
      }

      if (password && password.length < 6) {
        App.showToast('Password must be at least 6 characters', 'error')
        return
      }

      const btn = document.getElementById('btn-update-user')
      btn.disabled = true
      btn.textContent = 'Saving...'

      const res = await window.api.users.update({ id, name, role, active, password: password || null })
      if (res.success) {
        App.closeModal()
        App.showToast('User updated successfully', 'success')
        await Users.render()
      } else {
        App.showToast(res.error || 'Failed to update user', 'error')
        btn.disabled = false
        btn.textContent = 'Save Changes'
      }
    })
  },

  async toggleActive(id, currentActive) {
    const user = Users.users.find(u => u.id === id)
    if (!user) return

    const action = currentActive ? 'deactivate' : 'activate'
    if (!App.confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} user "${user.name}"?`)) return

    if (currentActive) {
      // Deactivating
      const res = await window.api.users.delete(id)
      if (res.success) {
        App.showToast('User deactivated', 'success')
        await Users.render()
      } else {
        App.showToast(res.error || 'Failed to deactivate user', 'error')
      }
    } else {
      // Activating
      const res = await window.api.users.update({ id, name: user.name, role: user.role, active: 1, password: null })
      if (res.success) {
        App.showToast('User activated', 'success')
        await Users.render()
      } else {
        App.showToast(res.error || 'Failed to activate user', 'error')
      }
    }
  }
}

'use strict'

const Auth = {
  init() {
    const form = document.getElementById('login-form')
    const errorEl = document.getElementById('login-error')

    // Remove old listeners by cloning
    const newForm = form.cloneNode(true)
    form.parentNode.replaceChild(newForm, form)

    document.getElementById('login-form').addEventListener('submit', Auth.handleLogin)

    // Clear error on input
    document.getElementById('login-username').addEventListener('input', () => {
      document.getElementById('login-error').style.display = 'none'
    })
    document.getElementById('login-password').addEventListener('input', () => {
      document.getElementById('login-error').style.display = 'none'
    })
  },

  async handleLogin(e) {
    e.preventDefault()
    const username = document.getElementById('login-username').value.trim()
    const password = document.getElementById('login-password').value
    const errorEl = document.getElementById('login-error')
    const btnText = document.getElementById('login-btn-text')

    if (!username || !password) {
      errorEl.textContent = 'Please enter both username and password.'
      errorEl.style.display = 'block'
      return
    }

    btnText.textContent = 'Signing in...'
    errorEl.style.display = 'none'

    try {
      const res = await window.api.auth.login({ username, password })

      if (res.success) {
        App.currentUser = res.user
        document.getElementById('login-password').value = ''
        App.showMain()
        const defaultView = res.user.role === 'cashier' ? 'pos' : 'dashboard'
        App.navigate(defaultView)
        App.showToast(`Welcome back, ${res.user.name}!`, 'success')
      } else {
        errorEl.textContent = res.error || 'Invalid credentials. Please try again.'
        errorEl.style.display = 'block'
        document.getElementById('login-password').value = ''
        document.getElementById('login-password').focus()
      }
    } catch (err) {
      errorEl.textContent = 'An error occurred. Please try again.'
      errorEl.style.display = 'block'
      console.error(err)
    } finally {
      btnText.textContent = 'Sign In'
    }
  }
}

/**
 * Login & Auth Controller (auth.js)
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Check if already logged in
  try {
    const user = await getAuthUser();
    if (user) {
      if (user.role === 'admin') {
        window.location.href = '/admin.html';
        return;
      } else {
        window.location.href = '/student.html';
        return;
      }
    }
  } catch (err) {
    console.log('Not authenticated yet');
  }

  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const submitBtn = document.getElementById('submit-btn');

  // Check if Admin enabled passwordless guest login
  try {
    const settingsRes = await api('/api/settings');
    if (settingsRes.ok && settingsRes.settings?.allowPasswordlessLogin) {
      const pSection = document.getElementById('passwordless-section');
      if (pSection) pSection.style.display = 'block';
    }
  } catch (err) {
    console.log('Settings check:', err);
  }

  // Toggle passwordless guest form
  const toggleGuestBtn = document.getElementById('btn-toggle-passwordless');
  const guestForm = document.getElementById('passwordless-form');
  const guestNameInput = document.getElementById('guest-name');
  const guestCodeInput = document.getElementById('guest-code');
  const guestClassInput = document.getElementById('guest-class');
  const guestSubmitBtn = document.getElementById('guest-submit-btn');

  if (toggleGuestBtn && guestForm) {
    toggleGuestBtn.addEventListener('click', () => {
      const isHidden = guestForm.style.display === 'none' || !guestForm.style.display;
      if (isHidden) {
        guestForm.style.display = 'block';
        toggleGuestBtn.textContent = '✖️ إخفاء نموذج الدخول السريع';
        guestNameInput.focus();
      } else {
        guestForm.style.display = 'none';
        toggleGuestBtn.textContent = '🎓 دخول سريع باسم الطالب فقط';
      }
    });
  }

  // Handle passwordless guest submission
  if (guestForm) {
    guestForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = guestNameInput.value.trim();
      const studentCode = guestCodeInput ? guestCodeInput.value.trim() : '';
      const className = guestClassInput ? guestClassInput.value.trim() : '';

      if (!name) {
        showToast('يرجى إدخال اسم الطالب', 'warning');
        return;
      }

      guestSubmitBtn.disabled = true;
      guestSubmitBtn.textContent = 'جاري تسجيل الدخول...';
      showLoading('جاري تسجيل دخول الطالب وتجهيز المنصة...');

      try {
        const response = await api('/api/auth/passwordless', {
          method: 'POST',
          body: JSON.stringify({ name, studentCode, className }),
        });

        if (response.ok && response.user) {
          showToast(`أهلاً بك يا ${response.user.name}، بالتوفيق!`, 'success');
          setTimeout(() => {
            window.location.href = '/student.html';
          }, 600);
        } else {
          showToast(response.error || 'فشل الدخول السريع', 'error');
          guestSubmitBtn.disabled = false;
          guestSubmitBtn.textContent = '🚀 الدخول وبدء الاختبار';
          hideLoading();
        }
      } catch (err) {
        showToast(err.message || 'حدث خطأ في الاتصال بالخادم', 'error');
        guestSubmitBtn.disabled = false;
        guestSubmitBtn.textContent = '🚀 الدخول وبدء الاختبار';
        hideLoading();
      }
    });
  }



  // Handle Form Submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showToast('يرجى إدخال البريد الإلكتروني وكلمة المرور', 'warning');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'جاري تسجيل الدخول...';
    showLoading('جاري التحقق من بيانات الحساب...');

    try {
      const response = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      if (response.ok && response.user) {
        showToast(`أهلاً بك، ${response.user.name}`, 'success');
        setTimeout(() => {
          if (response.user.role === 'admin') {
            window.location.href = '/admin.html';
          } else {
            window.location.href = '/student.html';
          }
        }, 600);
      } else {
        showToast(response.error || 'فشل تسجيل الدخول', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'تسجيل الدخول';
        hideLoading();
      }
    } catch (err) {
      showToast(err.message || 'حدث خطأ في الاتصال بالخادم', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'تسجيل الدخول';
      hideLoading();
    }
  });
});
